import { Router, type IRouter } from "express";
import { db, productFeedback } from "@workspace/db";
import { CreateProductFeedbackBody } from "@workspace/api-zod";
import { normalizeProductFeedback } from "../lib/productFeedback";

const router: IRouter = Router();

router.post("/feedback", async (req, res): Promise<void> => {
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
    const [created] = await db
      .insert(productFeedback)
      .values(normalized)
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Product feedback failed");
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;
