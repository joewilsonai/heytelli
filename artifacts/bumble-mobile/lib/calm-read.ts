type RedFlagLike = {
  severity?: "low" | "medium" | "high" | string | null;
  label?: string | null;
  evidence?: string | null;
  status?: string | null;
};

type GreenFlagLike = {
  label?: string | null;
  evidence?: string | null;
};

export type CalmReadMatch = {
  name: string;
  lastRead?: {
    body: string;
    generatedAt: string;
    screenshotCountAt: number;
  } | null;
  readFreshness?: string | null;
  analysisFreshness?: string | null;
  pendingScreenshotCount?: number | null;
  failedScreenshotCount?: number | null;
  overallRead?: string | null;
  lastSpeaker?: "her" | "me" | string | null;
  nextDateAt?: string | Date | null;
  nextDateLocation?: string | null;
  dateHistory?: unknown[] | null;
  currentRedFlags?: RedFlagLike[] | null;
  historicalRedFlags?: RedFlagLike[] | null;
  redFlags?: RedFlagLike[] | null;
  greenFlags?: GreenFlagLike[] | null;
  redFlagSummary?: {
    currentCount: number;
    historicalCount: number;
    highSeverityCount: number;
    lastAnalyzedAt: string | null;
  } | null;
};

export type CalmReadLensTone =
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "muted";
export type CalmReadSafetyLevel = "Low" | "Moderate" | "Elevated";
export type CalmReadClarityLevel = "Clear" | "Mixed" | "Unclear" | "Cooling";
export type CalmReadPaceLevel = "Normal" | "Moderate" | "Fast" | "Unbalanced";
export type CalmReadPatternState =
  | "Active"
  | "Partially resolved"
  | "Resolved"
  | "Historical"
  | "Escalating"
  | "Contradicted by newer behavior";

export type CalmReadModel = {
  label: "The Calm Read";
  headline: string;
  summary: string;
  nextMove: string;
  safety: {
    level: CalmReadSafetyLevel;
    sentence: string;
    tone: CalmReadLensTone;
  };
  clarity: {
    level: CalmReadClarityLevel;
    sentence: string;
    tone: CalmReadLensTone;
  };
  pace: {
    level: CalmReadPaceLevel;
    sentence: string;
    tone: CalmReadLensTone;
  };
  freshness: {
    label: string;
    tone: CalmReadLensTone;
  };
  latestRead: {
    title: string;
    body: string;
    freshnessLabel: string;
  } | null;
  patternStates: Array<{
    label: string;
    evidence: string;
    category:
      | "Safety risk"
      | "Dating clarity"
      | "Emotional pacing"
      | "Communication";
    state: CalmReadPatternState;
    reason: string;
  }>;
};

const SAFETY_PATTERN =
  /threat|intimidat|stalk|harass|coerc|sextortion|intimate image|money|gift card|crypto|fraud|privacy|private location|password|boundary|pressure/i;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pendingCount(match: CalmReadMatch): number {
  return (
    (match.pendingScreenshotCount ?? 0) + (match.failedScreenshotCount ?? 0)
  );
}

function activeFlags(match: CalmReadMatch): RedFlagLike[] {
  return match.currentRedFlags?.length
    ? match.currentRedFlags
    : (match.redFlags ?? []);
}

function allFlags(match: CalmReadMatch): RedFlagLike[] {
  return [...activeFlags(match), ...(match.historicalRedFlags ?? [])];
}

function hasPattern(flags: RedFlagLike[], pattern: RegExp): boolean {
  return flags.some((flag) =>
    pattern.test(`${flag.label ?? ""} ${flag.evidence ?? ""}`),
  );
}

function hasFutureDate(match: CalmReadMatch, now: Date): boolean {
  if (!match.nextDateAt) return false;
  const time = new Date(match.nextDateAt).getTime();
  return !Number.isNaN(time) && time > now.getTime();
}

function hasCompletedDate(match: CalmReadMatch): boolean {
  return (match.dateHistory?.length ?? 0) > 0;
}

function safetyLens(match: CalmReadMatch): CalmReadModel["safety"] {
  const flags = allFlags(match);
  const hasHigh =
    (match.redFlagSummary?.highSeverityCount ?? 0) > 0 ||
    flags.some((flag) => flag.severity === "high");
  const hasMediumSafety = flags.some(
    (flag) =>
      flag.severity === "medium" &&
      SAFETY_PATTERN.test(`${flag.label ?? ""} ${flag.evidence ?? ""}`),
  );

  if (hasHigh && hasPattern(flags, SAFETY_PATTERN)) {
    return {
      level: "Elevated",
      sentence: "This needs safety support before you move forward.",
      tone: "danger",
    };
  }

  if (hasMediumSafety) {
    return {
      level: "Moderate",
      sentence:
        "This may be a boundary concern. Slow down and bring your circle in.",
      tone: "warning",
    };
  }

  return {
    level: "Low",
    sentence: "This is not a safety concern based on the current evidence.",
    tone: "success",
  };
}

function clarityLens(
  match: CalmReadMatch,
  now: Date,
): CalmReadModel["clarity"] {
  const flags = allFlags(match);

  if (hasPattern(flags, /cool|slower|distant|low effort|one-word|dry/i)) {
    return {
      level: "Cooling",
      sentence: "Recent signals look cooler or lower-effort than before.",
      tone: "warning",
    };
  }

  if (
    hasPattern(
      flags,
      /soft availability|vague|not sure|follow-through|no concrete|scheduling|plan/i,
    )
  ) {
    return {
      level: "Mixed",
      sentence: "There is warmth, but the next step is not concrete yet.",
      tone: "primary",
    };
  }

  if (hasFutureDate(match, now) || (match.greenFlags?.length ?? 0) > 0) {
    return {
      level: "Clear",
      sentence: "The current evidence shows reciprocity or follow-through.",
      tone: "success",
    };
  }

  return {
    level: "Unclear",
    sentence:
      "There is not enough current evidence to read momentum confidently.",
    tone: "muted",
  };
}

function paceLens(match: CalmReadMatch): CalmReadModel["pace"] {
  const text = allFlags(match)
    .map((flag) => `${flag.label ?? ""} ${flag.evidence ?? ""}`)
    .join(" ");

  if (/love bombing|pressure|too fast|intense|trauma bonding/i.test(text)) {
    return {
      level: "Fast",
      sentence:
        "The emotional pace may be moving faster than the evidence supports.",
      tone: "warning",
    };
  }

  if (
    /overshar|heavy disclosure|vulnerab|grief|trauma/i.test(text) ||
    (match.greenFlags?.length ?? 0) > 0
  ) {
    return {
      level: "Moderate",
      sentence:
        "There is some openness or vulnerability, but not necessarily too fast.",
      tone: "primary",
    };
  }

  return {
    level: "Normal",
    sentence: "The emotional pace looks normal for the current stage.",
    tone: "success",
  };
}

function freshness(match: CalmReadMatch): CalmReadModel["freshness"] {
  const pending = pendingCount(match);
  if (pending > 0) {
    return {
      label: `${pending} screenshot${pending === 1 ? "" : "s"} waiting`,
      tone: "warning",
    };
  }

  if (
    match.readFreshness === "current" &&
    match.analysisFreshness === "current"
  ) {
    return { label: "Up to date", tone: "success" };
  }

  if (match.readFreshness === "missing") {
    return { label: "Not analyzed yet", tone: "warning" };
  }

  return { label: "Refresh recommended", tone: "warning" };
}

function summaryFor(match: CalmReadMatch): string {
  return (
    clean(match.lastRead?.body) ??
    clean(match.overallRead) ??
    "The story is still forming. Add screenshots, notes, or a debrief so HeyTelli can ground the read in receipts."
  );
}

function headlineFor(
  safety: CalmReadModel["safety"],
  clarity: CalmReadModel["clarity"],
): string {
  if (safety.level === "Elevated") return "Pause before moving forward.";
  if (clarity.level === "Mixed")
    return "Warm signs exist. Momentum is not confirmed.";
  if (clarity.level === "Cooling") return "Something may be cooling.";
  if (clarity.level === "Clear") return "The current signals are steady.";
  return "The story is still forming.";
}

function nextMoveFor(
  match: CalmReadMatch,
  safety: CalmReadModel["safety"],
  clarity: CalmReadModel["clarity"],
  now: Date,
): string {
  if (safety.level === "Elevated") {
    return "Share this with your circle before responding or meeting. Keep plans public and use support resources if you feel pressured.";
  }

  if (safety.level === "Moderate") {
    return "Slow down, verify the plan, and tell your circle before meeting or escalating the conversation.";
  }

  if (pendingCount(match) > 0) {
    return "Analyze the new screenshots before deciding. The saved read stays visible until the refresh finishes.";
  }

  if (hasFutureDate(match, now)) {
    return "Confirm the plan, make the Date Card, and keep your own way home.";
  }

  if (match.lastSpeaker === "her") {
    return clarity.level === "Mixed"
      ? "Reply once, warmly. Do not chase. Watch whether they reopen the thread or follow through."
      : "Review the latest message, then reply with one clear next step.";
  }

  if (match.lastSpeaker === "me") {
    return "Wait for their reply. Let the next signal come from them.";
  }

  return "Add the latest screenshots or a quick note before making a call.";
}

function patternCategory(
  flag: RedFlagLike,
): CalmReadModel["patternStates"][number]["category"] {
  const text = `${flag.label ?? ""} ${flag.evidence ?? ""}`;
  if (SAFETY_PATTERN.test(text)) return "Safety risk";
  if (/vulnerab|trauma|intense|pace|disclosure|grief/i.test(text)) {
    return "Emotional pacing";
  }
  if (/reply|text|message|dodg|question/i.test(text)) return "Communication";
  return "Dating clarity";
}

function patternState(
  match: CalmReadMatch,
  flag: RedFlagLike,
): Pick<CalmReadModel["patternStates"][number], "state" | "reason"> {
  const text = `${flag.label ?? ""} ${flag.evidence ?? ""}`;
  const historical =
    flag.status === "previously-seen" ||
    (match.historicalRedFlags ?? []).includes(flag);
  const planningConcern =
    /meet|date|plan|schedule|availability|follow-through/i.test(text);

  if (historical && planningConcern && hasCompletedDate(match)) {
    return {
      state: "Partially resolved",
      reason: "Later planned or completed date behavior softened this concern.",
    };
  }

  if (historical) {
    return {
      state: "Historical",
      reason: "Saved for memory, but not hot in the latest evidence.",
    };
  }

  if (flag.severity === "high") {
    return {
      state: "Escalating",
      reason: "High-severity concern should stay visible until reviewed.",
    };
  }

  return {
    state: "Active",
    reason: "Still visible in the latest analyzed evidence.",
  };
}

function patternStates(match: CalmReadMatch): CalmReadModel["patternStates"] {
  return allFlags(match)
    .map((flag) => {
      const label = clean(flag.label);
      if (!label) return null;
      const state = patternState(match, flag);
      return {
        label,
        evidence: clean(flag.evidence) ?? "Saved observation from analysis.",
        category: patternCategory(flag),
        state: state.state,
        reason: state.reason,
      };
    })
    .filter(
      (item): item is CalmReadModel["patternStates"][number] => item != null,
    )
    .slice(0, 6);
}

export function getCalmReadModel(
  match: CalmReadMatch,
  now = new Date(),
): CalmReadModel {
  const safety = safetyLens(match);
  const clarity = clarityLens(match, now);
  const pace = paceLens(match);
  const readFreshness = freshness(match);
  const summary = summaryFor(match);

  return {
    label: "The Calm Read",
    headline: headlineFor(safety, clarity),
    summary,
    nextMove: nextMoveFor(match, safety, clarity, now),
    safety,
    clarity,
    pace,
    freshness: readFreshness,
    latestRead: clean(match.lastRead?.body)
      ? {
          title: "Latest saved read",
          body: summary,
          freshnessLabel: readFreshness.label,
        }
      : null,
    patternStates: patternStates(match),
  };
}
