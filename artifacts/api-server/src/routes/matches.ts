import { Router, type IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, matches, screenshots, emptyExtractedProfile } from "@workspace/db";
import {
  CreateMatchBody,
  GetMatchParams,
  UpdateMatchParams,
  UpdateMatchBody,
  DeleteMatchParams,
  AddScreenshotParams,
  AddScreenshotBody,
  GenerateMatchRepliesParams,
  PreviewMatchExtractionBody,
  ListScreenshotsParams,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  extractFromScreenshot,
  mergeExtraction,
  mergeVibeTags,
  generateRepliesFromContext,
} from "../lib/extraction";

const router: IRouter = Router();
const storage = new ObjectStorageService();

async function objectPathToDataUrl(objectPath: string): Promise<string> {
  const file = await storage.getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  const contentType = (meta.contentType as string) || "image/png";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

async function loadMatchDetail(matchId: number) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return null;
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, matchId))
    .orderBy(asc(screenshots.uploadedAt));
  return { ...match, screenshots: shots };
}

router.get("/matches", async (_req, res): Promise<void> => {
  const rows = await db.select().from(matches).orderBy(desc(matches.updatedAt));
  res.json(rows);
});

router.post("/matches/preview", async (req, res): Promise<void> => {
  const parsed = PreviewMatchExtractionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const dataUrl = await objectPathToDataUrl(parsed.data.objectPath);
    const extraction = await extractFromScreenshot(dataUrl);
    res.json({
      suggestedName: extraction.suggestedName,
      vibeTags: extraction.vibeTags,
      extractedProfile: mergeExtraction(emptyExtractedProfile, extraction.profile),
    });
  } catch (err) {
    req.log.error({ err }, "Extraction preview failed");
    res.status(500).json({ error: "Failed to analyze screenshot" });
  }
});

router.post("/matches", async (req, res): Promise<void> => {
  const parsed = CreateMatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { screenshotObjectPath, name, vibeTags, extractedProfile } = parsed.data;

  const [created] = await db
    .insert(matches)
    .values({
      name: name.trim() || "New Match",
      photoObjectPath: screenshotObjectPath,
      vibeTags,
      extractedProfile,
      notes: "",
    })
    .returning();

  await db.insert(screenshots).values({
    matchId: created.id,
    objectPath: screenshotObjectPath,
  });

  const detail = await loadMatchDetail(created.id);
  res.status(201).json(detail);
});

router.get("/matches/:id", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await loadMatchDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(detail);
});

router.patch("/matches/:id", async (req, res): Promise<void> => {
  const params = UpdateMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.notes !== undefined) updates.notes = body.data.notes;
  if (body.data.vibeTags !== undefined) updates.vibeTags = body.data.vibeTags;
  if (body.data.extractedProfile !== undefined)
    updates.extractedProfile = body.data.extractedProfile;
  if (body.data.photoObjectPath !== undefined)
    updates.photoObjectPath = body.data.photoObjectPath;

  if (Object.keys(updates).length === 0) {
    const [existing] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json(existing);
    return;
  }

  const [updated] = await db
    .update(matches)
    .set(updates)
    .where(eq(matches.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(updated);
});

router.delete("/matches/:id", async (req, res): Promise<void> => {
  const params = DeleteMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(matches)
    .where(eq(matches.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/matches/:id/screenshots", async (req, res): Promise<void> => {
  const params = ListScreenshotsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, params.data.id))
    .orderBy(asc(screenshots.uploadedAt));
  res.json(shots);
});

router.post("/matches/:id/screenshots", async (req, res): Promise<void> => {
  const params = AddScreenshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddScreenshotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  let extraction;
  try {
    const dataUrl = await objectPathToDataUrl(body.data.objectPath);
    extraction = await extractFromScreenshot(dataUrl);
  } catch (err) {
    req.log.error({ err }, "Extraction failed during screenshot add");
    res.status(500).json({ error: "Failed to analyze screenshot" });
    return;
  }

  const mergedProfile = mergeExtraction(match.extractedProfile, extraction.profile);
  const mergedTags = mergeVibeTags(match.vibeTags, extraction.vibeTags);

  await db
    .update(matches)
    .set({
      extractedProfile: mergedProfile,
      vibeTags: mergedTags,
    })
    .where(eq(matches.id, match.id));

  await db.insert(screenshots).values({
    matchId: match.id,
    objectPath: body.data.objectPath,
  });

  const detail = await loadMatchDetail(match.id);
  res.json(detail);
});

router.post("/matches/:id/replies", async (req, res): Promise<void> => {
  const params = GenerateMatchRepliesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await loadMatchDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  if (detail.screenshots.length === 0) {
    res.status(400).json({ error: "Match has no screenshots yet" });
    return;
  }

  try {
    const dataUrls = await Promise.all(
      detail.screenshots.map((s) => objectPathToDataUrl(s.objectPath)),
    );
    const replies = await generateRepliesFromContext(
      dataUrls,
      detail.extractedProfile,
      detail.name,
      detail.notes,
    );
    res.json({ replies });
  } catch (err) {
    req.log.error({ err }, "Reply generation failed");
    res.status(500).json({ error: "Failed to generate replies" });
  }
});

export default router;
