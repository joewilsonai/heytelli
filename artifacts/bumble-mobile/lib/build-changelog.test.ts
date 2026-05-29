import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBuildChangelogVersion,
  getLatestBuildChangelog,
} from "./build-changelog.ts";

test("prefers build-time changelog metadata for each beta build", () => {
  const entry = getLatestBuildChangelog({
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_VERSION: "1.0.0",
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_DATE: "2026-05-28",
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_TITLE: "Beta build 9",
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_HIGHLIGHTS: JSON.stringify([
      "Gut Check now splits broad swarm work.",
      "Build notes are injected by the iOS beta workflow.",
    ]),
  });

  assert.equal(entry.title, "Beta build 9");
  assert.equal(entry.date, "2026-05-28");
  assert.deepEqual(entry.highlights, [
    "Gut Check now splits broad swarm work.",
    "Build notes are injected by the iOS beta workflow.",
  ]);
  assert.equal(formatBuildChangelogVersion(entry, "9"), "Version 1.0.0 (9)");
});

test("falls back to curated changelog when build metadata is absent or malformed", () => {
  const entry = getLatestBuildChangelog({
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_TITLE: "",
    EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_HIGHLIGHTS: "not json",
  });

  assert.equal(entry.title, "Screenshot analysis refresh");
  assert.match(entry.highlights.join("\n"), /Pattern Radar clears stale/);
});
