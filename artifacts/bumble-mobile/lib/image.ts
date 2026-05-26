import { getApiBaseUrl } from "@/lib/api-base";

export function objectPathToUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = getApiBaseUrl() ?? "";
  return `${base}/api/storage${path}`;
}
