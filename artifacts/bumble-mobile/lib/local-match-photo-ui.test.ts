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

test("match photos are stored locally and never use backend upload", () => {
  const localPhotos = read("./local-match-photos.ts");
  const detail = read("../app/match/[id].tsx");
  const home = read("../app/index.tsx");
  const staleNudges = read("../components/StaleNudgesSection.tsx");

  assert.match(localPhotos, /LOCAL_MATCH_PHOTO_STORAGE_KEY/);
  assert.match(localPhotos, /heytelli-match-photos/);
  assert.match(localPhotos, /Paths\.document/);
  assert.match(localPhotos, /AsyncStorage/);
  assert.match(localPhotos, /resolveStoredLocalMatchPhotoUri/);
  assert.match(localPhotos, /serializeLocalMatchPhotoUriForStorage/);
  assert.match(localPhotos, /saveLocalMatchPhoto/);
  assert.match(localPhotos, /clearLocalMatchPhoto/);
  assert.doesNotMatch(localPhotos, /uploadImage/);
  assert.doesNotMatch(localPhotos, /fetch\(/);
  assert.doesNotMatch(localPhotos, /addScreenshot/);
  assert.doesNotMatch(localPhotos, /updateMatch/);

  assert.match(detail, /useLocalMatchPhotos/);
  assert.match(detail, /chooseLocalMatchPhoto/);
  assert.match(detail, /clearMatchPhoto/);
  assert.match(detail, /Private match photo/);
  assert.match(detail, /const photo = localPhotoUri/);
  assert.doesNotMatch(detail, /localPhotoUri\s*\?\?\s*objectPathToUrl/);

  assert.match(home, /useLocalMatchPhotos/);
  assert.match(home, /localPhotoUri/);
  assert.match(home, /<Image/);

  assert.match(staleNudges, /useLocalMatchPhotos/);
  assert.match(staleNudges, /localMatchPhotos\[String\(nudge\.matchId\)\]/);
  assert.doesNotMatch(staleNudges, /objectPathToUrl/);
});
