import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFeedbackStatuses } from "./feedback-status.ts";

test("normalizes older feedback status payloads without a timeline", () => {
  const [status] = normalizeFeedbackStatuses([
    {
      ticketId: 42,
      stage: "shipped",
      message: "Shipped or resolved.",
      summary: "Settings crashed after feedback status loaded.",
      updatedAt: "2026-06-18T21:27:41.135Z",
    },
  ]);

  assert.equal(status?.ticketId, 42);
  assert.equal(status?.stage, "shipped");
  assert.deepEqual(status?.timeline, []);
  assert.equal(status?.createdAt, "2026-06-18T21:27:41.135Z");
});

test("falls back safely for unknown feedback stages", () => {
  const [status] = normalizeFeedbackStatuses([
    {
      ticketId: 43,
      stage: "queued",
      summary: "Unexpected server status.",
      updatedAt: "not-a-date",
    },
  ]);

  assert.equal(status?.stage, "received");
  assert.equal(status?.message, "Saved privately.");
  assert.equal(status?.updatedAt, "");
});
