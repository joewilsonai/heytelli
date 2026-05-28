import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";

const LOCAL_MATCH_SCREENSHOT_DIR = "heytelli-match-screenshots";
export const LOCAL_MATCH_SCREENSHOT_STORAGE_KEY =
  "heytelli:local-match-screenshots:v1";

export type LocalMatchScreenshotMap = Record<string, Record<string, string>>;

type LocalMatchScreenshotListener = (
  screenshots: LocalMatchScreenshotMap,
) => void;

const listeners = new Set<LocalMatchScreenshotListener>();

function screenshotDir(): Directory {
  return new Directory(Paths.document, LOCAL_MATCH_SCREENSHOT_DIR);
}

function matchKey(matchId: number | string): string {
  return String(matchId);
}

function screenshotKey(screenshotId: number | string): string {
  return String(screenshotId);
}

function imageExtension(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? "";
  const match = withoutQuery.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) {
    return ext === "heif" ? "heic" : ext;
  }
  return "jpg";
}

function canReadLocalScreenshot(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

function deleteLocalScreenshotFile(uri: string | null | undefined): void {
  if (!uri) return;
  const directory = screenshotDir();
  if (!uri.startsWith(directory.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Missing local screenshot files should never block UI cleanup.
  }
}

function notifyLocalScreenshotListeners(
  screenshots: LocalMatchScreenshotMap,
): void {
  for (const listener of listeners) {
    listener(screenshots);
  }
}

export function pruneMissingLocalMatchScreenshots(
  screenshots: LocalMatchScreenshotMap,
): LocalMatchScreenshotMap {
  const next: LocalMatchScreenshotMap = {};
  for (const [matchId, byScreenshot] of Object.entries(screenshots)) {
    const kept: Record<string, string> = {};
    for (const [screenshotId, uri] of Object.entries(byScreenshot)) {
      if (uri && canReadLocalScreenshot(uri)) {
        kept[screenshotId] = uri;
      }
    }
    if (Object.keys(kept).length > 0) {
      next[matchId] = kept;
    }
  }
  return next;
}

export async function readLocalMatchScreenshots(): Promise<LocalMatchScreenshotMap> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MATCH_SCREENSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const screenshots: LocalMatchScreenshotMap = {};
    for (const [matchId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const byScreenshot: Record<string, string> = {};
      for (const [screenshotId, uri] of Object.entries(value)) {
        if (typeof uri === "string" && uri) {
          byScreenshot[screenshotId] = uri;
        }
      }
      if (Object.keys(byScreenshot).length > 0) {
        screenshots[matchId] = byScreenshot;
      }
    }
    return pruneMissingLocalMatchScreenshots(screenshots);
  } catch {
    return {};
  }
}

async function writeLocalMatchScreenshots(
  screenshots: LocalMatchScreenshotMap,
): Promise<LocalMatchScreenshotMap> {
  const pruned = pruneMissingLocalMatchScreenshots(screenshots);
  await AsyncStorage.setItem(
    LOCAL_MATCH_SCREENSHOT_STORAGE_KEY,
    JSON.stringify(pruned),
  );
  notifyLocalScreenshotListeners(pruned);
  return pruned;
}

export function getLocalMatchScreenshotUri(
  screenshots: LocalMatchScreenshotMap,
  matchId: number | string,
  screenshotId: number | string,
): string | null {
  return screenshots[matchKey(matchId)]?.[screenshotKey(screenshotId)] ?? null;
}

export async function saveLocalMatchScreenshot(
  matchId: number | string,
  screenshotId: number | string,
  sourceUri: string,
): Promise<string> {
  const matchIdKey = matchKey(matchId);
  const screenshotIdKey = screenshotKey(screenshotId);
  const directory = screenshotDir();
  directory.create({ intermediates: true, idempotent: true });

  const screenshots = await readLocalMatchScreenshots();
  const previousUri = screenshots[matchIdKey]?.[screenshotIdKey] ?? null;
  let localUri = sourceUri;

  if (!sourceUri.startsWith(directory.uri)) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileName = `match_${matchIdKey}_screenshot_${screenshotIdKey}_${Date.now().toString(36)}_${suffix}.${imageExtension(sourceUri)}`;
    const destination = new File(directory, fileName);
    new File(sourceUri).copy(destination);
    localUri = destination.uri;
  }

  const next = await writeLocalMatchScreenshots({
    ...screenshots,
    [matchIdKey]: {
      ...(screenshots[matchIdKey] ?? {}),
      [screenshotIdKey]: localUri,
    },
  });

  if (previousUri && previousUri !== next[matchIdKey]?.[screenshotIdKey]) {
    deleteLocalScreenshotFile(previousUri);
  }

  return next[matchIdKey]?.[screenshotIdKey] ?? localUri;
}

export async function clearLocalMatchScreenshotArchive(
  matchId: number | string,
): Promise<void> {
  const matchIdKey = matchKey(matchId);
  const screenshots = await readLocalMatchScreenshots();
  const previous = screenshots[matchIdKey] ?? {};
  const next = { ...screenshots };
  delete next[matchIdKey];
  await writeLocalMatchScreenshots(next);
  for (const uri of Object.values(previous)) {
    deleteLocalScreenshotFile(uri);
  }
}

export function useLocalMatchScreenshots() {
  const [screenshots, setScreenshots] = useState<LocalMatchScreenshotMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await readLocalMatchScreenshots();
    setScreenshots(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    readLocalMatchScreenshots()
      .then((next) => {
        if (!alive) return;
        setScreenshots(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const listener: LocalMatchScreenshotListener = (next) => {
      if (alive) setScreenshots(next);
    };
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const setLocalMatchScreenshot = useCallback(
    async (
      matchId: number | string,
      screenshotId: number | string,
      sourceUri: string,
    ) => {
      const uri = await saveLocalMatchScreenshot(
        matchId,
        screenshotId,
        sourceUri,
      );
      return uri;
    },
    [],
  );

  const removeLocalMatchScreenshotArchive = useCallback(
    async (matchId: number | string) => {
      await clearLocalMatchScreenshotArchive(matchId);
    },
    [],
  );

  return {
    screenshots,
    loading,
    reload,
    setLocalMatchScreenshot,
    removeLocalMatchScreenshotArchive,
  };
}
