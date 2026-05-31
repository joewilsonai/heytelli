import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";
process.env.NODE_ENV ??= "test";

test("runModelTask records usage with feature, user, and match context", async () => {
  const { runModelTask } = await import("./modelRouter");
  const recorded: unknown[] = [];
  const payloads: unknown[] = [];

  const result = await runModelTask(
    {
      feature: "calm_read",
      userId: 7,
      matchId: 11,
      provider: "mock",
      preferredModel: "metered-mock",
      messages: [{ role: "user", content: "safe synthetic test input" }],
      responseFormat: { type: "json_object" },
      metadata: { messageCount: 1 },
      promptVersion: "calm_read:v1",
      responseSchemaVersion: "calm_read_schema:v1",
    },
    {
      now: () => 1_000,
      createChatCompletion: async (payload) => {
        payloads.push(payload);
        return {
          id: "chatcmpl_test",
          choices: [{ message: { content: "{\"ok\":true}" } }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: 20 },
            completion_tokens_details: { reasoning_tokens: 5 },
          },
        };
      },
      recordUsageEvent: async (event) => {
        recorded.push(event);
      },
    },
  );

  assert.deepEqual(result.parsedJson, { ok: true });
  assert.equal(payloads.length, 1);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    environment: "test",
    feature: "calm_read",
    provider: "mock",
    model: "metered-mock",
    userId: 7,
    matchId: 11,
    conversationId: undefined,
    requestId: "chatcmpl_test",
    traceId: undefined,
    inputTokens: 120,
    outputTokens: 30,
    cachedInputTokens: 20,
    reasoningTokens: 5,
    imageTokens: 0,
    audioTokens: 0,
    totalTokens: 150,
    latencyMs: 0,
    success: true,
    retryCount: 0,
    metadata: { messageCount: 1 },
    promptVersion: "calm_read:v1",
    responseSchemaVersion: "calm_read_schema:v1",
  });
});

test("runModelTask records failed provider calls before rethrowing", async () => {
  const { runModelTask } = await import("./modelRouter");
  const recorded: Array<{ success?: boolean; errorType?: string | null }> = [];

  await assert.rejects(
    runModelTask(
      {
        feature: "safety_escalation",
        provider: "mock",
        preferredModel: "metered-mock",
        messages: [{ role: "user", content: "safe synthetic test input" }],
      },
      {
        now: () => 1_000,
        createChatCompletion: async () => {
          throw new Error("provider unavailable");
        },
        recordUsageEvent: async (event) => {
          recorded.push(event);
        },
      },
    ),
    /provider unavailable/,
  );

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.success, false);
  assert.equal(recorded[0]?.errorType, "Error");
});

test("runModelTask returns fallback without provider call when model calls are disabled", async () => {
  const { runModelTask } = await import("./modelRouter");
  const recorded: unknown[] = [];

  const result = await runModelTask(
    {
      feature: "calm_read",
      provider: "mock",
      preferredModel: "metered-mock",
      messages: [{ role: "user", content: "safe synthetic test input" }],
    },
    {
      env: { AI_MODEL_CALLS_DISABLED: "true", NODE_ENV: "test" },
      createChatCompletion: async () => {
        throw new Error("provider should not be called");
      },
      recordUsageEvent: async (event) => {
        recorded.push(event);
      },
    },
  );

  assert.equal(result.disabled, true);
  assert.match(result.content, /can't generate a new Calm Read right now/);
  assert.deepEqual(recorded, [
    {
      environment: "test",
      feature: "calm_read",
      provider: "local",
      model: "disabled",
      userId: undefined,
      matchId: undefined,
      conversationId: undefined,
      traceId: undefined,
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
      metadata: { disabled: true },
      promptVersion: undefined,
      responseSchemaVersion: undefined,
    },
  ]);
});
