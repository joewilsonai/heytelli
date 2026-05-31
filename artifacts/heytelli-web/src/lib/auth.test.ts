import assert from "node:assert/strict";
import test from "node:test";
import {
  isAuthSession,
  loadStoredSession,
  normalizeApiBaseUrl,
  storeSession,
  type StorageLike,
} from "./auth";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("normalizes optional API base URLs for browser use", () => {
  assert.equal(normalizeApiBaseUrl(""), null);
  assert.equal(normalizeApiBaseUrl("   "), null);
  assert.equal(normalizeApiBaseUrl("/"), null);
  assert.equal(
    normalizeApiBaseUrl(" https://api.heytelli.test/// "),
    "https://api.heytelli.test",
  );
});

test("validates auth sessions before trusting local storage", () => {
  assert.equal(
    isAuthSession({
      token: "token",
      user: { id: 1, email: "joe@example.com", displayName: null, role: "user" },
    }),
    true,
  );

  assert.equal(isAuthSession({ token: "", user: { id: 1 } }), false);
  assert.equal(isAuthSession({ token: "token" }), false);
});

test("stores, loads, and clears web auth sessions safely", () => {
  const storage = createMemoryStorage();
  const session = {
    token: "token",
    user: { id: 1, email: "joe@example.com", displayName: "Joe", role: "admin" as const },
  };

  storeSession(storage, session);
  assert.deepEqual(loadStoredSession(storage), session);

  storeSession(storage, null);
  assert.equal(loadStoredSession(storage), null);

  const badStorage = createMemoryStorage({ heytelli_web_session: "not-json" });
  assert.equal(loadStoredSession(badStorage), null);
});
