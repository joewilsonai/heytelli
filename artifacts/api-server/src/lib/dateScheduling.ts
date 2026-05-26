import type { InsertMatchTimelineEvent } from "@workspace/db";

type DateLike = Date | string | null | undefined;

export type DateSchedulePatchPlan = {
  clearLastDateBrief: boolean;
  timelineEvent: InsertMatchTimelineEvent | null;
};

type ExistingDateDetails = {
  nextDateLocation: string | null | undefined;
  nextDateOutfit: string | null | undefined;
};

function validIso(input: DateLike): string | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function sameInstant(a: DateLike, b: DateLike): boolean {
  return validIso(a) === validIso(b);
}

function compact(parts: Array<string | null | undefined>): string[] {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

export function buildDateSchedulePatchPlan(input: {
  matchId: number;
  matchName: string;
  existingNextDateAt: DateLike;
  existingNextDateLocation?: string | null;
  existingNextDateOutfit?: string | null;
  nextDateAt: DateLike;
  nextDateLocation: string | null | undefined;
  nextDateOutfit: string | null | undefined;
}): DateSchedulePatchPlan {
  const nextDateAt = validIso(input.nextDateAt);
  if (!nextDateAt) {
    return { clearLastDateBrief: false, timelineEvent: null };
  }

  const location = input.nextDateLocation?.trim() || null;
  const outfit = input.nextDateOutfit?.trim() || null;
  const changed =
    !sameInstant(input.existingNextDateAt, input.nextDateAt) ||
    dateDetailsChanged(
      {
        nextDateLocation: input.existingNextDateLocation,
        nextDateOutfit: input.existingNextDateOutfit,
      },
      {
        nextDateLocation: location,
        nextDateOutfit: outfit,
      },
    );
  if (!changed) {
    return { clearLastDateBrief: false, timelineEvent: null };
  }
  const scheduledFor = new Date(nextDateAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return {
    clearLastDateBrief: true,
    timelineEvent: {
      matchId: input.matchId,
      type: "date_scheduled",
      source: "user",
      title: input.existingNextDateAt ? "Date updated" : "Date scheduled",
      summary: compact([
        `${input.matchName} · ${scheduledFor}`,
        location ? `at ${location}` : null,
      ]).join(" "),
      body: null,
      metadata: {
        nextDateAt,
        location,
        outfit,
      },
    },
  };
}

function normalizeDetail(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function dateDetailsChanged(
  existing: ExistingDateDetails,
  next: ExistingDateDetails,
): boolean {
  return (
    normalizeDetail(existing.nextDateLocation) !==
      normalizeDetail(next.nextDateLocation) ||
    normalizeDetail(existing.nextDateOutfit) !==
      normalizeDetail(next.nextDateOutfit)
  );
}
