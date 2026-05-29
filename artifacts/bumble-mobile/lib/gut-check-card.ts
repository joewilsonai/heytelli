import { circleLabelsFromPlanValue } from "./circle-card-labels.ts";
import { sanitizeSafetyShareText } from "./safety-share.ts";

export type GutCheckTimelineEvent = {
  id?: number;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  type?: string | null;
  occurredAt?: string | null;
};

export type GutCheckRedFlag = {
  severity?: string | null;
  label?: string | null;
  evidence?: string | null;
  status?: string | null;
};

export type GutCheckGreenFlag = {
  label?: string | null;
  evidence?: string | null;
};

export type GutCheckMatch = {
  name: string;
  tags?: string[] | null;
  vibeTags?: string[] | null;
  overallRead?: string | null;
  notes?: string | null;
  nextDateAt?: string | null;
  nextDateLocation?: string | null;
  dateSafetyPlan?: {
    trustedCircleName?: string | null;
  } | null;
  redFlags?: GutCheckRedFlag[] | null;
  currentRedFlags?: GutCheckRedFlag[] | null;
  historicalRedFlags?: GutCheckRedFlag[] | null;
  greenFlags?: GutCheckGreenFlag[] | null;
  timelineEvents?: GutCheckTimelineEvent[] | null;
  screenshots?: unknown;
  screenshotObjectPath?: unknown;
  transcript?: unknown;
};

export type GutCheckMomentKind =
  | "manual"
  | "pattern"
  | "green-flag"
  | "timeline"
  | "date"
  | "tag"
  | "read";

export type GutCheckMoment = {
  id: string;
  kind: GutCheckMomentKind;
  label: string;
  title: string;
  evidence?: string | null;
  suggestedQuestion: string;
};

export type GutCheckOptions = {
  selectedMoment?: GutCheckMoment | null;
  selectedMoments?: GutCheckMoment[];
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
const MAX_GUT_CHECK_MOMENTS = 8;
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

function safeEvidence(value: string | null | undefined): string | null {
  const text = clean(value);
  if (!text) return null;
  if (/screenshots?\//i.test(text)) return null;
  return text;
}

function uniqueByContent<T extends { title: string; evidence?: string | null }>(
  values: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const key = `${value.title.toLowerCase()}|${value.evidence ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function compactMoments(
  values: Array<GutCheckMoment | null>,
): GutCheckMoment[] {
  return values.filter((moment): moment is GutCheckMoment => moment != null);
}

export function toggleGutCheckMomentId(
  selectedMomentIds: string[],
  momentId: string,
): string[] {
  return selectedMomentIds.includes(momentId)
    ? selectedMomentIds.filter((id) => id !== momentId)
    : [...selectedMomentIds, momentId];
}

function redFlagMoments(match: GutCheckMatch): GutCheckMoment[] {
  const flags = uniqueByContent(
    compactMoments(
      [
        ...(match.currentRedFlags ?? []),
        ...(match.redFlags ?? []),
        ...(match.historicalRedFlags ?? []),
      ].map((flag, index) => {
        const title = clean(flag.label);
        if (!title) return null;
        return {
          id: `red-flag-${index}`,
          kind: "pattern" as const,
          label: "Pattern",
          title,
          evidence: safeEvidence(flag.evidence),
          suggestedQuestion:
            "Does this feel like a real pattern, or am I reading too much into it?",
        } satisfies GutCheckMoment;
      }),
    ),
  );
  return flags.map((moment, index) => ({ ...moment, id: `red-flag-${index}` }));
}

function greenFlagMoments(match: GutCheckMatch): GutCheckMoment[] {
  return uniqueByContent(
    compactMoments(
      (match.greenFlags ?? []).map((flag, index) => {
        const title = clean(flag.label);
        if (!title) return null;
        return {
          id: `green-flag-${index}`,
          kind: "green-flag" as const,
          label: "Green flag",
          title,
          evidence: safeEvidence(flag.evidence),
          suggestedQuestion:
            "Does this feel genuinely good, or is there anything I should slow down and notice?",
        } satisfies GutCheckMoment;
      }),
    ),
  );
}

function timelineMoments(match: GutCheckMatch): GutCheckMoment[] {
  return compactMoments(
    (match.timelineEvents ?? [])
      .filter((event) => {
        const title = clean(event.title);
        return title != null && !EXCLUDED_TIMELINE_TYPES.has(event.type ?? "");
      })
      .slice()
      .sort((a, b) => timelineTime(b) - timelineTime(a))
      .map((event, index) => {
        const title = clean(event.title);
        if (!title) return null;
        return {
          id: `timeline-${event.id ?? index}`,
          kind: "timeline",
          label: "Moment",
          title,
          evidence: safeEvidence(event.summary) ?? safeEvidence(event.body),
          suggestedQuestion:
            "Can you gut check this moment and tell me what you notice?",
        } satisfies GutCheckMoment;
      }),
  );
}

function tagMoments(match: GutCheckMatch): GutCheckMoment[] {
  return [...(match.tags ?? []), ...(match.vibeTags ?? [])]
    .map(clean)
    .filter((tag): tag is string => tag != null)
    .slice(0, 2)
    .map((tag, index) => ({
      id: `tag-${index}`,
      kind: "tag" as const,
      label: "Tag",
      title: tag,
      evidence: null,
      suggestedQuestion:
        "Does this label fit what you are seeing from the outside?",
    }));
}

export function buildGutCheckMoments(match: GutCheckMatch): GutCheckMoment[] {
  const manual: GutCheckMoment = {
    id: "manual-instinct",
    kind: "manual",
    label: "My read",
    title: "Something feels off",
    evidence: "Your gut is enough reason to ask for a second opinion.",
    suggestedQuestion:
      "Can you gut check this with me and help me trust my read?",
  };
  const dateMoment: GutCheckMoment[] =
    clean(match.nextDateAt) || clean(match.nextDateLocation)
      ? [
          {
            id: "date-plan",
            kind: "date",
            label: "Date plan",
            title: "Upcoming date plan",
            evidence: [
              clean(match.nextDateLocation),
              clean(match.nextDateAt) ? formatDateTime(match.nextDateAt) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            suggestedQuestion:
              "Does this date plan feel safe and clear enough from the outside?",
          },
        ]
      : [];
  const readMoment: GutCheckMoment[] = clean(match.overallRead)
    ? [
        {
          id: "latest-read",
          kind: "read",
          label: "Read",
          title: "Latest HeyTelli read",
          evidence: clean(match.overallRead),
          suggestedQuestion:
            "Does this read match what you are seeing from the outside?",
        },
      ]
    : [];

  return [
    manual,
    ...redFlagMoments(match),
    ...greenFlagMoments(match),
    ...timelineMoments(match),
    ...dateMoment,
    ...tagMoments(match),
    ...readMoment,
  ].slice(0, MAX_GUT_CHECK_MOMENTS);
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
  const selectedMoments = (
    options.selectedMoments ??
    (options.selectedMoment ? [options.selectedMoment] : [])
  ).filter((moment): moment is GutCheckMoment => moment != null);
  const note = sanitizeSafetyShareText(options.note);
  const question = sanitizeSafetyShareText(
    clean(options.question) ??
      (selectedMoments.length === 1
        ? selectedMoments[0]?.suggestedQuestion
        : selectedMoments.length > 1
          ? "Can you gut check these together and tell me what you notice?"
          : undefined),
  );
  const lines = ["HeyTelli Gut Check", `About: ${preview.displayName}`];

  if (preview.circleLabel) lines.push(`Circle: ${preview.circleLabel}`);
  if (selectedMoments.length === 1) {
    const selectedMoment = selectedMoments[0]!;
    const title =
      sanitizeSafetyShareText(selectedMoment.title) ?? "Selected item";
    const evidence = sanitizeSafetyShareText(selectedMoment.evidence);
    lines.push("", "Gut check item:", `${selectedMoment.label}: ${title}`);
    if (evidence) {
      lines.push("Why it stood out:", evidence);
    }
  } else if (selectedMoments.length > 1) {
    lines.push("", "Gut check items:");
    for (const moment of selectedMoments) {
      const title = sanitizeSafetyShareText(moment.title) ?? "Selected item";
      const evidence = sanitizeSafetyShareText(moment.evidence);
      lines.push(`${moment.label}: ${title}`);
      if (evidence) {
        lines.push(`Why it stood out: ${evidence}`);
      }
    }
  }
  if (note)
    lines.push(
      "",
      selectedMoments.length > 0 ? "My instinct:" : "What happened:",
      note,
    );
  if (question) {
    lines.push(
      "",
      selectedMoments.length > 0
        ? "What I want from you:"
        : "What I want checked:",
      question,
    );
  }

  if (options.includeDate && preview.hasDateContext) {
    lines.push(
      "",
      "Date context:",
      `Date: ${formatDateTime(match.nextDateAt)}`,
      `Place: ${sanitizeSafetyShareText(match.nextDateLocation) ?? "Not set"}`,
    );
  }

  if (options.includeTimeline && preview.timelineHighlights.length > 0) {
    lines.push("", "Recent context:");
    for (const highlight of preview.timelineHighlights) {
      lines.push(`- ${sanitizeSafetyShareText(highlight) ?? "Recent moment"}`);
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
