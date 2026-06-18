#!/usr/bin/env node

const apiBase = normalizeApiBase(
  process.env.HEYTELLI_API_BASE_URL || "https://heytelli-api-production.up.railway.app",
);
const email = requiredEnv("HEYTELLI_SMOKE_ADMIN_EMAIL");
const inviteCode = requiredEnv("HEYTELLI_SMOKE_INVITE_CODE");
const displayName = process.env.HEYTELLI_SMOKE_ADMIN_NAME || "Railway Deploy Smoke";

function normalizeApiBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function requestJson(path, init = {}) {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();

  let json;
  try {
    json = body ? JSON.parse(body) : null;
  } catch (error) {
    throw new Error(
      `${init.label || path} returned non-JSON HTTP ${response.status}: ${body.slice(0, 240)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${init.label || path} returned HTTP ${response.status}: ${JSON.stringify(json).slice(0, 240)}`,
    );
  }

  return json;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

const health = await requestJson("/api/healthz", { label: "healthcheck" });
if (health?.status !== "ok") {
  throw new Error(`Unexpected healthcheck response: ${JSON.stringify(health)}`);
}

const login = await requestJson("/api/auth/login", {
  label: "admin login",
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, inviteCode, displayName }),
});
const token = login?.token || login?.accessToken;
if (!token) {
  throw new Error("Admin login did not return a bearer token");
}

const controlRoom = await requestJson("/api/admin/improvement/control-room", {
  label: "improvement control room",
  headers: { authorization: `Bearer ${token}` },
});

if (typeof controlRoom.generatedAt !== "string") {
  throw new Error("control-room generatedAt must be a string");
}

assertObject(controlRoom.queue, "control-room queue");
for (const key of [
  "waitingForTriage",
  "executable",
  "inProgress",
  "reviewGated",
  "needsAttention",
  "reconsiderCandidates",
]) {
  if (typeof controlRoom.queue[key] !== "number") {
    throw new Error(`control-room queue.${key} must be a number`);
  }
}

for (const key of [
  "agentLanes",
  "recentWorkItems",
  "reconsiderCandidates",
  "recentRuns",
  "demoScript",
]) {
  assertArray(controlRoom[key], `control-room ${key}`);
}

console.log(
  JSON.stringify({
    ok: true,
    apiBase,
    agentLanes: controlRoom.agentLanes.length,
    recentWorkItems: controlRoom.recentWorkItems.length,
    recentRuns: controlRoom.recentRuns.length,
  }),
);
