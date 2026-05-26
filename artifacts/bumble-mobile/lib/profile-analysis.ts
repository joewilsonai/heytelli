import { getApiBaseUrl } from "./api-base";
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

  const response = await fetch(`${apiBaseUrl}/api/settings/profile/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: prepared.dataUrls }),
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
    profileScreenshotUris: prepared.profileScreenshotUris,
    skippedScreenshotUris: prepared.skippedScreenshotUris,
  };
}
