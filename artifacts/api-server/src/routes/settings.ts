import { Router, type IRouter } from "express";
import { analyzeUserDatingProfile } from "../lib/userProfileAnalysis";
import { requireAuth, requireUserId } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

function isDataImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpe?g|webp|heic|heif);base64,/i.test(value)
  );
}

router.post("/settings/profile/analyze", async (req, res): Promise<void> => {
  const images = Array.isArray(req.body?.images)
    ? req.body.images.filter(isDataImage).slice(0, 10)
    : [];

  if (images.length === 0) {
    res
      .status(400)
      .json({ error: "At least one profile screenshot is required" });
    return;
  }

  try {
    const analysis = await analyzeUserDatingProfile(images, {
      userId: requireUserId(req),
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Profile analysis failed");
    res.status(500).json({ error: "Failed to analyze profile screenshots" });
  }
});

export default router;
