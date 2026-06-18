import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./improvement.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");

test("improvement signal route protects private beta feedback", () => {
  assert.match(route, /requireAuth/);
  assert.match(route, /requireUserId\(req\)/);
  assert.match(route, /CreateImprovementSignalBody/);
  assert.match(route, /normalizeImprovementSignalInput/);
  assert.match(route, /sanitizeImprovementPayload/);
  assert.match(route, /fingerprintImprovementSignal/);
  assert.match(route, /eq\(matches\.userId,\s*userId\)/);
  assert.doesNotMatch(
    route,
    /screenshotObjectPath|transcriptText|rawTranscript/,
  );
});

test("improvement admin routes require admin role", () => {
  assert.match(auth, /function requireAdmin|export function requireAdmin/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /\/admin\/improvement\/signals/);
  assert.match(route, /\/admin\/improvement\/work-items/);
  assert.match(route, /\/admin\/improvement\/health/);
  assert.match(route, /\/admin\/improvement\/control-room/);
  assert.match(route, /buildImprovementHealthSnapshot/);
  assert.match(route, /buildImprovementControlRoomSnapshot/);
});

test("improvement router is mounted", () => {
  assert.match(index, /improvementRouter/);
  assert.match(index, /router\.use\(improvementRouter\)/);
});

test("user feedback status route returns sanitized follow-up state", () => {
  assert.match(route, /\/improvement\/signals\/mine/);
  assert.match(route, /requireUserId\(req\)/);
  assert.match(route, /buildUserFeedbackStatuses/);
  assert.doesNotMatch(route, /githubIssueUrl|githubIssueNumber/);
});
