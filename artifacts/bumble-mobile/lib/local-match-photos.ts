import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";

import {
  resolveStoredLocalMatchPhotoUri,
  serializeLocalMatchPhotoUriForStorage,
} from "./local-match-photo-paths.ts";

const LOCAL_MATCH_PHOTO_DIR = "heytelli-match-photos";
export const LOCAL_MATCH_PHOTO_STORAGE_KEY = "heytelli:local-match-photos:v1";

export type LocalMatchPhotoMap = Record<string, string>;

type LocalMatchPhotoListener = (photos: LocalMatchPhotoMap) => void;

const listeners = new Set<LocalMatchPhotoListener>();

function matchPhotoDir(): Directory {
  return new Directory(Paths.document, LOCAL_MATCH_PHOTO_DIR);
}

function matchKey(matchId: number | string): string {
  return String(matchId);
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

function canReadLocalPhoto(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

function deleteLocalMatchPhotoFile(uri: string | null | undefined): void {
  if (!uri) return;
  const directory = matchPhotoDir();
  if (!uri.startsWith(directory.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Missing local match photos should never block UI cleanup.
  }
}

function notifyLocalMatchPhotoListeners(photos: LocalMatchPhotoMap): void {
  for (const listener of listeners) {
    listener(photos);
  }
}

export function pruneMissingLocalMatchPhotos(
  photos: LocalMatchPhotoMap,
): LocalMatchPhotoMap {
  const directory = matchPhotoDir();
  const next: LocalMatchPhotoMap = {};
  for (const [id, uri] of Object.entries(photos)) {
    const readableUri = uri
      ? resolveStoredLocalMatchPhotoUri(uri, directory.uri, canReadLocalPhoto)
      : null;
    if (readableUri) {
      next[id] = readableUri;
    }
  }
  return next;
}

function serializeLocalMatchPhotosForStorage(
  photos: LocalMatchPhotoMap,
): LocalMatchPhotoMap {
  const directory = matchPhotoDir();
  const next: LocalMatchPhotoMap = {};
  for (const [id, uri] of Object.entries(photos)) {
    next[id] = serializeLocalMatchPhotoUriForStorage(uri, directory.uri);
  }
  return next;
}

export async function readLocalMatchPhotos(): Promise<LocalMatchPhotoMap> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MATCH_PHOTO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const photos: LocalMatchPhotoMap = {};
    for (const [id, uri] of Object.entries(parsed)) {
      if (typeof uri === "string" && uri) {
        photos[id] = uri;
      }
    }
    return pruneMissingLocalMatchPhotos(photos);
  } catch {
    return {};
  }
}

async function writeLocalMatchPhotos(
  photos: LocalMatchPhotoMap,
): Promise<LocalMatchPhotoMap> {
  const pruned = pruneMissingLocalMatchPhotos(photos);
  await AsyncStorage.setItem(
    LOCAL_MATCH_PHOTO_STORAGE_KEY,
    JSON.stringify(serializeLocalMatchPhotosForStorage(pruned)),
  );
  notifyLocalMatchPhotoListeners(pruned);
  return pruned;
}

export async function saveLocalMatchPhoto(
  matchId: number | string,
  sourceUri: string,
): Promise<string> {
  const key = matchKey(matchId);
  const directory = matchPhotoDir();
  directory.create({ intermediates: true, idempotent: true });

  const photos = await readLocalMatchPhotos();
  const previousUri = photos[key] ?? null;
  let localUri = sourceUri;

  if (!sourceUri.startsWith(directory.uri)) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileName = `match_${key}_${Date.now().toString(36)}_${suffix}.${imageExtension(sourceUri)}`;
    const destination = new File(directory, fileName);
    new File(sourceUri).copy(destination);
    localUri = destination.uri;
  }

  const next = await writeLocalMatchPhotos({
    ...photos,
    [key]: localUri,
  });

  if (previousUri && previousUri !== next[key]) {
    deleteLocalMatchPhotoFile(previousUri);
  }

  return next[key] ?? localUri;
}

export async function clearLocalMatchPhoto(
  matchId: number | string,
): Promise<void> {
  const key = matchKey(matchId);
  const photos = await readLocalMatchPhotos();
  const previousUri = photos[key] ?? null;
  const next = { ...photos };
  delete next[key];
  await writeLocalMatchPhotos(next);
  deleteLocalMatchPhotoFile(previousUri);
}

export function useLocalMatchPhotos() {
  const [photos, setPhotos] = useState<LocalMatchPhotoMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await readLocalMatchPhotos();
    setPhotos(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    readLocalMatchPhotos()
      .then((next) => {
        if (!alive) return;
        setPhotos(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const listener: LocalMatchPhotoListener = (next) => {
      if (alive) setPhotos(next);
    };
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const setLocalMatchPhoto = useCallback(
    async (matchId: number | string, sourceUri: string) => {
      const uri = await saveLocalMatchPhoto(matchId, sourceUri);
      return uri;
    },
    [],
  );

  const removeLocalMatchPhoto = useCallback(
    async (matchId: number | string) => {
      await clearLocalMatchPhoto(matchId);
    },
    [],
  );

  return {
    photos,
    loading,
    reload,
    setLocalMatchPhoto,
    removeLocalMatchPhoto,
  };
}
