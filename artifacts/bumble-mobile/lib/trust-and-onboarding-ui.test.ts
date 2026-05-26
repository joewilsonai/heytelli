import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

const homeScreen = readFileSync(
  fileURLToPath(new NodeURL("../app/index.tsx", import.meta.url)),
  "utf8",
);

const trustScreen = readFileSync(
  fileURLToPath(new NodeURL("../app/trust.tsx", import.meta.url)),
  "utf8",
);

test("home screen includes share-sheet onboarding and trust center entry", () => {
  assert.match(homeScreen, /Add screenshots/);
  assert.match(homeScreen, /Import screenshots/);
  assert.match(homeScreen, /Open Photos/);
  assert.match(homeScreen, /Choose HeyTelli/);
  assert.match(homeScreen, /href="\/trust"/);
  assert.match(homeScreen, /DashboardOverview/);
});

test("trust center explains retention, private date cards, and delete controls", () => {
  assert.match(trustScreen, /Raw screenshots are temporary/);
  assert.match(trustScreen, /not a long-term private vault/);
  assert.match(trustScreen, /Date Cards never include screenshots/);
  assert.match(trustScreen, /optional code word/);
  assert.match(trustScreen, /Your circle stays local/);
  assert.match(trustScreen, /phone storage stays off/);
  assert.match(trustScreen, /Delete a match deletes its history/);
  assert.match(trustScreen, /DatingPatternGlossaryCard/);
});
