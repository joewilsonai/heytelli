import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  AiUsageFeature,
  AiUsageProvider,
  AiUsageMetadata,
} from "@workspace/db";
import {
  getModelCallsDisabledFallback,
  isModelCallsDisabled,
} from "./aiBudgetGuards";
import {
  recordAiUsageEvent,
  type AiUsageEventInput,
} from "./aiUsage";

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: unknown;
};

export type ModelResponseFormat = { type: "json_object" } | Record<string, unknown>;

export type ModelTaskInput = {
  feature: AiUsageFeature;
  userId?: number;
  matchId?: number;
  conversationId?: number;
  messages: ModelMessage[];
  responseFormat?: ModelResponseFormat;
  priority?: "low" | "normal" | "high";
  riskLevel?: "low" | "medium" | "high";
  provider?: AiUsageProvider;
  preferredModel?: string;
  metadata?: AiUsageMetadata;
  promptVersion?: string;
  responseSchemaVersion?: string;
  traceId?: string;
  maxRetries?: number;
  temperature?: number;
  maxCompletionTokens?: number;
};

export type ModelTaskResult = {
  content: string;
  parsedJson?: unknown;
  disabled?: boolean;
  completion?: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    imageTokens: number;
    audioTokens: number;
    totalTokens: number;
    costUsd?: number;
    requestId?: string;
  };
};

type ChatCompletionPayload = {
  model: string;
  messages: ModelMessage[];
  response_format?: ModelResponseFormat;
  temperature?: number;
  max_completion_tokens?: number;
};

export type ModelRouterDeps = {
  env?: Partial<NodeJS.ProcessEnv>;
  now?: () => number;
  createChatCompletion?: (payload: ChatCompletionPayload) => Promise<unknown>;
  recordUsageEvent?: (event: AiUsageEventInput) => Promise<void>;
};

type Route = {
  provider: AiUsageProvider;
  model: string;
};

const CHEAP_FEATURES = new Set<AiUsageFeature>([
  "calm_read",
  "dating_clarity_lens",
  "emotional_pace_lens",
  "pattern_extraction",
  "evidence_mapping",
  "trusted_circle_summary",
  "ocr_cleanup",
  "reply_suggestion",
]);

function envValue(
  env: Partial<NodeJS.ProcessEnv>,
  key: string,
): string | undefined {
  return env[key]?.trim() || undefined;
}

export function chooseModelRoute(
  input: Pick<ModelTaskInput, "feature" | "provider" | "preferredModel">,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Route {
  const provider =
    input.provider ??
    (envValue(env, "AI_MODEL_DEFAULT_PROVIDER") as AiUsageProvider | undefined) ??
    "openai";
  if (input.preferredModel) return { provider, model: input.preferredModel };

  const cheapModel =
    envValue(env, "AI_MODEL_CHEAP_MODEL") ??
    envValue(env, "AI_MODEL_DEFAULT_MODEL") ??
    "gpt-5.4";
  const strongModel =
    envValue(env, "AI_MODEL_STRONG_MODEL") ??
    envValue(env, "AI_MODEL_DEFAULT_MODEL") ??
    "gpt-5.4";

  if (input.feature === "safety_escalation") {
    return {
      provider,
      model: envValue(env, "AI_MODEL_SAFETY_ESCALATION_MODEL") ?? strongModel,
    };
  }
  if (input.feature === "ocr_cleanup") {
    return {
      provider,
      model: envValue(env, "AI_MODEL_OCR_CLEANUP_MODEL") ?? cheapModel,
    };
  }
  if (CHEAP_FEATURES.has(input.feature)) {
    return { provider, model: cheapModel };
  }
  return {
    provider,
    model: envValue(env, "AI_MODEL_DEFAULT_MODEL") ?? strongModel,
  };
}

function environment(env: Partial<NodeJS.ProcessEnv>): string {
  return envValue(env, "NODE_ENV") ?? process.env.NODE_ENV ?? "development";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function nestedNumber(value: unknown, key: string): number {
  return value && typeof value === "object"
    ? numberField((value as Record<string, unknown>)[key])
    : 0;
}

function completionUsage(completion: unknown): ModelTaskResult["usage"] {
  const value =
    completion && typeof completion === "object"
      ? (completion as Record<string, unknown>)
      : {};
  const usage =
    value.usage && typeof value.usage === "object"
      ? (value.usage as Record<string, unknown>)
      : {};
  const promptDetails = usage.prompt_tokens_details ?? usage.input_tokens_details;
  const completionDetails =
    usage.completion_tokens_details ?? usage.output_tokens_details;
  const inputTokens =
    numberField(usage.input_tokens) || numberField(usage.prompt_tokens);
  const outputTokens =
    numberField(usage.output_tokens) || numberField(usage.completion_tokens);
  const cachedInputTokens =
    nestedNumber(promptDetails, "cached_tokens") ||
    nestedNumber(promptDetails, "cached_input_tokens");
  const reasoningTokens =
    nestedNumber(completionDetails, "reasoning_tokens") ||
    nestedNumber(usage, "reasoning_tokens");
  const imageTokens = numberField(usage.image_tokens);
  const audioTokens = numberField(usage.audio_tokens);
  const totalTokens =
    numberField(usage.total_tokens) ||
    inputTokens + outputTokens + imageTokens + audioTokens;
  const costUsd =
    typeof usage.cost_usd === "number"
      ? usage.cost_usd
      : typeof usage.cost === "number"
        ? usage.cost
        : undefined;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    imageTokens,
    audioTokens,
    totalTokens,
    costUsd,
    requestId: typeof value.id === "string" ? value.id : undefined,
  };
}

function completionContent(completion: unknown): string {
  const value =
    completion && typeof completion === "object"
      ? (completion as Record<string, unknown>)
      : {};
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

function parseJsonContent(content: string): unknown | undefined {
  if (!content.trim()) return undefined;
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function defaultCreateChatCompletion(
  route: Route,
  payload: ChatCompletionPayload,
): Promise<unknown> {
  if (route.provider !== "openai") {
    throw new Error(`Provider ${route.provider} is not configured yet`);
  }
  return openai.chat.completions.create(payload as never);
}

async function mockCompletion(payload: ChatCompletionPayload): Promise<unknown> {
  const json =
    payload.response_format?.type === "json_object"
      ? "{\"mock\":true}"
      : "Mock model response";
  return {
    id: `mock_${Date.now()}`,
    choices: [{ message: { content: json } }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export async function runModelTask(
  input: ModelTaskInput,
  deps: ModelRouterDeps = {},
): Promise<ModelTaskResult> {
  const env = deps.env ?? process.env;
  const start = deps.now?.() ?? Date.now();
  const route = chooseModelRoute(input, env);
  const record = deps.recordUsageEvent ?? recordAiUsageEvent;

  if (isModelCallsDisabled(env)) {
    const fallback = getModelCallsDisabledFallback();
    await record({
      environment: environment(env),
      feature: input.feature,
      provider: "local",
      model: "disabled",
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      success: false,
      errorType: "model_calls_disabled",
      errorMessage: "Model calls disabled by AI_MODEL_CALLS_DISABLED",
      retryCount: 0,
      metadata: { ...(input.metadata ?? {}), disabled: true },
      promptVersion: input.promptVersion,
      responseSchemaVersion: input.responseSchemaVersion,
    });
    return {
      content: fallback,
      disabled: true,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        imageTokens: 0,
        audioTokens: 0,
        totalTokens: 0,
      },
    };
  }

  const payload: ChatCompletionPayload = {
    model: route.model,
    messages: input.messages,
    response_format: input.responseFormat,
    temperature: input.temperature,
    max_completion_tokens: input.maxCompletionTokens,
  };
  const maxRetries = Math.max(0, Math.floor(input.maxRetries ?? 0));
  let retryCount = 0;

  for (;;) {
    try {
      const completion =
        deps.createChatCompletion != null
          ? await deps.createChatCompletion(payload)
          : route.provider === "mock" || envValue(env, "AI_MODEL_MOCK_MODE")
            ? await mockCompletion(payload)
            : await defaultCreateChatCompletion(route, payload);
      const usage = completionUsage(completion);
      const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
      const usageEvent: AiUsageEventInput = {
        environment: environment(env),
        feature: input.feature,
        provider: route.provider,
        model: route.model,
        userId: input.userId,
        matchId: input.matchId,
        conversationId: input.conversationId,
        requestId: usage.requestId,
        traceId: input.traceId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        imageTokens: usage.imageTokens,
        audioTokens: usage.audioTokens,
        totalTokens: usage.totalTokens,
        latencyMs,
        success: true,
        retryCount,
        metadata: input.metadata,
        promptVersion: input.promptVersion,
        responseSchemaVersion: input.responseSchemaVersion,
      };
      if (usage.costUsd != null) usageEvent.costUsd = usage.costUsd;
      await record(usageEvent);
      const content = completionContent(completion);
      return {
        content,
        parsedJson: parseJsonContent(content),
        completion,
        usage,
      };
    } catch (err) {
      if (retryCount < maxRetries) {
        retryCount += 1;
        continue;
      }
      const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
      await record({
        environment: environment(env),
        feature: input.feature,
        provider: route.provider,
        model: route.model,
        userId: input.userId,
        matchId: input.matchId,
        conversationId: input.conversationId,
        traceId: input.traceId,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        imageTokens: 0,
        audioTokens: 0,
        totalTokens: 0,
        latencyMs,
        success: false,
        errorType: errorType(err),
        errorMessage: errorMessage(err),
        retryCount,
        metadata: input.metadata,
        promptVersion: input.promptVersion,
        responseSchemaVersion: input.responseSchemaVersion,
      });
      throw err;
    }
  }
}

export type AudioTranscriptionTaskInput = {
  feature: AiUsageFeature;
  file: File;
  userId?: number;
  matchId?: number;
  conversationId?: number;
  provider?: AiUsageProvider;
  model?: string;
  metadata?: AiUsageMetadata;
  traceId?: string;
};

export type AudioTranscriptionDeps = {
  env?: Partial<NodeJS.ProcessEnv>;
  now?: () => number;
  createAudioTranscription?: (payload: {
    file: File;
    model: string;
  }) => Promise<unknown>;
  recordUsageEvent?: (event: AiUsageEventInput) => Promise<void>;
};

function transcriptionText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const text = (response as Record<string, unknown>).text;
  return typeof text === "string" ? text.trim() : "";
}

export async function runAudioTranscriptionTask(
  input: AudioTranscriptionTaskInput,
  deps: AudioTranscriptionDeps = {},
): Promise<string> {
  const env = deps.env ?? process.env;
  const start = deps.now?.() ?? Date.now();
  const provider = input.provider ?? "openai";
  const model =
    input.model ??
    envValue(env, "AI_AUDIO_TRANSCRIPTION_MODEL") ??
    "gpt-4o-mini-transcribe";
  const record = deps.recordUsageEvent ?? recordAiUsageEvent;

  if (isModelCallsDisabled(env)) {
    await record({
      environment: environment(env),
      feature: input.feature,
      provider: "local",
      model: "disabled",
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      success: false,
      errorType: "model_calls_disabled",
      errorMessage: "Model calls disabled by AI_MODEL_CALLS_DISABLED",
      retryCount: 0,
      metadata: { ...(input.metadata ?? {}), disabled: true },
    });
    return "";
  }

  try {
    const response =
      deps.createAudioTranscription != null
        ? await deps.createAudioTranscription({ file: input.file, model })
        : provider === "openai"
          ? await openai.audio.transcriptions.create({
              file: input.file,
              model,
            })
          : (() => {
              throw new Error(`Provider ${provider} is not configured yet`);
            })();
    const usage = completionUsage(response);
    const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
    await record({
      environment: environment(env),
      feature: input.feature,
      provider,
      model,
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      requestId: usage.requestId,
      traceId: input.traceId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      reasoningTokens: usage.reasoningTokens,
      imageTokens: usage.imageTokens,
      audioTokens: usage.audioTokens,
      totalTokens: usage.totalTokens,
      costUsd: usage.costUsd,
      latencyMs,
      success: true,
      retryCount: 0,
      metadata: input.metadata,
    });
    return transcriptionText(response);
  } catch (err) {
    const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
    await record({
      environment: environment(env),
      feature: input.feature,
      provider,
      model,
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs,
      success: false,
      errorType: errorType(err),
      errorMessage: errorMessage(err),
      retryCount: 0,
      metadata: input.metadata,
    });
    throw err;
  }
}

export type StreamingModelTaskInput = ModelTaskInput & {
  onContent: (content: string) => void | Promise<void>;
};

export type StreamingModelRouterDeps = ModelRouterDeps & {
  createStreamingChatCompletion?: (
    payload: ChatCompletionPayload & { stream: true },
  ) => Promise<AsyncIterable<unknown>>;
};

function streamChunkContent(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  const choices = (chunk as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const delta = (first as Record<string, unknown>).delta;
  if (!delta || typeof delta !== "object") return "";
  const content = (delta as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

async function defaultCreateStreamingChatCompletion(
  route: Route,
  payload: ChatCompletionPayload & { stream: true },
): Promise<AsyncIterable<unknown>> {
  if (route.provider !== "openai") {
    throw new Error(`Provider ${route.provider} is not configured yet`);
  }
  return (await openai.chat.completions.create(payload as never)) as unknown as AsyncIterable<unknown>;
}

export async function runStreamingModelTask(
  input: StreamingModelTaskInput,
  deps: StreamingModelRouterDeps = {},
): Promise<{ content: string; disabled?: boolean }> {
  const env = deps.env ?? process.env;
  const start = deps.now?.() ?? Date.now();
  const route = chooseModelRoute(input, env);
  const record = deps.recordUsageEvent ?? recordAiUsageEvent;

  if (isModelCallsDisabled(env)) {
    const fallback = getModelCallsDisabledFallback();
    await input.onContent(fallback);
    await record({
      environment: environment(env),
      feature: input.feature,
      provider: "local",
      model: "disabled",
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      success: false,
      errorType: "model_calls_disabled",
      errorMessage: "Model calls disabled by AI_MODEL_CALLS_DISABLED",
      retryCount: 0,
      metadata: { ...(input.metadata ?? {}), disabled: true, streaming: true },
      promptVersion: input.promptVersion,
      responseSchemaVersion: input.responseSchemaVersion,
    });
    return { content: fallback, disabled: true };
  }

  const payload: ChatCompletionPayload & { stream: true } = {
    model: route.model,
    messages: input.messages,
    response_format: input.responseFormat,
    temperature: input.temperature,
    max_completion_tokens: input.maxCompletionTokens,
    stream: true,
  };
  let fullResponse = "";

  try {
    const stream =
      deps.createStreamingChatCompletion != null
        ? await deps.createStreamingChatCompletion(payload)
        : await defaultCreateStreamingChatCompletion(route, payload);
    for await (const chunk of stream) {
      const content = streamChunkContent(chunk);
      if (!content) continue;
      fullResponse += content;
      await input.onContent(content);
    }
    const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
    await record({
      environment: environment(env),
      feature: input.feature,
      provider: route.provider,
      model: route.model,
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs,
      success: true,
      retryCount: 0,
      metadata: { ...(input.metadata ?? {}), streaming: true },
      promptVersion: input.promptVersion,
      responseSchemaVersion: input.responseSchemaVersion,
    });
    return { content: fullResponse };
  } catch (err) {
    const latencyMs = Math.max(0, (deps.now?.() ?? Date.now()) - start);
    await record({
      environment: environment(env),
      feature: input.feature,
      provider: route.provider,
      model: route.model,
      userId: input.userId,
      matchId: input.matchId,
      conversationId: input.conversationId,
      traceId: input.traceId,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      totalTokens: 0,
      latencyMs,
      success: false,
      errorType: errorType(err),
      errorMessage: errorMessage(err),
      retryCount: 0,
      metadata: { ...(input.metadata ?? {}), streaming: true },
      promptVersion: input.promptVersion,
      responseSchemaVersion: input.responseSchemaVersion,
    });
    throw err;
  }
}
