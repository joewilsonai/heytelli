const LOCAL_MATCH_PHOTO_DIR_SEGMENT = "/heytelli-match-photos/";

function ensureTrailingSlash(uri: string): string {
  return uri.endsWith("/") ? uri : `${uri}/`;
}

function isRelativeStoragePath(uri: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri) && !uri.startsWith("/");
}

function isSafeLocalFileName(fileName: string): boolean {
  return (
    Boolean(fileName) && !fileName.includes("/") && !fileName.includes("..")
  );
}

function currentDirectoryUriFor(fileName: string, currentDirectoryUri: string) {
  if (!isSafeLocalFileName(fileName)) return null;
  return `${ensureTrailingSlash(currentDirectoryUri)}${fileName}`;
}

function remapPreviousBuildUri(
  uri: string,
  currentDirectoryUri: string,
): string | null {
  const dirIndex = uri.indexOf(LOCAL_MATCH_PHOTO_DIR_SEGMENT);
  if (dirIndex === -1) return null;

  const fileName = uri.slice(dirIndex + LOCAL_MATCH_PHOTO_DIR_SEGMENT.length);
  return currentDirectoryUriFor(fileName, currentDirectoryUri);
}

export function serializeLocalMatchPhotoUriForStorage(
  uri: string,
  currentDirectoryUri: string,
): string {
  const directoryUri = ensureTrailingSlash(currentDirectoryUri);
  return uri.startsWith(directoryUri) ? uri.slice(directoryUri.length) : uri;
}

export function resolveStoredLocalMatchPhotoUri(
  storedUri: string,
  currentDirectoryUri: string,
  canReadUri: (uri: string) => boolean,
): string | null {
  const candidates = [
    isRelativeStoragePath(storedUri)
      ? currentDirectoryUriFor(storedUri, currentDirectoryUri)
      : storedUri,
    remapPreviousBuildUri(storedUri, currentDirectoryUri),
  ].filter((uri): uri is string => Boolean(uri));

  for (const uri of candidates) {
    if (canReadUri(uri)) return uri;
  }

  return null;
}
