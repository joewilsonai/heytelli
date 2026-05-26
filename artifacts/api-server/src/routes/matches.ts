import { Router, type IRouter } from "express";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  db,
  conversations,
  matches,
  matchScoreHistory,
  matchRedFlagEvents,
  matchTagEvents,
  screenshots,
  emptyExtractedProfile,
  normalizeExtractedProfile,
  normalizeDateHistory,
  normalizeTranscript,
  type TagEventSource,
  type RedFlagEventSource,
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
import { suggestTags } from "../lib/tagSuggestions";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import {
  extractFromScreenshot,
  extractFromScreenshots,
  mergeExtraction,
  mergeVibeTags,
  generateRepliesFromContext,
  recordScoreHistory,
  runExtractionInBackground,
} from "../lib/extraction";
import {
  buildMatchReadSnapshot,
  computeMatchReadFreshness,
  normalizeMatchReadSnapshot,
} from "../lib/matchRead";
import {
  analyzedScreenshotCountAfterSuccess,
  mergeTranscriptTurns,
  purgeAnalyzedScreenshotObjects,
  selectScreenshotsForVision,
} from "../lib/screenshotRetention";
import {
  buildRedFlagEventRows,
  buildRedFlagSnapshot,
  redFlagFingerprint,
  summarizeRedFlagHistory,
  type RedFlagRadarHistoryResult,
  type RedFlagSummary,
} from "../lib/redFlagHistory";
import type { RedFlag, RedFlagRadarResult } from "../lib/redFlagRadar";

const router: IRouter = Router();
const storage = new ObjectStorageService();

type DeleteMatchDatabase = Pick<typeof db, "transaction">;
type MatchObjectStorage = Pick<ObjectStorageService, "getObjectEntityFile">;

export async function deleteMatchAndHistory(
  database: DeleteMatchDatabase,
  matchId: number,
) {
  return database.transaction(async (tx) => {
    await tx.delete(conversations).where(eq(conversations.matchId, matchId));
    const [deleted] = await tx
      .delete(matches)
      .where(eq(matches.id, matchId))
      .returning();
    return deleted ?? null;
  });
}

export async function deleteMatchObjects(
  storageClient: MatchObjectStorage,
  objectPaths: Array<string | null | undefined>,
) {
  let deletedCount = 0;
  let failedCount = 0;
  const uniqueObjectPaths = Array.from(
    new Set(
      objectPaths.filter(
        (objectPath): objectPath is string =>
          typeof objectPath === "string" && objectPath.length > 0,
      ),
    ),
  );

  for (const objectPath of uniqueObjectPaths) {
    try {
      const file = await storageClient.getObjectEntityFile(objectPath);
      await file.delete();
      deletedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return { deletedCount, failedCount };
}

async function listMatchObjectPaths(matchId: number) {
  const [match] = await db
    .select({ photoObjectPath: matches.photoObjectPath })
    .from(matches)
    .where(eq(matches.id, matchId));
  const shotRows = await db
    .select({ objectPath: screenshots.objectPath })
    .from(screenshots)
    .where(eq(screenshots.matchId, matchId));

  return [
    match?.photoObjectPath ?? null,
    ...shotRows.map((shot) => shot.objectPath),
  ];
}

async function objectPathToDataUrl(objectPath: string): Promise<string> {
  const file = await storage.getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  const contentType = (meta.contentType as string) || "image/png";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

async function purgeAnalyzedRawImages(input: {
  matchId: number;
  matchPhotoObjectPath: string | null;
  shots: Array<{ id: number; objectPath: string | null }>;
}) {
  const result = await purgeAnalyzedScreenshotObjects({
    shots: input.shots,
    matchPhotoObjectPath: input.matchPhotoObjectPath,
    async deleteObject(objectPath) {
      const file = await storage.getObjectEntityFile(objectPath);
      await file.delete();
    },
    async markScreenshotPurged(id, purgedAt) {
      await db
        .update(screenshots)
        .set({ objectPath: null, rawImagePurgedAt: purgedAt })
        .where(eq(screenshots.id, id));
    },
    async clearMatchPhotoObjectPath(objectPath) {
      await db
        .update(matches)
        .set({ photoObjectPath: null })
        .where(eq(matches.id, input.matchId));
      logger.info(
        { matchId: input.matchId, objectPath },
        "Cleared purged screenshot cover photo",
      );
    },
    onError(error, shot) {
      logger.warn(
        { err: error, matchId: input.matchId, screenshotId: shot.id },
        "Failed to purge analyzed screenshot object",
      );
    },
  });
  if (result.purgedCount > 0 || result.failedCount > 0) {
    logger.info(
      { matchId: input.matchId, ...result },
      "Raw screenshot purge finished",
    );
  }
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

type FreshnessCounts = {
  pendingScreenshotCount: number;
  failedScreenshotCount: number;
  analysisFreshness: "current" | "needs-analysis" | "never-analyzed";
};

export function computeFreshness(
  transcriptLength: number,
  shots: { extractionStatus: string }[],
): FreshnessCounts {
  const pending = shots.filter((s) => s.extractionStatus === "pending").length;
  const failed = shots.filter((s) => s.extractionStatus === "failed").length;
  const done = shots.filter((s) => s.extractionStatus === "done").length;
  let freshness: FreshnessCounts["analysisFreshness"];
  if (pending > 0 || failed > 0) freshness = "needs-analysis";
  else if (shots.length > 0 && done === 0 && transcriptLength === 0)
    freshness = "never-analyzed";
  else freshness = "current";
  return {
    pendingScreenshotCount: pending,
    failedScreenshotCount: failed,
    analysisFreshness: freshness,
  };
}

const DATE_BRIEF_STALE_MS = 5 * 24 * 60 * 60 * 1000;

export function dateBriefContextHash(input: {
  dateHistory: unknown;
  nextDateAt: Date | string | null;
  nextDateLocation: string | null;
  nextDateOutfit: string | null;
  notes: string | null;
}): string {
  // Only include fields the user actually controls. `createdAt` is
  // synthesized to `new Date()` when missing in normalizeDateHistory, so
  // including it would re-hash differently every read for legacy rows.
  // `id` can also be regenerated, so skip it too. Sort by `when` for a
  // stable ordering independent of insertion order.
  const stableDateHistory = normalizeDateHistory(input.dateHistory)
    .map((e) => ({ when: e.when, location: e.location, recap: e.recap }))
    .sort((a, b) => a.when.localeCompare(b.when));
  const normalized = {
    dateHistory: stableDateHistory,
    nextDateAt:
      input.nextDateAt instanceof Date
        ? input.nextDateAt.toISOString()
        : (input.nextDateAt ?? null),
    nextDateLocation: input.nextDateLocation ?? null,
    nextDateOutfit: input.nextDateOutfit ?? null,
    notes: input.notes ?? "",
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
}

function normalizeDateBriefSnapshot(raw: unknown): {
  brief: string;
  generatedAt: string;
  screenshotCountAt: number;
  contextHash: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.brief !== "string" || typeof obj.generatedAt !== "string") {
    return null;
  }
  return {
    brief: obj.brief,
    generatedAt: obj.generatedAt,
    screenshotCountAt:
      typeof obj.screenshotCountAt === "number" ? obj.screenshotCountAt : 0,
    // Legacy rows pre-contextHash get "" — guaranteed to mismatch any real
    // hash, so freshness will correctly resolve to "stale".
    contextHash: typeof obj.contextHash === "string" ? obj.contextHash : "",
  };
}

function computeDateBriefFreshness(
  lastDateBrief: {
    generatedAt: string;
    screenshotCountAt: number;
    contextHash: string;
  } | null,
  currentDoneScreenshotCount: number,
  currentContextHash: string,
): "current" | "stale" | "missing" {
  if (!lastDateBrief) return "missing";
  if (currentDoneScreenshotCount > lastDateBrief.screenshotCountAt)
    return "stale";
  if (lastDateBrief.contextHash !== currentContextHash) return "stale";
  const ageMs = Date.now() - new Date(lastDateBrief.generatedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs > DATE_BRIEF_STALE_MS) return "stale";
  return "current";
}

function redFlagContextHash(input: {
  extractedProfile: unknown;
  transcript: unknown;
  dateHistory: unknown;
  notes: string | null;
}): string {
  const normalized = {
    extractedProfile: normalizeExtractedProfile(input.extractedProfile),
    transcript: normalizeTranscript(input.transcript).slice(-50),
    dateHistory: normalizeDateHistory(input.dateHistory).slice(-10),
    notes: input.notes ?? "",
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function redFlagSummaryFromRows(
  events: Array<{
    severity: "low" | "medium" | "high";
    label: string;
    evidence: string;
    fingerprint: string;
    observedAt: Date;
  }>,
  lastRedFlagRadar: {
    redFlags?: RedFlag[];
    generatedAt?: string;
  } | null,
): RedFlagSummary {
  const generatedAt = lastRedFlagRadar?.generatedAt
    ? new Date(lastRedFlagRadar.generatedAt)
    : undefined;
  const summary = summarizeRedFlagHistory({
    events,
    currentRedFlags: Array.isArray(lastRedFlagRadar?.redFlags)
      ? lastRedFlagRadar.redFlags
      : [],
    generatedAt:
      generatedAt && !Number.isNaN(generatedAt.getTime())
        ? generatedAt
        : undefined,
  });
  return {
    currentCount: summary.currentCount,
    historicalCount: summary.historicalCount,
    highSeverityCount: summary.highSeverityCount,
    lastAnalyzedAt: summary.lastAnalyzedAt,
  };
}

async function loadRedFlagEvents(matchId: number) {
  return db
    .select()
    .from(matchRedFlagEvents)
    .where(eq(matchRedFlagEvents.matchId, matchId))
    .orderBy(asc(matchRedFlagEvents.observedAt));
}

function redFlagSummaryFromResult(
  result: ReturnType<typeof summarizeRedFlagHistory>,
): RedFlagSummary {
  return {
    currentCount: result.currentCount,
    historicalCount: result.historicalCount,
    highSeverityCount: result.highSeverityCount,
    lastAnalyzedAt: result.lastAnalyzedAt,
  };
}

async function persistRedFlagRadar(input: {
  matchId: number;
  result: RedFlagRadarResult;
  contextHash: string;
}): Promise<RedFlagRadarHistoryResult> {
  const generatedAt = new Date();
  const runId = randomUUID();
  const snapshot = buildRedFlagSnapshot({
    result: input.result,
    generatedAt,
    contextHash: input.contextHash,
  });
  const existingEvents = await loadRedFlagEvents(input.matchId);
  const existingContextFingerprints = new Set(
    existingEvents.map((event) => `${event.contextHash}:${event.fingerprint}`),
  );
  const rows = buildRedFlagEventRows({
    matchId: input.matchId,
    source: "radar",
    runId,
    contextHash: input.contextHash,
    observedAt: generatedAt,
    redFlags: snapshot.redFlags,
  }).filter(
    (row) =>
      !existingContextFingerprints.has(`${row.contextHash}:${row.fingerprint}`),
  );

  if (rows.length > 0) {
    await db.insert(matchRedFlagEvents).values(rows);
  }
  await db
    .update(matches)
    .set({ lastRedFlagRadar: snapshot })
    .where(eq(matches.id, input.matchId));

  const summary = summarizeRedFlagHistory({
    events: [...existingEvents, ...rows],
    currentRedFlags: snapshot.redFlags,
    generatedAt,
  });

  return {
    redFlags: summary.redFlags,
    currentRedFlags: summary.currentRedFlags,
    historicalRedFlags: summary.historicalRedFlags,
    greenFlags: snapshot.greenFlags,
    overallRead: snapshot.overallRead,
    generatedAt: snapshot.generatedAt,
    redFlagSummary: redFlagSummaryFromResult(summary),
  };
}

async function recordRedFlagMentions(input: {
  matchId: number;
  source: RedFlagEventSource;
  labels: string[];
}) {
  const redFlags = input.labels
    .map((label) => label.trim())
    .filter(Boolean)
    .map(
      (label): RedFlag => ({
        severity: "medium",
        label,
        evidence: `Mentioned during ${input.source.replace(/-/g, " ")}.`,
      }),
    );
  if (redFlags.length === 0) return;
  const observedAt = new Date();
  const rows = buildRedFlagEventRows({
    matchId: input.matchId,
    source: input.source,
    runId: randomUUID(),
    contextHash: createHash("sha256")
      .update(
        `${input.source}:${observedAt.toISOString()}:${redFlags.map(redFlagFingerprint).join(",")}`,
      )
      .digest("hex"),
    observedAt,
    redFlags,
  });
  if (rows.length > 0) await db.insert(matchRedFlagEvents).values(rows);
}

async function loadMatchDetail(matchId: number) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId));
  if (!match) return null;
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, matchId))
    .orderBy(asc(screenshots.uploadedAt));
  const transcript = normalizeTranscript(match.transcript);
  const redFlagEvents = await loadRedFlagEvents(matchId);
  const lastDateBrief = normalizeDateBriefSnapshot(match.lastDateBrief);
  const lastRead = normalizeMatchReadSnapshot(match.lastRead);
  const doneShots = shots.filter((s) => s.extractionStatus === "done").length;
  const freshnessCounts = computeFreshness(transcript.length, shots);
  const currentHash = dateBriefContextHash({
    dateHistory: match.dateHistory,
    nextDateAt: match.nextDateAt,
    nextDateLocation: match.nextDateLocation,
    nextDateOutfit: match.nextDateOutfit,
    notes: match.notes,
  });
  return {
    ...withNormalizedProfile(match),
    transcript,
    screenshots: shots,
    ...freshnessCounts,
    lastDateBrief,
    dateBriefFreshness: computeDateBriefFreshness(
      lastDateBrief,
      doneShots,
      currentHash,
    ),
    lastRead,
    readFreshness: computeMatchReadFreshness({
      lastRead,
      doneScreenshotCount: doneShots,
      pendingScreenshotCount: freshnessCounts.pendingScreenshotCount,
      failedScreenshotCount: freshnessCounts.failedScreenshotCount,
    }),
    redFlagSummary: redFlagSummaryFromRows(
      redFlagEvents,
      match.lastRedFlagRadar,
    ),
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
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, params.data.id));
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
    const historyResult = await persistRedFlagRadar({
      matchId: match.id,
      result,
      contextHash: redFlagContextHash({
        extractedProfile: match.extractedProfile,
        transcript: match.transcript,
        dateHistory: match.dateHistory,
        notes: match.notes,
      }),
    });
    res.json(historyResult);
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
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, params.data.id));
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

router.get("/matches/:id/tag-suggestions", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
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
  try {
    const result = await suggestTags({
      name: match.name,
      currentTags: match.tags ?? [],
      profile: normalizeExtractedProfile(match.extractedProfile),
      transcript: normalizeTranscript(match.transcript),
      dateHistory: normalizeDateHistory(match.dateHistory),
      notes: match.notes ?? "",
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Tag suggestions failed");
    res.status(500).json({ error: "Failed to generate tag suggestions" });
  }
});

router.get("/matches/:id/tag-history", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const events = await db
    .select()
    .from(matchTagEvents)
    .where(eq(matchTagEvents.matchId, params.data.id))
    .orderBy(desc(matchTagEvents.createdAt));
  res.json({
    events: events.map((e) => ({
      id: e.id,
      tag: e.tag,
      action: e.action,
      source: e.source,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

router.post("/matches/:id/tags/apply", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = req.body as {
    suggestions?: Array<{
      tag: string;
      action: "add" | "remove";
      reason?: string;
    }>;
  };
  const suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];
  if (suggestions.length === 0) {
    res.status(400).json({ error: "No suggestions provided" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, params.data.id))
      .for("update");
    if (!match) return { notFound: true as const };
    const current = new Set(match.tags ?? []);
    const events: Array<{
      matchId: number;
      tag: string;
      action: "added" | "removed";
      source: TagEventSource;
      reason: string | null;
    }> = [];
    for (const s of suggestions) {
      if (typeof s?.tag !== "string") continue;
      const tag = s.tag.trim().toLowerCase();
      if (!tag) continue;
      if (s.action === "add" && !current.has(tag)) {
        current.add(tag);
        events.push({
          matchId: params.data.id,
          tag,
          action: "added",
          source: "ai",
          reason: s.reason?.trim() || null,
        });
      } else if (s.action === "remove" && current.has(tag)) {
        current.delete(tag);
        events.push({
          matchId: params.data.id,
          tag,
          action: "removed",
          source: "ai",
          reason: s.reason?.trim() || null,
        });
      }
    }
    const nextTags = Array.from(current).sort();
    await tx
      .update(matches)
      .set({ tags: nextTags })
      .where(eq(matches.id, params.data.id));
    if (events.length > 0) {
      await tx.insert(matchTagEvents).values(events);
    }
    return { notFound: false as const };
  });
  if (result.notFound) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const detail = await loadMatchDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(detail);
});

router.get("/matches/:id/response-stats", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
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
  const turns = normalizeTranscript(match.transcript);
  const herCount = turns.filter((t) => t.speaker === "her").length;
  const meCount = turns.filter((t) => t.speaker === "me").length;

  // Approximate reply timing using screenshot upload gaps as a proxy.
  const gaps: number[] = [];
  for (let i = 1; i < shots.length; i++) {
    gaps.push(
      (shots[i].uploadedAt.getTime() - shots[i - 1].uploadedAt.getTime()) /
        3_600_000,
    );
  }
  const avgGap =
    gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const longestGap = gaps.length > 0 ? Math.max(...gaps) : null;

  // Heuristic split: alternate her/me on gaps assuming roughly equal share.
  const herAvg =
    avgGap != null && herCount > 0
      ? Number(
          ((avgGap * (meCount + 1)) / Math.max(herCount + meCount, 1)).toFixed(
            1,
          ),
        )
      : null;
  const meAvg =
    avgGap != null && meCount > 0
      ? Number(
          ((avgGap * (herCount + 1)) / Math.max(herCount + meCount, 1)).toFixed(
            1,
          ),
        )
      : null;

  let cadence: "you_chasing" | "balanced" | "she_chasing" | "unknown" =
    "unknown";
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
    longestHerSilenceHours:
      longestGap != null ? Number(longestGap.toFixed(1)) : null,
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
      if (!prev || s.uploadedAt > prev)
        lastActivity.set(s.matchId, s.uploadedAt);
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
        scores: latestScores.get(m.id) ?? { sex: null, conv: null, chem: null },
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
        if (!prev || s.uploadedAt > prev)
          lastActivity.set(s.matchId, s.uploadedAt);
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
  const redFlagRows = ids.length
    ? await db
        .select()
        .from(matchRedFlagEvents)
        .where(inArray(matchRedFlagEvents.matchId, ids))
        .orderBy(asc(matchRedFlagEvents.observedAt))
    : [];
  const redFlagsByMatch = new Map<number, typeof redFlagRows>();
  for (const event of redFlagRows) {
    const arr = redFlagsByMatch.get(event.matchId) ?? [];
    arr.push(event);
    redFlagsByMatch.set(event.matchId, arr);
  }

  const shotRows = ids.length
    ? await db
        .select({
          matchId: screenshots.matchId,
          uploadedAt: screenshots.uploadedAt,
          extractionStatus: screenshots.extractionStatus,
        })
        .from(screenshots)
        .where(inArray(screenshots.matchId, ids))
    : [];
  const lastActivity = new Map<number, Date>();
  const shotsByMatch = new Map<number, { extractionStatus: string }[]>();
  for (const s of shotRows) {
    const prev = lastActivity.get(s.matchId);
    if (!prev || s.uploadedAt > prev) lastActivity.set(s.matchId, s.uploadedAt);
    const arr = shotsByMatch.get(s.matchId) ?? [];
    arr.push({ extractionStatus: s.extractionStatus });
    shotsByMatch.set(s.matchId, arr);
  }

  res.json(
    rows.map((r) => {
      const turns = normalizeTranscript(r.transcript);
      const lastTurn = turns[turns.length - 1];
      const lastAct = lastActivity.get(r.id) ?? null;
      const shotsForMatch = shotsByMatch.get(r.id) ?? [];
      const doneShots = shotsForMatch.filter(
        (s) => s.extractionStatus === "done",
      ).length;
      const lastDateBrief = normalizeDateBriefSnapshot(r.lastDateBrief);
      const lastRead = normalizeMatchReadSnapshot(r.lastRead);
      const freshnessCounts = computeFreshness(turns.length, shotsForMatch);
      const currentHash = dateBriefContextHash({
        dateHistory: r.dateHistory,
        nextDateAt: r.nextDateAt,
        nextDateLocation: r.nextDateLocation,
        nextDateOutfit: r.nextDateOutfit,
        notes: r.notes,
      });
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
        ...freshnessCounts,
        lastDateBrief,
        dateBriefFreshness: computeDateBriefFreshness(
          lastDateBrief,
          doneShots,
          currentHash,
        ),
        lastRead,
        readFreshness: computeMatchReadFreshness({
          lastRead,
          doneScreenshotCount: doneShots,
          pendingScreenshotCount: freshnessCounts.pendingScreenshotCount,
          failedScreenshotCount: freshnessCounts.failedScreenshotCount,
        }),
        redFlagSummary: redFlagSummaryFromRows(
          redFlagsByMatch.get(r.id) ?? [],
          r.lastRedFlagRadar,
        ),
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
      extractedProfile: mergeExtraction(
        emptyExtractedProfile,
        extraction.profile,
      ),
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

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, params.data.id))
      .for("update");
    if (!existing) return { notFound: true as const, updated: null };

    let tagDiff: { added: string[]; removed: string[] } | null = null;
    if (body.data.tags !== undefined) {
      const before = new Set(existing.tags ?? []);
      const after = new Set(body.data.tags);
      tagDiff = {
        added: [...after].filter((t) => !before.has(t)),
        removed: [...before].filter((t) => !after.has(t)),
      };
    }

    if (Object.keys(updates).length === 0) {
      return { notFound: false as const, updated: existing };
    }

    const [updated] = await tx
      .update(matches)
      .set(updates)
      .where(eq(matches.id, params.data.id))
      .returning();

    if (tagDiff && (tagDiff.added.length > 0 || tagDiff.removed.length > 0)) {
      const rows = [
        ...tagDiff.added.map((tag) => ({
          matchId: params.data.id,
          tag,
          action: "added" as const,
          source: "user" as TagEventSource,
          reason: null,
        })),
        ...tagDiff.removed.map((tag) => ({
          matchId: params.data.id,
          tag,
          action: "removed" as const,
          source: "user" as TagEventSource,
          reason: null,
        })),
      ];
      await tx.insert(matchTagEvents).values(rows);
    }
    return { notFound: false as const, updated: updated ?? existing };
  });

  if (result.notFound || !result.updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const refreshed = await loadMatchDetail(result.updated.id);
  res.json(refreshed ?? withNormalizedProfile(result.updated));
});

router.delete("/matches/:id", async (req, res): Promise<void> => {
  const params = DeleteMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const objectPaths = await listMatchObjectPaths(params.data.id);
  const deleted = await deleteMatchAndHistory(db, params.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const objectDeleteResult = await deleteMatchObjects(storage, objectPaths);
  if (objectDeleteResult.failedCount > 0) {
    logger.warn(
      { matchId: params.data.id, failedCount: objectDeleteResult.failedCount },
      "Failed to delete some match object files",
    );
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

  // Insert as "pending" so analysisFreshness flips to "needs-analysis"
  // until the client's batched /rescore call processes the new uploads.
  // Rescore is what actually runs OCR + flips them to "done".
  await db
    .insert(screenshots)
    .values({
      matchId: match.id,
      objectPath: body.data.objectPath,
      extractionStatus: "pending",
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

  // Skip re-OCR if everything's already been analyzed. Saves the model call,
  // the storage round-trip, and a chunk of latency for a no-op.
  if (detail.analysisFreshness === "current" && detail.lastRead) {
    const retainedAnalyzedShots = selectScreenshotsForVision(
      detail.screenshots.filter((s) => s.extractionStatus === "done"),
    );
    if (retainedAnalyzedShots.length > 0) {
      await purgeAnalyzedRawImages({
        matchId: detail.id,
        matchPhotoObjectPath: detail.photoObjectPath,
        shots: retainedAnalyzedShots,
      });
      const refreshed = await loadMatchDetail(detail.id);
      res.json(refreshed);
      return;
    }
    res.json(detail);
    return;
  }

  // Snapshot the retained raw screenshots we're about to analyze. Anything
  // added mid-flight stays pending so the next /rescore catches it, while
  // already-purged rows continue to count through persisted transcript/read.
  const shotsForVision = selectScreenshotsForVision(detail.screenshots);
  if (shotsForVision.length === 0) {
    res.status(400).json({ error: "No retained screenshots need analysis" });
    return;
  }
  const analyzedShotIds = shotsForVision.map((s) => s.id);

  try {
    const dataUrls = await Promise.all(
      shotsForVision.map((s) => objectPathToDataUrl(s.objectPath)),
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
    const mergedTranscript =
      extraction.transcript.length > 0
        ? mergeTranscriptTurns(detail.transcript, extraction.transcript)
        : detail.transcript;
    const lastRead = buildMatchReadSnapshot({
      profile: mergedProfile,
      transcript: mergedTranscript,
      explicitRead: extraction.read,
      screenshotCountAt: analyzedScreenshotCountAfterSuccess(
        detail.screenshots,
        analyzedShotIds,
      ),
    });
    const updates: Record<string, unknown> = {
      extractedProfile: mergedProfile,
      vibeTags: mergedTags,
      lastRead,
    };
    if (extraction.transcript.length > 0) {
      updates.transcript = mergedTranscript;
    }
    await db.update(matches).set(updates).where(eq(matches.id, detail.id));
    await recordScoreHistory(detail.id, mergedProfile.scores);
    // Only flip the snapshot we actually analyzed — screenshots added
    // mid-flight stay pending so the next rescore catches them.
    if (analyzedShotIds.length > 0) {
      await db
        .update(screenshots)
        .set({ extractionStatus: "done", extractionError: null })
        .where(inArray(screenshots.id, analyzedShotIds));
    }
    await purgeAnalyzedRawImages({
      matchId: detail.id,
      matchPhotoObjectPath: detail.photoObjectPath,
      shots: shotsForVision,
    });
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
    const shotsForVision = selectScreenshotsForVision(detail.screenshots);
    const dataUrls = await Promise.all(
      shotsForVision.map((s) => objectPathToDataUrl(s.objectPath)),
    );
    const replies = await generateRepliesFromContext(
      dataUrls,
      detail.extractedProfile,
      detail.name,
      detail.notes,
      detail.transcript,
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
        error:
          "Both parties must consent to recording. Set bothPartiesConsented=true.",
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
      for (const key of [
        "sexPotential",
        "conversionAbility",
        "chemistry",
      ] as const) {
        const s = analysis.scoreSuggestions[key];
        if (s.value != null) mergedScores[key] = s;
      }
      const mergedProfile = {
        ...detail.extractedProfile,
        scores: mergedScores,
      };

      const noteHeader = `\n\n— In-person recording (${new Date().toLocaleDateString()}) [consent confirmed] —\n`;
      const noteBody = [
        `Summary: ${analysis.summary}`,
        analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
        analysis.greenFlags.length
          ? `Green flags:\n${analysis.greenFlags.map((f) => `  • ${f}`).join("\n")}`
          : null,
        analysis.redFlags.length
          ? `Red flags:\n${analysis.redFlags.map((f) => `  • ${f}`).join("\n")}`
          : null,
        analysis.nextMoveSuggestion
          ? `Next move: ${analysis.nextMoveSuggestion}`
          : null,
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
          analysis.nextMoveSuggestion
            ? `Next: ${analysis.nextMoveSuggestion}`
            : null,
        ]
          .filter(Boolean)
          .join(" — ");
        const newEntry = {
          id: `inp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          when: detail.nextDateAt
            ? new Date(detail.nextDateAt).toISOString()
            : nowIso,
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
      await recordRedFlagMentions({
        matchId: detail.id,
        source: "in-person-recording",
        labels: analysis.redFlags,
      });

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
    for (const key of [
      "sexPotential",
      "conversionAbility",
      "chemistry",
    ] as const) {
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
      analysis.greenFlags.length
        ? `Green flags:\n${analysis.greenFlags.map((f) => `  • ${f}`).join("\n")}`
        : null,
      analysis.redFlags.length
        ? `Red flags:\n${analysis.redFlags.map((f) => `  • ${f}`).join("\n")}`
        : null,
      analysis.nextMoveSuggestion
        ? `Next move: ${analysis.nextMoveSuggestion}`
        : null,
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
        analysis.nextMoveSuggestion
          ? `Next: ${analysis.nextMoveSuggestion}`
          : null,
      ]
        .filter(Boolean)
        .join(" — ");
      const newEntry = {
        id: `vd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        when: detail.nextDateAt
          ? new Date(detail.nextDateAt).toISOString()
          : nowIso,
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
    await recordRedFlagMentions({
      matchId: detail.id,
      source: "voice-debrief",
      labels: analysis.redFlags,
    });

    const refreshed = await loadMatchDetail(detail.id);
    res.json({ transcript, analysis, match: refreshed });
  } catch (err) {
    req.log.error({ err }, "Voice debrief failed");
    res.status(500).json({ error: "Voice debrief failed" });
  }
});

export default router;
