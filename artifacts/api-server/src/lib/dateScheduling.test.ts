import assert from "node:assert/strict";
import { test } from "node:test";

test("scheduling a date creates a timeline event and clears any old brief", async () => {
  const { buildDateSchedulePatchPlan } = await import("./dateScheduling");

  const plan = buildDateSchedulePatchPlan({
    matchId: 5,
    matchName: "Gretchen",
    existingNextDateAt: null,
    existingNextDateLocation: null,
    existingNextDateOutfit: null,
    nextDateAt: new Date("2026-06-03T00:30:00.000Z"),
    nextDateLocation: "Louie",
    nextDateOutfit: "black dress",
  });

  assert.equal(plan.clearLastDateBrief, true);
  assert.equal(plan.timelineEvent?.type, "date_scheduled");
  assert.equal(plan.timelineEvent?.source, "user");
  assert.equal(plan.timelineEvent?.title, "Date scheduled");
  assert.match(plan.timelineEvent?.summary ?? "", /Gretchen/);
  assert.match(plan.timelineEvent?.summary ?? "", /Louie/);
  assert.deepEqual(plan.timelineEvent?.metadata, {
    nextDateAt: "2026-06-03T00:30:00.000Z",
    location: "Louie",
    outfit: "black dress",
  });
});

test("leaves timeline alone when next date is unchanged", async () => {
  const { buildDateSchedulePatchPlan } = await import("./dateScheduling");

  const plan = buildDateSchedulePatchPlan({
    matchId: 5,
    matchName: "Gretchen",
    existingNextDateAt: new Date("2026-06-03T00:30:00.000Z"),
    existingNextDateLocation: "Louie",
    existingNextDateOutfit: "black dress",
    nextDateAt: new Date("2026-06-03T00:30:00.000Z"),
    nextDateLocation: "Louie",
    nextDateOutfit: "black dress",
  });

  assert.equal(plan.clearLastDateBrief, false);
  assert.equal(plan.timelineEvent, null);
});

test("date detail changes clear stale brief and create an update timeline event", async () => {
  const { buildDateSchedulePatchPlan } = await import("./dateScheduling");

  const plan = buildDateSchedulePatchPlan({
    matchId: 5,
    matchName: "Gretchen",
    existingNextDateAt: new Date("2026-06-03T00:30:00.000Z"),
    existingNextDateLocation: "Louie",
    existingNextDateOutfit: "black dress",
    nextDateAt: new Date("2026-06-03T00:30:00.000Z"),
    nextDateLocation: "The Violet Hour",
    nextDateOutfit: "jacket",
  });

  assert.equal(plan.clearLastDateBrief, true);
  assert.equal(plan.timelineEvent?.title, "Date updated");
  assert.equal(plan.timelineEvent?.type, "date_scheduled");
  assert.deepEqual(plan.timelineEvent?.metadata, {
    nextDateAt: "2026-06-03T00:30:00.000Z",
    location: "The Violet Hour",
    outfit: "jacket",
  });
});
