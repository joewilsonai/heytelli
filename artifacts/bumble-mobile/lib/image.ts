import { getApiBaseUrl } from "@/lib/api-base";
import { getCachedAuthHeader } from "@/lib/auth-session";

export type ObjectImageSource =
  | string
  | { uri: string; headers?: { Authorization?: string } };

export function objectPathToUrl(
  path: string | null | undefined,
): ObjectImageSource | null {
  if (!path) return null;
  const base = getApiBaseUrl() ?? "";
  const uri = `${base}/api/storage${path}`;
  const headers = getCachedAuthHeader();
  return headers.Authorization ? { uri, headers } : uri;
}
