import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";

test("normalizes usage fields, cost override, and safe metadata", async () => {
  const { normalizeAiUsageEvent } = await import("./aiUsage");

  const normalized = normalizeAiUsageEvent({
    environment: "test",
    feature: "calm_read",
    provider: "openai",
    model: "unit-test-model",
    userId: 7,
    matchId: 11,
    success: true,
    inputTokens: 10,
    outputTokens: 20,
    cachedInputTokens: undefined,
    costUsd: 0.123456,
    metadata: {
      messageCount: 3,
      prompt: "do not persist this",
      nested: {
        safeId: "abc",
        content: "also sensitive",
      },
    },
  });

  assert.equal(normalized.totalTokens, 30);
  assert.equal(normalized.cachedInputTokens, 0);
  assert.equal(normalized.costUsd, "0.123456");
  assert.deepEqual(normalized.metadata, {
    messageCount: 3,
    nested: { safeId: "abc" },
  });
});

test("infers cost when provider did not return one", async () => {
  const { normalizeAiUsageEvent } = await import("./aiUsage");

  const normalized = normalizeAiUsageEvent(
    {
      environment: "test",
      feature: "reply_suggestion",
      provider: "mock",
      model: "metered-mock",
      success: true,
      inputTokens: 1_000,
      outputTokens: 1_000,
    },
    {
      pricingRegistry: [
        {
          provider: "mock",
          model: "metered-mock",
          inputCostPer1MTokens: 2,
          outputCostPer1MTokens: 4,
          effectiveAt: "2026-05-31",
        },
      ],
    },
  );

  assert.equal(normalized.costUsd, "0.006000");
});

test("recordAiUsageEvent never throws when persistence fails", async () => {
  const { recordAiUsageEvent } = await import("./aiUsage");
  let insertCalls = 0;
  let warningCalls = 0;

  await recordAiUsageEvent(
    {
      environment: "test",
      feature: "pattern_extraction",
      provider: "mock",
      model: "metered-mock",
      success: false,
      errorType: "Error",
      errorMessage: "raw stack with secret token abc123",
    },
    {
      insertEvent: async () => {
        insertCalls += 1;
        throw new Error("database unavailable");
      },
      logger: {
        warn: () => {
          warningCalls += 1;
        },
      },
    },
  );

  assert.equal(insertCalls, 1);
  assert.equal(warningCalls, 1);
});
