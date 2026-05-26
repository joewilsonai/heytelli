import { Directory, File, Paths } from "expo-file-system";

const PROFILE_SCREENSHOT_DIR = "heytelli-profile-screenshots";
export const MAX_PROFILE_SCREENSHOTS = 10;

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
