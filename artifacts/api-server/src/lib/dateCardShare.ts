import type {
  DateCardPayload,
  InsertDateCard,
  InsertMatchTimelineEvent,
} from "@workspace/db";
import { normalizeDateSafetyPlan } from "./dateSafetyPlan";

type DateLike = Date | string | null | undefined;

export type DateCardSharePersistence = {
  dateCard: InsertDateCard;
  timelineEvent: InsertMatchTimelineEvent;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || null;
}

function firstName(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "Date";
  return text.split(/\s+/)[0] ?? text;
}

function looksLikeFullName(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 &&
    words.every((word) => /^[A-Z]/.test(word) || /^[A-Z][.'-]/.test(word))
  );
}

function circleLabels(value: string | null | undefined): string[] {
  const labels =
    cleanText(value)
      ?.split(",")
      .map((label) => {
        const trimmed = cleanText(label);
        if (!trimmed) return null;
        return looksLikeFullName(trimmed) ? firstName(trimmed) : trimmed;
      })
      .filter((label): label is string => label != null) ?? [];

  return Array.from(new Set(labels)).slice(0, 3);
}

function iso(value: DateLike): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildPayload(input: {
  matchName: string;
  nextDateAt: DateLike;
  nextDateLocation: string | null | undefined;
  plan: NonNullable<ReturnType<typeof normalizeDateSafetyPlan>>;
}): DateCardPayload {
  return {
    matchFirstName: firstName(input.matchName),
    dateTime: iso(input.nextDateAt),
    hasVenue: Boolean(cleanText(input.nextDateLocation)),
    hasTransportPlan: Boolean(input.plan.transportPlan),
    hasCheckIn: Boolean(input.plan.checkInAt),
    hasExpectedEnd: Boolean(input.plan.expectedEndAt),
    trustedCircleLabels: circleLabels(input.plan.trustedCircleName),
    includesCodeWord: Boolean(input.plan.codeWord),
    includesCircleNote: Boolean(input.plan.circleNote),
    liveLocationIntent: input.plan.shareLiveLocation,
  };
}

export function buildDateCardSharePersistence(input: {
  userId: number;
  matchId: number;
  matchName: string;
  nextDateAt: DateLike;
  nextDateLocation: string | null | undefined;
  existingPlan: unknown;
  nextPlan: unknown;
  observedAt?: Date;
}): DateCardSharePersistence | null {
  const observedAt = input.observedAt ?? new Date();
  const existingPlan = normalizeDateSafetyPlan(input.existingPlan, observedAt);
  const nextPlan = normalizeDateSafetyPlan(input.nextPlan, observedAt);

  if (
    !nextPlan ||
    nextPlan.dateModeStatus !== "date_card_sent" ||
    existingPlan?.dateModeStatus === "date_card_sent"
  ) {
    return null;
  }

  const payload = buildPayload({
    matchName: input.matchName,
    nextDateAt: input.nextDateAt,
    nextDateLocation: input.nextDateLocation,
    plan: nextPlan,
  });

  return {
    dateCard: {
      userId: input.userId,
      matchId: input.matchId,
      payload,
      state: "sent",
      sharedAt: observedAt,
    },
    timelineEvent: {
      matchId: input.matchId,
      type: "date_card_shared",
      source: "user",
      title: "Date Card shared",
      summary: `${payload.matchFirstName}'s Date Card was shared with ${payload.trustedCircleLabels.length || 1} circle contact${payload.trustedCircleLabels.length === 1 ? "" : "s"}.`,
      body: null,
      metadata: {
        matchFirstName: payload.matchFirstName,
        dateTime: payload.dateTime,
        hasVenue: payload.hasVenue,
        hasTransportPlan: payload.hasTransportPlan,
        hasCheckIn: payload.hasCheckIn,
        hasExpectedEnd: payload.hasExpectedEnd,
        trustedCircleCount: payload.trustedCircleLabels.length,
        includesCodeWord: payload.includesCodeWord,
        includesCircleNote: payload.includesCircleNote,
        liveLocationIntent: payload.liveLocationIntent,
      },
      occurredAt: observedAt,
    },
  };
}
