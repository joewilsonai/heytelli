import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExtractedProfile } from "@workspace/db";
import { emptyExtractedProfile } from "@workspace/db";

export type ExtractionResult = {
  suggestedName: string | null;
  vibeTags: string[];
  profile: ExtractedProfile;
};

const SYSTEM_PROMPT = `You are an assistant helping a single user track their Bumble matches.

Given a screenshot of a Bumble profile or chat, extract structured information.

Respond with ONLY a JSON object (no markdown, no extra text) with this shape:
{
  "suggestedName": string | null,        // The match's first name if visible, else null
  "vibeTags": string[],                  // 2-5 short adjective tags about the conversation/profile vibe (e.g. "playful", "adventurous", "intellectual")
  "job": string | null,                  // Job title or profession if mentioned
  "location": string | null,             // City / neighborhood if mentioned
  "interests": string[],                 // Hobbies / interests they've mentioned (concise nouns/phrases)
  "mentionedTopics": string[],           // Specific things they brought up (e.g. "their dog Milo", "trip to Lisbon", "coffee snob")
  "conversationTone": string | null      // Brief description of overall tone (e.g. "warm and playful", "dry witty banter") - null if no chat visible
}

If a field cannot be determined, use null (for scalars) or [] (for arrays). Keep lists short and high-signal.`;

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim());
}

export async function extractFromScreenshot(
  imageDataUrl: string,
): Promise<ExtractionResult> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "high" },
          },
          {
            type: "text",
            text: "Extract structured information from this Bumble screenshot.",
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
    profile: {
      job: toStringOrNull(parsed.job),
      location: toStringOrNull(parsed.location),
      interests: toStringArray(parsed.interests),
      mentionedTopics: toStringArray(parsed.mentionedTopics),
      conversationTone: toStringOrNull(parsed.conversationTone),
    },
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
  const base = existing ?? emptyExtractedProfile;
  return {
    job: incoming.job ?? base.job,
    location: incoming.location ?? base.location,
    interests: mergeStringList(base.interests, incoming.interests),
    mentionedTopics: mergeStringList(base.mentionedTopics, incoming.mentionedTopics),
    conversationTone: incoming.conversationTone ?? base.conversationTone,
  };
}

export function mergeVibeTags(existing: string[], incoming: string[]): string[] {
  return mergeStringList(existing, incoming).slice(0, 8);
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

  const imageParts = imageDataUrls.map(
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
        content: `You are a witty, charming dating coach helping someone craft great replies on Bumble.

You will receive the full conversation history (as one or more screenshots in chronological order) and an extracted profile summary of the match. Use both to craft 3 distinct reply options the user could send next.

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
