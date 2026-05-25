import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  DateHistoryEntry,
  ExtractedProfile,
  TranscriptTurn,
} from "@workspace/db";

const MODEL = "gpt-5.4";

export type TagSuggestion = {
  tag: string;
  action: "add" | "remove";
  reason: string;
};

export type TagSuggestionResult = {
  suggestions: TagSuggestion[];
  summary: string;
};

const SYSTEM = `You curate short, lowercase, hyphenated tags that describe a romantic match as the relationship evolves. Tags are operational (used for filtering and at-a-glance vibe), not adjectives. Good: "fitness", "career-driven", "long-distance", "deal-breaker-religion", "second-date-locked", "ghosted-twice", "very-into-me". Bad: "she is nice", "MAYBE", "Possible".

You are given:
- CURRENT tags the user has on this match.
- Profile, recent transcript, date history, notes.

Propose changes. Add a tag when there's clear new evidence it now applies. Remove a tag when evidence contradicts it OR it's now stale (e.g. "early-convo" after 50 messages, "scheduling" after the date happened). Be conservative — only suggest changes you can justify in one sentence. Max 6 suggestions. Never re-suggest a tag already on the match (no-op).

Respond with ONLY JSON: { "suggestions": [{ "tag": string, "action": "add"|"remove", "reason": string }, ...], "summary": string }`;

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  if (!t || t.length > 40) return null;
  return t;
}

export async function suggestTags(args: {
  name: string;
  currentTags: string[];
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
  dateHistory: DateHistoryEntry[];
  notes: string;
}): Promise<TagSuggestionResult> {
  const recent = args.transcript
    .slice(-20)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");
  const dates = args.dateHistory
    .slice(-5)
    .map(
      (d) =>
        `- ${d.when}${d.location ? ` @ ${d.location}` : ""}: ${d.recap || "(no recap)"}`,
    )
    .join("\n");

  const user = `Match: ${args.name}
Current tags: ${args.currentTags.length ? args.currentTags.join(", ") : "(none)"}
Tone: ${args.profile.conversationTone ?? "?"}
Interests: ${args.profile.interests.join(", ") || "?"}
Job: ${args.profile.job ?? "?"}

Notes:
${args.notes || "(none)"}

Date history:
${dates || "(no dates yet)"}

Recent chat (${args.transcript.length} total turns):
${recent || "(no chat yet)"}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const current = new Set(args.currentTags);
  const seen = new Set<string>();
  const suggestions: TagSuggestion[] = [];
  for (const r of Array.isArray(parsed.suggestions) ? parsed.suggestions : []) {
    if (!r || typeof r !== "object") continue;
    const tag = normalizeTag((r as TagSuggestion).tag);
    const action = (r as TagSuggestion).action;
    const reason =
      typeof (r as TagSuggestion).reason === "string"
        ? (r as TagSuggestion).reason.trim()
        : "";
    if (!tag || (action !== "add" && action !== "remove")) continue;
    if (action === "add" && current.has(tag)) continue;
    if (action === "remove" && !current.has(tag)) continue;
    if (seen.has(`${action}:${tag}`)) continue;
    seen.add(`${action}:${tag}`);
    suggestions.push({ tag, action, reason });
    if (suggestions.length >= 6) break;
  }
  return { suggestions, summary };
}
