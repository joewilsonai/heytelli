import { Directory, File, Paths } from "expo-file-system";

const PROFILE_SCREENSHOT_DIR = "heytelli-profile-screenshots";
export const MAX_PROFILE_SCREENSHOTS = 10;

export type ProfileScreenshotPruneResult = {
  profileScreenshotUris: string[];
  skippedScreenshotUris: string[];
};

export type PreparedProfileScreenshots = ProfileScreenshotPruneResult & {
  dataUrls: string[];
};

function imageExtension(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? "";
  const match = withoutQuery.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return ext;
  }
  return "jpg";
}

function profileScreenshotDir(): Directory {
  return new Directory(Paths.document, PROFILE_SCREENSHOT_DIR);
}

function contentTypeForUri(uri: string): string {
  const ext = imageExtension(uri);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

function isDataImage(uri: string): boolean {
  return /^data:image\/(png|jpe?g|webp|heic|heif);base64,/i.test(uri);
}

function canReadProfileScreenshot(uri: string): boolean {
  if (isDataImage(uri)) return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function filterExistingProfileScreenshotUris(
  uris: string[],
): ProfileScreenshotPruneResult {
  const profileScreenshotUris: string[] = [];
  const skippedScreenshotUris: string[] = [];
  const seen = new Set<string>();

  for (const uri of uris.slice(0, MAX_PROFILE_SCREENSHOTS)) {
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    if (canReadProfileScreenshot(uri)) {
      profileScreenshotUris.push(uri);
    } else {
      skippedScreenshotUris.push(uri);
    }
  }

  return { profileScreenshotUris, skippedScreenshotUris };
}

export function deleteProfileScreenshotUris(uris: string[]): void {
  const directory = profileScreenshotDir();
  for (const uri of uris) {
    if (!uri.startsWith(directory.uri)) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Missing local screenshot files should never block Settings cleanup.
    }
  }
}

export async function saveProfileScreenshotUris(
  uris: string[],
): Promise<string[]> {
  const directory = profileScreenshotDir();
  directory.create({ intermediates: true, idempotent: true });

  return uris.slice(0, MAX_PROFILE_SCREENSHOTS).map((uri, index) => {
    if (uri.startsWith(directory.uri)) return uri;
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileName = `profile_${Date.now().toString(36)}_${index}_${suffix}.${imageExtension(uri)}`;
    const destination = new File(directory, fileName);
    new File(uri).copy(destination);
    return destination.uri;
  });
}

export async function prepareProfileScreenshotsForAnalysis(
  uris: string[],
): Promise<PreparedProfileScreenshots> {
  const profileScreenshotUris: string[] = [];
  const skippedScreenshotUris: string[] = [];
  const dataUrls: string[] = [];
  const seen = new Set<string>();

  for (const uri of uris.slice(0, MAX_PROFILE_SCREENSHOTS)) {
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    if (isDataImage(uri)) {
      profileScreenshotUris.push(uri);
      dataUrls.push(uri);
      continue;
    }
    try {
      const file = new File(uri);
      if (!file.exists) {
        skippedScreenshotUris.push(uri);
        continue;
      }
      const base64 = await file.base64();
      profileScreenshotUris.push(uri);
      dataUrls.push(`data:${contentTypeForUri(uri)};base64,${base64}`);
    } catch {
      skippedScreenshotUris.push(uri);
    }
  }

  return { profileScreenshotUris, skippedScreenshotUris, dataUrls };
}
