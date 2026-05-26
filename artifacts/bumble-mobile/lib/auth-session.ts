import AsyncStorage from "@react-native-async-storage/async-storage";

import { getApiBaseUrl } from "./api-base";

export const AUTH_STORAGE_KEY = "heytelli.auth.v1";

export type BetaAuthUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
};

export type AuthSession = {
  token: string;
  user: BetaAuthUser;
};

let cachedSession: AuthSession | null = null;

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return (
    typeof session.token === "string" &&
    session.token.length > 0 &&
    !!session.user &&
    typeof session.user === "object" &&
    typeof session.user.email === "string"
  );
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  if (cachedSession) return cachedSession;
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    cachedSession = isAuthSession(parsed) ? parsed : null;
    return cachedSession;
  } catch {
    return null;
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  cachedSession = session;
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function clearAuthSession(): Promise<void> {
  cachedSession = null;
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function getAuthToken(): Promise<string | null> {
  return (await loadAuthSession())?.token ?? null;
}

export async function getAuthHeader(): Promise<{ Authorization?: string }> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getCachedAuthHeader(): { Authorization?: string } {
  return cachedSession?.token
    ? { Authorization: `Bearer ${cachedSession.token}` }
    : {};
}

export async function loginBetaUser(input: {
  email: string;
  inviteCode: string;
  displayName?: string;
}): Promise<AuthSession> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("API connection is not configured.");
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error ?? "Sign-in failed.");
  }

  const session = body as AuthSession;
  if (!isAuthSession(session)) {
    throw new Error("Sign-in returned an invalid session.");
  }
  await saveAuthSession(session);
  return session;
}
