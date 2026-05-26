import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, matches, productFeedback } from "@workspace/db";
import { CreateProductFeedbackBody } from "@workspace/api-zod";
import { normalizeProductFeedback } from "../lib/productFeedback";
import { requireAuth, requireUserId } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.post("/feedback", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  const body = CreateProductFeedbackBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const normalized = normalizeProductFeedback(body.data);
  if (!normalized) {
    res.status(400).json({ error: "Feedback event and answer are required" });
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
    const [created] = await db
      .insert(productFeedback)
      .values({ ...normalized, userId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Product feedback failed");
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;
