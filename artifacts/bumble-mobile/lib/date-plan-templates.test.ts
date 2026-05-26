import assert from "node:assert/strict";
import test from "node:test";

import {
  DATE_PLAN_TEMPLATES,
  buildDatePlanFromTemplate,
} from "./date-plan-templates.ts";

test("ships three editable safe-date plan templates", () => {
  assert.equal(DATE_PLAN_TEMPLATES.length, 3);
  assert.deepEqual(
    DATE_PLAN_TEMPLATES.map((template) => template.id),
    ["coffee", "dinner", "activity"],
  );
});

test("template builds check-in and end times from the planned date", () => {
  const plan = buildDatePlanFromTemplate(
    DATE_PLAN_TEMPLATES[0]!,
    "2026-06-01T00:00:00.000Z",
  );

  assert.equal(plan.checkInAt, "2026-06-01T00:45:00.000Z");
  assert.equal(plan.expectedEndAt, "2026-06-01T02:00:00.000Z");
  assert.equal(plan.safeDateChecklist.publicPlace, true);
  assert.equal(plan.safeDateChecklist.circleHasPlan, false);
});
