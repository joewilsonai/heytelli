import type {
  ImprovementDecisionCategory,
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
  | "not_planned"
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
  decisionCategory: ImprovementDecisionCategory | null;
  decisionDetails: string | null;
  frequencyCount: number;
  decisionReconsiderAfterCount: number;
  pullRequestNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FeedbackTimelineRun = {
  workItemId: number;
  runType: ImprovementRunType;
  agentName: string;
  status: ImprovementRunStatus;
  summary: string;
  createdAt: Date;
  completedAt: Date | null;
};

export type FeedbackTimelineEvent = {
  event: string;
  label: string;
  body: string;
  createdAt: Date;
  agentName: string | null;
  proof: string | null;
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
  decisionCategory: ImprovementDecisionCategory | null;
  decisionDetails: string | null;
  frequencyCount: number | null;
  timeline: FeedbackTimelineEvent[];
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
  decisionCategory: string | null;
  frequencyCount: number;
  decisionReconsiderAfterCount: number;
  updatedAt: Date;
};

export type ImprovementHealthRun = {
  workItemId?: number;
  runType: ImprovementRunType;
  status: ImprovementRunStatus;
  createdAt: Date;
  completedAt: Date | null;
  metadata?: Record<string, unknown>;
};

export type ImprovementControlRoomFeatureCost = {
  estimatedUsd: number;
  actualUsd: number | null;
  rangeLowUsd: number;
  rangeHighUsd: number;
  confidence: "low" | "medium" | "high";
  costPerRequestUsd: number;
  model: string;
  totalTokens: number;
  effort: {
    agentRuns: number;
    reviewerAgents: number;
    traceDurationMs: number;
    ciRuns: number;
    releaseRuns: number;
    retries: number;
  };
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
    reconsiderCandidates: number;
  };
  lastRunAt: string | null;
};

export type ImprovementControlRoomWorkItem = {
  id: number;
  title: string;
  status: ImprovementWorkItemStatus;
  category: string;
  riskTier: string;
  priority: string;
  decisionCategory: string | null;
  decisionDetails: string | null;
  frequencyCount: number;
  decisionReconsiderAfterCount: number;
  reconsiderReady: boolean;
  featureCost: ImprovementControlRoomFeatureCost | null;
  updatedAt: string;
};

export type ImprovementControlRoomRun = {
  runType: ImprovementRunType;
  status: ImprovementRunStatus;
  agentName: string;
  summary: string;
  createdAt: string;
  completedAt: string | null;
};

export type ImprovementControlRoomLane = {
  id: string;
  label: string;
  activeCount: number;
  description: string;
};

export type ImprovementControlRoomSnapshot = {
  generatedAt: string;
  queue: ImprovementHealthSnapshot["queue"];
  agentLanes: ImprovementControlRoomLane[];
  recentWorkItems: ImprovementControlRoomWorkItem[];
  reconsiderCandidates: ImprovementControlRoomWorkItem[];
  recentRuns: ImprovementControlRoomRun[];
  demoScript: string[];
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

const notPlannedDecisionCategories = new Set<ImprovementDecisionCategory>([
  "not_planned",
  "needs_more_signal",
  "not_reproducible",
  "privacy_or_safety",
  "out_of_scope",
  "duplicate",
  "superseded",
]);

function isNotPlannedDecision(
  category: ImprovementDecisionCategory | null | undefined,
): boolean {
  return category != null && notPlannedDecisionCategories.has(category);
}

function isReconsiderCandidate(
  item: Pick<
    ImprovementHealthWorkItem,
    "decisionCategory" | "frequencyCount" | "decisionReconsiderAfterCount"
  >,
): boolean {
  return (
    isNotPlannedDecision(item.decisionCategory as ImprovementDecisionCategory | null) &&
    item.frequencyCount >= item.decisionReconsiderAfterCount
  );
}

function timelineEvent(input: FeedbackTimelineEvent): FeedbackTimelineEvent {
  return input;
}

function runEventLabel(runType: ImprovementRunType): string {
  switch (runType) {
    case "triage":
      return "Triage agent";
    case "research":
      return "Planning agent";
    case "implementation":
      return "Builder agent";
    case "review":
      return "Reviewer agents";
    case "merge":
      return "Merge automation";
    case "deploy":
      return "Release automation";
    case "monitor":
      return "Lifecycle monitor";
    case "rollback":
      return "Rollback automation";
  }
}

function runProof(run: FeedbackTimelineRun): string | null {
  if (run.status === "succeeded") {
    return `${runEventLabel(run.runType)} completed.`;
  }
  if (run.status === "failed") return `${runEventLabel(run.runType)} needs repair.`;
  if (run.status === "blocked") return `${runEventLabel(run.runType)} blocked.`;
  return null;
}

function finalResolutionEvent(
  stage: FeedbackFollowUpStage,
  workItem: FeedbackStatusWorkItem,
): FeedbackTimelineEvent | null {
  if (stage === "not_planned") {
    return timelineEvent({
      event: "not_planned",
      label: "Not planned right now",
      body:
        workItem.decisionDetails?.trim() ||
        "The request is not planned right now, but demand is still tracked.",
      createdAt: workItem.updatedAt,
      agentName: null,
      proof: "Decision stored for reconsideration.",
    });
  }
  if (stage === "shipped") {
    const alreadyAvailable = workItem.decisionCategory === "already_available";
    return timelineEvent({
      event: alreadyAvailable ? "already_available" : "shipped",
      label: alreadyAvailable ? "Already available" : "Shipped",
      body:
        workItem.decisionDetails?.trim() ||
        (alreadyAvailable
          ? "An agent verified this is already in the app."
          : "The change is resolved in the product."),
      createdAt: workItem.updatedAt,
      agentName: null,
      proof: alreadyAvailable
        ? "Existing implementation verified."
        : "Beta release proof recorded.",
    });
  }
  if (stage === "planned") {
    return timelineEvent({
      event: "planned",
      label: "Planned for agents",
      body: "The request is in the agent work queue or currently being worked.",
      createdAt: workItem.updatedAt,
      agentName: null,
      proof: "Work item is active in the improvement queue.",
    });
  }
  return null;
}

export function buildFeedbackTimeline(
  signal: FeedbackStatusSignal,
  workItem: FeedbackStatusWorkItem | null,
  runs: FeedbackTimelineRun[] = [],
  stage: FeedbackFollowUpStage = feedbackStageFor(signal, workItem),
): FeedbackTimelineEvent[] {
  const timeline: FeedbackTimelineEvent[] = [
    timelineEvent({
      event: "feedback_received",
      label: "Feedback received",
      body: "Saved privately in HeyTelli.",
      createdAt: signal.createdAt,
      agentName: null,
      proof: "Private signal stored.",
    }),
  ];

  if (signal.status === "blocked" || signal.status === "ignored") {
    timeline.push(
      timelineEvent({
        event: "privacy_blocked",
        label: "Privacy gate",
        body: "This stayed private because it was not safe to turn into agent work.",
        createdAt: signal.updatedAt,
        agentName: "heytelli-triage-worker",
        proof: "Sanitizer blocked repo-visible handoff.",
      }),
    );
    return timeline;
  }

  if (!workItem) {
    if (signal.status !== "new") {
      timeline.push(
        timelineEvent({
          event: "feedback_triaged",
          label: "Triaged",
          body: "Accepted into the private improvement queue.",
          createdAt: signal.updatedAt,
          agentName: "heytelli-triage-worker",
          proof: "Signal status advanced.",
        }),
      );
    }
    return timeline;
  }

  timeline.push(
    timelineEvent({
      event: "feedback_grouped",
      label: "Grouped by demand",
      body:
        workItem.frequencyCount > 1
          ? `Grouped with ${workItem.frequencyCount} similar beta request${workItem.frequencyCount === 1 ? "" : "s"}.`
          : "Accepted as a trackable improvement work item.",
      createdAt: workItem.createdAt,
      agentName: "heytelli-triage-worker",
      proof: "Work item fingerprint matched.",
    }),
  );

  for (const run of runs
    .filter((item) => item.workItemId === workItem.id)
    .sort(
      (a, b) =>
        (a.completedAt ?? a.createdAt).getTime() -
        (b.completedAt ?? b.createdAt).getTime(),
    )) {
    timeline.push(
      timelineEvent({
        event: `agent_${run.runType}`,
        label: runEventLabel(run.runType),
        body: run.summary,
        createdAt: run.completedAt ?? run.createdAt,
        agentName: run.agentName,
        proof: runProof(run),
      }),
    );
  }

  const finalEvent = finalResolutionEvent(stage, workItem);
  if (finalEvent) timeline.push(finalEvent);

  return timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function feedbackStageFor(
  signal: Pick<FeedbackStatusSignal, "status">,
  workItem: Pick<FeedbackStatusWorkItem, "status" | "decisionCategory"> | null,
): FeedbackFollowUpStage {
  if (signal.status === "blocked" || signal.status === "ignored") {
    return "blocked";
  }
  if (workItem?.status === "closed" && isNotPlannedDecision(workItem.decisionCategory)) {
    return "not_planned";
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

export function feedbackMessageFor(
  stage: FeedbackFollowUpStage,
  workItem?: Pick<
    FeedbackStatusWorkItem,
    "decisionCategory" | "decisionDetails" | "frequencyCount" | "decisionReconsiderAfterCount"
  > | null,
): string {
  switch (stage) {
    case "received":
      return "Saved privately.";
    case "accepted":
      return "Accepted into the improvement queue.";
    case "planned":
      return "Planned or in progress.";
    case "shipped":
      if (workItem?.decisionCategory === "already_available") {
        return workItem.decisionDetails
          ? `Already available: ${workItem.decisionDetails}`
          : "Already available in the current app.";
      }
      return "Shipped or resolved.";
    case "not_planned": {
      const reason = workItem?.decisionDetails?.trim()
        ? ` ${workItem.decisionDetails.trim()}`
        : "";
      const reconsider =
        workItem &&
        workItem.frequencyCount < workItem.decisionReconsiderAfterCount
          ? " If more beta users ask for this, we will reconsider it."
          : " Enough beta users have asked that this should be reconsidered.";
      return `Not planned right now.${reason}${reconsider}`;
    }
    case "blocked":
      return "Saved, but not safe to turn into an engineering task.";
  }
}

export function buildUserFeedbackStatuses(
  signals: FeedbackStatusSignal[],
  workItems: FeedbackStatusWorkItem[],
  runs: FeedbackTimelineRun[] = [],
): UserFeedbackStatus[] {
  return signals.map((signal) => {
    const workItem =
      workItems.find((item) => item.signalIds.includes(signal.id)) ?? null;
    const stage = feedbackStageFor(signal, workItem);
    const timeline = buildFeedbackTimeline(signal, workItem, runs, stage);
    return {
      ticketId: signal.id,
      stage,
      message: feedbackMessageFor(stage, workItem),
      summary: signal.sanitizedSummary ?? "Feedback received.",
      type: payloadText(signal.sanitizedPayload, "type"),
      surface: payloadText(signal.sanitizedPayload, "surface"),
      signalStatus: signal.status,
      workItemStatus: workItem?.status ?? null,
      workItemId: workItem?.id ?? null,
      decisionCategory: workItem?.decisionCategory ?? null,
      decisionDetails: workItem?.decisionDetails ?? null,
      frequencyCount: workItem?.frequencyCount ?? null,
      timeline,
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
      executable: workItems.filter(
        (item) => item.status === "planned" && item.riskTier !== "no_auto_merge",
      ).length,
      inProgress: workItems.filter((item) =>
        ["building", "checks_running", "monitoring"].includes(item.status),
      ).length,
      reviewGated: workItems.filter((item) =>
        ["reviewing", "changes_requested"].includes(item.status),
      ).length,
      needsAttention: workItems.filter((item) =>
        ["changes_requested", "rolled_back"].includes(item.status),
      ).length,
      reconsiderCandidates: workItems.filter(isReconsiderCandidate).length,
    },
    lastRunAt: lastRun?.toISOString() ?? null,
  };
}

function laneCount(
  workItems: Array<Pick<ImprovementHealthWorkItem, "status">>,
  statuses: ImprovementWorkItemStatus[],
): number {
  return workItems.filter((item) => statuses.includes(item.status)).length;
}

function money(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Number(parsed.toFixed(6))
    : null;
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function costConfidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" ? value : "low";
}

function costObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseFeatureCost(
  value: unknown,
): ImprovementControlRoomFeatureCost | null {
  const raw = costObject(value);
  if (!raw) return null;
  const estimatedUsd = money(raw.estimatedUsd);
  if (estimatedUsd == null) return null;
  const effort = costObject(raw.effort);
  return {
    estimatedUsd,
    actualUsd: money(raw.actualUsd),
    rangeLowUsd: money(raw.rangeLowUsd) ?? estimatedUsd,
    rangeHighUsd: money(raw.rangeHighUsd) ?? estimatedUsd,
    confidence: costConfidence(raw.confidence),
    costPerRequestUsd: money(raw.costPerRequestUsd) ?? estimatedUsd,
    model: typeof raw.model === "string" ? raw.model : "unknown",
    totalTokens: integer(raw.totalTokens),
    effort: {
      agentRuns: integer(effort?.agentRuns),
      reviewerAgents: integer(effort?.reviewerAgents),
      traceDurationMs: integer(effort?.traceDurationMs),
      ciRuns: integer(effort?.ciRuns),
      releaseRuns: integer(effort?.releaseRuns),
      retries: integer(effort?.retries),
    },
  };
}

function featureCostByWorkItem(
  runs: Array<ImprovementHealthRun>,
): Map<number, ImprovementControlRoomFeatureCost> {
  const byWorkItem = new Map<number, ImprovementControlRoomFeatureCost>();
  for (const run of [...runs].sort(
    (a, b) =>
      (a.completedAt ?? a.createdAt).getTime() -
      (b.completedAt ?? b.createdAt).getTime(),
  )) {
    if (!run.workItemId) continue;
    const metadata = run.metadata ?? {};
    const actual = parseFeatureCost(metadata.featureCostActual);
    const estimate = parseFeatureCost(metadata.featureCostEstimate);
    const next = actual ?? estimate;
    if (next) byWorkItem.set(run.workItemId, next);
  }
  return byWorkItem;
}

function controlRoomWorkItem(
  item: ImprovementHealthWorkItem & {
    id: number;
    title: string;
    category: string;
    decisionDetails: string | null;
  },
  featureCosts: Map<number, ImprovementControlRoomFeatureCost>,
): ImprovementControlRoomWorkItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    category: item.category,
    riskTier: item.riskTier,
    priority: item.priority,
    decisionCategory: item.decisionCategory,
    decisionDetails: item.decisionDetails,
    frequencyCount: item.frequencyCount,
    decisionReconsiderAfterCount: item.decisionReconsiderAfterCount,
    reconsiderReady: isReconsiderCandidate(item),
    featureCost: featureCosts.get(item.id) ?? null,
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function buildImprovementControlRoomSnapshot(input: {
  signals: ImprovementHealthSignal[];
  workItems: Array<
    ImprovementHealthWorkItem & {
      id: number;
      title: string;
      category: string;
      decisionDetails: string | null;
    }
  >;
  runs: Array<ImprovementHealthRun & { agentName: string; summary: string }>;
  now?: Date;
}): ImprovementControlRoomSnapshot {
  const health = buildImprovementHealthSnapshot(input);
  const featureCosts = featureCostByWorkItem(input.runs);
  const recentWorkItems = [...input.workItems]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8)
    .map((item) => controlRoomWorkItem(item, featureCosts));
  return {
    generatedAt: health.generatedAt,
    queue: health.queue,
    agentLanes: [
      {
        id: "triage",
        label: "Triage",
        activeCount: health.queue.waitingForTriage,
        description: "Sanitizes feedback, blocks private context, and groups demand.",
      },
      {
        id: "planner",
        label: "Planning",
        activeCount: laneCount(input.workItems, ["issue_created", "researching"]),
        description: "Turns safe requests into PR-sized agent plans.",
      },
      {
        id: "builder",
        label: "Builder",
        activeCount: input.workItems.filter(
          (item) =>
            ["planned", "building", "checks_running"].includes(item.status) &&
            item.riskTier !== "no_auto_merge",
        ).length,
        description: "Implements scoped changes in generated worktrees.",
      },
      {
        id: "review",
        label: "Review",
        activeCount: laneCount(input.workItems, ["reviewing", "changes_requested"]),
        description: "Runs code, product, privacy, safety, and release review lanes.",
      },
      {
        id: "release",
        label: "Release",
        activeCount: laneCount(input.workItems, ["merged", "deployed", "monitoring"]),
        description: "Confirms merge, deploy, TestFlight, and user-facing proof.",
      },
    ],
    recentWorkItems,
    reconsiderCandidates: recentWorkItems.filter((item) => item.reconsiderReady),
    recentRuns: [...input.runs]
      .sort(
        (a, b) =>
          (b.completedAt ?? b.createdAt).getTime() -
          (a.completedAt ?? a.createdAt).getTime(),
      )
      .slice(0, 10)
      .map((run) => ({
        runType: run.runType,
        status: run.status,
        agentName: run.agentName,
        summary: run.summary,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    demoScript: [
      "A beta user submits private feedback in the app.",
      "The triage agent sanitizes it, groups duplicate demand, and opens only safe work.",
      "Planner, builder, reviewer, and release agents move the item through proof-backed states.",
      "The user sees shipped, already available, not planned, or needs more signal with a reason.",
    ],
  };
}
