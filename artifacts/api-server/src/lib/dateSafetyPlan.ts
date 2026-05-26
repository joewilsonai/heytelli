import type {
  CircleCheckStatus,
  DateSafetyPlan,
  InsertMatchTimelineEvent,
  SafeDateChecklist,
} from "@workspace/db";

type DateSafetyPlanInput = Partial<DateSafetyPlan> &
  Record<string, unknown> & {
    trustedCirclePhone?: unknown;
    trustedCircleEmail?: unknown;
  };

export type DateSafetyPlanPatchPlan = {
  dateSafetyPlan: DateSafetyPlan | null;
  timelineEvent: InsertMatchTimelineEvent | null;
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
  safeDateChecklistReady: boolean;
  circleCheckStatus: CircleCheckStatus | null;
  lastCircleCheckAt: string | null;
  updatedAt: string | null;
};

const CHECKLIST_KEYS: Array<keyof SafeDateChecklist> = [
  "publicPlace",
  "ownTransport",
  "circleHasPlan",
  "profileReviewed",
  "noPrivateLocationPressure",
  "noMoneyOrPhotoPressure",
];

const emptySafeDateChecklist: SafeDateChecklist = {
  publicPlace: false,
  ownTransport: false,
  circleHasPlan: false,
  profileReviewed: false,
  noPrivateLocationPressure: false,
  noMoneyOrPhotoPressure: false,
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || null;
}

function cleanLongText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[ \t]+/g, " ");
  return trimmed || null;
}

function cleanIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanChecklist(input: unknown): SafeDateChecklist {
  const obj =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  return CHECKLIST_KEYS.reduce<SafeDateChecklist>(
    (acc, key) => ({ ...acc, [key]: obj[key] === true }),
    { ...emptySafeDateChecklist },
  );
}

function checklistReady(checklist: SafeDateChecklist): boolean {
  return CHECKLIST_KEYS.every((key) => checklist[key] === true);
}

function cleanCircleCheckStatus(value: unknown): CircleCheckStatus | null {
  return value === "planned" ||
    value === "safe" ||
    value === "needs_help" ||
    value === "completed"
    ? value
    : null;
}

export function normalizeDateSafetyPlan(
  input: unknown,
  observedAt = new Date(),
): DateSafetyPlan | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as DateSafetyPlanInput;

  const plan: DateSafetyPlan = {
    trustedCircleName: cleanText(obj.trustedCircleName),
    transportPlan: cleanText(obj.transportPlan),
    checkInAt: cleanIso(obj.checkInAt),
    expectedEndAt: cleanIso(obj.expectedEndAt),
    codeWord: cleanText(obj.codeWord),
    circleNote: cleanLongText(obj.circleNote),
    shareLiveLocation: obj.shareLiveLocation === true,
    safeDateChecklist: cleanChecklist(obj.safeDateChecklist),
    circleCheckStatus: cleanCircleCheckStatus(obj.circleCheckStatus),
    lastCircleCheckAt: cleanIso(obj.lastCircleCheckAt),
    updatedAt: observedAt.toISOString(),
  };

  const hasAnyValue = [
    plan.trustedCircleName,
    plan.transportPlan,
    plan.checkInAt,
    plan.expectedEndAt,
    plan.codeWord,
    plan.circleNote,
    plan.lastCircleCheckAt,
  ].some(Boolean);

  return hasAnyValue ||
    plan.shareLiveLocation ||
    checklistReady(plan.safeDateChecklist) ||
    plan.circleCheckStatus
    ? plan
    : null;
}

export function summarizeDateSafetyPlanForList(
  input: unknown,
): DateSafetyPlanListStatus {
  if (!input || typeof input !== "object") {
    return {
      hasPlan: false,
      hasTrustedCircle: false,
      hasTransportPlan: false,
      hasCheckIn: false,
      hasExpectedEnd: false,
      hasCodeWord: false,
      hasCircleNote: false,
      shareLiveLocation: false,
      safeDateChecklistReady: false,
      circleCheckStatus: null,
      lastCircleCheckAt: null,
      updatedAt: null,
    };
  }
  const obj = input as DateSafetyPlanInput;
  const trustedCircleName = cleanText(obj.trustedCircleName);
  const transportPlan = cleanText(obj.transportPlan);
  const checkInAt = cleanIso(obj.checkInAt);
  const expectedEndAt = cleanIso(obj.expectedEndAt);
  const codeWord = cleanText(obj.codeWord);
  const circleNote = cleanLongText(obj.circleNote);
  const shareLiveLocation = obj.shareLiveLocation === true;
  const safeDateChecklist = cleanChecklist(obj.safeDateChecklist);
  const circleCheckStatus = cleanCircleCheckStatus(obj.circleCheckStatus);
  const lastCircleCheckAt = cleanIso(obj.lastCircleCheckAt);
  const hasPlan =
    [
      trustedCircleName,
      transportPlan,
      checkInAt,
      expectedEndAt,
      codeWord,
      circleNote,
      lastCircleCheckAt,
    ].some(Boolean) ||
    shareLiveLocation ||
    checklistReady(safeDateChecklist) ||
    Boolean(circleCheckStatus);

  return {
    hasPlan,
    hasTrustedCircle: Boolean(trustedCircleName),
    hasTransportPlan: Boolean(transportPlan),
    hasCheckIn: Boolean(checkInAt),
    hasExpectedEnd: Boolean(expectedEndAt),
    hasCodeWord: Boolean(codeWord),
    hasCircleNote: Boolean(circleNote),
    shareLiveLocation,
    safeDateChecklistReady: checklistReady(safeDateChecklist),
    circleCheckStatus,
    lastCircleCheckAt,
    updatedAt: cleanIso(obj.updatedAt),
  };
}

function comparablePlan(plan: DateSafetyPlan | null) {
  if (!plan) return null;
  return {
    trustedCircleName: plan.trustedCircleName,
    transportPlan: plan.transportPlan,
    checkInAt: plan.checkInAt,
    expectedEndAt: plan.expectedEndAt,
    codeWord: plan.codeWord,
    circleNote: plan.circleNote,
    shareLiveLocation: plan.shareLiveLocation,
    safeDateChecklist: plan.safeDateChecklist,
    circleCheckStatus: plan.circleCheckStatus,
    lastCircleCheckAt: plan.lastCircleCheckAt,
  };
}

function samePlan(
  existingPlan: DateSafetyPlan | null,
  nextPlan: DateSafetyPlan | null,
): boolean {
  return (
    JSON.stringify(comparablePlan(existingPlan)) ===
    JSON.stringify(comparablePlan(nextPlan))
  );
}

function formatCheckIn(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildDateSafetyPlanPatchPlan(input: {
  matchId: number;
  matchName: string;
  existingPlan: unknown;
  nextPlan: unknown;
  observedAt?: Date;
}): DateSafetyPlanPatchPlan {
  const observedAt = input.observedAt ?? new Date();
  const existingPlan = normalizeDateSafetyPlan(input.existingPlan, observedAt);
  const dateSafetyPlan = normalizeDateSafetyPlan(input.nextPlan, observedAt);

  if (samePlan(existingPlan, dateSafetyPlan)) {
    return { dateSafetyPlan, timelineEvent: null };
  }
  if (!dateSafetyPlan) {
    return {
      dateSafetyPlan: null,
      timelineEvent: {
        matchId: input.matchId,
        type: "safety_plan_updated",
        source: "user",
        title: "Date safety plan cleared",
        summary: `${input.matchName}'s date safety plan was cleared.`,
        body: null,
        metadata: {
          hasTrustedCircle: false,
          hasCheckIn: false,
          hasExpectedEnd: false,
          hasCodeWord: false,
          shareLiveLocation: false,
          safeDateChecklistReady: false,
          circleCheckStatus: null,
        },
        occurredAt: observedAt,
      },
    };
  }

  const checkIn = formatCheckIn(dateSafetyPlan.checkInAt);
  const summaryParts = [
    `${input.matchName}'s date safety plan`,
    dateSafetyPlan.trustedCircleName
      ? `with ${dateSafetyPlan.trustedCircleName}`
      : null,
    checkIn ? `check-in ${checkIn}` : null,
  ].filter(Boolean);

  return {
    dateSafetyPlan,
    timelineEvent: {
      matchId: input.matchId,
      type: "safety_plan_updated",
      source: "user",
      title: "Date safety plan saved",
      summary: summaryParts.join(" · "),
      body: null,
      metadata: {
        hasTrustedCircle: Boolean(dateSafetyPlan.trustedCircleName),
        hasCheckIn: Boolean(dateSafetyPlan.checkInAt),
        hasExpectedEnd: Boolean(dateSafetyPlan.expectedEndAt),
        hasCodeWord: Boolean(dateSafetyPlan.codeWord),
        shareLiveLocation: dateSafetyPlan.shareLiveLocation,
        safeDateChecklistReady: checklistReady(
          dateSafetyPlan.safeDateChecklist,
        ),
        circleCheckStatus: dateSafetyPlan.circleCheckStatus,
      },
      occurredAt: observedAt,
    },
  };
}
