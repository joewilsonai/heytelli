import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStoredLocalMatchPhotoUri,
  serializeLocalMatchPhotoUriForStorage,
} from "./local-match-photo-paths.ts";

const currentDir =
  "file:///var/mobile/Containers/Data/Application/new-build/Documents/heytelli-match-photos/";

test("stores local match photo paths relative to the current document directory", () => {
  assert.equal(
    serializeLocalMatchPhotoUriForStorage(
      `${currentDir}match_42_photo.jpg`,
      currentDir,
    ),
    "match_42_photo.jpg",
  );
});

test("resolves a saved match photo from an older iOS app container", () => {
  const previousBuildUri =
    "file:///var/mobile/Containers/Data/Application/old-build/Documents/heytelli-match-photos/match_42_photo.jpg";

  const resolved = resolveStoredLocalMatchPhotoUri(
    previousBuildUri,
    currentDir,
    (uri) => uri === `${currentDir}match_42_photo.jpg`,
  );

  assert.equal(resolved, `${currentDir}match_42_photo.jpg`);
});

test("keeps readable non-local photo URIs intact", () => {
  const pickedUri = "ph://library-photo-id";

  assert.equal(
    resolveStoredLocalMatchPhotoUri(
      pickedUri,
      currentDir,
      (uri) => uri === pickedUri,
    ),
    pickedUri,
  );
});
