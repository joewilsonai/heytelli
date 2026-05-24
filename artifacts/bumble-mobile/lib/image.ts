const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export function objectPathToUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = DOMAIN ? `https://${DOMAIN}` : "";
  return `${base}/api/storage${path}`;
}
