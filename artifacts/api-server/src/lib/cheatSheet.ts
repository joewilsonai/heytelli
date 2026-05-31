import type {
  DateHistoryEntry,
  DateSafetyPlan,
  ExtractedProfile,
  RedFlagRadarSnapshot,
  TranscriptTurn,
} from "@workspace/db";
import { runModelTask } from "./modelRouter";

const MODEL = "gpt-5.4";

export type CheatSheetReply = {
  style: "playful" | "curious" | "direct";
  text: string;
};

const SYSTEM = `You generate 3 quick-reply suggestions for the user's NEXT message in an active dating chat. Each is a different style:
- "playful": teasing, witty, light
- "curious": asks a sharp, specific follow-up
- "direct": moves the convo forward (suggest meeting, escalate, set plan)

Each reply is in the user's voice (male, candid, no corporate hedging), 1-2 sentences, no emojis unless they fit naturally. Build on the most recent turn. No "Hey [name]".

Use the full dossier: profile, conversation, saved patterns, tags, notes, date history, and any scheduled date. If patterns suggest caution, make the replies calmer, boundary-aware, and avoid chasing.

Respond with ONLY JSON: { "replies": [{ "style": "playful"|"curious"|"direct", "text": string }, ...] }`;

export type CheatSheetContext = {
  userId?: number;
  matchId?: number;
  tags?: string[];
  vibeTags?: string[];
  notes?: string | null;
  dateHistory?: DateHistoryEntry[];
  nextDateAt?: string | Date | null;
  nextDateLocation?: string | null;
  nextDateOutfit?: string | null;
  dateSafetyPlan?: DateSafetyPlan | null;
  lastRedFlagRadar?: RedFlagRadarSnapshot | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/[ \t]+/g, " ") : null;
}

function formatList(values: string[] | undefined): string {
  const cleaned = (values ?? [])
    .map((value) => clean(value))
    .filter((value): value is string => Boolean(value));
  return cleaned.length > 0 ? cleaned.join(", ") : "(none)";
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const trimmed = clean(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function formatDateHistory(dateHistory: DateHistoryEntry[] | undefined): string {
  const rows = (dateHistory ?? []).slice(-5).map((date) => {
    const when = formatDate(date.when) ?? date.when;
    const location = clean(date.location);
    const recap = clean(date.recap) ?? "(no recap)";
    return `- ${when}${location ? ` @ ${location}` : ""}: ${recap}`;
  });
  return rows.length > 0 ? rows.join("\n") : "(none)";
}

function formatPatternRead(radar: RedFlagRadarSnapshot | null | undefined) {
  if (!radar) return "(none saved)";
  const redFlags = radar.redFlags
    .slice(0, 5)
    .map((flag) => `- ${flag.severity}: ${flag.label} (${flag.evidence})`);
  const greenFlags = radar.greenFlags
    .slice(0, 5)
    .map((flag) => `- ${flag.label} (${flag.evidence})`);
  return [
    `Overall: ${radar.overallRead || "(none)"}`,
    `Red patterns:\n${redFlags.length ? redFlags.join("\n") : "(none)"}`,
    `Green patterns:\n${greenFlags.length ? greenFlags.join("\n") : "(none)"}`,
  ].join("\n");
}

function formatDateSafetyPlan(plan: DateSafetyPlan | null | undefined): string {
  if (!plan) return "(none)";
  const checklistReady = Object.values(plan.safeDateChecklist).every(Boolean)
    ? "ready"
    : "incomplete";
  return [
    `dateModeStatus: ${plan.dateModeStatus ?? "none"}`,
    `circleCheckStatus: ${plan.circleCheckStatus ?? "none"}`,
    `checklist: ${checklistReady}`,
  ].join(", ");
}

function buildCheatSheetPrompt(
  name: string,
  profile: ExtractedProfile,
  transcript: TranscriptTurn[],
  context: CheatSheetContext,
): string {
  const recent = transcript
    .slice(-12)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");
  const visibleMedia = profile.visibleMedia
    .slice(-5)
    .map((item) => item.description)
    .filter(Boolean);
  const upcomingDate = formatDate(context.nextDateAt);
  const upcomingDateParts = [
    upcomingDate ?? "(none scheduled)",
    clean(context.nextDateLocation)
      ? `Location: ${clean(context.nextDateLocation)}`
      : null,
    clean(context.nextDateOutfit)
      ? `Outfit note: ${clean(context.nextDateOutfit)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return `Match: ${name}

Match profile:
Tone: ${profile.conversationTone ?? "?"}
Interests: ${formatList(profile.interests)}
Job: ${profile.job ?? "?"}
Location: ${profile.location ?? "?"}
Recent topics: ${formatList(profile.mentionedTopics)}
Visible media: ${visibleMedia.length ? visibleMedia.join(", ") : "(none)"}

Current tags: ${formatList(context.tags)}
Vibe tags: ${formatList(context.vibeTags)}

Saved pattern read:
${formatPatternRead(context.lastRedFlagRadar)}

Private notes:
${clean(context.notes) ?? "(none)"}

Upcoming date: ${upcomingDateParts.join(" | ")}
Date safety status: ${formatDateSafetyPlan(context.dateSafetyPlan)}

Date history:
${formatDateHistory(context.dateHistory)}

Most recent chat (${transcript.length} total turns):
${recent || "(none - generate openers)"}`;
}

export async function generateCheatSheet(
  name: string,
  profile: ExtractedProfile,
  transcript: TranscriptTurn[],
  context: CheatSheetContext = {},
): Promise<CheatSheetReply[]> {
  const user = buildCheatSheetPrompt(name, profile, transcript, context);

  const result = await runModelTask({
    feature: "reply_suggestion",
    userId: context.userId,
    matchId: context.matchId,
    preferredModel: MODEL,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    metadata: {
      transcriptTurns: transcript.length,
      hasDateHistory: (context.dateHistory ?? []).length > 0,
      hasSavedPatterns: context.lastRedFlagRadar != null,
    },
    promptVersion: "cheat_sheet:v1",
    responseSchemaVersion: "cheat_sheet_replies:v1",
  });
  const raw = result.content || "{}";
  const parsed = JSON.parse(raw);
  const replies = Array.isArray(parsed.replies) ? parsed.replies : [];
  return replies
    .filter(
      (r: unknown): r is CheatSheetReply =>
        !!r &&
        typeof r === "object" &&
        typeof (r as CheatSheetReply).text === "string" &&
        ["playful", "curious", "direct"].includes((r as CheatSheetReply).style),
    )
    .slice(0, 3);
}
