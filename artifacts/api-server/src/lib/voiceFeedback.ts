import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExtractedProfile, TranscriptTurn } from "@workspace/db";

const MODEL = "gpt-5.4";

export type VoiceNoteFeedback = {
  transcript: string;
  toneRating: number | null;
  energyRating: number | null;
  strengths: string[];
  improvements: string[];
  rewrite: string | null;
  shouldSend: "send" | "revise" | "scrap";
};

const SYSTEM = `You are a sharp, honest dating coach. The user is about to send a voice note to a match and wants you to critique it before they hit send.

Be direct, not sycophantic. Be specific.

Respond with ONLY a JSON object:
{
  "toneRating": integer 1-10,         // How warm/inviting vs flat the delivery sounds (judging from the transcript)
  "energyRating": integer 1-10,        // How engaging/alive vs low-energy
  "strengths": string[],               // 1-3 short bullets - what works
  "improvements": string[],            // 1-3 short bullets - concrete fixes
  "rewrite": string | null,            // Suggested short rewrite (1-3 sentences) if it needs work, else null
  "shouldSend": "send" | "revise" | "scrap"
}`;

export async function analyzeVoiceNote(
  transcript: string,
  context: {
    name: string;
    profile: ExtractedProfile;
    recentTurns: TranscriptTurn[];
  },
): Promise<Omit<VoiceNoteFeedback, "transcript">> {
  const recent = context.recentTurns.slice(-8);
  const recentText = recent
    .map((t) => `${t.speaker === "her" ? context.name : "Me"}: ${t.text}`)
    .join("\n");

  const user = `Match: ${context.name}
Her tone: ${context.profile.conversationTone ?? "(unknown)"}

Recent chat:
${recentText || "(no prior chat)"}

The user's voice note (transcribed):
"""
${transcript}
"""

Critique it.`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
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

  const toNum = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.max(1, Math.min(10, Math.round(v)));
  };
  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((x) => x.trim())
          .slice(0, 4)
      : [];

  const shouldRaw = parsed.shouldSend;
  const shouldSend: VoiceNoteFeedback["shouldSend"] =
    shouldRaw === "send" || shouldRaw === "revise" || shouldRaw === "scrap"
      ? shouldRaw
      : "revise";

  return {
    toneRating: toNum(parsed.toneRating),
    energyRating: toNum(parsed.energyRating),
    strengths: toStrArr(parsed.strengths),
    improvements: toStrArr(parsed.improvements),
    rewrite:
      typeof parsed.rewrite === "string" && parsed.rewrite.trim()
        ? parsed.rewrite.trim()
        : null,
    shouldSend,
  };
}
