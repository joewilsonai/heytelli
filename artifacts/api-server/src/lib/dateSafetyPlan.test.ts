import assert from "node:assert/strict";
import test from "node:test";

test("normalizes date safety plans without storing contact phone numbers", async () => {
  const { normalizeDateSafetyPlan } = await import("./dateSafetyPlan");

  const plan = normalizeDateSafetyPlan(
    {
      trustedCircleName: "  Maya  ",
      trustedCirclePhone: "314-555-0199",
      transportPlan: "  rideshare there, own ride home ",
      checkInAt: "2026-06-01T02:30:00.000Z",
      expectedEndAt: "bad-date",
      codeWord: "  pineapple ",
      circleNote: "  Table near the front if possible. ",
      shareLiveLocation: true,
    },
    new Date("2026-05-26T16:00:00.000Z"),
  );

  assert.deepEqual(plan, {
    trustedCircleName: "Maya",
    transportPlan: "rideshare there, own ride home",
    checkInAt: "2026-06-01T02:30:00.000Z",
    expectedEndAt: null,
    codeWord: "pineapple",
    circleNote: "Table near the front if possible.",
    shareLiveLocation: true,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });
  assert.equal("trustedCirclePhone" in (plan ?? {}), false);
});

test("builds a date safety plan timeline event only when the plan changes", async () => {
  const { buildDateSafetyPlanPatchPlan } = await import("./dateSafetyPlan");

  const existingPlan = {
    trustedCircleName: "Maya",
    transportPlan: "rideshare",
    checkInAt: "2026-06-01T02:30:00.000Z",
    expectedEndAt: null,
    codeWord: "pineapple",
    circleNote: null,
    shareLiveLocation: false,
    updatedAt: "2026-05-26T16:00:00.000Z",
  };

  const unchanged = buildDateSafetyPlanPatchPlan({
    matchId: 7,
    matchName: "Gretchen",
    existingPlan,
    nextPlan: { ...existingPlan, updatedAt: "ignored" },
    observedAt: new Date("2026-05-26T17:00:00.000Z"),
  });
  assert.equal(unchanged.timelineEvent, null);

  const changed = buildDateSafetyPlanPatchPlan({
    matchId: 7,
    matchName: "Gretchen",
    existingPlan,
    nextPlan: {
      ...existingPlan,
      trustedCircleName: "Riley",
      expectedEndAt: "2026-06-01T05:00:00.000Z",
    },
    observedAt: new Date("2026-05-26T18:00:00.000Z"),
  });

  assert.equal(changed.dateSafetyPlan?.trustedCircleName, "Riley");
  assert.equal(changed.timelineEvent?.type, "safety_plan_updated");
  assert.equal(changed.timelineEvent?.source, "user");
  assert.match(changed.timelineEvent?.summary ?? "", /Gretchen/);
  assert.match(changed.timelineEvent?.summary ?? "", /Riley/);
  assert.deepEqual(changed.timelineEvent?.metadata, {
    hasTrustedCircle: true,
    hasCheckIn: true,
    hasExpectedEnd: true,
    hasCodeWord: true,
    shareLiveLocation: false,
  });
});

test("summarizes date safety plans for list responses without leaking secrets", async () => {
  const { summarizeDateSafetyPlanForList } = await import("./dateSafetyPlan");

  const status = summarizeDateSafetyPlanForList({
    trustedCircleName: "Maya",
    transportPlan: "Driving myself",
    checkInAt: "2026-06-01T02:30:00.000Z",
    expectedEndAt: "2026-06-01T05:00:00.000Z",
    codeWord: "pineapple",
    circleNote: "Ask staff near the front if I need help.",
    shareLiveLocation: false,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });

  assert.deepEqual(status, {
    hasPlan: true,
    hasTrustedCircle: true,
    hasTransportPlan: true,
    hasCheckIn: true,
    hasExpectedEnd: true,
    hasCodeWord: true,
    hasCircleNote: true,
    shareLiveLocation: false,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(status), /pineapple|Ask staff|Maya/);
});
