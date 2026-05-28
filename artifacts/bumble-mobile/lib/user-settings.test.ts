import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HEYTELLI_SETTINGS,
  MAX_TRUSTED_CIRCLE_PEOPLE,
  buildDateSafetyPlanFromSettings,
  buildProfileReview,
  getPrimaryCirclePerson,
  getTrustedCirclePeople,
  sanitizeCircleContact,
  stripStoredCirclePhoneNumbers,
} from "./user-settings.ts";

test("defaults keep trusted circle local and date-card focused", () => {
  assert.equal(DEFAULT_HEYTELLI_SETTINGS.trustedCircle.length, 0);
  assert.equal(
    DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults.checkInOffsetMinutes,
    60,
  );
  assert.equal(
    DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults.expectedEndOffsetMinutes,
    180,
  );
  assert.equal(DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults.storePhone, false);
});

test("sanitizes picked contacts to first name and does not keep phone numbers by default", () => {
  const person = sanitizeCircleContact({
    fullName: "Claire Wilson",
    phoneNumber: "+1 555 1212",
    relationship: "sister",
  });

  assert.equal(person.name, "Claire");
  assert.equal(person.relationship, "sister");
  assert.equal(person.phoneNumber, null);
  assert.equal(person.source, "contacts");
});

test("uses selected primary circle person when building a new date card", () => {
  const settings = {
    ...DEFAULT_HEYTELLI_SETTINGS,
    trustedCircle: [
      {
        id: "circle_1",
        name: "Claire",
        relationship: "sister",
        cardLabelPreference: "relationship" as const,
        phoneNumber: null,
        source: "contacts" as const,
        createdAt: "2026-05-26T07:00:00.000Z",
      },
      {
        id: "circle_2",
        name: "Maya",
        relationship: "roommate",
        cardLabelPreference: "name" as const,
        phoneNumber: null,
        source: "manual" as const,
        createdAt: "2026-05-26T07:05:00.000Z",
      },
      {
        id: "circle_3",
        name: "Riley",
        relationship: "friend",
        cardLabelPreference: "relationship" as const,
        phoneNumber: null,
        source: "contacts" as const,
        createdAt: "2026-05-26T07:10:00.000Z",
      },
    ],
    dateSafetyDefaults: {
      ...DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults,
      primaryCirclePersonId: "circle_1",
      transportPlan: "I drive myself and park near the front",
      codeWord: "pineapple",
      circleNote: "Text me if I miss the check-in.",
      shareLiveLocation: true,
      checkInOffsetMinutes: 45,
      expectedEndOffsetMinutes: 150,
    },
  };

  assert.equal(getPrimaryCirclePerson(settings)?.name, "Claire");
  assert.equal(MAX_TRUSTED_CIRCLE_PEOPLE, 3);
  assert.deepEqual(
    getTrustedCirclePeople(settings).map((person) => person.name),
    ["Claire", "Maya", "Riley"],
  );

  const plan = buildDateSafetyPlanFromSettings(settings, {
    nextDateAt: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(plan.trustedCircleName, "sister, Maya, friend");
  assert.equal(plan.transportPlan, "I drive myself and park near the front");
  assert.equal(plan.codeWord, "pineapple");
  assert.equal(plan.circleNote, "Text me if I miss the check-in.");
  assert.equal(plan.shareLiveLocation, true);
  assert.equal(plan.checkInAt, "2026-06-01T00:45:00.000Z");
  assert.equal(plan.expectedEndAt, "2026-06-01T02:30:00.000Z");
  assert.equal(plan.safeDateChecklist?.circleHasPlan, false);
  assert.equal(plan.safeDateChecklist?.ownTransport, true);
  assert.equal(plan.safeDateChecklist?.profileReviewed, false);
});

test("falls back to first name when relationship label is selected without a relationship", () => {
  const settings = {
    ...DEFAULT_HEYTELLI_SETTINGS,
    trustedCircle: [
      {
        id: "circle_1",
        name: "Terry",
        relationship: null,
        cardLabelPreference: "relationship" as const,
        phoneNumber: null,
        source: "manual" as const,
        createdAt: "2026-05-26T07:00:00.000Z",
      },
    ],
  };

  const plan = buildDateSafetyPlanFromSettings(settings, {
    nextDateAt: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(plan.trustedCircleName, "Terry");
});

test("profile review spots privacy leaks and unclear dating intent", () => {
  const review = buildProfileReview({
    profileText:
      "Find me on Instagram @maya_at_midtown. I work at Mercy Endoscopy and go to Midtown Yoga every Monday. Just seeing what's out there.",
    lookingFor: "",
    boundaries: "No last-minute home dates.",
    photoNotes: "One photo shows my work badge.",
  });

  assert.equal(review.readyForMatching, false);
  assert.ok(review.privacyWarnings.some((w) => /social handle/i.test(w)));
  assert.ok(review.privacyWarnings.some((w) => /workplace/i.test(w)));
  assert.ok(review.privacyWarnings.some((w) => /routine/i.test(w)));
  assert.ok(review.clarityWarnings.some((w) => /looking for/i.test(w)));
  assert.ok(review.strengths.some((s) => /boundary/i.test(s)));
});

test("turning off stored phone numbers purges existing circle numbers", () => {
  const settings = {
    ...DEFAULT_HEYTELLI_SETTINGS,
    trustedCircle: [
      {
        id: "circle_1",
        name: "Claire",
        relationship: "sister",
        phoneNumber: "+1 555 1212",
        source: "contacts" as const,
        createdAt: "2026-05-26T07:00:00.000Z",
      },
    ],
    dateSafetyDefaults: {
      ...DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults,
      storePhone: true,
    },
  };

  const scrubbed = stripStoredCirclePhoneNumbers(settings);

  assert.equal(scrubbed.dateSafetyDefaults.storePhone, false);
  assert.equal(scrubbed.trustedCircle[0]?.phoneNumber, null);
});
