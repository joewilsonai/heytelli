import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new NodeURL(relativePath, import.meta.url)),
    "utf8",
  );
}

test("settings screen exposes profile, circle, and date defaults", () => {
  const screen = read("../app/settings.tsx");

  assert.match(screen, /My Dating Profile/);
  assert.match(screen, /Trusted Circle/);
  assert.match(screen, /Date Safety Defaults/);
  assert.match(screen, /Add from Contacts/);
  assert.match(screen, /HeyTelli stores names locally/);
  assert.match(screen, /Profile Review/);
  assert.match(screen, /saveProfileScreenshotUris/);
  assert.match(screen, /MAX_PROFILE_SCREENSHOTS/);
  assert.match(screen, /Analyze Profile/);
  assert.match(screen, /analyzeDatingProfileScreenshots/);
  assert.match(screen, /stripStoredCirclePhoneNumbers/);
  assert.match(screen, /draftDirty/);
});

test("settings profile screenshots allow ten and analyze into profile fields", () => {
  const screen = read("../app/settings.tsx");
  const localScreenshots = read("./local-profile-screenshots.ts");
  const analysis = read("./profile-analysis.ts");

  assert.match(localScreenshots, /MAX_PROFILE_SCREENSHOTS = 10/);
  assert.match(screen, /selectionLimit: remainingProfileScreenshotSlots/);
  assert.match(screen, /Analyze Profile/);
  assert.match(screen, /setAnalyzingProfile\(true\)/);
  assert.match(screen, /profileText: analysis\.profileText/);
  assert.match(screen, /lookingFor: analysis\.lookingFor/);
  assert.match(screen, /boundaries: analysis\.boundaries/);
  assert.match(screen, /photoNotes: analysis\.photoNotes/);
  assert.match(analysis, /\/api\/settings\/profile\/analyze/);
});

test("trusted circle contact picker statically imports expo contacts", () => {
  const contacts = read("./trusted-circle-contacts.ts");

  assert.match(contacts, /import \* as Contacts from "expo-contacts"/);
  assert.doesNotMatch(contacts, /require\("expo-contacts"\)/);
  assert.doesNotMatch(contacts, /await import\("expo-contacts"\)/);
});

test("settings route is registered and reachable from home", () => {
  const layout = read("../app/_layout.tsx");
  const home = read("../app/index.tsx");

  assert.match(layout, /name="settings"/);
  assert.match(home, /href="\/settings"/);
  assert.match(home, /accessibilityLabel="Settings"/);
});
