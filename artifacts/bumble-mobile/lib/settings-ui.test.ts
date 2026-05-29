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

  assert.match(screen, /My HeyTelli/);
  assert.doesNotMatch(screen, /dating OS/i);
  assert.match(screen, /Profile radar/);
  assert.match(screen, /Circle seats/);
  assert.match(screen, /Date defaults/);
  assert.match(screen, /My Dating Profile/);
  assert.match(screen, /Trusted Circle/);
  assert.match(screen, /circle\s+people/);
  assert.match(screen, /Listed on cards as/);
  assert.match(screen, /First name/);
  assert.match(screen, /Relationship/);
  assert.match(screen, /cardLabelPreference/);
  assert.match(screen, /MAX_TRUSTED_CIRCLE_PEOPLE/);
  assert.match(screen, /Date Safety Defaults/);
  assert.match(screen, /Appearance/);
  assert.match(screen, /Light mode/);
  assert.match(screen, /Color theme/);
  assert.match(screen, /updateAppearance/);
  assert.match(screen, /setSettings\(\(current\)/);
  assert.match(screen, /Build changelog/);
  assert.match(screen, /getLatestBuildChangelog/);
  assert.match(screen, /Add from Contacts/);
  assert.match(screen, /HeyTelli stores up to 3 first names locally/);
  assert.match(screen, /Profile Review/);
  assert.match(screen, /saveProfileScreenshotUris/);
  assert.match(screen, /MAX_PROFILE_SCREENSHOTS/);
  assert.match(screen, /Analyze Profile/);
  assert.match(screen, /analyzeDatingProfileScreenshots/);
  assert.match(screen, /stripStoredCirclePhoneNumbers/);
  assert.match(screen, /draftDirty/);
});

test("settings changelog has detailed latest build notes", () => {
  const screen = read("../app/settings.tsx");
  const changelog = read("./build-changelog.ts");

  assert.match(screen, /formatBuildChangelogVersion/);
  assert.match(screen, /Constants\.nativeBuildVersion/);
  assert.match(changelog, /BUILD_CHANGELOG_ENTRIES/);
  assert.match(changelog, /Beta safety polish/);
  assert.match(changelog, /Private match photos repair/);
  assert.match(changelog, /Feedback now confirms/);
});

test("ios beta workflow injects build changelog metadata", () => {
  const workflow = read("../../../.github/workflows/ios-beta-build.yml");

  assert.match(workflow, /Generate in-app build changelog/);
  assert.match(workflow, /EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_TITLE/);
  assert.match(workflow, /EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_DATE/);
  assert.match(workflow, /EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_HIGHLIGHTS/);
  assert.match(workflow, /GITHUB_ENV/);
});

test("settings profile screenshots allow ten and analyze into profile fields", () => {
  const screen = read("../app/settings.tsx");
  const localScreenshots = read("./local-profile-screenshots.ts");
  const analysis = read("./profile-analysis.ts");

  assert.match(localScreenshots, /MAX_PROFILE_SCREENSHOTS = 10/);
  assert.match(localScreenshots, /prepareProfileScreenshotsForAnalysis/);
  assert.match(localScreenshots, /deleteProfileScreenshotUris/);
  assert.match(localScreenshots, /\.exists/);
  assert.match(screen, /selectionLimit: remainingProfileScreenshotSlots/);
  assert.match(screen, /Analyze Profile/);
  assert.match(screen, /Clear screenshots/);
  assert.match(screen, /clearProfileScreenshots/);
  assert.match(screen, /setAnalyzingProfile\(true\)/);
  assert.match(screen, /skippedScreenshotUris/);
  assert.match(screen, /skippedOversizedScreenshotUris/);
  assert.match(
    screen,
    /profileScreenshotUris: analysis\.profileScreenshotUris/,
  );
  assert.match(screen, /profileText: analysis\.profileText/);
  assert.match(screen, /lookingFor: analysis\.lookingFor/);
  assert.match(screen, /boundaries: analysis\.boundaries/);
  assert.match(screen, /photoNotes: analysis\.photoNotes/);
  assert.match(analysis, /\/api\/settings\/profile\/analyze/);
  assert.match(analysis, /prepareProfileScreenshotsForAnalysis/);
  assert.match(analysis, /batchProfileAnalysisDataUrls/);
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

  assert.match(layout, /UserSettingsProvider/);
  assert.match(layout, /name="settings"/);
  assert.match(home, /href="\/settings"/);
  assert.match(home, /accessibilityLabel="My HeyTelli"/);
});
