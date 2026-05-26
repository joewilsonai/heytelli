import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";

const {
  createAuthToken,
  isInviteCodeAllowed,
  normalizeEmail,
  verifyAuthToken,
} = await import("./auth");

test("normalizes email identity before auth/user lookup", () => {
  assert.equal(normalizeEmail("  TESTER@Example.COM "), "tester@example.com");
});

test("invite codes are explicit and whitespace-safe", () => {
  const env = {
    BETA_INVITE_CODES: "alpha,  safety-girls ,third",
  };

  assert.equal(isInviteCodeAllowed("safety-girls", env), true);
  assert.equal(isInviteCodeAllowed(" SAFETY-GIRLS ", env), true);
  assert.equal(isInviteCodeAllowed("missing", env), false);
});

test("signed auth tokens survive round trip and reject tampering", () => {
  const env = { HEYTELLI_AUTH_SECRET: "test-secret" };
  const token = createAuthToken(
    { id: 42, email: "tester@example.com" },
    { env, now: 1_700_000_000_000 },
  );

  assert.deepEqual(verifyAuthToken(token, { env, now: 1_700_000_001_000 }), {
    userId: 42,
    email: "tester@example.com",
  });

  assert.equal(
    verifyAuthToken(`${token.slice(0, -1)}x`, {
      env,
      now: 1_700_000_001_000,
    }),
    null,
  );
});

test("expired auth tokens are rejected", () => {
  const env = { HEYTELLI_AUTH_SECRET: "test-secret" };
  const token = createAuthToken(
    { id: 42, email: "tester@example.com" },
    { env, now: 1_700_000_000_000, ttlMs: 1000 },
  );

  assert.equal(verifyAuthToken(token, { env, now: 1_700_000_002_000 }), null);
});
