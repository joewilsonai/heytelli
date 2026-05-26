import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, users, type UserRole } from "@workspace/db";

type AuthEnv = Partial<
  Record<
    | "AUTH_SECRET"
    | "BETA_INVITE_CODES"
    | "HEYTELLI_AUTH_SECRET"
    | "HEYTELLI_BETA_INVITE_CODES"
    | "NODE_ENV",
    string
  >
>;

type TokenOptions = {
  env?: AuthEnv;
  now?: number;
  ttlMs?: number;
};

type TokenPayload = {
  sub: number;
  email: string;
  iat: number;
  exp: number;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEV_INVITE_CODE = "heytelli-beta";
const DEV_AUTH_SECRET = "dev-only-heytelli-auth-secret";

function getEnv(env: AuthEnv | undefined): AuthEnv {
  return env ?? process.env;
}

function getAuthSecret(env?: AuthEnv): string {
  const source = getEnv(env);
  const secret = source.HEYTELLI_AUTH_SECRET ?? source.AUTH_SECRET;
  if (secret) return secret;
  if (source.NODE_ENV === "production") {
    throw new Error("HEYTELLI_AUTH_SECRET must be set in production");
  }
  return DEV_AUTH_SECRET;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(body: string, env?: AuthEnv): string {
  return createHmac("sha256", getAuthSecret(env))
    .update(body)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInviteCodeAllowed(code: string, env?: AuthEnv): boolean {
  const source = getEnv(env);
  const configured =
    source.HEYTELLI_BETA_INVITE_CODES ?? source.BETA_INVITE_CODES ?? "";
  const allowed = configured
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 && source.NODE_ENV !== "production") {
    allowed.push(DEV_INVITE_CODE);
  }
  return allowed.includes(code.trim().toLowerCase());
}

export function createAuthToken(
  user: { id: number; email: string },
  options: TokenOptions = {},
): string {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const payload: TokenPayload = {
    sub: user.id,
    email: normalizeEmail(user.email),
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
  };
  const body = base64UrlJson(payload);
  return `${body}.${sign(body, options.env)}`;
}

export function verifyAuthToken(
  token: string,
  options: TokenOptions = {},
): { userId: number; email: string } | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(sign(body, options.env), signature)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const nowSec = Math.floor((options.now ?? Date.now()) / 1000);
  if (
    typeof payload.sub !== "number" ||
    !Number.isInteger(payload.sub) ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSec
  ) {
    return null;
  }

  return { userId: payload.sub, email: normalizeEmail(payload.email) };
}

function bearerToken(req: Request): string | null {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  let verified: { userId: number; email: string } | null = null;
  try {
    verified = token ? verifyAuthToken(token) : null;
  } catch (err) {
    next(err);
    return;
  }
  if (!verified) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, verified.userId));
    if (!user || normalizeEmail(user.email) !== verified.email) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.auth = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUserId(req: Request): number {
  if (!req.auth?.id) {
    throw new Error("Auth middleware missing");
  }
  return req.auth.id;
}
