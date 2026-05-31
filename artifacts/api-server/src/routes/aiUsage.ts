import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { aiUsageEvents, db } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { buildAiUsageSummary } from "../lib/aiUsageSummary";
import { parseMonthlyBudgetWarningUsd } from "../lib/aiBudgetGuards";

const router: IRouter = Router();

router.use(requireAuth);

function summaryLimit(): number {
  const raw = process.env.AI_USAGE_SUMMARY_LIMIT?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 25_000) : 5_000;
}

router.get(
  "/admin/ai-usage/summary",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const rows = await db
        .select({
          createdAt: aiUsageEvents.createdAt,
          feature: aiUsageEvents.feature,
          provider: aiUsageEvents.provider,
          model: aiUsageEvents.model,
          costUsd: aiUsageEvents.costUsd,
          latencyMs: aiUsageEvents.latencyMs,
          success: aiUsageEvents.success,
          retryCount: aiUsageEvents.retryCount,
        })
        .from(aiUsageEvents)
        .orderBy(desc(aiUsageEvents.createdAt))
        .limit(summaryLimit());

      const summary = buildAiUsageSummary(rows);
      const warningThresholdUsd = parseMonthlyBudgetWarningUsd();
      res.json({
        ...summary,
        monthlyBudgetWarningUsd: warningThresholdUsd,
        monthlyBudgetWarningExceeded:
          warningThresholdUsd != null &&
          summary.totalSpendLast7DaysUsd * 4.35 >= warningThresholdUsd,
      });
    } catch (err) {
      req.log.error({ err }, "AI usage summary failed");
      res.status(500).json({ error: "Failed to load AI usage summary" });
    }
  },
);

export default router;
