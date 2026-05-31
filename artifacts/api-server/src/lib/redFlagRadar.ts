import type {
  ExtractedProfile,
  TranscriptTurn,
  DateHistoryEntry,
} from "@workspace/db";
import {
  detectDatingSafetyRedFlags,
  mergeSafetyRedFlags,
} from "./datingSafetyTaxonomy";
import { runModelTask } from "./modelRouter";

const MODEL = "gpt-5.4";

export type RedFlag = {
  severity: "low" | "medium" | "high";
  label: string;
  evidence: string;
};

export type GreenFlag = {
  label: string;
  evidence: string;
};

export type RedFlagRadarResult = {
  redFlags: RedFlag[];
  greenFlags: GreenFlag[];
  overallRead: string;
};

const SYSTEM = `You are a candid dating analyst. Scan the match dossier and identify behavioral patterns: red flags (flakiness, hot-cold, low-effort replies, cancellations, dodging questions, late-night-only texting, validation seeking, contradictions) and green flags (specificity, reciprocity, planning, vulnerability, follow-through, asking about the user). Pull short verbatim evidence from chat/notes/date history when possible.

Respond with ONLY a JSON object:
{
  "redFlags": [{ "severity": "low"|"medium"|"high", "label": string, "evidence": string }],
  "greenFlags": [{ "label": string, "evidence": string }],
  "overallRead": string  // 1-2 sentence verdict, candid not corporate
}`;

export async function analyzeRedFlags(
  name: string,
  profile: ExtractedProfile,
  transcript: TranscriptTurn[],
  dateHistory: DateHistoryEntry[],
  notes: string,
  context: { userId?: number; matchId?: number } = {},
): Promise<RedFlagRadarResult> {
  const transcriptText = transcript
    .slice(-50)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");
  const dateText = dateHistory
    .slice(-10)
    .map((d) => `[${d.when}] ${d.location || "?"} — ${d.recap}`)
    .join("\n");
  const user = `Match: ${name}
Tone: ${profile.conversationTone ?? "?"}
Interests: ${profile.interests.join(", ") || "?"}

Recent transcript (last 50):
${transcriptText || "(none)"}

Date history:
${dateText || "(none)"}

User notes:
${notes || "(none)"}`;

  const result = await runModelTask({
    feature: "pattern_extraction",
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
      dateHistoryCount: dateHistory.length,
      hasNotes: notes.trim().length > 0,
    },
    promptVersion: "red_flag_radar:v1",
    responseSchemaVersion: "red_flag_radar:v1",
  });
  const raw = result.content || "{}";
  const parsed = JSON.parse(raw);
  const aiRedFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags.slice(0, 8)
    : [];
  const safetyRedFlags = detectDatingSafetyRedFlags({
    name,
    profile,
    transcript,
    dateHistory,
    notes,
  });
  return {
    redFlags: mergeSafetyRedFlags(aiRedFlags, safetyRedFlags).slice(0, 8),
    greenFlags: Array.isArray(parsed.greenFlags)
      ? parsed.greenFlags.slice(0, 8)
      : [],
    overallRead:
      typeof parsed.overallRead === "string" ? parsed.overallRead : "",
  };
}
