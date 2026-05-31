import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAiUsageSummary } from "./aiUsageSummary";

test("builds spend, latency, error, retry, and call-count summary", () => {
  const summary = buildAiUsageSummary(
    [
      {
        createdAt: new Date("2026-05-31T11:00:00.000Z"),
        feature: "calm_read",
        provider: "openai",
        model: "gpt-mini",
        costUsd: "0.020000",
        latencyMs: 800,
        success: true,
        retryCount: 0,
      },
      {
        createdAt: new Date("2026-05-31T10:00:00.000Z"),
        feature: "calm_read",
        provider: "openai",
        model: "gpt-mini",
        costUsd: "0.040000",
        latencyMs: 1200,
        success: false,
        retryCount: 1,
      },
      {
        createdAt: new Date("2026-05-28T10:00:00.000Z"),
        feature: "safety_escalation",
        provider: "anthropic",
        model: "strong-model",
        costUsd: "0.500000",
        latencyMs: 3000,
        success: true,
        retryCount: 2,
      },
      {
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        feature: "reply_suggestion",
        provider: "openai",
        model: "gpt-mini",
        costUsd: "0.250000",
        latencyMs: 700,
        success: true,
        retryCount: 0,
      },
    ],
    new Date("2026-05-31T12:00:00.000Z"),
  );

  assert.equal(summary.totalSpendTodayUsd, 0.06);
  assert.equal(summary.totalSpendLast7DaysUsd, 0.56);
  assert.deepEqual(summary.spendByFeature, {
    calm_read: 0.06,
    safety_escalation: 0.5,
    reply_suggestion: 0.25,
  });
  assert.deepEqual(summary.spendByProviderModel, {
    "anthropic:strong-model": 0.5,
    "openai:gpt-mini": 0.31,
  });
  assert.equal(summary.averageCostPerCalmReadUsd, 0.03);
  assert.deepEqual(summary.averageLatencyByFeatureMs, {
    calm_read: 1000,
    safety_escalation: 3000,
    reply_suggestion: 700,
  });
  assert.deepEqual(summary.errorRetryCounts, {
    errors: 1,
    retries: 3,
  });
  assert.deepEqual(summary.callsByFeature, {
    calm_read: 2,
    safety_escalation: 1,
    reply_suggestion: 1,
  });
  assert.deepEqual(summary.topExpensiveFeatures.slice(0, 2), [
    { feature: "safety_escalation", costUsd: 0.5 },
    { feature: "reply_suggestion", costUsd: 0.25 },
  ]);
});
