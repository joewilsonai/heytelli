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
  VoiceNoteFeedbackParams,
  VoiceNoteFeedbackBody,
  InPersonRecordingParams,
  InPersonRecordingBody,
} from "@workspace/api-zod";
import { transcribeAudioObject } from "../lib/audio";
import { analyzeVoiceDebrief } from "../lib/voiceDebrief";
import { analyzeVoiceNote } from "../lib/voiceFeedback";
import { generateStaleNudgeOpeners } from "../lib/nudges";
import { analyzeRedFlags } from "../lib/redFlagRadar";
import { generateCheatSheet } from "../lib/cheatSheet";
import { generateWeeklyDebrief } from "../lib/weeklyDebrief";
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

// Static sub-paths must be registered BEFORE `/matches/:id` so Express
// doesn't try to parse "stale-nudges" as a numeric id.
router.get("/matches/stale-nudges", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.status, "active"));

    const ids = rows.map((r) => r.id);
    const shotRows = ids.length
      ? await db
          .select({
            matchId: screenshots.matchId,
            uploadedAt: screenshots.uploadedAt,
          })
          .from(screenshots)
          .where(inArray(screenshots.matchId, ids))
      : [];
    const lastShot = new Map<number, Date>();
    for (const s of shotRows) {
      const prev = lastShot.get(s.matchId);
      if (!prev || s.uploadedAt > prev) lastShot.set(s.matchId, s.uploadedAt);
    }

    const STALE_HOURS = 36;
    const now = Date.now();
    const candidates = rows
      .map(withNormalizedProfile)
      .map((m) => ({
        ...m,
        transcript: normalizeTranscript(m.transcript),
      }))
      .filter((m) => {
        const lastTurn = m.transcript[m.transcript.length - 1];
        if (!lastTurn || lastTurn.speaker === "me") return false;
        const lastActivity = lastShot.get(m.id) ?? m.updatedAt;
        if (!lastActivity) return false;
        const hours = (now - new Date(lastActivity).getTime()) / 3600000;
        return hours >= STALE_HOURS;
      })
      .slice(0, 8);

    const results = await Promise.all(
      candidates.map(async (m) => {
        const lastActivity = (lastShot.get(m.id) ?? m.updatedAt) as Date;
        const hours = (now - new Date(lastActivity).getTime()) / 3600000;
        let openers: string[] = [];
        try {
          openers = await generateStaleNudgeOpeners(
            m.name,
            hours,
            m.extractedProfile,
            m.transcript,
            m.notes ?? "",
          );
        } catch (err) {
          req.log.warn({ err, matchId: m.id }, "Nudge generation failed");
        }
        return {
          matchId: m.id,
          name: m.name,
          photoObjectPath: m.photoObjectPath,
          hoursSinceLastReply: Math.round(hours * 10) / 10,
          openers,
        };
      }),
    );

    res.json(results.filter((r) => r.openers.length > 0));
  } catch (err) {
    req.log.error({ err }, "Stale nudges failed");
    res.status(500).json({ error: "Failed to fetch stale nudges" });
  }
});

router.get("/matches/:id/red-flags", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [match] = await db.select().from(matches).where(eq(matches.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  try {
    const result = await analyzeRedFlags(
      match.name,
      normalizeExtractedProfile(match.extractedProfile),
      normalizeTranscript(match.transcript),
      normalizeDateHistory(match.dateHistory),
      match.notes ?? "",
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Red flag radar failed");
    res.status(500).json({ error: "Failed to analyze red flags" });
  }
});

router.get("/matches/:id/cheat-sheet", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [match] = await db.select().from(matches).where(eq(matches.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  try {
    const replies = await generateCheatSheet(
      match.name,
      normalizeExtractedProfile(match.extractedProfile),
      normalizeTranscript(match.transcript),
    );
    res.json({ replies });
  } catch (err) {
    req.log.error({ err }, "Cheat sheet failed");
    res.status(500).json({ error: "Failed to generate cheat sheet" });
  }
});

router.get("/matches/:id/response-stats", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [match] = await db.select().from(matches).where(eq(matches.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, params.data.id))
    .orderBy(asc(screenshots.uploadedAt));
  const turns = normalizeTranscript(match.transcript);
  const herCount = turns.filter((t) => t.speaker === "her").length;
  const meCount = turns.filter((t) => t.speaker === "me").length;

  // Approximate reply timing using screenshot upload gaps as a proxy.
  const gaps: number[] = [];
  for (let i = 1; i < shots.length; i++) {
    gaps.push(
      (shots[i].uploadedAt.getTime() - shots[i - 1].uploadedAt.getTime()) / 3_600_000,
    );
  }
  const avgGap =
    gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const longestGap = gaps.length > 0 ? Math.max(...gaps) : null;

  // Heuristic split: alternate her/me on gaps assuming roughly equal share.
  const herAvg =
    avgGap != null && herCount > 0
      ? Number(((avgGap * (meCount + 1)) / Math.max(herCount + meCount, 1)).toFixed(1))
      : null;
  const meAvg =
    avgGap != null && meCount > 0
      ? Number(((avgGap * (herCount + 1)) / Math.max(herCount + meCount, 1)).toFixed(1))
      : null;

  let cadence: "you_chasing" | "balanced" | "she_chasing" | "unknown" = "unknown";
  if (herCount + meCount >= 4) {
    const ratio = meCount / Math.max(herCount, 1);
    if (ratio > 1.5) cadence = "you_chasing";
    else if (ratio < 0.66) cadence = "she_chasing";
    else cadence = "balanced";
  }

  res.json({
    herAvgReplyHours: herAvg,
    meAvgReplyHours: meAvg,
    herMessageCount: herCount,
    meMessageCount: meCount,
    longestHerSilenceHours: longestGap != null ? Number(longestGap.toFixed(1)) : null,
    cadenceBalance: cadence,
  });
});

router.get("/matches/weekly-debrief", async (req, res): Promise<void> => {
  try {
    const allMatches = await db.select().from(matches);
    const active = allMatches.filter((m) => m.status === "active");
    const oneWeekAgo = Date.now() - 7 * 24 * 3_600_000;
    const newThisWeek = allMatches.filter(
      (m) => m.createdAt.getTime() >= oneWeekAgo,
    ).length;

    const ids = active.map((m) => m.id);
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
    const scoreRows = ids.length
      ? await db
          .select()
          .from(matchScoreHistory)
          .where(inArray(matchScoreHistory.matchId, ids))
          .orderBy(desc(matchScoreHistory.createdAt))
      : [];
    const latestScores = new Map<
      number,
      { sex: number | null; conv: number | null; chem: number | null }
    >();
    for (const s of scoreRows) {
      if (!latestScores.has(s.matchId)) {
        latestScores.set(s.matchId, {
          sex: s.sexPotential,
          conv: s.conversionAbility,
          chem: s.chemistry,
        });
      }
    }

    const now = Date.now();
    const input = active.map((m) => {
      const turns = normalizeTranscript(m.transcript);
      const lastTurn = turns[turns.length - 1];
      const last = lastActivity.get(m.id);
      const recent = turns
        .slice(-6)
        .map((t) => `${t.speaker}: ${t.text}`)
        .join(" | ");
      return {
        matchId: m.id,
        name: m.name,
        scores:
          latestScores.get(m.id) ?? { sex: null, conv: null, chem: null },
        hoursSinceLastActivity: last
          ? (now - last.getTime()) / 3_600_000
          : null,
        lastSpeaker: lastTurn ? lastTurn.speaker : null,
        recentTurns: recent,
        nextDateAt: m.nextDateAt ? m.nextDateAt.toISOString() : null,
      };
    });

    const result = await generateWeeklyDebrief({
      totalActive: active.length,
      newThisWeek,
      matches: input,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Weekly debrief failed");
    res.status(500).json({ error: "Failed to generate weekly debrief" });
  }
});

router.get(
  "/matches/auto-archive-candidates",
  async (req, res): Promise<void> => {
    try {
      const active = await db
        .select()
        .from(matches)
        .where(eq(matches.status, "active"));
      const ids = active.map((m) => m.id);
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
      const now = Date.now();
      const COLD_HOURS = 14 * 24; // 14 days
      const out = active
        .map((m) => {
          const turns = normalizeTranscript(m.transcript);
          const lastTurn = turns[turns.length - 1];
          const last = lastActivity.get(m.id) ?? m.updatedAt;
          const hours = (now - last.getTime()) / 3_600_000;
          const herLast = lastTurn?.speaker === "her";
          const noUpcoming = !m.nextDateAt || m.nextDateAt.getTime() < now;
          let reason = "";
          if (hours >= COLD_HOURS && noUpcoming) {
            if (lastTurn?.speaker === "me") {
              reason = `You sent the last message ${Math.round(hours / 24)} days ago — she hasn't replied.`;
            } else if (herLast) {
              reason = `Her last message was ${Math.round(hours / 24)} days ago and you never replied.`;
            } else {
              reason = `No activity for ${Math.round(hours / 24)} days.`;
            }
          }
          return { match: m, hours, reason };
        })
        .filter((x) => x.reason)
        .map((x) => ({
          matchId: x.match.id,
          name: x.match.name,
          photoObjectPath: x.match.photoObjectPath,
          hoursSinceLastReply: Number(x.hours.toFixed(1)),
          reason: x.reason,
        }));
      res.json(out);
    } catch (err) {
      req.log.error({ err }, "Auto-archive candidates failed");
      res.status(500).json({ error: "Failed to compute candidates" });
    }
  },
);

router.get("/analytics/funnel", async (_req, res): Promise<void> => {
  const allMatches = await db.select().from(matches);
  const totals = {
    matches: allMatches.length,
    active: allMatches.filter((m) => m.status === "active").length,
    archived: allMatches.filter((m) => m.status === "archived").length,
    ghosted: allMatches.filter((m) => m.status === "ghosted").length,
    withDateScheduled: allMatches.filter((m) => !!m.nextDateAt).length,
    withDateCompleted: allMatches.filter(
      (m) => normalizeDateHistory(m.dateHistory).length > 0,
    ).length,
  };

  const matched = allMatches.length;
  const conversed = allMatches.filter(
    (m) => normalizeTranscript(m.transcript).length >= 2,
  ).length;
  // Funnel-consistent: anyone who currently has a date queued OR ever completed one
  // reached the "scheduled" milestone. Union, not sum, to avoid double-counting.
  const scheduled = allMatches.filter(
    (m) => !!m.nextDateAt || normalizeDateHistory(m.dateHistory).length > 0,
  ).length;
  const firstDate = totals.withDateCompleted;
  const repeatDate = allMatches.filter(
    (m) => normalizeDateHistory(m.dateHistory).length >= 2,
  ).length;

  res.json({
    stages: [
      { label: "Matched", count: matched },
      { label: "Conversed", count: conversed },
      { label: "Date scheduled", count: scheduled },
      { label: "First date", count: firstDate },
      { label: "Repeat date", count: repeatDate },
    ],
    totals,
  });
});

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
  if (body.data.nextDateOutfit !== undefined)
    updates.nextDateOutfit = body.data.nextDateOutfit;
  if (body.data.tags !== undefined) updates.tags = body.data.tags;
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

router.post(
  "/matches/:id/voice-note-feedback",
  async (req, res): Promise<void> => {
    const params = VoiceNoteFeedbackParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = VoiceNoteFeedbackBody.safeParse(req.body);
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
      const feedback = await analyzeVoiceNote(transcript, {
        name: detail.name,
        profile: detail.extractedProfile,
        recentTurns: detail.transcript,
      });
      res.json({ transcript, ...feedback });
    } catch (err) {
      req.log.error({ err }, "Voice note feedback failed");
      res.status(500).json({ error: "Voice note feedback failed" });
    }
  },
);

router.post(
  "/matches/:id/in-person-recording",
  async (req, res): Promise<void> => {
    const params = InPersonRecordingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = InPersonRecordingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!body.data.bothPartiesConsented) {
      res.status(400).json({
        error: "Both parties must consent to recording. Set bothPartiesConsented=true.",
      });
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

      const mergedScores = { ...detail.extractedProfile.scores };
      for (const key of ["sexPotential", "conversionAbility", "chemistry"] as const) {
        const s = analysis.scoreSuggestions[key];
        if (s.value != null) mergedScores[key] = s;
      }
      const mergedProfile = { ...detail.extractedProfile, scores: mergedScores };

      const noteHeader = `\n\n— In-person recording (${new Date().toLocaleDateString()}) [consent confirmed] —\n`;
      const noteBody = [
        `Summary: ${analysis.summary}`,
        analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
        analysis.greenFlags.length ? `Green flags:\n${analysis.greenFlags.map((f) => `  • ${f}`).join("\n")}` : null,
        analysis.redFlags.length ? `Red flags:\n${analysis.redFlags.map((f) => `  • ${f}`).join("\n")}` : null,
        analysis.nextMoveSuggestion ? `Next move: ${analysis.nextMoveSuggestion}` : null,
        `\nTranscript:\n"${transcript}"`,
      ].filter(Boolean).join("\n");
      const updatedNotes = (detail.notes || "").trim() + noteHeader + noteBody;

      const updates: Record<string, unknown> = {
        extractedProfile: mergedProfile,
        notes: updatedNotes,
      };

      if (body.data.addToDateHistory) {
        const nowIso = new Date().toISOString();
        const recap = [
          analysis.summary,
          analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
          analysis.nextMoveSuggestion ? `Next: ${analysis.nextMoveSuggestion}` : null,
        ]
          .filter(Boolean)
          .join(" — ");
        const newEntry = {
          id: `inp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          when: detail.nextDateAt ? new Date(detail.nextDateAt).toISOString() : nowIso,
          location: detail.nextDateLocation ?? "",
          recap,
          createdAt: nowIso,
        };
        updates.dateHistory = [...detail.dateHistory, newEntry];
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
      req.log.error({ err }, "In-person recording analysis failed");
      res.status(500).json({ error: "Recording analysis failed" });
    }
  },
);

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
    };

    if (body.data.addToDateHistory) {
      const nowIso = new Date().toISOString();
      const recap = [
        analysis.summary,
        analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
        analysis.nextMoveSuggestion ? `Next: ${analysis.nextMoveSuggestion}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      const newEntry = {
        id: `vd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        when: detail.nextDateAt ? new Date(detail.nextDateAt).toISOString() : nowIso,
        location: detail.nextDateLocation ?? "",
        recap,
        createdAt: nowIso,
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
