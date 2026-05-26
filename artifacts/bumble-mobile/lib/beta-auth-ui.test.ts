import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import test from "node:test";

function readLocal(path: string): string {
  return readFileSync(
    fileURLToPath(new NodeURL(path, import.meta.url)),
    "utf8",
  );
}

const layout = readLocal("../app/_layout.tsx");
const authSession = readLocal("./auth-session.ts");
const chatScreen = readLocal("../app/chat/[id].tsx");

test("app boot wires bearer auth before rendering private routes", () => {
  assert.match(layout, /setAuthTokenGetter/);
  assert.match(layout, /AuthGate/);
  assert.match(layout, /queryClient\.clear\(\)/);
});

test("beta sign-in persists a session and exposes auth headers for manual fetches", () => {
  assert.match(authSession, /AUTH_STORAGE_KEY/);
  assert.match(authSession, /loginBetaUser/);
  assert.match(authSession, /getAuthHeader/);
  assert.match(authSession, /clearAuthSession/);
});

test("manual chat streaming request includes the beta auth header", () => {
  assert.match(chatScreen, /getAuthHeader/);
  assert.match(chatScreen, /Authorization/);
});
