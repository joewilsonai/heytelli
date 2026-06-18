import type {
  AiUsageProvider,
  ImprovementPriority,
  ImprovementRiskTier,
  ImprovementRunType,
} from "@workspace/db";
import {
  estimateAiUsageCostUsd,
  type AiModelPricing,
} from "@workspace/api-server/src/lib/aiPricing";
import type { SwarmAgentRole } from "./swarmPlan";

export type FeatureCostPhase = "estimate" | "actual";
export type FeatureCostConfidence = "low" | "medium" | "high";
export type FeatureCostLineItemKind =
  | "model_tokens"
  | "reviewer_tokens"
  | "agent_runtime"
  | "ci"
  | "release";

export type FeatureCostLineItem = {
  kind: FeatureCostLineItemKind;
  label: string;
  amountUsd: number;
  confidence: FeatureCostConfidence;
  source: string;
  model?: string;
  totalTokens?: number;
};

export type FeatureCostEffort = {
  agentRuns: number;
  reviewerAgents: number;
  traceDurationMs: number;
  ciRuns: number;
  releaseRuns: number;
  retries: number;
};

export type FeatureCreationCostSummary = {
  phase: FeatureCostPhase;
  modelProvider: AiUsageProvider;
  model: string;
  estimatedUsd: number;
  actualUsd: number | null;
  rangeLowUsd: number;
  rangeHighUsd: number;
  confidence: FeatureCostConfidence;
  costPerRequestUsd: number;
  frequencyCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  lineItems: FeatureCostLineItem[];
  effort: FeatureCostEffort;
};

export type FeatureCostWorkItemInput = {
  riskTier: ImprovementRiskTier;
  priority: ImprovementPriority;
  frequencyCount: number;
  reviewerRoles?: SwarmAgentRole[];
};

export type ActualFeatureCostInput = FeatureCostWorkItemInput & {
  agentOutputText?: string | null;
  estimate?: FeatureCreationCostSummary | null;
  reviewerAgentsRun?: number;
  traceDurationMs?: number;
  ciRuns?: number;
  releaseRuns?: number;
  retries?: number;
};

export type FeatureCostOptions = {
  env?: NodeJS.ProcessEnv;
  pricingRegistry?: AiModelPricing[];
};

const DEFAULT_AGENT_PROVIDER: AiUsageProvider = "openai";
const DEFAULT_AGENT_MODEL = "gpt-5.3-codex";
const DEFAULT_OUTPUT_TOKEN_RATIO = 0.12;
const DEFAULT_REVIEWER_TOTAL_TOKENS = 24_000;

const baseTotalTokensByRiskTier: Record<ImprovementRiskTier, number> = {
  safe_auto_merge: 90_000,
  guarded_auto_merge: 150_000,
  extra_agent_review: 240_000,
  no_auto_merge: 45_000,
};

const priorityMultipliers: Record<ImprovementPriority, number> = {
  p0: 1.4,
  p1: 1.25,
  p2: 1.1,
  p3: 1,
};

const defaultReviewerRolesByRiskTier: Record<
  ImprovementRiskTier,
  SwarmAgentRole[]
> = {
  safe_auto_merge: ["code_reviewer"],
  guarded_auto_merge: [
    "product_reviewer",
    "privacy_reviewer",
    "code_reviewer",
  ],
  extra_agent_review: [
    "privacy_reviewer",
    "safety_reviewer",
    "backend_api_reviewer",
    "code_reviewer",
    "test_reviewer",
  ],
  no_auto_merge: ["product_reviewer"],
};

function money(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}

function count(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null && value > 0
    ? Math.floor(value)
    : 0;
}

function frequency(value: number): number {
  return Math.max(1, count(value));
}

function agentProvider(env: NodeJS.ProcessEnv | undefined): AiUsageProvider {
  const raw = env?.FEATURE_COST_AGENT_MODEL_PROVIDER?.trim();
  return raw &&
    ["openai", "anthropic", "openrouter", "litellm", "local", "mock"].includes(raw)
    ? (raw as AiUsageProvider)
    : DEFAULT_AGENT_PROVIDER;
}

function agentModel(env: NodeJS.ProcessEnv | undefined): string {
  return env?.FEATURE_COST_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;
}

function splitTokens(totalTokens: number): {
  inputTokens: number;
  outputTokens: number;
} {
  const outputTokens = Math.floor(totalTokens * DEFAULT_OUTPUT_TOKEN_RATIO);
  return {
    inputTokens: Math.max(0, totalTokens - outputTokens),
    outputTokens,
  };
}

function modelCostUsd(input: {
  provider: AiUsageProvider;
  model: string;
  totalTokens: number;
  pricingRegistry?: AiModelPricing[];
}): { inputTokens: number; outputTokens: number; amountUsd: number } {
  const { inputTokens, outputTokens } = splitTokens(input.totalTokens);
  return {
    inputTokens,
    outputTokens,
    amountUsd: money(
      estimateAiUsageCostUsd(
        {
          provider: input.provider,
          model: input.model,
          inputTokens,
          outputTokens,
        },
        input.pricingRegistry,
      ),
    ),
  };
}

function confidenceForLineItems(
  lineItems: FeatureCostLineItem[],
): FeatureCostConfidence {
  if (lineItems.some((item) => item.confidence === "low")) return "low";
  if (lineItems.some((item) => item.confidence === "medium")) return "medium";
  return "high";
}

function totalLineItems(lineItems: FeatureCostLineItem[]): number {
  return money(lineItems.reduce((sum, item) => sum + item.amountUsd, 0));
}

function perRequest(amountUsd: number, frequencyCount: number): number {
  return money(amountUsd / frequency(frequencyCount));
}

export function reviewerRolesForFeatureCost(
  input: Pick<FeatureCostWorkItemInput, "riskTier" | "reviewerRoles">,
): SwarmAgentRole[] {
  return input.reviewerRoles ?? defaultReviewerRolesByRiskTier[input.riskTier];
}

export function estimateFeatureCreationCost(
  input: FeatureCostWorkItemInput,
  options: FeatureCostOptions = {},
): FeatureCreationCostSummary {
  const provider = agentProvider(options.env);
  const model = agentModel(options.env);
  const reviewerRoles = reviewerRolesForFeatureCost(input);
  const baseTokens = baseTotalTokensByRiskTier[input.riskTier];
  const totalTokens = Math.floor(baseTokens * priorityMultipliers[input.priority]);
  const modelCost = modelCostUsd({
    provider,
    model,
    totalTokens,
    pricingRegistry: options.pricingRegistry,
  });
  const reviewerTotalTokens = reviewerRoles.length * DEFAULT_REVIEWER_TOTAL_TOKENS;
  const reviewerCost = modelCostUsd({
    provider,
    model,
    totalTokens: reviewerTotalTokens,
    pricingRegistry: options.pricingRegistry,
  });
  const lineItems: FeatureCostLineItem[] = [
    {
      kind: "model_tokens",
      label: "Builder agent model tokens",
      amountUsd: modelCost.amountUsd,
      confidence: "low",
      source: "risk-tier token estimate",
      model,
      totalTokens,
    },
    {
      kind: "reviewer_tokens",
      label: "Reviewer agent model tokens",
      amountUsd: reviewerCost.amountUsd,
      confidence: "low",
      source: "planned reviewer lanes",
      model,
      totalTokens: reviewerTotalTokens,
    },
  ];
  const estimatedUsd = totalLineItems(lineItems);
  return {
    phase: "estimate",
    modelProvider: provider,
    model,
    estimatedUsd,
    actualUsd: null,
    rangeLowUsd: money(estimatedUsd * 0.65),
    rangeHighUsd: money(estimatedUsd * 1.55),
    confidence: confidenceForLineItems(lineItems),
    costPerRequestUsd: perRequest(estimatedUsd, input.frequencyCount),
    frequencyCount: frequency(input.frequencyCount),
    totalTokens: totalTokens + reviewerTotalTokens,
    inputTokens: modelCost.inputTokens + reviewerCost.inputTokens,
    outputTokens: modelCost.outputTokens + reviewerCost.outputTokens,
    lineItems,
    effort: {
      agentRuns: 1,
      reviewerAgents: reviewerRoles.length,
      traceDurationMs: 0,
      ciRuns: 0,
      releaseRuns: 0,
      retries: 0,
    },
  };
}

export function extractCodexTotalTokens(output: string | null | undefined): number {
  const text = output ?? "";
  const matches = [...text.matchAll(/tokens\s+used\s*:?\s*([\d,]+)/gi)];
  const last = matches.at(-1);
  if (!last?.[1]) return 0;
  return count(Number(last[1].replace(/,/g, "")));
}

function runTypeCount(
  runTypes: ImprovementRunType[] | undefined,
  runType: ImprovementRunType,
): number {
  return runTypes?.filter((item) => item === runType).length ?? 0;
}

export function buildActualFeatureCreationCost(
  input: ActualFeatureCostInput & { runTypes?: ImprovementRunType[] },
  options: FeatureCostOptions = {},
): FeatureCreationCostSummary {
  const estimate =
    input.estimate ?? estimateFeatureCreationCost(input, options);
  const provider = agentProvider(options.env);
  const model = agentModel(options.env);
  const actualTotalTokens = extractCodexTotalTokens(input.agentOutputText);
  const agentTotalTokens = actualTotalTokens || estimate.lineItems[0]?.totalTokens || 0;
  const agentCost = modelCostUsd({
    provider,
    model,
    totalTokens: agentTotalTokens,
    pricingRegistry: options.pricingRegistry,
  });
  const reviewerAgents =
    count(input.reviewerAgentsRun) ||
    estimate.effort.reviewerAgents ||
    reviewerRolesForFeatureCost(input).length;
  const reviewerTotalTokens = reviewerAgents * DEFAULT_REVIEWER_TOTAL_TOKENS;
  const reviewerCost = modelCostUsd({
    provider,
    model,
    totalTokens: reviewerTotalTokens,
    pricingRegistry: options.pricingRegistry,
  });
  const lineItems: FeatureCostLineItem[] = [
    {
      kind: "model_tokens",
      label: "Builder agent model tokens",
      amountUsd: agentCost.amountUsd,
      confidence: actualTotalTokens > 0 ? "medium" : "low",
      source:
        actualTotalTokens > 0
          ? "actual Codex total tokens with estimated split"
          : "fallback to pre-run estimate",
      model,
      totalTokens: agentTotalTokens,
    },
    {
      kind: "reviewer_tokens",
      label: "Reviewer agent model tokens",
      amountUsd: reviewerCost.amountUsd,
      confidence: "low",
      source: "actual reviewer count with estimated token use",
      model,
      totalTokens: reviewerTotalTokens,
    },
  ];
  const actualUsd = totalLineItems(lineItems);
  const totalTokens = agentTotalTokens + reviewerTotalTokens;
  return {
    phase: "actual",
    modelProvider: provider,
    model,
    estimatedUsd: estimate.estimatedUsd,
    actualUsd,
    rangeLowUsd: estimate.rangeLowUsd,
    rangeHighUsd: estimate.rangeHighUsd,
    confidence: confidenceForLineItems(lineItems),
    costPerRequestUsd: perRequest(actualUsd, input.frequencyCount),
    frequencyCount: frequency(input.frequencyCount),
    totalTokens,
    inputTokens: agentCost.inputTokens + reviewerCost.inputTokens,
    outputTokens: agentCost.outputTokens + reviewerCost.outputTokens,
    lineItems,
    effort: {
      agentRuns: 1,
      reviewerAgents,
      traceDurationMs: count(input.traceDurationMs),
      ciRuns: count(input.ciRuns) + runTypeCount(input.runTypes, "review"),
      releaseRuns: count(input.releaseRuns) + runTypeCount(input.runTypes, "deploy"),
      retries: count(input.retries),
    },
  };
}
