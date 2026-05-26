import { openai } from "@workspace/integrations-openai-ai-server";
import type { DateHistoryEntry } from "@workspace/db";
import type {
  DebriefRoutingAnalysis,
  DebriefTagSuggestion,
} from "./debriefRouting";

const DEBRIEF_MODEL = "gpt-5.4";

export type DebriefAnalysis = DebriefRoutingAnalysis;

export const DEBRIEF_SYSTEM_PROMPT = `You are HeyTelli, a private women-first dating safety and clarity assistant. The user is voice-debriefing what happened with a match. Extract durable, structured information that can be saved to her match timeline, tags, date history, red flags, and latest read.

Be grounded and specific. Do not diagnose people, moralize, or hype the user into overconfidence. Separate "what is going well" from "what to watch." Prefer concrete behavioral signals over vibes.

Respond with ONLY a JSON object (no markdown) with this shape:
{
  "summary": string,                       // 1-2 sentences capturing what actually happened
  "vibe": string | null,                   // 3-6 word descriptor (e.g. "warm but guarded")
  "greenFlags": string[],                  // 0-5 concrete signs things are going well
  "redFlags": string[],                    // 0-5 concrete concerns or safety/watch items
  "nextMoveSuggestion": string | null,     // 1-2 sentences: what to do next, if useful
  "tagsToAdd": [{ "tag": string, "reason": string | null }], // 0-5 short operational tags
  "date": {
    "isDate": boolean,                     // true only if the transcript describes an actual date/meetup
    "when": string | null,                 // ISO datetime if stated or strongly inferable
    "location": string | null,
    "recap": string | null
  },
  "readUpdate": string | null,             // durable latest read for the match after this debrief
  "timelineTitle": string | null           // short title for this saved debrief
}`;

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .slice(0, 6);
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDateCandidate(value: unknown): DebriefRoutingAnalysis["date"] {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const when = cleanText(obj.when);
  return {
    isDate: obj.isDate === true,
    when:
      when && !Number.isNaN(new Date(when).getTime())
        ? new Date(when).toISOString()
        : null,
    location: cleanText(obj.location),
    recap: cleanText(obj.recap),
  };
}

function toTagSuggestions(value: unknown): DebriefTagSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: DebriefTagSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const obj: Record<string, unknown> =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : { tag: raw };
    const tag = cleanText(obj.tag);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push({
      tag,
      reason: cleanText(obj.reason),
    });
    if (out.length >= 6) break;
  }
  return out;
}

export function normalizeDebriefAnalysis(
  parsed: unknown,
  fallbackTranscript: string,
): DebriefAnalysis {
  const obj =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return {
    summary:
      cleanText(obj.summary) ??
      fallbackTranscript.trim().slice(0, 200) ??
      "Debrief saved.",
    vibe: cleanText(obj.vibe),
    greenFlags: toStringArray(obj.greenFlags),
    redFlags: toStringArray(obj.redFlags),
    nextMoveSuggestion: cleanText(obj.nextMoveSuggestion),
    tagsToAdd: toTagSuggestions(obj.tagsToAdd),
    date: normalizeDateCandidate(obj.date),
    readUpdate: cleanText(obj.readUpdate),
    timelineTitle: cleanText(obj.timelineTitle),
  };
}

export async function analyzeVoiceDebrief(
  transcript: string,
  context: {
    name: string;
    priorVibe: string | null;
    currentTags: string[];
    dateHistory: DateHistoryEntry[];
    priorRead: string | null;
  },
): Promise<DebriefAnalysis> {
  const user = `Match: ${context.name}
Prior vibe: ${context.priorVibe ?? "(none)"}
Current tags: ${context.currentTags.length ? context.currentTags.join(", ") : "(none)"}
Prior dates: ${
    context.dateHistory.length
      ? context.dateHistory
          .map((d) => `${d.when}${d.location ? ` at ${d.location}` : ""}: ${d.recap}`)
          .join("\n")
      : "(none)"
  }
Current saved read: ${context.priorRead ?? "(none)"}

User's voice debrief (transcribed):
"""
${transcript}
"""

Analyze and return the JSON object.`;

  const completion = await openai.chat.completions.create({
    model: DEBRIEF_MODEL,
    messages: [
      { role: "system", content: DEBRIEF_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return normalizeDebriefAnalysis(parsed, transcript);
}
