import {
  type AiUsageFeature,
  type AiUsageMetadata,
  type AiUsageProvider,
  type InsertAiUsageEvent,
} from "@workspace/db";
import { aiUsageEvents } from "@workspace/db/schema";
import { logger as defaultLogger } from "./logger";
import {
  estimateAiUsageCostUsd,
  type AiModelPricing,
} from "./aiPricing";

export type AiUsageEventInput = {
  environment?: string | null;
  userId?: number | null;
  matchId?: number | null;
  conversationId?: number | null;
  feature: AiUsageFeature;
  provider: AiUsageProvider;
  model: string;
  requestId?: string | null;
  traceId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  imageTokens?: number | null;
  audioTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | string | null;
  latencyMs?: number | null;
  success: boolean;
  errorType?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  metadata?: AiUsageMetadata | null;
  promptVersion?: string | null;
  responseSchemaVersion?: string | null;
};

export type NormalizedAiUsageEvent = InsertAiUsageEvent;

export type NormalizeAiUsageOptions = {
  pricingRegistry?: AiModelPricing[];
  env?: NodeJS.ProcessEnv;
};

export type RecordAiUsageOptions = NormalizeAiUsageOptions & {
  insertEvent?: (event: NormalizedAiUsageEvent) => Promise<unknown>;
  logger?: {
    warn: (...args: unknown[]) => void;
  };
};

const SENSITIVE_METADATA_KEYS = new Set([
  "audio",
  "blob",
  "content",
  "conversation",
  "conversationtext",
  "file",
  "image",
  "images",
  "input",
  "message",
  "messages",
  "profile",
  "prompt",
  "prompts",
  "raw",
  "rawpayload",
  "screenshot",
  "screenshots",
  "text",
  "transcript",
  "userinput",
]);

function integerOrUndefined(value: number | null | undefined): number | undefined {
  return Number.isInteger(value) && value != null ? value : undefined;
}

function tokenCount(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null && value > 0
    ? Math.floor(value)
    : 0;
}

function money(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return numberValue.toFixed(6);
}

function cleanShortString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

export function redactAiErrorMessage(
  message: string | null | undefined,
): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 500);
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const cleaned = value
      .slice(0, 50)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return cleaned;
  }
  if (typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[_-]/g, "");
      if (SENSITIVE_METADATA_KEYS.has(normalizedKey)) continue;
      const sanitized = sanitizeMetadataValue(item, depth + 1);
      if (sanitized !== undefined) cleaned[key] = sanitized;
    }
    return cleaned;
  }
  return undefined;
}

export function sanitizeAiUsageMetadata(
  metadata: AiUsageMetadata | null | undefined,
): AiUsageMetadata {
  const sanitized = sanitizeMetadataValue(metadata ?? {});
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as AiUsageMetadata)
    : {};
}

export function normalizeAiUsageEvent(
  event: AiUsageEventInput,
  options: NormalizeAiUsageOptions = {},
): NormalizedAiUsageEvent {
  if (!event.feature) throw new Error("AI usage feature is required");
  if (!event.provider) throw new Error("AI usage provider is required");
  if (!event.model?.trim()) throw new Error("AI usage model is required");

  const inputTokens = tokenCount(event.inputTokens);
  const outputTokens = tokenCount(event.outputTokens);
  const cachedInputTokens = tokenCount(event.cachedInputTokens);
  const reasoningTokens = tokenCount(event.reasoningTokens);
  const imageTokens = tokenCount(event.imageTokens);
  const audioTokens = tokenCount(event.audioTokens);
  const inferredTotal =
    inputTokens +
    outputTokens +
    imageTokens +
    audioTokens +
    (outputTokens === 0 ? reasoningTokens : 0);
  const totalTokens = tokenCount(event.totalTokens) || inferredTotal;
  const costUsd =
    money(event.costUsd) ??
    estimateAiUsageCostUsd(
      {
        provider: event.provider,
        model: event.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        reasoningTokens,
        imageTokens,
        audioTokens,
      },
      options.pricingRegistry,
    ).toFixed(6);

  return {
    environment:
      cleanShortString(event.environment) ??
      cleanShortString(options.env?.NODE_ENV) ??
      cleanShortString(process.env.NODE_ENV) ??
      "development",
    userId: integerOrUndefined(event.userId),
    matchId: integerOrUndefined(event.matchId),
    conversationId: integerOrUndefined(event.conversationId),
    feature: event.feature,
    provider: event.provider,
    model: event.model.trim(),
    requestId: cleanShortString(event.requestId),
    traceId: cleanShortString(event.traceId),
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    imageTokens,
    audioTokens,
    totalTokens,
    costUsd,
    latencyMs: integerOrUndefined(event.latencyMs),
    success: Boolean(event.success),
    errorType: cleanShortString(event.errorType),
    errorMessage: redactAiErrorMessage(event.errorMessage),
    retryCount: tokenCount(event.retryCount),
    metadata: sanitizeAiUsageMetadata(event.metadata),
    promptVersion: cleanShortString(event.promptVersion),
    responseSchemaVersion: cleanShortString(event.responseSchemaVersion),
  };
}

async function insertAiUsageEvent(
  event: NormalizedAiUsageEvent,
): Promise<void> {
  const { db } = await import("@workspace/db");
  await db.insert(aiUsageEvents).values(event);
}

export async function recordAiUsageEvent(
  event: AiUsageEventInput,
  options: RecordAiUsageOptions = {},
): Promise<void> {
  try {
    const normalized = normalizeAiUsageEvent(event, options);
    await (options.insertEvent ?? insertAiUsageEvent)(normalized);
  } catch (err) {
    const log = options.logger ?? defaultLogger;
    log.warn({ err, feature: event.feature }, "AI usage tracking failed");
  }
}
