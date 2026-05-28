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

test("match screenshots are archived locally while server raw images can be purged", () => {
  const localScreenshots = read("./local-match-screenshots.ts");
  const detail = read("../app/match/[id].tsx");
  const gallery = read("../app/match/[id]/photos.tsx");

  assert.match(localScreenshots, /LOCAL_MATCH_SCREENSHOT_STORAGE_KEY/);
  assert.match(localScreenshots, /heytelli-match-screenshots/);
  assert.match(localScreenshots, /Paths\.document/);
  assert.match(localScreenshots, /AsyncStorage/);
  assert.match(localScreenshots, /saveLocalMatchScreenshot/);
  assert.match(localScreenshots, /clearLocalMatchScreenshotArchive/);
  assert.doesNotMatch(localScreenshots, /uploadImage/);
  assert.doesNotMatch(localScreenshots, /fetch\(/);
  assert.doesNotMatch(localScreenshots, /addScreenshot/);

  assert.match(detail, /saveLocalMatchScreenshot/);
  assert.match(detail, /getLocalMatchScreenshotUri/);
  assert.match(detail, /Restore for analysis/);
  assert.match(detail, /On this iPhone/);
  assert.match(detail, /clearLocalMatchScreenshotArchive/);
  assert.match(detail, /clearLocalMatchPhoto/);

  assert.match(gallery, /useLocalMatchScreenshots/);
  assert.match(gallery, /getLocalMatchScreenshotUri/);
  assert.match(gallery, /On this iPhone/);
  assert.match(gallery, /objectPathToUrl\(s\.objectPath\) \?\?/);
});
