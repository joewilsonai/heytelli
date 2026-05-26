import { getApiBaseUrl } from "./api-base";
import { getAuthHeader } from "./auth-session";
import { batchProfileAnalysisDataUrls } from "./profile-analysis-batches";
import {
  prepareProfileScreenshotsForAnalysis,
  type PreparedProfileScreenshots,
} from "./local-profile-screenshots";

export type ProfileAnalysisResult = {
  profileText: string;
  lookingFor: string;
  boundaries: string;
  photoNotes: string;
  profileScreenshotUris: string[];
  skippedScreenshotUris: string[];
  skippedOversizedScreenshotUris: string[];
};

export class ProfileScreenshotUnavailableError extends Error {
  profileScreenshotUris: string[];
  skippedScreenshotUris: string[];

  constructor(prepared: PreparedProfileScreenshots) {
    super(
      "Those profile screenshots are no longer available on this phone. I removed them from Settings; add them again to analyze.",
    );
    this.name = "ProfileScreenshotUnavailableError";
    this.profileScreenshotUris = prepared.profileScreenshotUris;
    this.skippedScreenshotUris = prepared.skippedScreenshotUris;
  }
}

export function isProfileScreenshotUnavailableError(
  error: unknown,
): error is ProfileScreenshotUnavailableError {
  return (
    error instanceof ProfileScreenshotUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "ProfileScreenshotUnavailableError")
  );
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeField(values: string[]): string {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .join("\n\n");
}

async function postProfileAnalysisBatch(
  apiBaseUrl: string,
  images: string[],
): Promise<
  Omit<
    ProfileAnalysisResult,
    | "profileScreenshotUris"
    | "skippedScreenshotUris"
    | "skippedOversizedScreenshotUris"
  >
> {
  const authHeader = await getAuthHeader();
  if (!authHeader.Authorization) {
    throw new Error("Sign in again to analyze your profile.");
  }
  const response = await fetch(`${apiBaseUrl}/api/settings/profile/analyze`, {
    method: "POST",
    headers: {
      Authorization: authHeader.Authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ images }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? "Profile analysis failed.");
  }

  const body = await response.json();
  return {
    profileText: clean(body.profileText),
    lookingFor: clean(body.lookingFor),
    boundaries: clean(body.boundaries),
    photoNotes: clean(body.photoNotes),
  };
}

export async function analyzeDatingProfileScreenshots(
  profileScreenshotUris: string[],
): Promise<ProfileAnalysisResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("API connection is not configured.");
  }
  if (profileScreenshotUris.length === 0) {
    throw new Error("Add profile screenshots first.");
  }

  const prepared = await prepareProfileScreenshotsForAnalysis(
    profileScreenshotUris,
  );
  if (prepared.dataUrls.length === 0) {
    throw new ProfileScreenshotUnavailableError(prepared);
  }

  const batchPlan = batchProfileAnalysisDataUrls(prepared.dataUrls);
  const skippedOversizedScreenshotUris =
    batchPlan.skippedOversizedIndexes.flatMap((index) =>
      prepared.profileScreenshotUris[index]
        ? [prepared.profileScreenshotUris[index]!]
        : [],
    );

  if (batchPlan.batches.length === 0) {
    throw new Error(
      "Those profile screenshots are too large to analyze. Clear them, crop them tighter, and add them again.",
    );
  }

  const analyses = [];
  for (const batch of batchPlan.batches) {
    analyses.push(await postProfileAnalysisBatch(apiBaseUrl, batch));
  }

  return {
    profileText: mergeField(analyses.map((analysis) => analysis.profileText)),
    lookingFor: mergeField(analyses.map((analysis) => analysis.lookingFor)),
    boundaries: mergeField(analyses.map((analysis) => analysis.boundaries)),
    photoNotes: mergeField(analyses.map((analysis) => analysis.photoNotes)),
    profileScreenshotUris: prepared.profileScreenshotUris,
    skippedScreenshotUris: prepared.skippedScreenshotUris,
    skippedOversizedScreenshotUris,
  };
}
