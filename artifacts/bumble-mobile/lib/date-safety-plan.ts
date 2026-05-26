export type DateSafetyPlan = {
  trustedCircleName?: string | null;
  transportPlan?: string | null;
  checkInAt?: string | null;
  expectedEndAt?: string | null;
  codeWord?: string | null;
  circleNote?: string | null;
  shareLiveLocation?: boolean;
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
    return missing;
  }
  if (!summary?.hasTrustedCircle) missing.push("circle");
  if (!summary?.hasTransportPlan) missing.push("transport");
  if (!summary?.hasCheckIn) missing.push("check-in");
  if (!summary?.hasExpectedEnd) missing.push("expected end");

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
  const lines = [
    `HeyTelli Date Card`,
    `Date with: ${firstName(match.name)}`,
    `Time: ${formatDateTime(match.nextDateAt)}`,
    `Location: ${clean(match.nextDateLocation) ?? "Not set"}`,
    `Transport: ${clean(plan?.transportPlan) ?? "Not set"}`,
    `Check-in: ${formatDateTime(plan?.checkInAt)}`,
    `Expected end: ${formatDateTime(plan?.expectedEndAt)}`,
  ];
  const codeWord = clean(plan?.codeWord);
  const circleNote = clean(plan?.circleNote);

  if (codeWord) lines.push(`Code word: ${codeWord}`);
  if (circleNote) lines.push(`Note: ${circleNote}`);
  if (plan?.shareLiveLocation) {
    lines.push("Live location: date-only sharing if I turn it on.");
  }
  lines.push("Private by default. No images included.");

  return lines.join("\n");
}

export function buildSoftExitMessage(
  match: DateSafetyPlanMatch,
  intent: SoftExitIntent,
): string {
  const name = firstName(match.name);
  const location = clean(match.nextDateLocation);
  const codeWord = clean(match.dateSafetyPlan?.codeWord);
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
