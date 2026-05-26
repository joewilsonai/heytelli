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
      safeDateChecklist: {
        publicPlace: true,
        ownTransport: true,
        circleHasPlan: false,
        profileReviewed: true,
        noPrivateLocationPressure: true,
        noMoneyOrPhotoPressure: true,
        ignoredExtra: true,
      },
      circleCheckStatus: "needs_help",
      lastCircleCheckAt: "2026-06-01T03:00:00.000Z",
      coverModeEnabled: true,
      coverModeTheme: "notes",
      dateModeStatus: "on_date",
      dateModeStartedAt: "2026-06-01T02:15:00.000Z",
      dateModeClosedAt: "not-a-date",
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
    safeDateChecklist: {
      publicPlace: true,
      ownTransport: true,
      circleHasPlan: false,
      profileReviewed: true,
      noPrivateLocationPressure: true,
      noMoneyOrPhotoPressure: true,
    },
    circleCheckStatus: "needs_help",
    lastCircleCheckAt: "2026-06-01T03:00:00.000Z",
    coverModeEnabled: true,
    coverModeTheme: "notes",
    dateModeStatus: "on_date",
    dateModeStartedAt: "2026-06-01T02:15:00.000Z",
    dateModeClosedAt: null,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });
  assert.equal("trustedCirclePhone" in (plan ?? {}), false);
  assert.equal("trustedCircleEmail" in (plan ?? {}), false);
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
    safeDateChecklist: {
      publicPlace: true,
      ownTransport: true,
      circleHasPlan: true,
      profileReviewed: true,
      noPrivateLocationPressure: true,
      noMoneyOrPhotoPressure: true,
    },
    circleCheckStatus: "planned",
    lastCircleCheckAt: null,
    coverModeEnabled: false,
    coverModeTheme: null,
    dateModeStatus: "planning",
    dateModeStartedAt: null,
    dateModeClosedAt: null,
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
      coverModeEnabled: true,
      coverModeTheme: "breathing",
      dateModeStatus: "on_date",
      dateModeStartedAt: "2026-06-01T02:30:00.000Z",
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
    safeDateChecklistReady: true,
    circleCheckStatus: "planned",
    coverModeEnabled: true,
    coverModeTheme: "breathing",
    dateModeStatus: "on_date",
    dateModeStartedAt: "2026-06-01T02:30:00.000Z",
    dateModeClosedAt: null,
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
    safeDateChecklist: {
      publicPlace: true,
      ownTransport: true,
      circleHasPlan: true,
      profileReviewed: true,
      noPrivateLocationPressure: true,
      noMoneyOrPhotoPressure: true,
    },
    circleCheckStatus: "safe",
    lastCircleCheckAt: "2026-06-01T02:45:00.000Z",
    coverModeEnabled: true,
    coverModeTheme: "clock",
    dateModeStatus: "safe",
    dateModeStartedAt: "2026-06-01T02:30:00.000Z",
    dateModeClosedAt: "2026-06-01T04:30:00.000Z",
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
    safeDateChecklistReady: true,
    circleCheckStatus: "safe",
    lastCircleCheckAt: "2026-06-01T02:45:00.000Z",
    coverModeEnabled: true,
    coverModeTheme: "clock",
    dateModeStatus: "safe",
    dateModeStartedAt: "2026-06-01T02:30:00.000Z",
    dateModeClosedAt: "2026-06-01T04:30:00.000Z",
    updatedAt: "2026-05-26T16:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(status), /pineapple|Ask staff|Maya/);
});

test("cleans invalid cover and date mode values while preserving enabled cover mode", async () => {
  const {
    normalizeDateSafetyPlan,
    normalizePersistedDateSafetyPlan,
    summarizeDateSafetyPlanForList,
  } = await import("./dateSafetyPlan");

  const plan = normalizeDateSafetyPlan(
    {
      coverModeEnabled: true,
      coverModeTheme: "dashboard",
      dateModeStatus: "lost",
      dateModeStartedAt: "not-a-date",
      dateModeClosedAt: "also-not-a-date",
      trustedCircleEmail: "maya@example.com",
    },
    new Date("2026-05-26T16:00:00.000Z"),
  );

  assert.equal("trustedCircleEmail" in (plan ?? {}), false);
  assert.deepEqual(plan, {
    trustedCircleName: null,
    transportPlan: null,
    checkInAt: null,
    expectedEndAt: null,
    codeWord: null,
    circleNote: null,
    shareLiveLocation: false,
    safeDateChecklist: {
      publicPlace: false,
      ownTransport: false,
      circleHasPlan: false,
      profileReviewed: false,
      noPrivateLocationPressure: false,
      noMoneyOrPhotoPressure: false,
    },
    circleCheckStatus: null,
    lastCircleCheckAt: null,
    coverModeEnabled: true,
    coverModeTheme: null,
    dateModeStatus: null,
    dateModeStartedAt: null,
    dateModeClosedAt: null,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });

  assert.deepEqual(summarizeDateSafetyPlanForList(plan), {
    hasPlan: true,
    hasTrustedCircle: false,
    hasTransportPlan: false,
    hasCheckIn: false,
    hasExpectedEnd: false,
    hasCodeWord: false,
    hasCircleNote: false,
    shareLiveLocation: false,
    safeDateChecklistReady: false,
    circleCheckStatus: null,
    lastCircleCheckAt: null,
    coverModeEnabled: true,
    coverModeTheme: null,
    dateModeStatus: null,
    dateModeStartedAt: null,
    dateModeClosedAt: null,
    updatedAt: "2026-05-26T16:00:00.000Z",
  });

  assert.deepEqual(
    normalizePersistedDateSafetyPlan({
      trustedCircleName: "Maya",
      transportPlan: "rideshare",
      checkInAt: "2026-06-01T02:30:00.000Z",
      expectedEndAt: "2026-06-01T05:00:00.000Z",
      codeWord: "pineapple",
      circleNote: null,
      shareLiveLocation: false,
      safeDateChecklist: {
        publicPlace: true,
        ownTransport: true,
        circleHasPlan: true,
        profileReviewed: true,
        noPrivateLocationPressure: true,
        noMoneyOrPhotoPressure: true,
      },
      circleCheckStatus: "planned",
      lastCircleCheckAt: null,
      updatedAt: "2026-05-26T15:00:00.000Z",
    }),
    {
      trustedCircleName: "Maya",
      transportPlan: "rideshare",
      checkInAt: "2026-06-01T02:30:00.000Z",
      expectedEndAt: "2026-06-01T05:00:00.000Z",
      codeWord: "pineapple",
      circleNote: null,
      shareLiveLocation: false,
      safeDateChecklist: {
        publicPlace: true,
        ownTransport: true,
        circleHasPlan: true,
        profileReviewed: true,
        noPrivateLocationPressure: true,
        noMoneyOrPhotoPressure: true,
      },
      circleCheckStatus: "planned",
      lastCircleCheckAt: null,
      coverModeEnabled: false,
      coverModeTheme: null,
      dateModeStatus: null,
      dateModeStartedAt: null,
      dateModeClosedAt: null,
      updatedAt: "2026-05-26T15:00:00.000Z",
    },
  );
});

test("generated update contract preserves cover and date mode fields", async () => {
  const { UpdateMatchBody } = await import("@workspace/api-zod");

  const parsed = UpdateMatchBody.parse({
    dateSafetyPlan: {
      trustedCircleName: null,
      transportPlan: null,
      checkInAt: null,
      expectedEndAt: null,
      codeWord: null,
      circleNote: null,
      shareLiveLocation: false,
      safeDateChecklist: {
        publicPlace: false,
        ownTransport: false,
        circleHasPlan: false,
        profileReviewed: false,
        noPrivateLocationPressure: false,
        noMoneyOrPhotoPressure: false,
      },
      circleCheckStatus: null,
      lastCircleCheckAt: null,
      coverModeEnabled: true,
      coverModeTheme: "notes",
      dateModeStatus: "check_in_due",
      dateModeStartedAt: "2026-06-01T02:30:00.000Z",
      dateModeClosedAt: null,
    },
  });

  const dateSafetyPlan = parsed.dateSafetyPlan as Record<string, unknown>;
  assert.equal(dateSafetyPlan.coverModeEnabled, true);
  assert.equal(dateSafetyPlan.coverModeTheme, "notes");
  assert.equal(dateSafetyPlan.dateModeStatus, "check_in_due");
  assert.equal(
    (dateSafetyPlan.dateModeStartedAt as Date).toISOString(),
    "2026-06-01T02:30:00.000Z",
  );
  assert.equal(dateSafetyPlan.dateModeClosedAt, null);
});

test("generated update contract accepts legacy date safety plans without cover fields", async () => {
  const { UpdateMatchBody } = await import("@workspace/api-zod");

  const parsed = UpdateMatchBody.parse({
    dateSafetyPlan: {
      trustedCircleName: "Maya",
      transportPlan: "Driving myself",
      checkInAt: "2026-06-01T02:30:00.000Z",
      expectedEndAt: "2026-06-01T05:00:00.000Z",
      codeWord: "pineapple",
      circleNote: null,
      shareLiveLocation: false,
      safeDateChecklist: {
        publicPlace: true,
        ownTransport: true,
        circleHasPlan: true,
        profileReviewed: true,
        noPrivateLocationPressure: true,
        noMoneyOrPhotoPressure: true,
      },
      circleCheckStatus: "planned",
      lastCircleCheckAt: null,
    },
  });

  assert.equal(parsed.dateSafetyPlan?.coverModeEnabled, undefined);
  assert.equal(parsed.dateSafetyPlan?.dateModeStatus, undefined);
});
