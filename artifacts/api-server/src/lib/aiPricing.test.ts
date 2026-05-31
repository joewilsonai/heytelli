import assert from "node:assert/strict";
import { test } from "node:test";

import {
  estimateAiUsageCostUsd,
  lookupModelPricing,
  type AiModelPricing,
} from "./aiPricing";

const registry: AiModelPricing[] = [
  {
    provider: "openai",
    model: "unit-test-model",
    inputCostPer1MTokens: 1.25,
    outputCostPer1MTokens: 5,
    cachedInputCostPer1MTokens: 0.25,
    reasoningCostPer1MTokens: 8,
    imageCostPer1MTokens: 2,
    audioCostPer1MTokens: 3,
    effectiveAt: "2026-05-31",
  },
];

test("looks up model pricing by provider and model", () => {
  assert.deepEqual(lookupModelPricing("openai", "unit-test-model", registry), {
    provider: "openai",
    model: "unit-test-model",
    inputCostPer1MTokens: 1.25,
    outputCostPer1MTokens: 5,
    cachedInputCostPer1MTokens: 0.25,
    reasoningCostPer1MTokens: 8,
    imageCostPer1MTokens: 2,
    audioCostPer1MTokens: 3,
    effectiveAt: "2026-05-31",
  });
  assert.equal(lookupModelPricing("anthropic", "missing", registry), null);
});

test("estimates cost from token buckets", () => {
  const cost = estimateAiUsageCostUsd(
    {
      provider: "openai",
      model: "unit-test-model",
      inputTokens: 1_000,
      outputTokens: 2_000,
      cachedInputTokens: 500,
      reasoningTokens: 100,
      imageTokens: 50,
      audioTokens: 10,
    },
    registry,
  );

  const expected =
    ((1_000 - 500) / 1_000_000) * 1.25 +
    (2_000 / 1_000_000) * 5 +
    (500 / 1_000_000) * 0.25 +
    (100 / 1_000_000) * 8 +
    (50 / 1_000_000) * 2 +
    (10 / 1_000_000) * 3;
  assert.equal(cost, Number(expected.toFixed(8)));
});

test("returns zero for unknown pricing instead of guessing", () => {
  assert.equal(
    estimateAiUsageCostUsd({
      provider: "openai",
      model: "unknown-private-model",
      inputTokens: 10_000,
      outputTokens: 10_000,
    }),
    0,
  );
});
