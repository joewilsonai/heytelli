import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTraceSpan,
  redactTraceMetadata,
  traceIdForExecutorRun,
} from "./trace";

test("builds structured trace spans without leaking secrets", () => {
  const span = buildTraceSpan({
    traceId: "trace-1",
    workItemId: 42,
    runId: 9,
    name: "agent.implementation",
    kind: "agent",
    agentName: "executor",
    status: "succeeded",
    startedAt: new Date("2026-05-31T00:00:00Z"),
    endedAt: new Date("2026-05-31T00:00:03Z"),
    metadata: {
      command: "codex exec -",
      GH_TOKEN: "secret",
      nested: { privateKey: "very-secret", ok: "safe" },
    },
  });

  assert.equal(span.durationMs, 3000);
  assert.equal(span.metadata.GH_TOKEN, "[redacted]");
  assert.deepEqual(span.metadata.nested, {
    privateKey: "[redacted]",
    ok: "safe",
  });
});

test("creates stable executor trace ids", () => {
  assert.equal(traceIdForExecutorRun(42, 9), "swarm-executor:42:9");
});

test("redacts sensitive trace metadata recursively", () => {
  assert.deepEqual(
    redactTraceMetadata({
      token: "abc",
      safe: "value",
      child: [{ authorization: "bearer", count: 2 }],
    }),
    {
      token: "[redacted]",
      safe: "value",
      child: [{ authorization: "[redacted]", count: 2 }],
    },
  );
});
