import { circleLabelsFromPlanValue } from "./circle-card-labels.ts";
import { sanitizeSafetyShareText } from "./safety-share.ts";

export type SafeDateChecklist = {
  publicPlace: boolean;
  ownTransport: boolean;
  circleHasPlan: boolean;
  profileReviewed: boolean;
  noPrivateLocationPressure: boolean;
  noMoneyOrPhotoPressure: boolean;
};

export type SafeDateChecklistKey = keyof SafeDateChecklist;

export type CircleCheckStatus = "planned" | "safe" | "needs_help" | "completed";

export type DateModeStatus =
  | "planning"
  | "date_card_sent"
  | "on_date"
  | "check_in_due"
  | "safe"
  | "needs_exit"
  | "home_safe"
  | "missed_check_in";

export type CoverModeTheme = "clock" | "notes" | "breathing";

export type DateSafetyPlan = {
  trustedCircleName?: string | null;
  transportPlan?: string | null;
  checkInAt?: string | null;
  expectedEndAt?: string | null;
  codeWord?: string | null;
  circleNote?: string | null;
  shareLiveLocation?: boolean;
  safeDateChecklist?: Partial<SafeDateChecklist> | null;
  circleCheckStatus?: CircleCheckStatus | null;
  lastCircleCheckAt?: string | null;
  coverModeEnabled?: boolean | null;
  coverModeTheme?: CoverModeTheme | null;
  dateModeStatus?: DateModeStatus | null;
  dateModeStartedAt?: string | null;
  dateModeClosedAt?: string | null;
  updatedAt?: string;
};

export type DateSafetyPlanListStatus = {
  hasPlan: boolean;
  hasTrustedCircle: boolean;
  hasTransportPlan: boolean;
  hasCheckIn: boolean;
  hasExpectedEnd: boolean;
  hasCodeWord: boolean;
  hasCircleNote: boolean;
  shareLiveLocation: boolean;
  safeDateChecklistReady?: boolean;
  circleCheckStatus?: CircleCheckStatus | null;
  lastCircleCheckAt?: string | null;
  coverModeEnabled?: boolean | null;
  coverModeTheme?: CoverModeTheme | null;
  dateModeStatus?: DateModeStatus | null;
  dateModeStartedAt?: string | null;
  dateModeClosedAt?: string | null;
  updatedAt: string | null;
};

export type DateSafetyPlanMatch = {
  name: string;
  nextDateAt?: string | null;
  nextDateLocation?: string | null;
  dateSafetyPlan?: DateSafetyPlan | null;
  dateSafetyPlanStatus?: DateSafetyPlanListStatus | null;
  photoObjectPath?: unknown;
  screenshotObjectPath?: unknown;
  screenshots?: unknown;
};

export type DateSafetyPlanStatus = {
  state: "missing" | "ready" | "expired";
  label: string;
  missing: string[];
};

export type SoftExitIntent = "call" | "pickup" | "text";

export const SAFE_DATE_CHECKLIST_ITEMS: Array<{
  key: SafeDateChecklistKey;
  label: string;
  detail: string;
}> = [
  {
    key: "publicPlace",
    label: "Public place",
    detail: "First meetings stay in a populated public spot.",
  },
  {
    key: "ownTransport",
    label: "Own ride",
    detail: "You control how you leave: drive, rideshare, or trusted pickup.",
  },
  {
    key: "circleHasPlan",
    label: "Circle has the Date Card",
    detail: "A trusted person knows who, where, when, and check-in timing.",
  },
  {
    key: "profileReviewed",
    label: "Profile reviewed",
    detail: "You have looked for basic identity consistency before meeting.",
  },
  {
    key: "noPrivateLocationPressure",
    label: "No private-location pressure",
    detail: "No last-minute home, hotel, remote, or pickup pressure.",
  },
  {
    key: "noMoneyOrPhotoPressure",
    label: "No money/photo pressure",
    detail:
      "No money, gift cards, crypto, passwords, or intimate-image pressure.",
  },
];

const EMPTY_CHECKLIST: SafeDateChecklist = {
  publicPlace: false,
  ownTransport: false,
  circleHasPlan: false,
  profileReviewed: false,
  noPrivateLocationPressure: false,
  noMoneyOrPhotoPressure: false,
};

const DATE_MODE_STATUS_LABELS: Record<DateModeStatus, string> = {
  planning: "Planning",
  date_card_sent: "Date Card sent",
  on_date: "On date",
  check_in_due: "Check-in due",
  safe: "Safe",
  needs_exit: "Needs exit",
  home_safe: "Home safe",
  missed_check_in: "Missed check-in",
};

const COVER_MODE_LABELS: Record<CoverModeTheme, string> = {
  clock: "Clock screen",
  notes: "Notes screen",
  breathing: "Breathing screen",
};

export function getDateModeStatusLabel(
  status: DateModeStatus | null | undefined,
): string {
  return status ? DATE_MODE_STATUS_LABELS[status] : "Date Mode";
}

export function getCoverModeLabel(
  theme: CoverModeTheme | null | undefined,
): string {
  return theme ? COVER_MODE_LABELS[theme] : "Cover Mode";
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "my date";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasValue(value: string | null | undefined): boolean {
  return clean(value) != null;
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDateTime(value: string | null | undefined): string {
  const time = parseDate(value);
  if (time == null) return "Not set";
  return new Date(time).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeChecklist(
  checklist: Partial<SafeDateChecklist> | null | undefined,
): SafeDateChecklist {
  return {
    ...EMPTY_CHECKLIST,
    ...(checklist ?? {}),
  };
}

export function getDateSafetyChecklistProgress(
  checklist: Partial<SafeDateChecklist> | null | undefined,
) {
  const normalized = normalizeChecklist(checklist);
  const missingKeys = SAFE_DATE_CHECKLIST_ITEMS.filter(
    (item) => normalized[item.key] !== true,
  ).map((item) => item.key);
  return {
    completed: SAFE_DATE_CHECKLIST_ITEMS.length - missingKeys.length,
    total: SAFE_DATE_CHECKLIST_ITEMS.length,
    ready: missingKeys.length === 0,
    missingKeys,
  };
}

function getDateCardReadinessChecklistProgress(
  checklist: Partial<SafeDateChecklist> | null | undefined,
) {
  return getDateSafetyChecklistProgress({
    ...checklist,
    circleHasPlan: true,
  });
}

function getMissingFields(match: DateSafetyPlanMatch): string[] {
  const plan = match.dateSafetyPlan;
  const summary = match.dateSafetyPlanStatus;
  const missing: string[] = [];

  if (!hasValue(match.nextDateAt)) missing.push("date time");
  if (!hasValue(match.nextDateLocation)) missing.push("location");
  if (plan) {
    if (!hasValue(plan.trustedCircleName)) missing.push("circle");
    if (!hasValue(plan.transportPlan)) missing.push("transport");
    if (!hasValue(plan.checkInAt)) missing.push("check-in");
    if (!hasValue(plan.expectedEndAt)) missing.push("expected end");
    if (!getDateCardReadinessChecklistProgress(plan.safeDateChecklist).ready) {
      missing.push("safe date steps");
    }
    return missing;
  }
  if (!summary?.hasTrustedCircle) missing.push("circle");
  if (!summary?.hasTransportPlan) missing.push("transport");
  if (!summary?.hasCheckIn) missing.push("check-in");
  if (!summary?.hasExpectedEnd) missing.push("expected end");
  if (!summary?.safeDateChecklistReady) missing.push("safe date steps");

  return missing;
}

export function getDateSafetyPlanStatus(
  match: DateSafetyPlanMatch,
  now = new Date(),
): DateSafetyPlanStatus {
  const missing = getMissingFields(match);
  const expectedEnd = parseDate(match.dateSafetyPlan?.expectedEndAt);

  if (expectedEnd != null && expectedEnd <= now.getTime()) {
    return {
      state: "expired",
      label: "Date passed",
      missing,
    };
  }

  if (missing.length > 0) {
    return {
      state: "missing",
      label: "Needs safety plan",
      missing,
    };
  }

  return {
    state: "ready",
    label: "Ready for circle",
    missing: [],
  };
}

export function buildDateCardMessage(match: DateSafetyPlanMatch): string {
  const plan = match.dateSafetyPlan;
  const lines = [`HeyTelli Date Card`, `Date with: ${firstName(match.name)}`];
  const circleNames = circleLabelsFromPlanValue(plan?.trustedCircleName);
  if (circleNames.length === 1) {
    lines.push(`Circle contact: ${circleNames[0]}`);
  } else if (circleNames.length > 1) {
    lines.push(`Circle contacts: ${circleNames.join(", ")}`);
  }
  lines.push(
    `Time: ${formatDateTime(match.nextDateAt)}`,
    `Location: ${sanitizeSafetyShareText(match.nextDateLocation) ?? "Not set"}`,
    `Transport: ${sanitizeSafetyShareText(plan?.transportPlan) ?? "Not set"}`,
    `Check-in: ${formatDateTime(plan?.checkInAt)}`,
    `Expected end: ${formatDateTime(plan?.expectedEndAt)}`,
  );
  const codeWord = sanitizeSafetyShareText(plan?.codeWord);
  const circleNote = sanitizeSafetyShareText(plan?.circleNote);

  if (codeWord) lines.push(`Code word: ${codeWord}`);
  if (circleNote) lines.push(`Note: ${circleNote}`);
  if (plan?.shareLiveLocation) {
    lines.push("Live location: date-only sharing if I turn it on.");
  }
  if (getDateSafetyChecklistProgress(plan?.safeDateChecklist).ready) {
    lines.push("Safety scan: public place, own ride, circle informed.");
  }
  lines.push("Private by default. No images included.");

  return lines.join("\n");
}

export function buildSoftExitMessage(
  match: DateSafetyPlanMatch,
  intent: SoftExitIntent,
): string {
  const name = firstName(match.name);
  const location = sanitizeSafetyShareText(match.nextDateLocation);
  const codeWord = sanitizeSafetyShareText(match.dateSafetyPlan?.codeWord);
  const locationPhrase = location ? ` at ${location}` : "";
  const codePhrase = codeWord ? ` Code word: ${codeWord}.` : "";

  if (intent === "pickup") {
    return `Can you help me leave? I may need a pickup from my date with ${name}${locationPhrase}.${codePhrase}`;
  }

  if (intent === "text") {
    return `Can you text me? I may need a soft exit from my date with ${name}${locationPhrase}.${codePhrase}`;
  }

  return `Can you call me? I may need a soft exit from my date with ${name}${locationPhrase}.${codePhrase}`;
}

export function buildCircleCheckMessage(
  match: DateSafetyPlanMatch,
  status: Extract<CircleCheckStatus, "safe" | "completed">,
): string {
  const name = firstName(match.name);
  const location = sanitizeSafetyShareText(match.nextDateLocation);
  const locationPhrase = location ? ` at ${location}` : "";

  if (status === "completed") {
    const leavingPhrase = location ? ` ${location}` : "";
    return `Date with ${name} is complete. I'm leaving${leavingPhrase} now.`;
  }

  return `I'm safe at my date with ${name}${locationPhrase}. Check-in complete.`;
}
