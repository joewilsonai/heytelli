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

test("match screen exposes only one reply suggestion surface", () => {
  assert.match(matchScreen, /<CheatSheetCard matchId=\{data\.id\} \/>/);
  assert.doesNotMatch(matchScreen, /<RepliesCard/);
  assert.doesNotMatch(matchScreen, /function RepliesCard/);
  assert.doesNotMatch(matchScreen, /Generate 3 replies/);
  assert.doesNotMatch(matchScreen, /Reply suggestions/);
});
