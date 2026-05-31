import type {
  ImprovementRunStatus,
  ImprovementRunType,
  ImprovementSignalStatus,
  ImprovementWorkItemStatus,
} from "@workspace/db";

export type FeedbackFollowUpStage =
  | "received"
  | "accepted"
  | "planned"
  | "shipped"
  | "blocked";

export type FeedbackStatusSignal = {
  id: number;
  status: ImprovementSignalStatus;
  sanitizedSummary: string | null;
  sanitizedPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FeedbackStatusWorkItem = {
  id: number;
  signalIds: number[];
  status: ImprovementWorkItemStatus;
  pullRequestNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserFeedbackStatus = {
  ticketId: number;
  stage: FeedbackFollowUpStage;
  message: string;
  summary: string;
  type: string | null;
  surface: string | null;
  signalStatus: ImprovementSignalStatus;
  workItemStatus: ImprovementWorkItemStatus | null;
  workItemId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImprovementHealthSignal = {
  status: ImprovementSignalStatus;
};

export type ImprovementHealthWorkItem = {
  status: ImprovementWorkItemStatus;
  riskTier: string;
  priority: string;
  updatedAt: Date;
};

export type ImprovementHealthRun = {
  runType: ImprovementRunType;
  status: ImprovementRunStatus;
  createdAt: Date;
  completedAt: Date | null;
};

export type ImprovementHealthSnapshot = {
  generatedAt: string;
  signals: Record<string, number>;
  workItems: Record<string, number>;
  riskTiers: Record<string, number>;
  priorities: Record<string, number>;
  runs: Record<string, number>;
  queue: {
    waitingForTriage: number;
    executable: number;
    inProgress: number;
    reviewGated: number;
    needsAttention: number;
  };
  lastRunAt: string | null;
};

function countBy<T>(items: T[], keyFor: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function payloadText(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function feedbackStageFor(
  signal: Pick<FeedbackStatusSignal, "status">,
  workItem: Pick<FeedbackStatusWorkItem, "status"> | null,
): FeedbackFollowUpStage {
  if (signal.status === "blocked" || signal.status === "ignored") {
    return "blocked";
  }
  if (signal.status === "resolved") return "shipped";
  if (!workItem) {
    return signal.status === "new" ? "received" : "accepted";
  }

  switch (workItem.status) {
    case "draft":
    case "issue_created":
    case "researching":
      return "accepted";
    case "planned":
    case "building":
    case "reviewing":
    case "changes_requested":
    case "checks_running":
    case "monitoring":
      return "planned";
    case "merged":
    case "deployed":
    case "closed":
      return "shipped";
    case "rolled_back":
      return "planned";
  }
}

export function feedbackMessageFor(stage: FeedbackFollowUpStage): string {
  switch (stage) {
    case "received":
      return "Saved privately.";
    case "accepted":
      return "Accepted into the improvement queue.";
    case "planned":
      return "Planned or in progress.";
    case "shipped":
      return "Shipped or resolved.";
    case "blocked":
      return "Saved, but not safe to turn into an engineering task.";
  }
}

export function buildUserFeedbackStatuses(
  signals: FeedbackStatusSignal[],
  workItems: FeedbackStatusWorkItem[],
): UserFeedbackStatus[] {
  return signals.map((signal) => {
    const workItem =
      workItems.find((item) => item.signalIds.includes(signal.id)) ?? null;
    const stage = feedbackStageFor(signal, workItem);
    return {
      ticketId: signal.id,
      stage,
      message: feedbackMessageFor(stage),
      summary: signal.sanitizedSummary ?? "Feedback received.",
      type: payloadText(signal.sanitizedPayload, "type"),
      surface: payloadText(signal.sanitizedPayload, "surface"),
      signalStatus: signal.status,
      workItemStatus: workItem?.status ?? null,
      workItemId: workItem?.id ?? null,
      createdAt: signal.createdAt,
      updatedAt: workItem?.updatedAt ?? signal.updatedAt,
    };
  });
}

export function buildImprovementHealthSnapshot(input: {
  signals: ImprovementHealthSignal[];
  workItems: ImprovementHealthWorkItem[];
  runs: ImprovementHealthRun[];
  now?: Date;
}): ImprovementHealthSnapshot {
  const { signals, workItems, runs } = input;
  const lastRun = runs
    .map((run) => run.completedAt ?? run.createdAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    signals: countBy(signals, (signal) => signal.status),
    workItems: countBy(workItems, (item) => item.status),
    riskTiers: countBy(workItems, (item) => item.riskTier),
    priorities: countBy(workItems, (item) => item.priority),
    runs: countBy(runs, (run) => `${run.runType}:${run.status}`),
    queue: {
      waitingForTriage: signals.filter((signal) => signal.status === "new")
        .length,
      executable: workItems.filter((item) => item.status === "planned").length,
      inProgress: workItems.filter((item) =>
        ["building", "checks_running", "monitoring"].includes(item.status),
      ).length,
      reviewGated: workItems.filter((item) =>
        ["reviewing", "changes_requested"].includes(item.status),
      ).length,
      needsAttention: workItems.filter((item) =>
        ["changes_requested", "rolled_back"].includes(item.status),
      ).length,
    },
    lastRunAt: lastRun?.toISOString() ?? null,
  };
}
