export type BuildChangelogEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

type BuildChangelogEnv = Record<string, string | undefined>;

export const BUILD_CHANGELOG_ENTRIES: BuildChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-05-31",
    title: "Feedback follow-up status",
    highlights: [
      "Settings now shows whether your feedback is received, planned, shipped, or not planned.",
      "Feedback status refreshes after you send a new beta note.",
      "The improvement loop keeps private dating details out of engineering work.",
      "Build notes now call out the autonomous swarm and TestFlight recovery work.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-29",
    title: "iOS visual polish",
    highlights: [
      "HeyTelli now uses calmer iOS grouped neutrals with stronger status contrast.",
      "Shared buttons, icon actions, and chips have Apple-sized tap targets.",
      "Cover Mode safety actions have clearer accessible labels after long press.",
      "Match and settings labels are cleaner, less tracked, and easier to scan.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-29",
    title: "Simpler navigation redesign",
    highlights: [
      "Match details now open as a sectioned hub with Today, Read, Story, Date, and Talk.",
      "Home is calmer with compact Add, Import, Chat, and Privacy actions.",
      "Settings now has jumpable Essentials, Profile, Safety, and App sections.",
      "Dense match details are one tap away instead of stacked in one long scroll.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-29",
    title: "Private Date Card links",
    highlights: [
      "Share Date Card now creates private expiring links for selected circle people.",
      "Circle people can open the Date Card without an account and tap Got it.",
      "The match screen shows the latest circle link status after a card is shared.",
      "Date Card records store first names, logistics, token hashes, and events only.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-29",
    title: "Screenshot analysis refresh",
    highlights: [
      "Analyze new now replaces stale reanalyze copy throughout the match flow.",
      "New screenshots refresh the latest read, Pattern Radar, and date brief together when needed.",
      "Pattern Radar clears stale in-session results after a full analysis refresh.",
      "Date briefs stay available even when screenshot analysis needs attention.",
    ],
  },
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

const FALLBACK_CHANGELOG = BUILD_CHANGELOG_ENTRIES[0]!;
const MAX_HIGHLIGHTS = 5;

function clean(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanDate(value: string | undefined): string | null {
  const cleaned = clean(value, 20);
  return cleaned && /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : null;
}

function parseHighlights(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .flatMap((item) => (typeof item === "string" ? [clean(item, 160)] : []))
        .filter((item): item is string => item != null)
        .slice(0, MAX_HIGHLIGHTS);
    }
  } catch {
    // Fall through to delimiter parsing for local/manual builds.
  }

  return value
    .split(/\s*(?:\|\||\n|;)\s*/)
    .map((item) => clean(item, 160))
    .filter((item): item is string => item != null)
    .slice(0, MAX_HIGHLIGHTS);
}

export function getLatestBuildChangelog(
  env: BuildChangelogEnv = process.env,
): BuildChangelogEntry {
  const title = clean(env.EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_TITLE, 80);
  const highlights = parseHighlights(
    env.EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_HIGHLIGHTS,
  );
  if (!title || highlights.length === 0) {
    return FALLBACK_CHANGELOG;
  }
  return {
    version:
      clean(env.EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_VERSION, 24) ??
      FALLBACK_CHANGELOG.version,
    date:
      cleanDate(env.EXPO_PUBLIC_HEYTELLI_BUILD_CHANGELOG_DATE) ??
      FALLBACK_CHANGELOG.date,
    title,
    highlights,
  };
}

export function formatBuildChangelogVersion(
  entry: BuildChangelogEntry,
  nativeBuildNumber?: string | null,
): string {
  return nativeBuildNumber
    ? `Version ${entry.version} (${nativeBuildNumber})`
    : `Version ${entry.version}`;
}
