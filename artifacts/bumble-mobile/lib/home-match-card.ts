import {
  getDateSafetyPlanStatus,
  type DateModeStatus,
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
  | "decide_next_move"
  | "open_date_mode";

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

export type HomeBriefItem = {
  matchName: string;
  title: string;
  body: string;
  tone: HomeSignalTone;
  actionKind: HomePrimaryActionKind;
};

export type HomeDailyBriefModel = {
  headline: "Telli noticed...";
  body: string;
  items: HomeBriefItem[];
};

export type HomeTrendSnapshot = {
  title: string;
  body: string;
  tone: HomeSignalTone;
};

const STALE_MS = 48 * 60 * 60 * 1000;
const ACTIVE_DATE_MODE_STATUSES = new Set<DateModeStatus>([
  "on_date",
  "check_in_due",
  "safe",
  "needs_exit",
  "missed_check_in",
]);

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

function getDateModeStatus(match: HomeMatchCardMatch): DateModeStatus | null {
  return (
    match.dateSafetyPlan?.dateModeStatus ??
    match.dateSafetyPlanStatus?.dateModeStatus ??
    null
  );
}

function isDateModeClosed(match: HomeMatchCardMatch): boolean {
  return Boolean(
    firstNonEmpty(
      match.dateSafetyPlan?.dateModeClosedAt,
      match.dateSafetyPlanStatus?.dateModeClosedAt,
    ),
  );
}

function hasActiveDateMode(match: HomeMatchCardMatch): boolean {
  const status = getDateModeStatus(match);
  return (
    match.status === "active" &&
    status != null &&
    ACTIVE_DATE_MODE_STATUSES.has(status) &&
    !isDateModeClosed(match)
  );
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
  if (hasActiveDateMode(match))
    return { label: "On date now", tone: "primary" };
  if (hasFutureDate(match, now))
    return { label: "Date planned", tone: "primary" };
  if (isStale(match, now)) return { label: "Needs reply", tone: "warning" };
  return { label: "Active", tone: "success" };
}

function getSignal(
  match: HomeMatchCardMatch,
  now: Date,
): HomeMatchCardModel["signal"] {
  const needsContext =
    match.analysisFreshness !== "current" ||
    pendingContextCount(match) > 0 ||
    (!match.lastActivityAt &&
      !match.lastRead &&
      !match.extractedProfile.conversationTone);
  const concerns = savedConcernCount(match);

  if (match.status !== "active") return { label: "Stale", tone: "muted" };
  if (hasActiveDateMode(match)) return { label: "Date Mode", tone: "primary" };
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
  return { label: "Current", tone: "success" };
}

function getNextAction(match: HomeMatchCardMatch, now: Date): string {
  if (match.status === "archived") return "Revisit only if something changed";
  if (match.status === "ghosted") return "Let it fade";
  if (hasActiveDateMode(match)) return "Open Date Mode";
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
  if (hasActiveDateMode(match)) {
    return {
      kind: "open_date_mode",
      label: "Open Date Mode",
      tone: "primary",
    };
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
  if (hasActiveDateMode(match)) {
    return {
      key: "date",
      label: "Date Mode",
      tone: "primary",
    };
  }
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
    firstNonEmpty(profile.conversationTone, details) ??
    "No read yet. Upload screenshots to build the first read."
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
      freshnessLabel: "Analyze new",
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

  if (hasActiveDateMode(match)) chips.push("Date Mode");
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
  if (hasActiveDateMode(match)) return 110;
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

function briefBodyForAction(
  match: HomeMatchCardMatch,
  model: HomeMatchCardModel,
): Pick<HomeBriefItem, "title" | "body"> | null {
  const pending = pendingContextCount(match);
  switch (model.primaryAction.kind) {
    case "review_screenshots":
      return {
        title: "New screenshots waiting",
        body: `${model.name} has ${pending} screenshot${pending === 1 ? "" : "s"} waiting. The last read stays visible until you refresh it.`,
      };
    case "make_date_card":
      return {
        title: "Date plan needs a Date Card",
        body: `${model.name} has a date coming up. Finish the Date Card before you meet.`,
      };
    case "share_date_card":
      return {
        title: "Circle is ready",
        body: `${model.name}'s Date Card is ready to share with your circle.`,
      };
    case "open_date_mode":
      return {
        title: "Date Mode is active",
        body: `${model.name} is in Date Mode. Open the live safety controls when needed.`,
      };
    case "review_pattern":
      return {
        title: "Saved pattern to review",
        body: `${model.name} has a saved pattern worth checking before the next move.`,
      };
    case "review_reply":
      return {
        title: "Reply with context",
        body: `${model.name} replied. Check the read before you decide what to say.`,
      };
    case "decide_next_move":
      return {
        title: "Decision moment",
        body: `${model.name} has gone quiet. Follow up, pause, or let it fade.`,
      };
    case "add_screenshots":
      return {
        title: "Start the read",
        body: `${model.name} needs profile or chat screenshots before Telli can spot patterns.`,
      };
    case "wait":
      return null;
  }
}

export function getHomeDailyBriefModel(
  matches: HomeMatchCardMatch[],
  now = new Date(),
): HomeDailyBriefModel {
  const items = matches
    .filter((match) => match.status === "active")
    .map((match) => {
      const model = getHomeMatchCardModel(match, now);
      const copy = briefBodyForAction(match, model);
      if (!copy) return null;
      return {
        ...copy,
        matchName: model.name,
        tone: model.primaryAction.tone,
        actionKind: model.primaryAction.kind,
        attentionRank: model.attentionRank,
        lastActivity: parseTime(match.lastActivityAt) ?? 0,
      };
    })
    .filter(
      (
        item,
      ): item is HomeBriefItem & {
        attentionRank: number;
        lastActivity: number;
      } => Boolean(item),
    )
    .sort(
      (a, b) =>
        b.attentionRank - a.attentionRank || b.lastActivity - a.lastActivity,
    )
    .slice(0, 3)
    .map(
      ({
        attentionRank: _attentionRank,
        lastActivity: _lastActivity,
        ...item
      }) => item,
    );

  return {
    headline: "Telli noticed...",
    body:
      items.length > 0
        ? "A tiny priority list for safer, clearer dating today."
        : "Nothing urgent. Your reads, patterns, and date plans are calm for now.",
    items,
  };
}

export function getHomeTrendSnapshot(
  matches: HomeMatchCardMatch[],
): HomeTrendSnapshot {
  const active = matches.filter((match) => match.status === "active");
  const pending = active.reduce(
    (total, match) => total + pendingContextCount(match),
    0,
  );
  const savedPatterns = active.reduce(
    (total, match) => total + savedConcernCount(match),
    0,
  );
  const highSeverity = active.reduce(
    (total, match) => total + (match.redFlagSummary?.highSeverityCount ?? 0),
    0,
  );
  const upcomingDates = active.filter((match) => match.nextDateAt).length;
  const tagCounts = new Map<string, number>();
  active.forEach((match) => {
    (match.tags ?? []).forEach((tag) => {
      const normalized = tag.trim();
      if (!normalized) return;
      tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    });
  });
  const topTag = Array.from(tagCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];

  if (highSeverity > 0 || savedPatterns > 0) {
    const tagPhrase = topTag ? `, including "${topTag}"` : "";
    return {
      title: "Pattern watch",
      body: `${savedPatterns} saved pattern${savedPatterns === 1 ? "" : "s"}${tagPhrase}. Keep those visible even when the latest read changes.`,
      tone: highSeverity > 0 ? "danger" : "warning",
    };
  }

  if (pending > 0) {
    return {
      title: "Context waiting",
      body: `${pending} screenshot${pending === 1 ? "" : "s"} waiting to be analyzed across active matches.`,
      tone: "warning",
    };
  }

  if (upcomingDates > 0) {
    return {
      title: "Date mode",
      body: `${upcomingDates} upcoming date${upcomingDates === 1 ? "" : "s"}. Keep Date Cards and circle checks ready before you go.`,
      tone: "primary",
    };
  }

  if (topTag) {
    return {
      title: "Pattern watch",
      body: `The strongest current theme is "${topTag}". Use it as a lens, not a verdict.`,
      tone: "primary",
    };
  }

  return {
    title: "Clear for now",
    body: "No urgent trends are standing out. Add new screenshots when the story changes.",
    tone: "success",
  };
}
