import assert from "node:assert/strict";
import test from "node:test";

import { getSafetyActionChecklist } from "./safety-action-checklist.ts";

test("returns money scam actions without showing crisis resources for low risk", () => {
  const actions = getSafetyActionChecklist([
    {
      severity: "high",
      label: "Romance scam or urgent money pressure",
      evidence: "Gift card pressure.",
    },
  ]);

  assert.deepEqual(
    actions.map((action) => action.label),
    [
      "Do not send money, gift cards, crypto, or banking details",
      "Keep the original messages and profile screenshots",
      "Report money pressure through FTC or IC3 if anything was sent",
    ],
  );
});

test("returns boundary and stalking actions before date planning", () => {
  const actions = getSafetyActionChecklist([
    {
      severity: "high",
      label: "Stalking or harassment signals",
      evidence: "Keeps contacting after no.",
    },
    {
      severity: "medium",
      label: "Boundary pressure after a no",
      evidence: "Pushes private location.",
    },
  ]);

  assert.deepEqual(
    actions.map((action) => action.label),
    [
      "Tell your circle before responding or meeting",
      "Keep the date in a public place with your own ride",
      "Block or report if contact continues after a clear no",
    ],
  );
});

test("returns no action checklist for only low-severity style concerns", () => {
  const actions = getSafetyActionChecklist([
    {
      severity: "low",
      label: "Slow replies",
      evidence: "Takes a day to answer.",
    },
  ]);

  assert.deepEqual(actions, []);
});
