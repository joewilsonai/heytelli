import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExtractedProfile, TranscriptTurn } from "@workspace/db";

const MODEL = "gpt-5.2-mini";

const SYSTEM = `You are a candid, sharp dating coach helping the user re-engage a match who has gone quiet. Generate exactly 3 distinct re-engagement openers — short (1-2 sentences each), in HIS voice, that reference something specific from the conversation or profile when possible. Mix tone: one playful, one curious, one direct. No emojis unless they fit. No "Hey [name]" — start with the substance.

Respond with ONLY a JSON object: { "openers": [string, string, string] }`;

export async function generateStaleNudgeOpeners(
  name: string,
  hoursSinceLastReply: number,
  profile: ExtractedProfile,
  transcript: TranscriptTurn[],
  notes: string,
): Promise<string[]> {
  const recentTurns = transcript.slice(-12);
  const transcriptText = recentTurns
    .map((t) => `${t.speaker === "her" ? name : "Me"}: ${t.text}`)
    .join("\n");

  const user = `Match: ${name}
Hours since her last reply: ${Math.round(hoursSinceLastReply)}
Her vibe: ${profile.scores.chemistry.rationale ?? "(unknown)"}
Her interests: ${(profile.interests || []).join(", ") || "(none captured)"}
Things she mentioned: ${(profile.mentionedTopics || []).join("; ") || "(none captured)"}
Her tone: ${profile.conversationTone ?? "(unknown)"}

Recent conversation (last ${recentTurns.length} turns):
${transcriptText || "(no transcript)"}

User's notes on her:
${notes || "(none)"}

Generate 3 re-engagement openers in his voice.`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.openers)) {
      return parsed.openers
        .filter((o: unknown): o is string => typeof o === "string" && o.trim() !== "")
        .map((o: string) => o.trim())
        .slice(0, 3);
    }
  } catch {
    // fallthrough
  }
  return [];
}
