export function objectPathToUrl(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
    return objectPath;
  }
  const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
  return `/api/storage${path}`;
}
