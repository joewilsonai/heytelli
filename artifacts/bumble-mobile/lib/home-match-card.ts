import {
  getDateSafetyPlanStatus,
  type DateSafetyPlan,
  type DateSafetyPlanListStatus,
} from "./date-safety-plan.ts";

export type HomeMatchCardMatch = {
  name: string;
  status: "active" | "archived" | "ghosted" | string;
  extractedProfile: {
    job: string | null;
    location: string | null;
    interests: string[];
    mentionedTopics: string[];
    conversationTone: string | null;
    scores: {
      conversionAbility: { value: number | null; rationale?: string | null };
      chemistry: { value: number | null; rationale?: string | null };
      sexPotential?: { value: number | null; rationale?: string | null };
    };
  };
  nextDateAt: string | null;
  nextDateLocation?: string | null;
  dateSafetyPlan?: DateSafetyPlan | null;
  dateSafetyPlanStatus?: DateSafetyPlanListStatus | null;
  lastSpeaker?: "her" | "me" | null;
  lastActivityAt?: string | null;
  pendingScreenshotCount: number;
  failedScreenshotCount: number;
  analysisFreshness: "current" | "needs-analysis" | "never-analyzed" | string;
  dateHistory: Array<unknown>;
  lastRead: {
    body: string;
    generatedAt: string;
    screenshotCountAt: number;
  } | null;
  readFreshness: "current" | "stale" | "missing" | string;
  redFlagSummary?: {
    currentCount: number;
    historicalCount: number;
    highSeverityCount: number;
    lastAnalyzedAt: string | null;
  };
  tags?: string[];
  screenshotCount?: number;
};

export type HomeSignalTone =
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "primary";

export type HomePrimaryActionKind =
  | "add_screenshots"
  | "review_screenshots"
  | "make_date_card"
  | "share_date_card"
  | "review_pattern"
  | "review_reply"
  | "wait"
  | "decide_next_move";

export type HomeDashboardSection =
  | "date"
  | "needs-review"
  | "current"
  | "quiet";

export type HomeMatchCardModel = {
  name: string;
  status: {
    label: string;
    tone: HomeSignalTone;
  };
  signal: {
    label: string;
    tone: HomeSignalTone;
  };
  read: {
    title: string;
    body: string;
    freshnessLabel: string;
    tone: HomeSignalTone;
  };
  primaryAction: {
    kind: HomePrimaryActionKind;
    label: string;
    tone: HomeSignalTone;
  };
  section: {
    key: HomeDashboardSection;
    label: string;
    tone: HomeSignalTone;
  };
  nextAction: string;
  contextChips: string[];
  attentionRank: number;
};

const STALE_MS = 48 * 60 * 60 * 1000;

export function getFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Connection";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function hasFutureDate(match: HomeMatchCardMatch, now: Date): boolean {
  const time = parseTime(match.nextDateAt);
  return time != null && time > now.getTime();
}

function isSameLocalDay(time: number, now: Date): boolean {
  const date = new Date(time);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getDateSectionLabel(match: HomeMatchCardMatch, now: Date): string {
  const time = parseTime(match.nextDateAt);
  if (time != null && isSameLocalDay(time, now)) return "Tonight";
  return "Upcoming date";
}

function isStale(match: HomeMatchCardMatch, now: Date): boolean {
  const lastActivity = parseTime(match.lastActivityAt);
  return (
    match.status === "active" &&
    match.lastSpeaker === "her" &&
    lastActivity != null &&
    now.getTime() - lastActivity > STALE_MS
  );
}

function pendingContextCount(match: HomeMatchCardMatch): number {
  return match.pendingScreenshotCount + match.failedScreenshotCount;
}

function savedConcernCount(match: HomeMatchCardMatch): number {
  return (
    (match.redFlagSummary?.currentCount ?? 0) +
    (match.redFlagSummary?.historicalCount ?? 0)
  );
}

function getStatus(
  match: HomeMatchCardMatch,
  now: Date,
): HomeMatchCardModel["status"] {
  if (match.status === "archived") return { label: "Archived", tone: "muted" };
  if (match.status === "ghosted") return { label: "Quiet", tone: "muted" };
  if (hasFutureDate(match, now))
    return { label: "Date planned", tone: "primary" };
  if (isStale(match, now)) return { label: "Needs reply", tone: "warning" };
  return { label: "Active", tone: "success" };
}

function getSignal(
  match: HomeMatchCardMatch,
  now: Date,
): HomeMatchCardModel["signal"] {
  const connection = match.extractedProfile.scores.chemistry.value;
  const momentum = match.extractedProfile.scores.conversionAbility.value;
  const needsContext =
    match.analysisFreshness !== "current" ||
    pendingContextCount(match) > 0 ||
    (!match.lastActivityAt && connection == null && momentum == null);
  const concerns = savedConcernCount(match);

  if (match.status !== "active") return { label: "Stale", tone: "muted" };
  if ((match.redFlagSummary?.highSeverityCount ?? 0) > 0) {
    return { label: "Saved pattern", tone: "danger" };
  }
  if (concerns > 0) return { label: "Watch pattern", tone: "warning" };
  if (hasFutureDate(match, now)) {
    const status = getDateSafetyPlanStatus(match, now);
    if (status.state === "ready")
      return { label: "Circle ready", tone: "success" };
    return { label: "Needs Date Card", tone: "warning" };
  }
  if (isStale(match, now)) return { label: "Stale", tone: "warning" };
  if (needsContext) return { label: "Needs more context", tone: "warning" };
  if (
    (connection != null && connection <= 3) ||
    (momentum != null && momentum <= 3)
  ) {
    return { label: "Needs eyes", tone: "warning" };
  }
  if (
    (connection != null && connection <= 5) ||
    (momentum != null && momentum <= 5)
  ) {
    return { label: "Proceed slowly", tone: "warning" };
  }
  if ((connection ?? 0) >= 7 && (momentum ?? 0) >= 6) {
    return { label: "Promising", tone: "success" };
  }
  return { label: "Needs more context", tone: "warning" };
}

function getNextAction(match: HomeMatchCardMatch, now: Date): string {
  if (match.status === "archived") return "Revisit only if something changed";
  if (match.status === "ghosted") return "Let it fade";
  if (
    pendingContextCount(match) > 0 ||
    match.analysisFreshness === "needs-analysis"
  ) {
    return "Review new screenshots";
  }
  if ((match.redFlagSummary?.highSeverityCount ?? 0) > 0)
    return "Review saved pattern";
  if (hasFutureDate(match, now)) {
    const status = getDateSafetyPlanStatus(match, now);
    return status.state === "ready" ? "Share Date Card" : "Make Date Card";
  }
  if (isStale(match, now)) return "Follow up or let it fade";
  if (!match.lastActivityAt) return "Upload latest chat";
  if (match.lastSpeaker === "me") return "Wait for reply";
  if (match.lastSpeaker === "her") return "Review before replying";
  return "Upload latest chat";
}

function getPrimaryAction(
  match: HomeMatchCardMatch,
  now: Date,
): HomeMatchCardModel["primaryAction"] {
  if (match.status !== "active") {
    return { kind: "wait", label: "Keep archived", tone: "muted" };
  }
  if (
    pendingContextCount(match) > 0 ||
    match.analysisFreshness === "needs-analysis"
  ) {
    return {
      kind: "review_screenshots",
      label: "Review screenshots",
      tone: "warning",
    };
  }
  if ((match.redFlagSummary?.highSeverityCount ?? 0) > 0) {
    return { kind: "review_pattern", label: "Review pattern", tone: "danger" };
  }
  if (hasFutureDate(match, now)) {
    const status = getDateSafetyPlanStatus(match, now);
    return status.state === "ready"
      ? { kind: "share_date_card", label: "Share Date Card", tone: "success" }
      : { kind: "make_date_card", label: "Make Date Card", tone: "warning" };
  }
  if (isStale(match, now)) {
    return {
      kind: "decide_next_move",
      label: "Decide next move",
      tone: "warning",
    };
  }
  if (!match.lastActivityAt) {
    return {
      kind: "add_screenshots",
      label: "Add screenshots",
      tone: "primary",
    };
  }
  if (match.lastSpeaker === "her") {
    return { kind: "review_reply", label: "Review reply", tone: "primary" };
  }
  if (match.lastSpeaker === "me") {
    return { kind: "wait", label: "Wait for reply", tone: "muted" };
  }
  return {
    kind: "add_screenshots",
    label: "Add latest chat",
    tone: "primary",
  };
}

function getDashboardSection(
  match: HomeMatchCardMatch,
  now: Date,
): HomeMatchCardModel["section"] {
  if (hasFutureDate(match, now)) {
    return {
      key: "date",
      label: getDateSectionLabel(match, now),
      tone: "primary",
    };
  }
  if (
    pendingContextCount(match) > 0 ||
    match.analysisFreshness !== "current" ||
    savedConcernCount(match) > 0 ||
    isStale(match, now)
  ) {
    return { key: "needs-review", label: "Needs review", tone: "warning" };
  }
  if (match.status !== "active") {
    return { key: "quiet", label: "Quiet", tone: "muted" };
  }
  return { key: "current", label: "Current", tone: "success" };
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function getReadBody(match: HomeMatchCardMatch): string {
  const profile = match.extractedProfile;
  const details = [
    profile.job,
    profile.location,
    profile.interests.length > 0
      ? `Mentions ${profile.interests.slice(0, 3).join(", ")}.`
      : null,
    profile.mentionedTopics.length > 0
      ? `Recent topics: ${profile.mentionedTopics.slice(0, 3).join(", ")}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    firstNonEmpty(
      profile.conversationTone,
      profile.scores.chemistry.rationale,
      profile.scores.conversionAbility.rationale,
      details,
    ) ?? "No read yet. Upload screenshots to build the first read."
  );
}

function getRead(match: HomeMatchCardMatch): HomeMatchCardModel["read"] {
  const pending = pendingContextCount(match);
  const body = match.lastRead?.body?.trim() || getReadBody(match);

  if (pending > 0) {
    return {
      title: "Last read",
      body,
      freshnessLabel: `${pending} screenshot${pending === 1 ? "" : "s"} waiting`,
      tone: "warning",
    };
  }

  if (match.readFreshness === "current") {
    return {
      title: "Last read",
      body,
      freshnessLabel: "Up to date",
      tone: "success",
    };
  }

  if (match.readFreshness === "stale") {
    return {
      title: "Last read",
      body,
      freshnessLabel: "Reanalyze",
      tone: "warning",
    };
  }

  return {
    title: "Last read",
    body,
    freshnessLabel:
      match.readFreshness === "missing" ||
      match.analysisFreshness === "never-analyzed"
        ? "Not analyzed yet"
        : "Needs analysis",
    tone: "warning",
  };
}

function getContextChips(match: HomeMatchCardMatch, now: Date): string[] {
  const chips: string[] = [];
  const count = match.screenshotCount;

  if (typeof count === "number" && count > 0) {
    chips.push(`${count} screenshot${count === 1 ? "" : "s"}`);
  }
  if (match.lastActivityAt) chips.push(match.lastSpeaker ? "Chat" : "Activity");
  if (match.extractedProfile.job || match.extractedProfile.location)
    chips.push("Profile");
  if (hasFutureDate(match, now)) chips.push("Date set");
  if (hasFutureDate(match, now)) {
    const status = getDateSafetyPlanStatus(match, now);
    if (status.state === "ready") chips.push("Circle ready");
  }
  if (match.dateHistory.length > 0) chips.push("Date history");
  if (pendingContextCount(match) > 0)
    chips.push(`${pendingContextCount(match)} to analyze`);
  const concerns = savedConcernCount(match);
  if (concerns > 0)
    chips.push(`${concerns} pattern${concerns === 1 ? "" : "s"}`);
  if (chips.length === 0) chips.push("Needs screenshots");

  return chips.slice(0, 4);
}

function getAttentionRank(match: HomeMatchCardMatch, now: Date): number {
  if (pendingContextCount(match) > 0 || match.analysisFreshness !== "current")
    return 100;
  if ((match.redFlagSummary?.highSeverityCount ?? 0) > 0) return 95;
  if (hasFutureDate(match, now)) return 90;
  if (isStale(match, now)) return 80;
  if (match.lastSpeaker === "her") return 70;
  if (match.lastSpeaker === "me") return 40;
  return 30;
}

export function getHomeMatchCardModel(
  match: HomeMatchCardMatch,
  now = new Date(),
): HomeMatchCardModel {
  return {
    name: getFirstName(match.name),
    status: getStatus(match, now),
    signal: getSignal(match, now),
    read: getRead(match),
    primaryAction: getPrimaryAction(match, now),
    section: getDashboardSection(match, now),
    nextAction: getNextAction(match, now),
    contextChips: getContextChips(match, now),
    attentionRank: getAttentionRank(match, now),
  };
}
