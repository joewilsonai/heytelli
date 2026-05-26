import assert from "node:assert/strict";
import test from "node:test";

import {
  COVER_QUICK_ACTIONS,
  getCoverQuickAction,
} from "./date-mode-cover-actions.ts";

test("cover quick actions use harmless labels while mapping to circle intents", () => {
  assert.deepEqual(
    COVER_QUICK_ACTIONS.map((action) => action.label),
    ["Check", "Call", "Ride", "Text", "Done"],
  );
  assert.deepEqual(
    COVER_QUICK_ACTIONS.map((action) => action.circleStatus),
    ["safe", "needs_help", "needs_help", "needs_help", "completed"],
  );

  const visibleCopy = COVER_QUICK_ACTIONS.flatMap((action) => [
    action.label,
    action.detail,
  ]).join(" ");

  assert.doesNotMatch(visibleCopy, /Need exit|Home safe|HeyTelli|safety/i);
  assert.equal(getCoverQuickAction("call")?.messageIntent, "call");
  assert.equal(getCoverQuickAction("home")?.messageIntent, "completed");
});
