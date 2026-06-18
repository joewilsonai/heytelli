import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActualFeatureCreationCost,
  estimateFeatureCreationCost,
  extractCodexTotalTokens,
  reviewerRolesForFeatureCost,
} from "./featureCost";

const pricingRegistry = [
  {
    provider: "openai" as const,
    model: "gpt-5.3-codex",
    inputCostPer1MTokens: 1.75,
    outputCostPer1MTokens: 14,
    cachedInputCostPer1MTokens: 0.175,
  },
];

test("estimates feature cost from risk tier, priority, and reviewer lanes", () => {
  const estimate = estimateFeatureCreationCost(
    {
      riskTier: "guarded_auto_merge",
      priority: "p2",
      frequencyCount: 4,
    },
    { pricingRegistry },
  );

  assert.equal(estimate.phase, "estimate");
  assert.equal(estimate.model, "gpt-5.3-codex");
  assert.equal(estimate.effort.reviewerAgents, 3);
  assert.equal(estimate.totalTokens, 237_000);
  assert.equal(estimate.estimatedUsd, 0.76314);
  assert.equal(estimate.costPerRequestUsd, 0.190785);
  assert.equal(estimate.confidence, "low");
});

test("uses supplied reviewer roles for no-auto-merge research estimates", () => {
  assert.deepEqual(
    reviewerRolesForFeatureCost({
      riskTier: "no_auto_merge",
      reviewerRoles: ["product_reviewer", "code_reviewer"],
    }),
    ["product_reviewer", "code_reviewer"],
  );
});

test("extracts the last Codex total token count from agent output", () => {
  assert.equal(
    extractCodexTotalTokens(
      [
        "some output",
        "tokens used",
        "77,573",
        "later retry",
        "tokens used: 88,100",
      ].join("\n"),
    ),
    88_100,
  );
  assert.equal(extractCodexTotalTokens("no usage footer"), 0);
});

test("builds actual feature cost from observed tokens and effort counts", () => {
  const estimate = estimateFeatureCreationCost(
    {
      riskTier: "safe_auto_merge",
      priority: "p3",
      frequencyCount: 2,
    },
    { pricingRegistry },
  );
  const actual = buildActualFeatureCreationCost(
    {
      riskTier: "safe_auto_merge",
      priority: "p3",
      frequencyCount: 2,
      estimate,
      agentOutputText: "tokens used\n77,573",
      reviewerAgentsRun: 2,
      traceDurationMs: 120_000,
      runTypes: ["review", "deploy"],
      retries: 1,
    },
    { pricingRegistry },
  );

  assert.equal(actual.phase, "actual");
  assert.equal(actual.actualUsd, 0.404336);
  assert.equal(actual.costPerRequestUsd, 0.202168);
  assert.equal(actual.totalTokens, 125_573);
  assert.equal(actual.effort.reviewerAgents, 2);
  assert.equal(actual.effort.traceDurationMs, 120_000);
  assert.equal(actual.effort.ciRuns, 1);
  assert.equal(actual.effort.releaseRuns, 1);
  assert.equal(actual.effort.retries, 1);
  assert.equal(actual.lineItems[0]?.confidence, "medium");
});
