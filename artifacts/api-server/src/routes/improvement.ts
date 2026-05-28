import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  improvementSignals,
  improvementWorkItems,
  matches,
} from "@workspace/db";
import {
  CreateImprovementSignalBody,
  GetImprovementWorkItemParams,
} from "@workspace/api-zod";
import {
  fingerprintImprovementSignal,
  normalizeImprovementSignalInput,
  sanitizeImprovementPayload,
} from "../lib/improvementPipeline";
import { requireAdmin, requireAuth, requireUserId } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.post("/improvement/signals", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  const body = CreateImprovementSignalBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const normalized = normalizeImprovementSignalInput(body.data);
  if (!normalized) {
    res.status(400).json({ error: "Feedback type and message are required" });
    return;
  }

  try {
    if (normalized.matchId != null) {
      const [match] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(eq(matches.id, normalized.matchId), eq(matches.userId, userId)),
        );
      if (!match) {
        res.status(404).json({ error: "Match not found" });
        return;
      }
    }

    const sanitized = sanitizeImprovementPayload(normalized.rawPayload);
    const fingerprint = fingerprintImprovementSignal(normalized);
    const [created] = await db
      .insert(improvementSignals)
      .values({
        userId,
        matchId: normalized.matchId,
        source: normalized.source,
        severity: sanitized.severity,
        rawPayload: normalized.rawPayload,
        sanitizedSummary: sanitized.summary,
        sanitizedPayload: sanitized.sanitizedPayload,
        privacyRisk: sanitized.privacyRisk,
        fingerprint,
        status: sanitized.privacyRisk === "blocked" ? "blocked" : "new",
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Improvement signal failed");
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

router.get(
  "/admin/improvement/signals",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(improvementSignals)
      .orderBy(desc(improvementSignals.createdAt))
      .limit(50);
    res.json(rows);
  },
);

router.get(
  "/admin/improvement/work-items",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(improvementWorkItems)
      .orderBy(desc(improvementWorkItems.createdAt))
      .limit(50);
    res.json(rows);
  },
);

router.get(
  "/admin/improvement/work-items/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = GetImprovementWorkItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [workItem] = await db
      .select()
      .from(improvementWorkItems)
      .where(eq(improvementWorkItems.id, params.data.id));
    if (!workItem) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }
    res.json(workItem);
  },
);

export default router;
