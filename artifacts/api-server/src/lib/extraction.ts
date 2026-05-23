import { eq } from "drizzle-orm";
import sharp from "sharp";
import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ExtractedProfile,
  MatchScore,
  MatchScores,
  TranscriptTurn,
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

export type ExtractionResult = {
  suggestedName: string | null;
  vibeTags: string[];
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
};

const SYSTEM_PROMPT = `You are an assistant helping a single MALE user (referred to as "me") track women he's talking to from dating apps.

You'll be given screenshots from a dating app profile/chat (Bumble, Hinge, Tinder, etc.) OR a text-message thread (iMessage, SMS, WhatsApp, Instagram DMs) once the conversation has moved off the app. Treat all of these the same.

## Identifying who is speaking — READ CAREFULLY

In every chat UI on these platforms, message bubbles are visually divided by author:

- The OTHER PERSON (the woman, "her") = bubbles on the LEFT side of the screen, usually grey/white background, often with her name or profile photo next to them at the top of the thread.
- THE USER ("me") = bubbles on the RIGHT side of the screen, usually a colored/branded background (Bumble yellow, iMessage blue/green, Hinge dark, WhatsApp green, Instagram gradient, etc.). Never has her name next to them.

If a screenshot is ONLY her dating-app profile (no chat bubbles), there is no transcript — return an empty transcript array.

Do not guess. If a bubble's side or color is genuinely ambiguous, omit it from the transcript rather than mis-attributing it.

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

  // Full chat transcript across ALL screenshots, in chronological order (top-to-bottom within each screenshot, earliest screenshot first).
  // Each turn is { "speaker": "her" | "me", "text": "<exact message text>" }.
  // Combine consecutive bubbles from the same speaker into one turn separated by " / " ONLY when they're clearly the same message broken across bubbles; otherwise keep them as separate turns.
  // Strip timestamps, reactions, and read receipts. Keep emojis. Use [photo], [voice note], [gif], [link] inline for non-text content.
  // Return [] if no chat bubbles are visible (e.g. profile-only screenshot).
  "transcript": [{ "speaker": "her" | "me", "text": string }],

  // Scores: each is an integer 0-10 plus a short rationale (1 sentence).
  // Return null for both value and rationale if there is not enough signal to judge.
  "sexPotentialScore":      { "value": number | null, "rationale": string | null },  // Likelihood that a first date would lead to sex, based on flirtation level, sexual undertones, openness, and overall energy
  "conversionAbilityScore": { "value": number | null, "rationale": string | null },  // How skilled SHE is at moving the chat toward an actual date — asks questions, suggests plans, keeps momentum, doesn't ghost
  "chemistryScore":         { "value": number | null, "rationale": string | null }   // Mutual chemistry between the two people in the chat — banter quality, matching energy, shared humor, reciprocity
}

If a field cannot be determined, use null (for scalars) or [] (for arrays). Keep lists short and high-signal. Be honest with the scores — don't inflate them.`;

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
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return dataUrl; // fall back to original if sharp can't decode
  }
}

export async function extractFromScreenshots(
  imageDataUrls: string[],
): Promise<ExtractionResult> {
  // Cap to most-recent 12 to keep the request shape sane even for very long threads.
  const capped = imageDataUrls.slice(-12);
  const compressed = await Promise.all(capped.map(compressForVision));
  const imageParts = compressed.map(
    (url) =>
      ({
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      }) as const,
  );
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...imageParts,
          {
            type: "text",
            text: imageDataUrls.length > 1
              ? `Extract structured information from these ${imageDataUrls.length} screenshots, which together form one continuous conversation (chronological order). Score the conversation as a whole.`
              : "Extract structured information from this conversation or profile screenshot.",
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const jsonText = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = {};
      }
    }
  }

  return {
    suggestedName: toStringOrNull(parsed.suggestedName),
    vibeTags: toStringArray(parsed.vibeTags),
    transcript: normalizeTranscript(parsed.transcript),
    profile: {
      job: toStringOrNull(parsed.job),
      location: toStringOrNull(parsed.location),
      interests: toStringArray(parsed.interests),
      mentionedTopics: toStringArray(parsed.mentionedTopics),
      conversationTone: toStringOrNull(parsed.conversationTone),
      scores: {
        sexPotential: toScore(parsed.sexPotentialScore),
        conversionAbility: toScore(parsed.conversionAbilityScore),
        chemistry: toScore(parsed.chemistryScore),
      },
    },
  };
}

function mergeScore(existing: MatchScore, incoming: MatchScore): MatchScore {
  // Prefer the latest non-null reading, since later screenshots reflect more of the conversation.
  if (incoming.value === null && incoming.rationale === null) return existing;
  return {
    value: incoming.value ?? existing.value,
    rationale: incoming.rationale ?? existing.rationale,
  };
}

function mergeScores(existing: MatchScores, incoming: MatchScores): MatchScores {
  return {
    sexPotential: mergeScore(existing.sexPotential, incoming.sexPotential),
    conversionAbility: mergeScore(
      existing.conversionAbility,
      incoming.conversionAbility,
    ),
    chemistry: mergeScore(existing.chemistry, incoming.chemistry),
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

export function mergeExtraction(
  existing: ExtractedProfile | null | undefined,
  incoming: ExtractionResult["profile"],
): ExtractedProfile {
  const base: ExtractedProfile = existing
    ? { ...emptyExtractedProfile, ...existing, scores: existing.scores ?? emptyExtractedProfile.scores }
    : emptyExtractedProfile;
  return {
    job: incoming.job ?? base.job,
    location: incoming.location ?? base.location,
    interests: mergeStringList(base.interests, incoming.interests),
    mentionedTopics: mergeStringList(base.mentionedTopics, incoming.mentionedTopics),
    conversationTone: incoming.conversationTone ?? base.conversationTone,
    scores: mergeScores(base.scores, incoming.scores),
  };
}

export function mergeVibeTags(existing: string[], incoming: string[]): string[] {
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
      allShots.sort(
        (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
      );

      const dataUrls = await Promise.all(
        allShots.map((s) => objectPathToDataUrl(s.objectPath)),
      );
      const extraction = await extractFromScreenshots(dataUrls);

      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));
      if (!match) return;

      const mergedProfile = mergeExtraction(match.extractedProfile, extraction.profile);
      const mergedTags = mergeVibeTags(match.vibeTags, extraction.vibeTags);
      const updates: Record<string, unknown> = {
        extractedProfile: mergedProfile,
        vibeTags: mergedTags,
      };
      // Transcript is re-extracted from ALL screenshots each time, so replace
      // wholesale rather than merge — but only if we actually got turns back
      // (avoid wiping an existing transcript when a profile-only upload
      // returns []).
      if (extraction.transcript.length > 0) {
        updates.transcript = extraction.transcript;
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
        .where(eq(screenshots.id, screenshotId));
    } catch (err) {
      logger.error({ err, matchId, screenshotId }, "Background extraction failed");
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

export async function generateRepliesFromContext(
  imageDataUrls: string[],
  profile: ExtractedProfile,
  matchName: string,
  userNotes: string,
): Promise<string[]> {
  const profileSummary = [
    matchName ? `Match name: ${matchName}` : null,
    profile.job ? `Job: ${profile.job}` : null,
    profile.location ? `Location: ${profile.location}` : null,
    profile.interests.length ? `Interests: ${profile.interests.join(", ")}` : null,
    profile.mentionedTopics.length
      ? `Things they've mentioned: ${profile.mentionedTopics.join(", ")}`
      : null,
    profile.conversationTone ? `Conversation tone: ${profile.conversationTone}` : null,
    userNotes.trim() ? `User's private notes: ${userNotes.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const capped = imageDataUrls.slice(-12);
  const compressed = await Promise.all(capped.map(compressForVision));
  const imageParts = compressed.map(
    (url) =>
      ({
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      }) as const,
  );

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `You are a witty, charming dating coach helping someone craft great replies to a match they're talking to.

You will receive the full conversation history as one or more screenshots in chronological order. These may be from a dating app (Bumble, Hinge, Tinder, etc.) or from text messages (iMessage, SMS, WhatsApp, Instagram DMs) once the chat has moved off the app — treat them all as part of the same conversation. Use the screenshots plus the extracted profile summary to craft 3 distinct reply options the user could send next.

Each reply should:
- Be natural and conversational
- Match the tone already established
- Reference things the match has shared when natural
- Vary in style: one playful/flirty, one genuine/warm, one clever/witty
- Be concise — typically 1-3 sentences

Respond ONLY with a JSON array of exactly 3 strings, no extra text.
Example: ["Reply 1", "Reply 2", "Reply 3"]`,
      },
      {
        role: "user",
        content: [
          ...imageParts,
          {
            type: "text",
            text: `Profile summary:\n${profileSummary || "(no extracted profile yet)"}\n\nGenerate 3 great reply options.`,
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "[]";
  const jsonText = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let replies: unknown;
  try {
    replies = JSON.parse(jsonText);
  } catch {
    const matches = jsonText.match(/"([^"]+)"/g);
    replies = matches ? matches.map((m) => m.replace(/"/g, "")).slice(0, 3) : [];
  }

  if (!Array.isArray(replies) || replies.length === 0) {
    return ["Couldn't generate replies — try adding a clearer screenshot."];
  }
  return replies
    .filter((r): r is string => typeof r === "string")
    .slice(0, 3);
}
