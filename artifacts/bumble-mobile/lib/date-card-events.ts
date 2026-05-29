import { circleLabelsFromPlanValue } from "./circle-card-labels.ts";
import type { SafeDateChecklist } from "./date-safety-plan.ts";

export type LocalDateCardEventType = "date_card_shared";

export type LocalDateCardEventMetadata = {
  hasCheckIn: boolean;
  hasExpectedEnd: boolean;
  safeDateChecklistReady: boolean;
  circleContactCount: number;
  shareLiveLocation: boolean;
};

export type LocalDateCardEvent = {
  type: LocalDateCardEventType;
  clientDateId: string;
  idempotencyKey: string;
  occurredAt: string;
  metadata: LocalDateCardEventMetadata;
};

export type DateCardEventMatch = {
  nextDateAt?: string | null;
  dateSafetyPlan?: {
    trustedCircleName?: string | null;
    checkInAt?: string | null;
    expectedEndAt?: string | null;
    shareLiveLocation?: boolean | null;
    safeDateChecklist?: Partial<SafeDateChecklist> | null;
  } | null;
};

const DATE_CARD_CHECKLIST_KEYS: Array<keyof SafeDateChecklist> = [
  "publicPlace",
  "ownTransport",
  "profileReviewed",
  "noPrivateLocationPressure",
  "noMoneyOrPhotoPressure",
];

function isoSegment(value: string | null | undefined): string {
  if (!value) return "unset";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unset" : date.toISOString();
}

function dateCardChecklistReady(
  checklist: Partial<SafeDateChecklist> | null | undefined,
): boolean {
  return DATE_CARD_CHECKLIST_KEYS.every((key) => checklist?.[key] === true);
}

function buildClientDateId(match: DateCardEventMatch): string {
  const plan = match.dateSafetyPlan;
  return [
    "date",
    isoSegment(match.nextDateAt),
    isoSegment(plan?.checkInAt),
    isoSegment(plan?.expectedEndAt),
  ].join(":");
}

export function buildLocalDateCardShareEvent(
  match: DateCardEventMatch,
  occurredAt = new Date(),
): LocalDateCardEvent {
  const plan = match.dateSafetyPlan;
  const clientDateId = buildClientDateId(match);

  return {
    type: "date_card_shared",
    clientDateId,
    idempotencyKey: `${clientDateId}:date_card_shared`,
    occurredAt: occurredAt.toISOString(),
    metadata: {
      hasCheckIn: Boolean(isoSegment(plan?.checkInAt) !== "unset"),
      hasExpectedEnd: Boolean(isoSegment(plan?.expectedEndAt) !== "unset"),
      safeDateChecklistReady: dateCardChecklistReady(plan?.safeDateChecklist),
      circleContactCount: circleLabelsFromPlanValue(plan?.trustedCircleName)
        .length,
      shareLiveLocation: plan?.shareLiveLocation === true,
    },
  };
}

export function upsertLocalDateCardEvent(
  events: LocalDateCardEvent[],
  nextEvent: LocalDateCardEvent,
): LocalDateCardEvent[] {
  if (
    events.some((event) => event.idempotencyKey === nextEvent.idempotencyKey)
  ) {
    return events;
  }
  return [...events, nextEvent].slice(-20);
}
