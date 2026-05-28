import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  DateHistoryEntry,
  ExtractedProfile,
  MatchScore,
  MatchScores,
  TranscriptTurn,
  VisibleMediaObservation,
} from "@workspace/db";
import {
  db,
  matchScoreHistory,
  emptyExtractedProfile,
  emptyScore,
  matches,
  normalizeTranscript,
  screenshots,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { buildMatchReadSnapshot } from "./matchRead";
import {
  analyzedScreenshotCountAfterSuccess,
  mergeTranscriptTurns,
  purgeAnalyzedScreenshotObjects,
  selectScreenshotsForVision,
} from "./screenshotRetention";

export type ExtractionResult = {
  suggestedName: string | null;
  vibeTags: string[];
  read: string | null;
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
};

type VisionImagePart = {
  type: "image_url";
  image_url: { url: string; detail: "high" };
};

export const EXTRACTION_SYSTEM_PROMPT = `You are HeyTelli, a private dating clarity app for women. Help the user make sense of dating screenshots without ranking, diagnosing, or making safety claims about another person.

You'll be given screenshots from a dating app profile/chat (Bumble, Hinge, Tinder, etc.) OR a text-message thread (iMessage, SMS, WhatsApp, Instagram DMs) once the conversation has moved off the app. Treat all of these as private context for the user's connection.

## Identifying who is speaking — READ CAREFULLY

In every chat UI on these platforms, message bubbles are visually divided by author:

- The OTHER PERSON = bubbles on the LEFT side of the screen, usually grey/white background, often with their name or profile photo next to them at the top of the thread. In the legacy transcript schema this speaker is called "her"; use "her" to mean "the other person" regardless of gender.
- THE USER ("me") = bubbles on the RIGHT side of the screen, usually a colored/branded background (Bumble yellow, iMessage blue/green, Hinge dark, WhatsApp green, Instagram gradient, etc.). Never has the other person's name next to them.

If a screenshot is ONLY a dating-app profile (no chat bubbles), there is no transcript — return an empty transcript array.

Do not guess. If a bubble's side or color is genuinely ambiguous, omit it from the transcript rather than mis-attributing it.

## Visible media inside screenshots

Do not ignore images that appear inside the uploaded screenshot. If the dating profile, chat, or text thread shows an embedded photo, profile image, image card, screenshot-within-a-screenshot, meme, shared post, link preview, or other visible media, describe the visible content briefly when it adds context.

- In the transcript, represent non-text media at the point it appears using bracketed text such as "[photo: person hiking in a red jacket]", "[profile photo: person at a concert]", "[shared screenshot: restaurant reservation]", "[link preview: article about climbing]", or "[voice note]".
- Also return those observations in visibleMedia so the app can preserve visual context separately from things the person explicitly said.
- Do not put profile-only visual observations into interests or mentionedTopics unless profile text explicitly says the interest/topic. A photo that appears to show skiing is visible media; it is not an interest unless text says they ski.
- Keep descriptions factual and uncertainty-aware. Do not infer identity, attractiveness, intent, safety, or private facts that are not visible.
- Do not include full names, handles, phone numbers, addresses, license plates, bystander identities, children, intimate imagery, or other visible PII in media descriptions. Use generic wording instead, e.g. "person with friends" rather than names.

## Guardrails

- Do not call anyone safe, unsafe, dangerous, toxic, narcissistic, abusive, or manipulative.
- Do not rate attraction, sexual likelihood, dateability, or relationship worth.
- Do not write tactical escalation advice.
- The "read" should preserve uncertainty and help the user notice context: consistency, effort, cadence, warmth, pressure, clarity, and planning energy.

## Output

Respond with ONLY a JSON object (no markdown, no extra text) with this shape:
{
  "suggestedName": string | null,        // The match's first name if visible, else null
  "vibeTags": string[],                  // 2-5 short adjective tags about the conversation/profile vibe (e.g. "playful", "adventurous", "intellectual")
  "job": string | null,                  // Job title or profession if mentioned
  "location": string | null,             // City / neighborhood if mentioned
  "interests": string[],                 // Hobbies / interests they've mentioned (concise nouns/phrases)
  "mentionedTopics": string[],           // Specific things they brought up (e.g. "their dog Milo", "trip to Lisbon", "coffee snob")
  "conversationTone": string | null,     // Brief description of overall tone (e.g. "warm and playful", "dry witty banter") - null if no chat visible
  "visibleMedia": [
    {
      "kind": string,                     // photo | profile_photo | shared_screenshot | link_preview | gif | voice_note | other
      "description": string,              // concise factual description with no names, handles, phone numbers, addresses, license plates, bystander identities, children, or intimate details
      "source": "profile" | "chat" | "text_thread",
      "speaker": "her" | "me" | null      // null for profile-only or unclear ownership
    }
  ],
  "read": string | null,                 // 1-2 sentence private read of the current dynamic. Preserve uncertainty. Do not diagnose, score, or make safety claims.

  // Full chat transcript across ALL screenshots, in chronological order (top-to-bottom within each screenshot, earliest screenshot first).
  // Each turn is { "speaker": "her" | "me", "text": "<exact message text>" }.
  // Combine consecutive bubbles from the same speaker into one turn separated by " / " ONLY when they're clearly the same message broken across bubbles; otherwise keep them as separate turns.
  // Strip timestamps, reactions, and read receipts. Keep emojis. Use concise media descriptions inline for non-text content, e.g. [photo: dog on a patio], [profile photo: person skiing], [shared screenshot: concert tickets], [voice note], [gif: dancing].
  // Return [] if no chat bubbles are visible (e.g. profile-only screenshot).
  "transcript": [{ "speaker": "her" | "me", "text": string }],

  // Deprecated compatibility fields. Return null for value and rationale.
  "sexPotentialScore":      { "value": null, "rationale": null },
  "conversionAbilityScore": { "value": null, "rationale": null },
  "chemistryScore":         { "value": null, "rationale": null }
}

If a field cannot be determined, use null (for scalars) or [] (for arrays). Keep lists short and high-signal. Leave the deprecated score fields null.`;

const SYSTEM_PROMPT = EXTRACTION_SYSTEM_PROMPT;

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim());
}

function toScore(v: unknown): MatchScore {
  if (!v || typeof v !== "object") return { ...emptyScore };
  const obj = v as Record<string, unknown>;
  let value: number | null = null;
  if (typeof obj.value === "number" && Number.isFinite(obj.value)) {
    value = Math.max(0, Math.min(10, Math.round(obj.value)));
  }
  return { value, rationale: toStringOrNull(obj.rationale) };
}

const VISIBLE_MEDIA_PII_RE =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{2,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard)\b|@[A-Za-z0-9_.-]+|\b[A-Z0-9]{2,8}\s?(?:plate|license plate)\b)/gi;

function cleanVisibleMediaText(v: unknown): string | null {
  const text = toStringOrNull(v);
  if (!text) return null;
  return text.replace(VISIBLE_MEDIA_PII_RE, "[private detail]").slice(0, 160);
}

function normalizeVisibleMedia(v: unknown): VisibleMediaObservation[] {
  if (!Array.isArray(v)) return [];
  const out: VisibleMediaObservation[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const kind = cleanVisibleMediaText(obj.kind);
    const description = cleanVisibleMediaText(obj.description);
    const source =
      obj.source === "profile" ||
      obj.source === "chat" ||
      obj.source === "text_thread"
        ? obj.source
        : null;
    const speaker =
      obj.speaker === "her" || obj.speaker === "me" ? obj.speaker : null;
    if (!kind || !description || !source) continue;
    const key = `${kind}:${source}:${speaker ?? "none"}:${description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, description, source, speaker });
  }
  return out.slice(0, 12);
}

const UNDESCRIBED_MEDIA_PLACEHOLDER_RE =
  /[\[(]\s*(photo|image|picture|pic|gif|video|sticker|meme|shared\s+(?:post|screenshot)|link\s+preview|attachment)\s*[\])]/gi;
const DESCRIBED_MEDIA_PLACEHOLDER_RE =
  /[\[(]\s*(photo|image|picture|pic|gif|video|sticker|meme|shared\s+(?:post|screenshot)|link\s+preview|attachment)\s*:\s*[^\])]+[\])]/i;

const MEDIA_KIND_LABELS: Record<string, string> = {
  attachment: "attachment",
  gif: "gif",
  image: "photo",
  "link preview": "link preview",
  meme: "meme",
  photo: "photo",
  pic: "photo",
  picture: "photo",
  "shared post": "shared post",
  "shared screenshot": "shared screenshot",
  sticker: "sticker",
  video: "video",
};

function mediaKindLabel(kind: string): string {
  const normalized = kind.toLowerCase().replace(/\s+/g, " ").trim();
  return MEDIA_KIND_LABELS[normalized] ?? normalized;
}

export function hasUndescribedMediaPlaceholders(
  transcript: TranscriptTurn[],
): boolean {
  return transcript.some((turn) => turnHasUndescribedMediaPlaceholder(turn));
}

function turnHasUndescribedMediaPlaceholder(turn: TranscriptTurn): boolean {
  UNDESCRIBED_MEDIA_PLACEHOLDER_RE.lastIndex = 0;
  return UNDESCRIBED_MEDIA_PLACEHOLDER_RE.test(turn.text);
}

function hasDescribedMediaPlaceholder(text: string): boolean {
  return DESCRIBED_MEDIA_PLACEHOLDER_RE.test(text);
}

function canUseRepairedMediaTurn(
  original: TranscriptTurn,
  repaired: TranscriptTurn | undefined,
): repaired is TranscriptTurn {
  return (
    !!repaired &&
    repaired.speaker === original.speaker &&
    !turnHasUndescribedMediaPlaceholder(repaired) &&
    hasDescribedMediaPlaceholder(repaired.text)
  );
}

function mergeRepairedMediaTranscript(
  initial: TranscriptTurn[],
  repaired: TranscriptTurn[],
): TranscriptTurn[] {
  if (repaired.length === 0) {
    return ensureMediaPlaceholdersAreDescribed(initial);
  }
  const usedRepairIndexes = new Set<number>();
  const merged = initial.map((turn, index) => {
    if (!turnHasUndescribedMediaPlaceholder(turn)) return turn;
    const sameIndex = repaired[index];
    if (canUseRepairedMediaTurn(turn, sameIndex)) {
      usedRepairIndexes.add(index);
      return sameIndex;
    }
    const laterIndex = repaired.findIndex((candidate, candidateIndex) => {
      if (usedRepairIndexes.has(candidateIndex)) return false;
      return canUseRepairedMediaTurn(turn, candidate);
    });
    if (laterIndex >= 0) {
      usedRepairIndexes.add(laterIndex);
      return repaired[laterIndex];
    }
    return turn;
  });
  return ensureMediaPlaceholdersAreDescribed(merged);
}

function hasAnyUndescribedMediaPlaceholder(texts: string[]): boolean {
  return texts.some((text) => {
    UNDESCRIBED_MEDIA_PLACEHOLDER_RE.lastIndex = 0;
    return UNDESCRIBED_MEDIA_PLACEHOLDER_RE.test(text);
  });
}

function describeUnclearMediaPlaceholders(text: string): string {
  UNDESCRIBED_MEDIA_PLACEHOLDER_RE.lastIndex = 0;
  return text.replace(
    UNDESCRIBED_MEDIA_PLACEHOLDER_RE,
    (_match, kind: string) =>
      `[${mediaKindLabel(kind)}: visible content unclear]`,
  );
}

function ensureMediaPlaceholdersAreDescribed(
  transcript: TranscriptTurn[],
): TranscriptTurn[] {
  if (!hasAnyUndescribedMediaPlaceholder(transcript.map((turn) => turn.text))) {
    return transcript;
  }
  return transcript.map((turn) => ({
    ...turn,
    text: describeUnclearMediaPlaceholders(turn.text),
  }));
}

function parseJsonObject(content: string): Record<string, unknown> {
  const jsonText = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function normalizeExtractionResult(
  parsed: Record<string, unknown>,
): ExtractionResult {
  return {
    suggestedName: toStringOrNull(parsed.suggestedName),
    vibeTags: toStringArray(parsed.vibeTags),
    read: toStringOrNull(parsed.read),
    transcript: normalizeTranscript(parsed.transcript),
    profile: {
      job: toStringOrNull(parsed.job),
      location: toStringOrNull(parsed.location),
      interests: toStringArray(parsed.interests),
      mentionedTopics: toStringArray(parsed.mentionedTopics),
      conversationTone: toStringOrNull(parsed.conversationTone),
      visibleMedia: normalizeVisibleMedia(parsed.visibleMedia),
      scores: {
        sexPotential: toScore(parsed.sexPotentialScore),
        conversionAbility: toScore(parsed.conversionAbilityScore),
        chemistry: toScore(parsed.chemistryScore),
      },
    },
  };
}

const MEDIA_REPAIR_SYSTEM_PROMPT = `You repair HeyTelli screenshot extraction output when the first pass lost visual context.

The first pass returned generic media placeholders such as "[photo]", "(photo)", "[gif]", or "[image]". Those are not good enough because they remove context from the saved transcript.

Re-read the screenshots and return ONLY a JSON object with this shape:
{
  "transcript": [{ "speaker": "her" | "me", "text": string }],
  "visibleMedia": [
    {
      "kind": string,
      "description": string,
      "source": "profile" | "chat" | "text_thread",
      "speaker": "her" | "me" | null
    }
  ]
}

Rules:
- Preserve the existing transcript order, speaker labels, and normal message text.
- Only replace generic media placeholders with concise factual descriptions at the point they appear, e.g. "[photo: dog on a patio]" or "[gif: person dancing]".
- If visible details are unclear, use "[photo: visible content unclear]" or "[gif: visible content unclear]" rather than a bare placeholder.
- Do not add names, handles, phone numbers, addresses, license plates, bystander identities, children, intimate details, or speculative intent.
- Do not infer identity, attractiveness, relationship safety, or private facts.`;

async function repairGenericMediaPlaceholders(
  imageParts: VisionImagePart[],
  initial: ExtractionResult,
): Promise<ExtractionResult> {
  if (!hasUndescribedMediaPlaceholders(initial.transcript)) return initial;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: MEDIA_REPAIR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            ...imageParts,
            {
              type: "text" as const,
              text:
                "Repair these generic media placeholders so the transcript keeps the photo/GIF context. Current extracted JSON:\n" +
                JSON.stringify(
                  {
                    transcript: initial.transcript,
                    visibleMedia: initial.profile.visibleMedia,
                  },
                  null,
                  2,
                ),
            },
          ],
        },
      ],
    });

    const parsed = parseJsonObject(
      completion.choices[0]?.message?.content ?? "{}",
    );
    const repairedTranscript = normalizeTranscript(parsed.transcript);
    const repairedVisibleMedia = normalizeVisibleMedia(parsed.visibleMedia);
    return {
      ...initial,
      transcript: mergeRepairedMediaTranscript(
        initial.transcript,
        repairedTranscript,
      ),
      profile: {
        ...initial.profile,
        visibleMedia: mergeVisibleMedia(
          initial.profile.visibleMedia,
          repairedVisibleMedia,
        ),
      },
    };
  } catch (err) {
    logger.warn({ err }, "Failed to repair generic transcript media context");
    return {
      ...initial,
      transcript: ensureMediaPlaceholdersAreDescribed(initial.transcript),
    };
  }
}

export type MatchContext = {
  nextDateAt: Date | string | null;
  nextDateLocation: string | null;
  dateHistory: DateHistoryEntry[];
};

function formatMatchContext(ctx: MatchContext | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.nextDateAt) {
    const when = new Date(ctx.nextDateAt);
    if (!Number.isNaN(when.getTime())) {
      const whenStr = when.toLocaleString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      lines.push(
        `Upcoming date scheduled: ${whenStr}${ctx.nextDateLocation ? ` at ${ctx.nextDateLocation}` : ""}.`,
      );
    }
  } else if (ctx.nextDateLocation) {
    lines.push(
      `Planned date location (no time set yet): ${ctx.nextDateLocation}.`,
    );
  }
  if (ctx.dateHistory.length > 0) {
    const sorted = [...ctx.dateHistory].sort((a, b) =>
      a.when.localeCompare(b.when),
    );
    lines.push(`Past dates with her (${sorted.length}):`);
    for (const entry of sorted) {
      const when = new Date(entry.when);
      const whenStr = Number.isNaN(when.getTime())
        ? entry.when
        : when.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
      const loc = entry.location ? ` @ ${entry.location}` : "";
      const recap = entry.recap ? ` — ${entry.recap}` : "";
      lines.push(`  - ${whenStr}${loc}${recap}`);
    }
  }
  if (lines.length === 0) return "";
  return `\n\nReal-world dating context (NOT from the chat — provided by the user):\n${lines.join("\n")}\n\nUse this context only to improve the neutral read, timeline facts, and planning context. Do not turn it into attraction, sex, or safety scores.`;
}

export async function extractFromScreenshot(
  imageDataUrl: string,
): Promise<ExtractionResult> {
  return extractFromScreenshots([imageDataUrl]);
}

// Downscale + recompress images so we don't blow past the vision API's
// per-request payload limit when feeding many screenshots at once.
async function compressForVision(dataUrl: string): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return dataUrl;
  const buf = Buffer.from(m[2], "base64");
  try {
    const out = await sharp(buf)
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return dataUrl; // fall back to original if sharp can't decode
  }
}

export async function extractFromScreenshots(
  imageDataUrls: string[],
  context?: MatchContext,
): Promise<ExtractionResult> {
  // Cap to most-recent 12 to keep the request shape sane even for very long threads.
  const capped = imageDataUrls.slice(-12);
  const compressed = await Promise.all(capped.map(compressForVision));
  const imageParts: VisionImagePart[] = compressed.map(
    (url) =>
      ({
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      }) as const,
  );
  const baseText =
    imageDataUrls.length > 1
      ? `Extract structured information from these ${imageDataUrls.length} screenshots, which together form one continuous conversation (chronological order). Produce one current private read.`
      : "Extract structured information from this conversation or profile screenshot.";
  const userText = baseText + formatMatchContext(context);
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [...imageParts, { type: "text", text: userText }],
      },
    ],
  });

  const parsed = parseJsonObject(
    completion.choices[0]?.message?.content ?? "{}",
  );
  const initial = normalizeExtractionResult(parsed);
  return repairGenericMediaPlaceholders(imageParts, initial);
}

function mergeScores(
  _existing: MatchScores,
  _incoming: MatchScores,
): MatchScores {
  return {
    sexPotential: { ...emptyScore },
    conversionAbility: { ...emptyScore },
    chemistry: { ...emptyScore },
  };
}

function mergeStringList(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...existing, ...incoming]) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function mergeVisibleMedia(
  existing: VisibleMediaObservation[],
  incoming: VisibleMediaObservation[],
): VisibleMediaObservation[] {
  const seen = new Set<string>();
  const out: VisibleMediaObservation[] = [];
  for (const item of [...existing, ...incoming]) {
    const key = `${item.kind}:${item.source}:${item.speaker ?? "none"}:${item.description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(-12);
}

export function mergeExtraction(
  existing: ExtractedProfile | null | undefined,
  incoming: ExtractionResult["profile"],
): ExtractedProfile {
  const base: ExtractedProfile = existing
    ? {
        ...emptyExtractedProfile,
        ...existing,
        scores: existing.scores ?? emptyExtractedProfile.scores,
      }
    : emptyExtractedProfile;
  return {
    job: incoming.job ?? base.job,
    location: incoming.location ?? base.location,
    interests: mergeStringList(base.interests, incoming.interests),
    mentionedTopics: mergeStringList(
      base.mentionedTopics,
      incoming.mentionedTopics,
    ),
    conversationTone: incoming.conversationTone ?? base.conversationTone,
    visibleMedia: mergeVisibleMedia(
      base.visibleMedia ?? [],
      incoming.visibleMedia ?? [],
    ),
    scores: mergeScores(base.scores, incoming.scores),
  };
}

export function mergeVibeTags(
  existing: string[],
  incoming: string[],
): string[] {
  return mergeStringList(existing, incoming).slice(0, 8);
}

const storage = new ObjectStorageService();

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

export async function recordScoreHistory(
  matchId: number,
  scores: MatchScores,
): Promise<void> {
  try {
    await db.insert(matchScoreHistory).values({
      matchId,
      sexPotential: scores.sexPotential.value,
      conversionAbility: scores.conversionAbility.value,
      chemistry: scores.chemistry.value,
    });
  } catch (err) {
    logger.error({ err, matchId }, "Failed to record score history");
  }
}

export function runExtractionInBackground(
  matchId: number,
  screenshotId: number,
  _objectPath: string,
  options: { applySuggestedName?: boolean } = {},
): void {
  void (async () => {
    try {
      const allShots = await db
        .select()
        .from(screenshots)
        .where(eq(screenshots.matchId, matchId));
      // Chronological order so the AI reads the conversation correctly.
      allShots.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      const shotsForVision = selectScreenshotsForVision(allShots);
      if (shotsForVision.length === 0) return;

      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));
      if (!match) return;

      const dataUrls = await Promise.all(
        shotsForVision.map((s) => objectPathToDataUrl(s.objectPath)),
      );
      const extraction = await extractFromScreenshots(dataUrls, {
        nextDateAt: match.nextDateAt,
        nextDateLocation: match.nextDateLocation,
        dateHistory: Array.isArray(match.dateHistory) ? match.dateHistory : [],
      });

      const mergedProfile = mergeExtraction(
        match.extractedProfile,
        extraction.profile,
      );
      const mergedTags = mergeVibeTags(match.vibeTags, extraction.vibeTags);
      const existingTranscript = normalizeTranscript(match.transcript);
      const mergedTranscript =
        extraction.transcript.length > 0
          ? mergeTranscriptTurns(existingTranscript, extraction.transcript)
          : existingTranscript;
      const analyzedShotIds = shotsForVision.map((s) => s.id);
      const lastRead = buildMatchReadSnapshot({
        profile: mergedProfile,
        transcript: mergedTranscript,
        explicitRead: extraction.read,
        screenshotCountAt: analyzedScreenshotCountAfterSuccess(
          allShots,
          analyzedShotIds,
        ),
      });
      const updates: Record<string, unknown> = {
        extractedProfile: mergedProfile,
        vibeTags: mergedTags,
        lastRead,
      };
      // Transcript is re-extracted from ALL screenshots each time, so replace
      // only if we actually got turns back (avoid wiping an existing transcript
      // when a profile-only upload returns []).
      if (extraction.transcript.length > 0) {
        updates.transcript = mergedTranscript;
      }
      if (
        options.applySuggestedName &&
        extraction.suggestedName &&
        (match.name === "New Match" || match.name.trim() === "")
      ) {
        updates.name = extraction.suggestedName;
      }

      await db.update(matches).set(updates).where(eq(matches.id, matchId));
      await recordScoreHistory(matchId, mergedProfile.scores);
      await db
        .update(screenshots)
        .set({ extractionStatus: "done", extractionError: null })
        .where(inArray(screenshots.id, analyzedShotIds));
      await purgeAnalyzedRawImages({
        matchId,
        matchPhotoObjectPath: match.photoObjectPath,
        shots: shotsForVision,
      });
    } catch (err) {
      logger.error(
        { err, matchId, screenshotId },
        "Background extraction failed",
      );
      const message =
        err instanceof Error ? err.message : "Failed to analyze screenshot";
      try {
        await db
          .update(screenshots)
          .set({ extractionStatus: "failed", extractionError: message })
          .where(eq(screenshots.id, screenshotId));
      } catch (updateErr) {
        logger.error(
          { err: updateErr, screenshotId },
          "Failed to mark screenshot extraction as failed",
        );
      }
    }
  })();
}
