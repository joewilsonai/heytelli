import {
  setAuthTokenGetter,
  setBaseUrl,
  type AuthSession,
} from "@workspace/api-client-react";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SESSION_KEY = "heytelli_web_session";
export const API_BASE_KEY = "heytelli_web_api_base";

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function normalizeApiBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed || trimmed === "") return null;
  if (trimmed === "/") return null;

  try {
    const url = new URL(trimmed);
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return null;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isObject(value)) return false;
  const token = readString(value["token"]);
  const user = value["user"];
  if (!token || !isObject(user)) return false;

  return (
    typeof user["id"] === "number" &&
    Number.isInteger(user["id"]) &&
    readString(user["email"]) !== null &&
    (user["displayName"] === null || typeof user["displayName"] === "string") &&
    (user["role"] === "user" || user["role"] === "admin")
  );
}

export function loadStoredSession(storage: StorageLike | null = browserStorage()): AuthSession | null {
  if (!storage) return null;
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeSession(
  storage: StorageLike | null = browserStorage(),
  session: AuthSession | null,
): void {
  if (!storage) return;
  if (!session) {
    storage.removeItem(SESSION_KEY);
    return;
  }
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadStoredApiBaseUrl(storage: StorageLike | null = browserStorage()): string | null {
  if (!storage) return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  return normalizeApiBaseUrl(
    storage.getItem(API_BASE_KEY) ?? import.meta.env.VITE_API_BASE_URL,
  );
}

export function storeApiBaseUrl(
  storage: StorageLike | null = browserStorage(),
  value: string | null,
): string | null {
  const normalized = normalizeApiBaseUrl(value);
  if (!storage) return normalized;
  if (normalized) storage.setItem(API_BASE_KEY, normalized);
  else storage.removeItem(API_BASE_KEY);
  return normalized;
}

export function getStoredToken(storage: StorageLike | null = browserStorage()): string | null {
  return loadStoredSession(storage)?.token ?? null;
}

export function configureApiClient(session: AuthSession | null, apiBaseUrl: string | null): void {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  setBaseUrl(normalizedBaseUrl);
  setAuthTokenGetter(() => session?.token ?? getStoredToken());
}

export function resolveApiUrl(path: string, apiBaseUrl = loadStoredApiBaseUrl()): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = normalizeApiBaseUrl(apiBaseUrl);
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
