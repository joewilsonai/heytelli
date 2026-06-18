import type { AiUsageProvider } from "@workspace/db";

export type AiModelPricing = {
  provider: AiUsageProvider;
  model: string;
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  cachedInputCostPer1MTokens?: number;
  reasoningCostPer1MTokens?: number;
  imageCostPer1MTokens?: number;
  audioCostPer1MTokens?: number;
  effectiveAt?: string;
};

export type AiUsageCostInput = {
  provider: AiUsageProvider;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  imageTokens?: number | null;
  audioTokens?: number | null;
};

export type PricingEnv = Partial<
  Record<"AI_USAGE_PRICING_OVERRIDES_JSON", string>
>;

export const DEFAULT_AI_PRICING_REGISTRY: AiModelPricing[] = [
  {
    provider: "openai",
    model: "gpt-5.4",
    inputCostPer1MTokens: 2.5,
    outputCostPer1MTokens: 15,
    cachedInputCostPer1MTokens: 0.25,
    effectiveAt: "2026-06-18",
  },
  {
    provider: "openai",
    model: "gpt-5.5",
    inputCostPer1MTokens: 5,
    outputCostPer1MTokens: 30,
    cachedInputCostPer1MTokens: 0.5,
    effectiveAt: "2026-06-18",
  },
  {
    provider: "openai",
    model: "gpt-5.4-mini",
    inputCostPer1MTokens: 0.75,
    outputCostPer1MTokens: 4.5,
    cachedInputCostPer1MTokens: 0.075,
    effectiveAt: "2026-06-18",
  },
  {
    provider: "openai",
    model: "gpt-5.3-codex",
    inputCostPer1MTokens: 1.75,
    outputCostPer1MTokens: 14,
    cachedInputCostPer1MTokens: 0.175,
    effectiveAt: "2026-06-18",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini-transcribe",
    inputCostPer1MTokens: 0,
    outputCostPer1MTokens: 0,
    audioCostPer1MTokens: 0,
    effectiveAt: "2026-05-31",
  },
  {
    provider: "mock",
    model: "metered-mock",
    inputCostPer1MTokens: 2,
    outputCostPer1MTokens: 4,
    cachedInputCostPer1MTokens: 0.5,
    effectiveAt: "2026-05-31",
  },
];

function toFiniteNumber(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function normalizePricing(raw: unknown): AiModelPricing | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const provider = value.provider;
  const model = value.model;
  const inputCost = toFiniteNumber(value.inputCostPer1MTokens);
  const outputCost = toFiniteNumber(value.outputCostPer1MTokens);
  if (
    !["openai", "anthropic", "openrouter", "litellm", "local", "mock"].includes(
      String(provider),
    ) ||
    typeof model !== "string" ||
    !model.trim() ||
    inputCost == null ||
    outputCost == null
  ) {
    return null;
  }

  return {
    provider: provider as AiUsageProvider,
    model: model.trim(),
    inputCostPer1MTokens: inputCost,
    outputCostPer1MTokens: outputCost,
    cachedInputCostPer1MTokens:
      toFiniteNumber(value.cachedInputCostPer1MTokens) ?? undefined,
    reasoningCostPer1MTokens:
      toFiniteNumber(value.reasoningCostPer1MTokens) ?? undefined,
    imageCostPer1MTokens:
      toFiniteNumber(value.imageCostPer1MTokens) ?? undefined,
    audioCostPer1MTokens:
      toFiniteNumber(value.audioCostPer1MTokens) ?? undefined,
    effectiveAt:
      typeof value.effectiveAt === "string" ? value.effectiveAt : undefined,
  };
}

export function loadPricingOverridesFromEnv(
  env: PricingEnv = process.env,
): AiModelPricing[] {
  const raw = env.AI_USAGE_PRICING_OVERRIDES_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values
      .map((value) => normalizePricing(value))
      .filter((value): value is AiModelPricing => value != null);
  } catch {
    return [];
  }
}

export function mergePricingRegistry(
  base: AiModelPricing[] = DEFAULT_AI_PRICING_REGISTRY,
  overrides: AiModelPricing[] = loadPricingOverridesFromEnv(),
): AiModelPricing[] {
  const merged = new Map<string, AiModelPricing>();
  for (const item of base) {
    merged.set(`${item.provider}:${item.model}`, item);
  }
  for (const item of overrides) {
    merged.set(`${item.provider}:${item.model}`, item);
  }
  return [...merged.values()];
}

export function lookupModelPricing(
  provider: AiUsageProvider,
  model: string,
  registry: AiModelPricing[] = mergePricingRegistry(),
): AiModelPricing | null {
  return (
    registry.find(
      (item) => item.provider === provider && item.model === model,
    ) ?? null
  );
}

function tokens(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null && value > 0
    ? Math.floor(value)
    : 0;
}

function dollars(tokensValue: number, costPer1M: number | undefined): number {
  return (tokensValue / 1_000_000) * (costPer1M ?? 0);
}

export function estimateAiUsageCostUsd(
  input: AiUsageCostInput,
  registry: AiModelPricing[] = mergePricingRegistry(),
): number {
  const pricing = lookupModelPricing(input.provider, input.model, registry);
  if (!pricing) return 0;

  const inputTokens = tokens(input.inputTokens);
  const cachedInputTokens = tokens(input.cachedInputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const cost =
    dollars(uncachedInputTokens, pricing.inputCostPer1MTokens) +
    dollars(tokens(input.outputTokens), pricing.outputCostPer1MTokens) +
    dollars(cachedInputTokens, pricing.cachedInputCostPer1MTokens) +
    dollars(tokens(input.reasoningTokens), pricing.reasoningCostPer1MTokens) +
    dollars(tokens(input.imageTokens), pricing.imageCostPer1MTokens) +
    dollars(tokens(input.audioTokens), pricing.audioCostPer1MTokens);

  return Number(cost.toFixed(8));
}
