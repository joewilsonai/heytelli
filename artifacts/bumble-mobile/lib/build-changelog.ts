export type BuildChangelogEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

export const BUILD_CHANGELOG_ENTRIES: BuildChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-05-28",
    title: "Beta safety polish",
    highlights: [
      "Home cards keep long jobs and locations readable without breaking the layout.",
      "Private match photos repair their local file path after iOS build updates.",
      "Feedback now confirms how HeyTelli follows up on accepted and shipped fixes.",
    ],
  },
];

export function getLatestBuildChangelog(): BuildChangelogEntry {
  return BUILD_CHANGELOG_ENTRIES[0]!;
}

export function formatBuildChangelogVersion(
  entry: BuildChangelogEntry,
  nativeBuildNumber?: string | null,
): string {
  return nativeBuildNumber
    ? `Version ${entry.version} (${nativeBuildNumber})`
    : `Version ${entry.version}`;
}
