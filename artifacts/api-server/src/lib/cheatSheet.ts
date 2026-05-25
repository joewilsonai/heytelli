import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExtractedProfile, TranscriptTurn } from "@workspace/db";

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

Respond with ONLY JSON: { "replies": [{ "style": "playful"|"curious"|"direct", "text": string }, ...] }`;

export async function generateCheatSheet(
  name: string,
  profile: ExtractedProfile,
  transcript: TranscriptTurn[],
): Promise<CheatSheetReply[]> {
  const recent = transcript
    .slice(-12)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");
  const user = `Match: ${name}
Tone: ${profile.conversationTone ?? "?"}
Interests: ${profile.interests.join(", ") || "?"}

Most recent chat:
${recent || "(none — generate openers)"}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
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
