import { circleLabelsFromPlanValue } from "./circle-card-labels.ts";

export type GutCheckTimelineEvent = {
  id?: number;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  type?: string | null;
  occurredAt?: string | null;
};

export type GutCheckMatch = {
  name: string;
  notes?: string | null;
  nextDateAt?: string | null;
  nextDateLocation?: string | null;
  dateSafetyPlan?: {
    trustedCircleName?: string | null;
  } | null;
  timelineEvents?: GutCheckTimelineEvent[] | null;
  screenshots?: unknown;
  screenshotObjectPath?: unknown;
  transcript?: unknown;
};

export type GutCheckOptions = {
  note?: string;
  question?: string;
  includeDate?: boolean;
  includeTimeline?: boolean;
  maskName?: boolean;
};

export type GutCheckContextPreview = {
  displayName: string;
  circleLabel: string | null;
  hasDateContext: boolean;
  timelineHighlights: string[];
};

const MAX_TIMELINE_HIGHLIGHTS = 3;
const EXCLUDED_TIMELINE_TYPES = new Set(["screenshot_import"]);

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Someone";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timelineTime(event: GutCheckTimelineEvent): number {
  const time = event.occurredAt ? new Date(event.occurredAt).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function safeTimelineHighlights(
  events: GutCheckTimelineEvent[] | null | undefined,
): string[] {
  return (events ?? [])
    .filter((event) => {
      const title = clean(event.title);
      return title != null && !EXCLUDED_TIMELINE_TYPES.has(event.type ?? "");
    })
    .slice()
    .sort((a, b) => timelineTime(b) - timelineTime(a))
    .map((event) => clean(event.title))
    .filter((title): title is string => title != null)
    .slice(0, MAX_TIMELINE_HIGHLIGHTS);
}

export function getGutCheckContextPreview(
  match: GutCheckMatch,
  options: Pick<GutCheckOptions, "maskName"> = {},
): GutCheckContextPreview {
  const circle = circleLabelsFromPlanValue(
    match.dateSafetyPlan?.trustedCircleName,
  );
  return {
    displayName: options.maskName ? "Someone" : firstName(match.name),
    circleLabel: circle.length > 0 ? circle.join(", ") : null,
    hasDateContext: Boolean(
      clean(match.nextDateAt) || clean(match.nextDateLocation),
    ),
    timelineHighlights: safeTimelineHighlights(match.timelineEvents),
  };
}

export function buildGutCheckMessage(
  match: GutCheckMatch,
  options: GutCheckOptions = {},
): string {
  const preview = getGutCheckContextPreview(match, {
    maskName: options.maskName,
  });
  const note = clean(options.note);
  const question = clean(options.question);
  const lines = ["HeyTelli Gut Check", `About: ${preview.displayName}`];

  if (preview.circleLabel) lines.push(`Circle: ${preview.circleLabel}`);
  if (note) lines.push("", "What happened:", note);
  if (question) lines.push("", "What I want checked:", question);

  if (options.includeDate && preview.hasDateContext) {
    lines.push(
      "",
      "Date context:",
      `Date: ${formatDateTime(match.nextDateAt)}`,
      `Place: ${clean(match.nextDateLocation) ?? "Not set"}`,
    );
  }

  if (options.includeTimeline && preview.timelineHighlights.length > 0) {
    lines.push("", "Recent context:");
    for (const highlight of preview.timelineHighlights) {
      lines.push(`- ${highlight}`);
    }
  }

  lines.push(
    "",
    "No screenshots, transcripts, phone numbers, or photos included.",
  );

  return lines.join("\n");
}

export function buildGutCheckNoteAppend({
  note,
  sharedAt = new Date(),
}: {
  note: string;
  sharedAt?: Date;
}): string {
  return [
    "[Circle Note - Gut Check]",
    `Shared at: ${sharedAt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`,
    clean(note) ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}
