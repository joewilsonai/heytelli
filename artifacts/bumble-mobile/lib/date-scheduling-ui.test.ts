import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

const matchScreen = readFileSync(
  fileURLToPath(new NodeURL("../app/match/[id].tsx", import.meta.url)),
  "utf8",
);

test("date scheduling uses native date time picker and explicit brief state", () => {
  assert.match(matchScreen, /@react-native-community\/datetimepicker/);
  assert.match(matchScreen, /DateTimePicker/);
  assert.match(matchScreen, /androidPickerMode/);
  assert.match(matchScreen, /PickerTriggerRow/);
  assert.match(matchScreen, /Needs date brief/);
  assert.match(matchScreen, /date_scheduled/);
});

test("match screen walks through safe date planning after a date is entered", () => {
  assert.match(matchScreen, /NextStepCard/);
  assert.match(matchScreen, /Date Card readiness/);
  assert.match(matchScreen, /Safe date walkthrough/);
  assert.match(matchScreen, /SAFE_DATE_CHECKLIST_ITEMS/);
  assert.match(matchScreen, /DATE_PLAN_TEMPLATES/);
  assert.match(matchScreen, /applyDatePlanTemplate/);
  assert.match(matchScreen, /Custom plan/);
  assert.match(matchScreen, /item\.label/);
  assert.match(matchScreen, /Circle Check/);
  assert.match(matchScreen, /useUserSettings/);
  assert.match(matchScreen, /buildDateSafetyPlanFromSettings/);
  assert.match(matchScreen, /planDirty/);
  assert.match(matchScreen, /defaultPlanAppliedKey/);
  assert.match(matchScreen, /I'm safe/);
  assert.match(matchScreen, /Need exit/);
  assert.match(matchScreen, /result\.action === Share\.sharedAction/);
  assert.match(matchScreen, /buildSoftExitMessage\(shareTarget, "pickup"\)/);
  assert.match(matchScreen, /buildSoftExitMessage\(shareTarget, "text"\)/);
  assert.equal(
    [...matchScreen.matchAll(/disabled=\{circleActionDisabled/g)].length >= 4,
    true,
  );
  assert.match(matchScreen, /scheduleDateSafetyReminders/);
});

test("match screen exposes per-date date mode and clock cover controls", () => {
  assert.match(matchScreen, /Start Date Mode/);
  assert.match(matchScreen, /Date Mode/);
  assert.match(matchScreen, /Cover Mode/);
  assert.match(matchScreen, /Clock screen/);
  assert.match(matchScreen, /activeDateMode/);
  assert.match(matchScreen, /!isPast\(data\.nextDateAt\) \|\| activeDateMode/);
  assert.match(matchScreen, /coverModeEnabled/);
  assert.match(matchScreen, /coverModeTheme/);
  assert.match(matchScreen, /dateModeStatus/);
  assert.match(matchScreen, /dateModeStartedAt/);
  assert.match(matchScreen, /dateSafetyPlan: null/);
  assert.match(matchScreen, /circleActionDisabled/);
  assert.doesNotMatch(matchScreen, /Hold the clock to reveal controls/);
  assert.match(matchScreen, /Hide as clock/);
});

test("match screen includes the dating pattern glossary near the radar", () => {
  assert.match(matchScreen, /DatingPatternGlossaryCard/);
  assert.match(matchScreen, /compact/);
});

test("post-date debrief asks for safety and chemistry signals", () => {
  assert.match(matchScreen, /How did you feel in your body/);
  assert.match(matchScreen, /Any boundary pressure/);
  assert.match(matchScreen, /Any mismatch between text and in-person/);
});

test("match screen exposes only one reply suggestion surface", () => {
  assert.match(matchScreen, /<CheatSheetCard matchId=\{data\.id\} \/>/);
  assert.doesNotMatch(matchScreen, /<RepliesCard/);
  assert.doesNotMatch(matchScreen, /function RepliesCard/);
  assert.doesNotMatch(matchScreen, /Generate 3 replies/);
  assert.doesNotMatch(matchScreen, /Reply suggestions/);
});
