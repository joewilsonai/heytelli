import { File } from "expo-file-system";

import { getApiBaseUrl } from "./api-base";

export type ProfileAnalysisResult = {
  profileText: string;
  lookingFor: string;
  boundaries: string;
  photoNotes: string;
};

function contentTypeForUri(uri: string): string {
  const ext = uri.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

async function uriToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const base64 = await new File(uri).base64();
  return `data:${contentTypeForUri(uri)};base64,${base64}`;
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

  const images = await Promise.all(profileScreenshotUris.map(uriToDataUrl));
  const response = await fetch(`${apiBaseUrl}/api/settings/profile/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
