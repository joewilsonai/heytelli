import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRedFlagEventRows,
  summarizeRedFlagHistory,
} from "./redFlagHistory";

test("summarizes current red flags while preserving previously seen concerns", () => {
  const firstSeen = new Date("2026-05-24T12:00:00.000Z");
  const currentSeen = new Date("2026-05-26T12:00:00.000Z");
  const historical = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-old",
    contextHash: "old-context",
    observedAt: firstSeen,
    redFlags: [
      {
        severity: "high",
        label: "Late-night-only texting",
        evidence: "He only reaches out after midnight.",
      },
    ],
  });
  const current = {
    severity: "medium" as const,
    label: "Dodges plans",
    evidence: "He changes the subject when she suggests a time.",
  };
  const currentRows = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-new",
    contextHash: "new-context",
    observedAt: currentSeen,
    redFlags: [current],
  });

  const summary = summarizeRedFlagHistory({
    events: [...historical, ...currentRows],
    currentRedFlags: [current],
  });

  assert.deepEqual(
    summary.currentRedFlags.map((f) => [f.label, f.status]),
    [["Dodges plans", "current"]],
  );
  assert.deepEqual(
    summary.historicalRedFlags.map((f) => [f.label, f.status]),
    [["Late-night-only texting", "previously-seen"]],
  );
  assert.equal(summary.redFlags.length, 2);
  assert.equal(summary.highSeverityCount, 1);
});
