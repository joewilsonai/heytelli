import { openai } from "@workspace/integrations-openai-ai-server";
import type { MatchScore } from "@workspace/db";

const DEBRIEF_MODEL = "gpt-5.2-mini";

export type DebriefAnalysis = {
  summary: string;
  vibe: string | null;
  greenFlags: string[];
  redFlags: string[];
  nextMoveSuggestion: string | null;
  scoreSuggestions: {
    sexPotential: MatchScore;
    conversionAbility: MatchScore;
    chemistry: MatchScore;
  };
};

const SYSTEM = `You are a sharp, candid dating coach. The user just got back from a date or interaction with a match and is voice-debriefing what happened. Analyze the transcript and return structured insights.

Be honest, not sycophantic. Pick up on subtext.

Respond with ONLY a JSON object (no markdown) with this shape:
{
  "summary": string,                       // 1-2 sentences capturing what actually happened
  "vibe": string | null,                   // 3-6 word vibe descriptor (e.g. "warm but cagey")
  "greenFlags": string[],                  // 0-4 short bullet observations - things going well
  "redFlags": string[],                    // 0-4 short bullet observations - concerns or warning signs
  "nextMoveSuggestion": string | null,     // 1-2 sentences: what to do next (text, escalate, wait, etc.)
  "scoreSuggestions": {                    // Updated scores 0-10, null if not enough info to revise
    "sexPotential":      { "value": number | null, "rationale": string | null },
    "conversionAbility": { "value": number | null, "rationale": string | null },
    "chemistry":         { "value": number | null, "rationale": string | null }
  }
}`;

function emptyScore(): MatchScore {
  return { value: null, rationale: null };
}

function toScore(v: unknown): MatchScore {
  if (!v || typeof v !== "object") return emptyScore();
  const obj = v as Record<string, unknown>;
  let value: number | null = null;
  if (typeof obj.value === "number" && Number.isFinite(obj.value)) {
    value = Math.max(0, Math.min(10, Math.round(obj.value)));
  }
  const rationale =
    typeof obj.rationale === "string" && obj.rationale.trim() !== ""
      ? obj.rationale.trim()
      : null;
  return { value, rationale };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .slice(0, 6);
}

export async function analyzeVoiceDebrief(
  transcript: string,
  context: {
    name: string;
    priorVibe: string | null;
    priorScores: {
      sexPotential: MatchScore;
      conversionAbility: MatchScore;
      chemistry: MatchScore;
    };
  },
): Promise<DebriefAnalysis> {
  const user = `Match: ${context.name}
Prior vibe: ${context.priorVibe ?? "(none)"}
Prior scores — sex: ${context.priorScores.sexPotential.value ?? "?"}, conversion: ${context.priorScores.conversionAbility.value ?? "?"}, chemistry: ${context.priorScores.chemistry.value ?? "?"}

User's voice debrief (transcribed):
"""
${transcript}
"""

Analyze and return the JSON object.`;

  const completion = await openai.chat.completions.create({
    model: DEBRIEF_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
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

  const scoreSugg = (parsed.scoreSuggestions as Record<string, unknown>) ?? {};
  return {
    summary:
      typeof parsed.summary === "string" ? parsed.summary.trim() : transcript.slice(0, 200),
    vibe: typeof parsed.vibe === "string" && parsed.vibe.trim() ? parsed.vibe.trim() : null,
    greenFlags: toStringArray(parsed.greenFlags),
    redFlags: toStringArray(parsed.redFlags),
    nextMoveSuggestion:
      typeof parsed.nextMoveSuggestion === "string" && parsed.nextMoveSuggestion.trim()
        ? parsed.nextMoveSuggestion.trim()
        : null,
    scoreSuggestions: {
      sexPotential: toScore(scoreSugg.sexPotential),
      conversionAbility: toScore(scoreSugg.conversionAbility),
      chemistry: toScore(scoreSugg.chemistry),
    },
  };
}
