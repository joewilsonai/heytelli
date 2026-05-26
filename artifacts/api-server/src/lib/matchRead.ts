import type {
  ExtractedProfile,
  MatchReadSnapshot,
  TranscriptTurn,
} from "@workspace/db";

export type MatchReadFreshness = "current" | "stale" | "missing";

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : null;
}

function joinParts(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map(cleanText).filter((v): v is string => Boolean(v));
  if (cleaned.length === 0) return null;
  return cleaned.join(" ");
}

export function buildMatchReadBody(input: {
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
  explicitRead?: string | null;
}): string {
  const explicitRead = cleanText(input.explicitRead);
  if (explicitRead) return explicitRead;

  const profile = input.profile;
  const profileDetails = joinParts([
    profile.job,
    profile.location,
    profile.interests.length > 0
      ? `Interests: ${profile.interests.slice(0, 3).join(", ")}.`
      : null,
    profile.mentionedTopics.length > 0
      ? `Recent topics: ${profile.mentionedTopics.slice(0, 3).join(", ")}.`
      : null,
  ]);

  const body = joinParts([
    profile.conversationTone,
    profile.scores.chemistry.rationale,
    profile.scores.conversionAbility.rationale,
    profileDetails,
  ]);

  if (body) return body;
  if (input.transcript.length > 0) {
    return "The latest screenshots were analyzed, but there was not enough clear signal for a detailed read yet.";
  }
  return "The latest screenshots were analyzed, but there was not enough readable conversation for a useful read yet.";
}

export function buildMatchReadSnapshot(input: {
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
  explicitRead?: string | null;
  screenshotCountAt: number;
  generatedAt?: Date;
}): MatchReadSnapshot {
  return {
    body: buildMatchReadBody(input),
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    screenshotCountAt: input.screenshotCountAt,
  };
}

export function normalizeMatchReadSnapshot(
  raw: unknown,
): MatchReadSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const body = cleanText(typeof obj.body === "string" ? obj.body : null);
  const generatedAt =
    typeof obj.generatedAt === "string" && !Number.isNaN(new Date(obj.generatedAt).getTime())
      ? obj.generatedAt
      : null;
  const screenshotCountAt =
    typeof obj.screenshotCountAt === "number" && Number.isFinite(obj.screenshotCountAt)
      ? Math.max(0, Math.floor(obj.screenshotCountAt))
      : null;

  if (!body || !generatedAt || screenshotCountAt == null) return null;
  return { body, generatedAt, screenshotCountAt };
}

export function computeMatchReadFreshness(input: {
  lastRead: MatchReadSnapshot | null;
  doneScreenshotCount: number;
  pendingScreenshotCount: number;
  failedScreenshotCount: number;
}): MatchReadFreshness {
  if (!input.lastRead) return "missing";
  if (input.pendingScreenshotCount > 0 || input.failedScreenshotCount > 0) {
    return "stale";
  }
  if (input.doneScreenshotCount > input.lastRead.screenshotCountAt) {
    return "stale";
  }
  return "current";
}
