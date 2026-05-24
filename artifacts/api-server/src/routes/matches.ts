import { Router, type IRouter } from "express";
import { eq, desc, asc, inArray } from "drizzle-orm";
import {
  db,
  matches,
  matchScoreHistory,
  screenshots,
  emptyExtractedProfile,
  normalizeExtractedProfile,
  normalizeDateHistory,
  normalizeTranscript,
} from "@workspace/db";
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
  RescoreMatchParams,
  VoiceDebriefParams,
  VoiceDebriefBody,
} from "@workspace/api-zod";
import { transcribeAudioObject } from "../lib/audio";
import { analyzeVoiceDebrief } from "../lib/voiceDebrief";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  extractFromScreenshot,
  extractFromScreenshots,
  mergeExtraction,
  mergeVibeTags,
  generateRepliesFromContext,
  recordScoreHistory,
  runExtractionInBackground,
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

function withNormalizedProfile<
  T extends { extractedProfile: unknown; dateHistory?: unknown },
>(m: T) {
  return {
    ...m,
    extractedProfile: normalizeExtractedProfile(m.extractedProfile),
    dateHistory: normalizeDateHistory(m.dateHistory),
  };
}

async function loadMatchDetail(matchId: number) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return null;
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, matchId))
    .orderBy(asc(screenshots.uploadedAt));
  return {
    ...withNormalizedProfile(match),
    transcript: normalizeTranscript(match.transcript),
    screenshots: shots,
  };
}

router.get("/matches", async (_req, res): Promise<void> => {
  const rows = await db.select().from(matches).orderBy(desc(matches.updatedAt));
  const ids = rows.map((r) => r.id);
  const history = ids.length
    ? await db
        .select()
        .from(matchScoreHistory)
        .where(inArray(matchScoreHistory.matchId, ids))
        .orderBy(asc(matchScoreHistory.createdAt))
    : [];
  const byMatch = new Map<number, typeof history>();
  for (const h of history) {
    const arr = byMatch.get(h.matchId) ?? [];
    arr.push(h);
    byMatch.set(h.matchId, arr);
  }

  const shotRows = ids.length
    ? await db
        .select({
          matchId: screenshots.matchId,
          uploadedAt: screenshots.uploadedAt,
        })
        .from(screenshots)
        .where(inArray(screenshots.matchId, ids))
    : [];
  const lastActivity = new Map<number, Date>();
  for (const s of shotRows) {
    const prev = lastActivity.get(s.matchId);
    if (!prev || s.uploadedAt > prev) lastActivity.set(s.matchId, s.uploadedAt);
  }

  res.json(
    rows.map((r) => {
      const turns = normalizeTranscript(r.transcript);
      const lastTurn = turns[turns.length - 1];
      const lastAct = lastActivity.get(r.id) ?? null;
      return {
        ...withNormalizedProfile(r),
        scoreHistory: (byMatch.get(r.id) ?? []).map((h) => ({
          sexPotential: h.sexPotential,
          conversionAbility: h.conversionAbility,
          chemistry: h.chemistry,
          createdAt: h.createdAt.toISOString(),
        })),
        lastSpeaker: lastTurn ? lastTurn.speaker : null,
        lastActivityAt: lastAct ? lastAct.toISOString() : null,
      };
    }),
  );
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

  const { screenshotObjectPath, name } = parsed.data;
  const initialName = (name ?? "").trim() || "New Match";

  const [created] = await db
    .insert(matches)
    .values({
      name: initialName,
      photoObjectPath: screenshotObjectPath,
      vibeTags: [],
      extractedProfile: emptyExtractedProfile,
      notes: "",
    })
    .returning();

  const [shot] = await db
    .insert(screenshots)
    .values({
      matchId: created.id,
      objectPath: screenshotObjectPath,
      extractionStatus: "pending",
    })
    .returning();

  runExtractionInBackground(created.id, shot.id, screenshotObjectPath, {
    applySuggestedName: true,
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
  if (body.data.nextDateAt !== undefined)
    updates.nextDateAt = body.data.nextDateAt
      ? new Date(body.data.nextDateAt)
      : null;
  if (body.data.nextDateLocation !== undefined)
    updates.nextDateLocation = body.data.nextDateLocation;
  if (body.data.dateHistory !== undefined)
    updates.dateHistory = normalizeDateHistory(body.data.dateHistory);
  if (body.data.transcript !== undefined)
    updates.transcript = normalizeTranscript(body.data.transcript);
  if (body.data.status !== undefined) updates.status = body.data.status;

  if (Object.keys(updates).length === 0) {
    const [existing] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json(withNormalizedProfile(existing));
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
  res.json(withNormalizedProfile(updated));
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

  // Mark the screenshot as "done" immediately. The client batches uploads
  // and triggers a single /rescore call after the batch, which analyzes
  // every screenshot together — much cheaper and avoids rate limits.
  await db
    .insert(screenshots)
    .values({
      matchId: match.id,
      objectPath: body.data.objectPath,
      extractionStatus: "done",
    })
    .returning();

  const detail = await loadMatchDetail(match.id);
  res.json(detail);
});

router.post("/matches/:id/rescore", async (req, res): Promise<void> => {
  const params = RescoreMatchParams.safeParse(req.params);
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
    const extraction = await extractFromScreenshots(dataUrls, {
      nextDateAt: detail.nextDateAt,
      nextDateLocation: detail.nextDateLocation,
      dateHistory: detail.dateHistory,
    });
    const mergedProfile = mergeExtraction(
      detail.extractedProfile,
      extraction.profile,
    );
    const mergedTags = mergeVibeTags(detail.vibeTags, extraction.vibeTags);
    const updates: Record<string, unknown> = {
      extractedProfile: mergedProfile,
      vibeTags: mergedTags,
    };
    if (extraction.transcript.length > 0) {
      updates.transcript = extraction.transcript;
    }
    await db
      .update(matches)
      .set(updates)
      .where(eq(matches.id, detail.id));
    await recordScoreHistory(detail.id, mergedProfile.scores);
    // Clear any prior per-screenshot failure badges — we just successfully
    // read the whole conversation in one shot.
    await db
      .update(screenshots)
      .set({ extractionStatus: "done", extractionError: null })
      .where(eq(screenshots.matchId, detail.id));
    const refreshed = await loadMatchDetail(detail.id);
    res.json(refreshed);
  } catch (err) {
    req.log.error({ err }, "Rescore failed");
    res.status(500).json({ error: "Failed to rescore match" });
  }
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

router.post("/matches/:id/voice-debrief", async (req, res): Promise<void> => {
  const params = VoiceDebriefParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = VoiceDebriefBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const detail = await loadMatchDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  try {
    const transcript = await transcribeAudioObject(body.data.audioObjectPath);
    if (!transcript) {
      res.status(400).json({ error: "Transcription returned empty text" });
      return;
    }

    const analysis = await analyzeVoiceDebrief(transcript, {
      name: detail.name,
      priorVibe: detail.vibeTags.join(", ") || null,
      priorScores: detail.extractedProfile.scores,
    });

    // Persist: update scores (only fields where suggestion has a value),
    // append the debrief to notes, optionally add a date history entry.
    const mergedScores = { ...detail.extractedProfile.scores };
    for (const key of ["sexPotential", "conversionAbility", "chemistry"] as const) {
      const s = analysis.scoreSuggestions[key];
      if (s.value != null) mergedScores[key] = s;
    }
    const mergedProfile = {
      ...detail.extractedProfile,
      scores: mergedScores,
    };

    const noteHeader = `\n\n— Voice debrief (${new Date().toLocaleDateString()}) —\n`;
    const noteBody = [
      `Summary: ${analysis.summary}`,
      analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
      analysis.greenFlags.length ? `Green flags:\n${analysis.greenFlags.map((f) => `  • ${f}`).join("\n")}` : null,
      analysis.redFlags.length ? `Red flags:\n${analysis.redFlags.map((f) => `  • ${f}`).join("\n")}` : null,
      analysis.nextMoveSuggestion ? `Next move: ${analysis.nextMoveSuggestion}` : null,
      `\nTranscript:\n"${transcript}"`,
    ]
      .filter(Boolean)
      .join("\n");
    const updatedNotes = (detail.notes || "").trim() + noteHeader + noteBody;

    const updates: Record<string, unknown> = {
      extractedProfile: mergedProfile,
      notes: updatedNotes,
      lastActivityAt: new Date(),
    };

    if (body.data.addToDateHistory) {
      const newEntry = {
        at: new Date().toISOString(),
        location: detail.nextDateLocation,
        notes: analysis.summary,
        vibe: analysis.vibe,
      };
      const history = [...detail.dateHistory, newEntry];
      updates.dateHistory = history;
      // If this was the upcoming date, clear it.
      if (detail.nextDateAt) {
        updates.nextDateAt = null;
        updates.nextDateLocation = null;
      }
    }

    await db.update(matches).set(updates).where(eq(matches.id, detail.id));
    await recordScoreHistory(detail.id, mergedScores);

    const refreshed = await loadMatchDetail(detail.id);
    res.json({ transcript, analysis, match: refreshed });
  } catch (err) {
    req.log.error({ err }, "Voice debrief failed");
    res.status(500).json({ error: "Voice debrief failed" });
  }
});

export default router;
