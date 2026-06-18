import type {
  FeedbackTimelineEvent as ApiFeedbackTimelineEvent,
  UserFeedbackStatus,
} from "@workspace/api-client-react";

type FeedbackStage = UserFeedbackStatus["stage"];

const FEEDBACK_STAGES = new Set<FeedbackStage>([
  "received",
  "accepted",
  "planned",
  "shipped",
  "not_planned",
  "blocked",
]);

const DEFAULT_STAGE_MESSAGES: Record<FeedbackStage, string> = {
  received: "Saved privately.",
  accepted: "Accepted into the improvement queue.",
  planned: "Planned or in progress.",
  shipped: "Shipped or resolved.",
  not_planned:
    "Not planned right now. If more beta users ask for this, we will reconsider it.",
  blocked: "Saved, but not safe to turn into an engineering task.",
};

export type FeedbackStatus = UserFeedbackStatus & {
  stage: FeedbackStage;
  timeline: ApiFeedbackTimelineEvent[];
  createdAt: string;
  updatedAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return Number.isNaN(new Date(value).getTime()) ? fallback : value;
}

function normalizeStage(value: unknown): FeedbackStage {
  return typeof value === "string" && FEEDBACK_STAGES.has(value as FeedbackStage)
    ? (value as FeedbackStage)
    : "received";
}

function normalizeTimeline(value: unknown): ApiFeedbackTimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    if (!row) return [];
    const createdAt = dateString(row.createdAt);
    if (!createdAt) return [];
    return [
      {
        event: stringValue(row.event) || "feedback_update",
        label: stringValue(row.label) || "Feedback update",
        body: stringValue(row.body) || "Status updated.",
        createdAt,
        agentName: nullableString(row.agentName),
        proof: nullableString(row.proof),
      },
    ];
  });
}

export function normalizeFeedbackStatuses(value: unknown): FeedbackStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const row = record(item);
    if (!row) return [];
    const stage = normalizeStage(row.stage);
    const updatedAt = dateString(row.updatedAt);
    const createdAt = dateString(row.createdAt, updatedAt);
    return [
      {
        ticketId: numberValue(row.ticketId, index + 1),
        stage,
        message: stringValue(row.message) || DEFAULT_STAGE_MESSAGES[stage],
        summary: stringValue(row.summary) || "Feedback received.",
        type: nullableString(row.type),
        surface: nullableString(row.surface),
        signalStatus: (stringValue(row.signalStatus) ||
          "new") as FeedbackStatus["signalStatus"],
        workItemStatus: nullableString(
          row.workItemStatus,
        ) as FeedbackStatus["workItemStatus"],
        workItemId:
          typeof row.workItemId === "number" && Number.isFinite(row.workItemId)
            ? row.workItemId
            : null,
        decisionCategory: nullableString(
          row.decisionCategory,
        ) as FeedbackStatus["decisionCategory"],
        decisionDetails: nullableString(row.decisionDetails),
        frequencyCount:
          typeof row.frequencyCount === "number" &&
          Number.isFinite(row.frequencyCount)
            ? row.frequencyCount
            : null,
        timeline: normalizeTimeline(row.timeline),
        createdAt,
        updatedAt,
      },
    ];
  });
}
