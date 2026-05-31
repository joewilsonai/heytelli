import type { AiUsageFeature, AiUsageProvider } from "@workspace/db";

export type AiUsageSummaryRow = {
  createdAt: Date | string;
  feature: AiUsageFeature | string;
  provider: AiUsageProvider | string;
  model: string;
  costUsd: string | number;
  latencyMs: number | null;
  success: boolean;
  retryCount: number;
};

export type AiUsageSummary = {
  generatedAt: string;
  totalSpendTodayUsd: number;
  totalSpendLast7DaysUsd: number;
  spendByFeature: Record<string, number>;
  spendByProviderModel: Record<string, number>;
  averageCostPerCalmReadUsd: number;
  averageLatencyByFeatureMs: Record<string, number>;
  errorRetryCounts: {
    errors: number;
    retries: number;
  };
  topExpensiveFeatures: Array<{ feature: string; costUsd: number }>;
  callsByFeature: Record<string, number>;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function amount(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function add(map: Record<string, number>, key: string, value: number): void {
  map[key] = (map[key] ?? 0) + value;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function roundInt(value: number): number {
  return Math.round(value);
}

export function buildAiUsageSummary(
  rows: AiUsageSummaryRow[],
  now: Date = new Date(),
): AiUsageSummary {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let totalSpendTodayUsd = 0;
  let totalSpendLast7DaysUsd = 0;
  let calmReadSpend = 0;
  let calmReadCalls = 0;
  let errors = 0;
  let retries = 0;
  const spendByFeature: Record<string, number> = {};
  const spendByProviderModel: Record<string, number> = {};
  const callsByFeature: Record<string, number> = {};
  const latencyTotals: Record<string, number> = {};
  const latencyCounts: Record<string, number> = {};

  for (const row of rows) {
    const createdAt = asDate(row.createdAt);
    const costUsd = amount(row.costUsd);
    const feature = String(row.feature);
    const providerModel = `${row.provider}:${row.model}`;

    if (createdAt >= todayStart) totalSpendTodayUsd += costUsd;
    if (createdAt >= sevenDaysAgo) totalSpendLast7DaysUsd += costUsd;
    add(spendByFeature, feature, costUsd);
    add(spendByProviderModel, providerModel, costUsd);
    add(callsByFeature, feature, 1);
    if (feature === "calm_read") {
      calmReadSpend += costUsd;
      calmReadCalls += 1;
    }
    if (typeof row.latencyMs === "number" && row.latencyMs >= 0) {
      add(latencyTotals, feature, row.latencyMs);
      add(latencyCounts, feature, 1);
    }
    if (!row.success) errors += 1;
    retries += Math.max(0, Math.floor(row.retryCount ?? 0));
  }

  const averageLatencyByFeatureMs: Record<string, number> = {};
  for (const [feature, total] of Object.entries(latencyTotals)) {
    averageLatencyByFeatureMs[feature] = roundInt(
      total / (latencyCounts[feature] ?? 1),
    );
  }

  const roundedSpendByFeature = Object.fromEntries(
    Object.entries(spendByFeature).map(([key, value]) => [key, roundMoney(value)]),
  );
  const roundedSpendByProviderModel = Object.fromEntries(
    Object.entries(spendByProviderModel).map(([key, value]) => [
      key,
      roundMoney(value),
    ]),
  );
  const topExpensiveFeatures = Object.entries(roundedSpendByFeature)
    .map(([feature, costUsd]) => ({ feature, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    generatedAt: now.toISOString(),
    totalSpendTodayUsd: roundMoney(totalSpendTodayUsd),
    totalSpendLast7DaysUsd: roundMoney(totalSpendLast7DaysUsd),
    spendByFeature: roundedSpendByFeature,
    spendByProviderModel: roundedSpendByProviderModel,
    averageCostPerCalmReadUsd: roundMoney(
      calmReadCalls > 0 ? calmReadSpend / calmReadCalls : 0,
    ),
    averageLatencyByFeatureMs,
    errorRetryCounts: { errors, retries },
    topExpensiveFeatures,
    callsByFeature,
  };
}
