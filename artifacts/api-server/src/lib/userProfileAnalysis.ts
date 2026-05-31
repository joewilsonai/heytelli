import sharp from "sharp";
import { runModelTask } from "./modelRouter";

export type UserProfileAnalysis = {
  profileText: string;
  lookingFor: string;
  boundaries: string;
  photoNotes: string;
};

const PROFILE_ANALYSIS_SYSTEM_PROMPT = `You are HeyTelli, a private women-first dating safety and clarity app. Analyze the user's own dating profile screenshots. Extract what her profile currently communicates and suggest safer, clearer fields she can save locally.

Do not rate attractiveness. Do not diagnose matches. Focus on privacy, clarity, intent, boundaries, and what profile details may attract or repel certain kinds of attention.

Respond with ONLY a JSON object:
{
  "profileText": string,  // concise reconstruction/summary of her visible profile prompts and bio
  "lookingFor": string,   // what she appears to be looking for; suggest clearer wording if ambiguous
  "boundaries": string,   // concrete boundaries/non-negotiables she may want HeyTelli to remember
  "photoNotes": string    // notes about photo signals and privacy leaks: workplace, routine, location, kids, car plates, gym, home, school, handles
}`;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(content: string): Record<string, unknown> {
  const jsonText = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

export function normalizeUserProfileAnalysis(
  parsed: unknown,
): UserProfileAnalysis {
  const obj =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    profileText: clean(obj.profileText),
    lookingFor: clean(obj.lookingFor),
    boundaries: clean(obj.boundaries),
    photoNotes: clean(obj.photoNotes),
  };
}

async function compressForVision(dataUrl: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  const buf = Buffer.from(match[2]!, "base64");
  try {
    const out = await sharp(buf)
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return dataUrl;
  }
}

export async function analyzeUserDatingProfile(
  imageDataUrls: string[],
  context: { userId?: number } = {},
): Promise<UserProfileAnalysis> {
  const capped = imageDataUrls.slice(0, 10);
  const images = await Promise.all(capped.map(compressForVision));
  const result = await runModelTask({
    feature: "ocr_cleanup",
    userId: context.userId,
    preferredModel: "gpt-5.4",
    maxCompletionTokens: 1600,
    messages: [
      { role: "system", content: PROFILE_ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...images.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
          {
            type: "text" as const,
            text: `Analyze these ${images.length} dating profile screenshot(s). Fill all four fields. If a field is not visible, infer cautiously and say what is missing.`,
          },
        ],
      },
    ],
    metadata: { imageCount: images.length, surface: "settings_profile" },
    promptVersion: "user_profile_analysis:v1",
    responseSchemaVersion: "user_profile_analysis:v1",
  });

  const parsed = parseJsonObject(result.content || "{}");
  return normalizeUserProfileAnalysis(parsed);
}
