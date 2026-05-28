import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import type {
  ImprovementCategory,
  InsertImprovementWorkItem,
  ImprovementPriority,
  ImprovementPrivacyRisk,
  ImprovementRiskTier,
  ImprovementRunType,
  ImprovementWorkItemStatus,
} from "@workspace/db";
import type { GithubIssueDraft } from "@workspace/api-server/src/lib/improvementPipeline";
import {
  addIssueLabels,
  commentOnIssue,
  createGitHubIssue,
  findIssueCommentByMarker,
  githubTokenFromEnv,
  listAgentReadyIssues,
  removeIssueLabels,
  type GitHubIssueSummary,
} from "./github";
import {
  buildSwarmPlan,
  issueLabelsAllowSwarmPlanning,
  normalizeLabels,
  type SwarmAgentRole,
  type SwarmPlan,
} from "./swarmPlan";

export type SwarmWorkItemCandidate = {
  id: number;
  title: string;
  summary: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  privacyRisk?: ImprovementPrivacyRisk;
  fingerprint?: string | null;
  signalIds?: number[] | null;
  impactScore?: number | null;
  confidenceScore?: number | null;
  frequencyCount?: number | null;
  status: ImprovementWorkItemStatus;
  githubIssueUrl: string | null;
  githubIssueNumber: number | null;
};

export type PlannedSwarmWorkItem = {
  status: "planned";
  workItemId: number;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  workItemTitle: string;
  summary: string;
  labels: string[];
  plan: SwarmPlan;
};

export type SkippedSwarmWorkItem = {
  status: "skipped";
  workItemId: number;
  issueNumber: number | null;
  reason:
    | "missing-github-issue-number"
    | "issue-not-open"
    | "issue-labels-not-agent-ready";
  labels: string[];
};

export type SwarmBreakdownChild = InsertImprovementWorkItem & {
  fingerprint: string;
  title: string;
  summary: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  impactScore: number;
  confidenceScore: number;
  frequencyCount: number;
  signalIds: number[];
  status: "draft";
  githubIssueDraft: GithubIssueDraft;
};

export type BreakdownSwarmWorkItem = {
  status: "needs-breakdown";
  workItemId: number;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  workItemTitle: string;
  summary: string;
  labels: string[];
  reason: string;
  children: SwarmBreakdownChild[];
};

export type SwarmWorkItemPlanResult =
  | PlannedSwarmWorkItem
  | BreakdownSwarmWorkItem
  | SkippedSwarmWorkItem;

export type SwarmRunnerOptions = {
  dryRun: boolean;
  owner: string;
  repo: string;
  token: string | null;
  githubApiUrl?: string;
  limit: number;
  agentName: string;
  commentOnIssues: boolean;
  consumeAgentReadyLabel: boolean;
};

export type SwarmRunCounts = {
  read: number;
  planned: number;
  skipped: number;
  failed: number;
  commentsCreated: number;
  agentReadyLabelsRemoved: number;
  swarmLabelsAdded: number;
  breakdownsCreated: number;
  childIssuesCreated: number;
  dbUpdated: number;
  dryRun: boolean;
};

const DEFAULT_LIMIT = 10;
const MAX_BREAKDOWN_CHILDREN = 5;
const BREAKDOWN_LABELS = new Set([
  "needs-breakdown",
  "scope:large",
  "multi-pr",
  "multi-pr-needed",
]);
const CHILD_LABEL_BLOCKLIST = new Set([
  "needs-breakdown",
  "scope:large",
  "multi-pr",
  "multi-pr-needed",
  "contains-private-context",
  "needs-more-signal",
  "swarm-blocked",
  "swarm-done",
  "swarm-active",
  "swarm-planned",
  "swarm-running",
  "wontfix",
]);

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function numericEnv(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function argValue(argv: string[], flag: string): string | null {
  const eqPrefix = `${flag}=`;
  const withEquals = argv.find((arg) => arg.startsWith(eqPrefix));
  if (withEquals) return withEquals.slice(eqPrefix.length);
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1] ?? null;
  return null;
}

function numericArg(
  argv: string[],
  flag: string,
  envValue: string | undefined,
  defaultValue: number,
): number {
  return numericEnv(argValue(argv, flag) ?? envValue, defaultValue);
}

export function parseSwarmArgs(
  argv: string[],
  env = process.env,
): SwarmRunnerOptions {
  const dryRun =
    argv.includes("--live") || argv.includes("--no-dry-run")
      ? false
      : argv.includes("--dry-run")
        ? true
        : envFlag(env.IMPROVEMENT_SWARM_DRY_RUN, true);

  return {
    dryRun,
    owner: argValue(argv, "--owner") || env.GITHUB_OWNER || "joewilsonai",
    repo: argValue(argv, "--repo") || env.GITHUB_REPO || "heytelli",
    token: githubTokenFromEnv(env),
    githubApiUrl: argValue(argv, "--github-api-url") || env.GITHUB_API_URL,
    limit: numericArg(
      argv,
      "--limit",
      env.IMPROVEMENT_SWARM_LIMIT,
      DEFAULT_LIMIT,
    ),
    agentName:
      argValue(argv, "--agent-name") ||
      env.IMPROVEMENT_SWARM_AGENT_NAME ||
      "heytelli-swarm-runner",
    commentOnIssues: !argv.includes("--no-comment"),
    consumeAgentReadyLabel: !argv.includes("--keep-agent-ready"),
  };
}

export function roleToRunType(role: SwarmAgentRole): ImprovementRunType {
  if (role === "researcher") return "research";
  if (role === "builder") return "implementation";
  return "review";
}

function labelSet(labels: string[]): Set<string> {
  return new Set(labels.map((label) => label.trim().toLowerCase()));
}

function cleanTask(value: string): string | null {
  const cleaned = value
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  return cleaned.length >= 12 ? cleaned : null;
}

function sentenceCase(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return cleaned;
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function childTitlePrefix(workItem: SwarmWorkItemCandidate): string {
  const withoutFeedback = workItem.title.replace(/^feedback:\s*/i, "").trim();
  const beforeNeeds = withoutFeedback.replace(/\s+needs?\b.*$/i, "").trim();
  return sentenceCase(beforeNeeds || withoutFeedback || "Improvement");
}

function childTitle(prefix: string, task: string): string {
  const maxLength = 96;
  const title = `${prefix}: ${sentenceCase(task)}`;
  return title.length <= maxLength
    ? title
    : `${title.slice(0, maxLength - 3)}...`;
}

function splitExplicitTasks(summary: string): string[] {
  const lines = summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletTasks = lines
    .filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line))
    .map((line) => cleanTask(line))
    .filter((line): line is string => line != null);
  if (bulletTasks.length >= 2) {
    return bulletTasks.slice(0, MAX_BREAKDOWN_CHILDREN);
  }

  const semicolonTasks = summary
    .split(/\s*;\s*/)
    .map((part) => cleanTask(part))
    .filter((part): part is string => part != null);
  if (semicolonTasks.length >= 3) {
    return semicolonTasks.slice(0, MAX_BREAKDOWN_CHILDREN);
  }

  const sentenceTasks = (summary.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((part) => cleanTask(part))
    .filter((part): part is string => part != null && part.length >= 36);
  if (summary.length > 500 && sentenceTasks.length >= 3) {
    return sentenceTasks.slice(0, MAX_BREAKDOWN_CHILDREN);
  }

  return [];
}

function matchedBroadSurfaces(text: string): string[] {
  const surfaces = [
    {
      name: "backend/API",
      re: /\b(api|backend|server|database|db|schema|railway)\b/i,
    },
    {
      name: "mobile UI",
      re: /\b(mobile|ios|iphone|ui|screen|settings|card|share)\b/i,
    },
    {
      name: "automation",
      re: /\b(swarm|agent|github|workflow|ci|eas|testflight|pr)\b/i,
    },
    {
      name: "verification",
      re: /\b(test|typecheck|verify|smoke|docs|release)\b/i,
    },
  ];
  return surfaces
    .filter((surface) => surface.re.test(text))
    .map((surface) => surface.name);
}

function fallbackBreakdownTasks(text: string, labels: string[]): string[] {
  const surfaces = matchedBroadSurfaces(text);
  if (surfaces.length >= 2) {
    return surfaces.slice(0, MAX_BREAKDOWN_CHILDREN).map((surface) => {
      if (surface === "backend/API")
        return "Implement the backend and data model slice";
      if (surface === "mobile UI") return "Implement the mobile UI slice";
      if (surface === "automation")
        return "Wire the automation and release slice";
      return "Add focused verification for the completed slices";
    });
  }
  if (normalizeLabels(labels).some((label) => BREAKDOWN_LABELS.has(label))) {
    return [
      "Define the smallest safe scope and acceptance checks",
      "Implement the first production slice",
      "Add verification and release follow-up",
    ];
  }
  return [];
}

function childLabels(parentLabels: string[]): string[] {
  const labels = parentLabels.filter(
    (label) => !CHILD_LABEL_BLOCKLIST.has(label.trim().toLowerCase()),
  );
  if (!labels.some((label) => label.toLowerCase() === "agent-ready")) {
    labels.push("agent-ready");
  }
  return labels;
}

function parentFingerprint(workItem: SwarmWorkItemCandidate): string {
  return workItem.fingerprint?.trim() || `work-item-${workItem.id}`;
}

function shouldBreakDownWorkItem(
  workItem: SwarmWorkItemCandidate,
  issue: GitHubIssueSummary,
): boolean {
  const labels = normalizeLabels(issue.labels);
  if (labels.some((label) => BREAKDOWN_LABELS.has(label))) return true;
  const explicitTasks = splitExplicitTasks(workItem.summary);
  if (explicitTasks.length >= 3) return true;
  if (workItem.summary.length > 900) return true;
  return (
    workItem.summary.length > 240 &&
    matchedBroadSurfaces(`${workItem.title}\n${workItem.summary}`).length >= 3
  );
}

function buildChildIssueDraft({
  parent,
  issue,
  child,
  index,
}: {
  parent: SwarmWorkItemCandidate;
  issue: GitHubIssueSummary;
  child: Pick<SwarmBreakdownChild, "title" | "summary">;
  index: number;
}): GithubIssueDraft {
  return {
    title: child.title,
    labels: childLabels(issue.labels),
    body: [
      "## Scope",
      child.summary,
      "",
      "## Parent",
      `Parent issue: #${issue.number}`,
      `Parent work item: #${parent.id}`,
      "",
      "## Guardrails",
      "- PR-sized child issue from a larger HeyTelli swarm breakdown.",
      "- Use only the sanitized parent work item context.",
      "- Keep user-identifying and sensitive context out of GitHub.",
      "",
      `<!-- heytelli-swarm-child:${parent.id}:${issue.number}:${index} -->`,
    ].join("\n"),
  };
}

function buildBreakdownChildren(
  workItem: SwarmWorkItemCandidate,
  issue: GitHubIssueSummary,
  riskTier: ImprovementRiskTier,
): SwarmBreakdownChild[] {
  const explicitTasks = splitExplicitTasks(workItem.summary);
  const tasks =
    explicitTasks.length > 0
      ? explicitTasks
      : fallbackBreakdownTasks(
          `${workItem.title}\n${workItem.summary}`,
          issue.labels,
        );
  const prefix = childTitlePrefix(workItem);
  const fingerprint = parentFingerprint(workItem);
  return tasks.slice(0, MAX_BREAKDOWN_CHILDREN).map((task, index) => {
    const title = childTitle(prefix, task);
    const summary = [
      task,
      "",
      `Parent issue #${issue.number}: ${workItem.title}`,
    ].join("\n");
    const child = {
      fingerprint: `${fingerprint}:child:${index + 1}`,
      title,
      summary,
      category: workItem.category,
      priority: workItem.priority,
      riskTier,
      impactScore: workItem.impactScore ?? 1,
      confidenceScore: workItem.confidenceScore ?? 1,
      frequencyCount: workItem.frequencyCount ?? 1,
      signalIds: workItem.signalIds ?? [],
      status: "draft" as const,
      githubIssueUrl: null,
      githubIssueNumber: null,
      branchName: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
    };
    return {
      ...child,
      githubIssueDraft: buildChildIssueDraft({
        parent: workItem,
        issue,
        child,
        index: index + 1,
      }),
    };
  });
}

function buildSwarmBreakdown(
  workItem: SwarmWorkItemCandidate,
  issue: GitHubIssueSummary,
  plan: SwarmPlan,
): BreakdownSwarmWorkItem | null {
  if (plan.riskTier === "no_auto_merge") return null;
  if (!shouldBreakDownWorkItem(workItem, issue)) return null;
  const children = buildBreakdownChildren(workItem, issue, plan.riskTier);
  if (children.length < 2) return null;
  return {
    status: "needs-breakdown",
    workItemId: workItem.id,
    issueNumber: issue.number,
    issueUrl: issue.url,
    issueTitle: issue.title,
    workItemTitle: workItem.title,
    summary: workItem.summary,
    labels: issue.labels,
    reason: "Parent work item is too broad for one safe PR.",
    children,
  };
}

function issueWithoutLabels(
  issue: GitHubIssueSummary,
  labelsToRemove: string[],
): GitHubIssueSummary {
  const remove = new Set(labelsToRemove.map((label) => label.toLowerCase()));
  return {
    ...issue,
    labels: issue.labels.filter((label) => !remove.has(label.toLowerCase())),
  };
}

export function planSwarmWorkItem(
  workItem: SwarmWorkItemCandidate,
  issue: GitHubIssueSummary,
): SwarmWorkItemPlanResult {
  if (workItem.githubIssueNumber == null) {
    return {
      status: "skipped",
      workItemId: workItem.id,
      issueNumber: null,
      reason: "missing-github-issue-number",
      labels: [],
    };
  }

  if (issue.state !== "open") {
    return {
      status: "skipped",
      workItemId: workItem.id,
      issueNumber: issue.number,
      reason: "issue-not-open",
      labels: issue.labels,
    };
  }

  if (!issueLabelsAllowSwarmPlanning(issue.labels)) {
    return {
      status: "skipped",
      workItemId: workItem.id,
      issueNumber: issue.number,
      reason: "issue-labels-not-agent-ready",
      labels: issue.labels,
    };
  }

  const plan = buildSwarmPlan({
    category: workItem.category,
    priority: workItem.priority,
    riskTier: workItem.riskTier,
    privacyRisk: workItem.privacyRisk ?? "low",
    labels: issue.labels,
  });
  const breakdown = buildSwarmBreakdown(workItem, issue, plan);
  if (breakdown) return breakdown;

  return {
    status: "planned",
    workItemId: workItem.id,
    issueNumber: issue.number,
    issueUrl: issue.url,
    issueTitle: issue.title,
    workItemTitle: workItem.title,
    summary: workItem.summary,
    labels: issue.labels,
    plan,
  };
}

export function swarmBreakdownCommentMarker(
  breakdown: Pick<BreakdownSwarmWorkItem, "workItemId" | "issueNumber">,
): string {
  return `heytelli-swarm-breakdown:${breakdown.workItemId}:${breakdown.issueNumber}`;
}

function issueNumberFromUrl(url: string): string {
  const match = url.match(/\/issues\/(\d+)(?:[#/?].*)?$/);
  return match ? `#${match[1]}` : url;
}

export function buildSwarmBreakdownComment(
  breakdown: BreakdownSwarmWorkItem,
  childIssueUrls: string[],
): string {
  const childLines =
    childIssueUrls.length > 0
      ? childIssueUrls.map((url) => `- ${issueNumberFromUrl(url)}`).join("\n")
      : breakdown.children.map((child) => `- ${child.title}`).join("\n");
  return [
    "## HeyTelli swarm breakdown",
    "",
    "This parent issue is broad enough to require multiple PR-sized child issues.",
    `Parent work item: #${breakdown.workItemId}`,
    `Parent issue: #${breakdown.issueNumber}`,
    "",
    "### Child issues",
    childLines,
    "",
    "The parent will not be executed directly; the child issues will move through the normal swarm flow.",
    "",
    `<!-- ${swarmBreakdownCommentMarker(breakdown)} -->`,
  ].join("\n");
}

export function buildSwarmPlanComment(
  planned: PlannedSwarmWorkItem,
  agentName: string,
): string {
  const roles = planned.plan.requiredAgentRoles
    .map((role) => `- ${role} (${roleToRunType(role)})`)
    .join("\n");
  const checks = planned.plan.requiredChecks
    .map((check) => `- ${check}`)
    .join("\n");
  return [
    "## HeyTelli swarm plan",
    "",
    `Runner: ${agentName}`,
    `Work item: #${planned.workItemId}`,
    `Risk tier: ${planned.plan.riskTier}`,
    `Auto-merge policy: ${planned.plan.autoMergePolicy.mode}`,
    `Auto-merge allowed: ${planned.plan.autoMergePolicy.allowed ? "yes" : "no"}`,
    "",
    "### Agents",
    roles,
    "",
    "### Required checks",
    checks,
    "",
    "### Guardrails",
    planned.plan.reason,
    "No private screenshots, transcripts, or dating details are included or requested.",
    "",
    `<!-- ${swarmPlanCommentMarker(planned)} -->`,
  ].join("\n");
}

export function swarmPlanCommentMarker(
  planned: Pick<PlannedSwarmWorkItem, "workItemId" | "issueNumber">,
): string {
  return `heytelli-swarm-plan:${planned.workItemId}:${planned.issueNumber}`;
}

export function buildSwarmDigest(counts: SwarmRunCounts): string {
  return [
    "# HeyTelli Swarm Digest",
    "",
    `Mode: ${counts.dryRun ? "dry-run" : "live"}`,
    `Agent-ready issues read: ${counts.read}`,
    `Swarm plans created: ${counts.planned}`,
    `Breakdowns created: ${counts.breakdownsCreated}`,
    `Child issues created: ${counts.childIssuesCreated}`,
    `Skipped: ${counts.skipped}`,
    `Failed: ${counts.failed}`,
    `Issue comments created: ${counts.commentsCreated}`,
    `agent-ready labels removed: ${counts.agentReadyLabelsRemoved}`,
    `Swarm labels added: ${counts.swarmLabelsAdded}`,
    `DB rows updated: ${counts.dbUpdated}`,
  ].join("\n");
}

export function swarmRunShouldFail(counts: SwarmRunCounts): boolean {
  return counts.failed > 0;
}

function emptyCounts(dryRun: boolean): SwarmRunCounts {
  return {
    read: 0,
    planned: 0,
    skipped: 0,
    failed: 0,
    commentsCreated: 0,
    agentReadyLabelsRemoved: 0,
    swarmLabelsAdded: 0,
    breakdownsCreated: 0,
    childIssuesCreated: 0,
    dbUpdated: 0,
    dryRun,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runImprovementSwarm(
  options: SwarmRunnerOptions,
): Promise<SwarmRunCounts> {
  const counts = emptyCounts(options.dryRun);
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL missing; swarm planning cannot inspect the private queue.",
    );
  }

  const { db, improvementRuns, improvementWorkItems } =
    await import("@workspace/db");
  const issues = await listAgentReadyIssues({
    owner: options.owner,
    repo: options.repo,
    token: options.token,
    apiUrl: options.githubApiUrl,
    limit: Math.min(Math.max(options.limit * 5, options.limit), 100),
  });

  counts.read = issues.length;

  for (const issue of issues) {
    let workItem: SwarmWorkItemCandidate | null = null;
    let claimed = false;
    let activeLabelAdded = false;
    let publicCommentCreated = false;

    try {
      const labels = labelSet(issue.labels);
      const [alreadyPlannedWorkItem] = await db
        .select()
        .from(improvementWorkItems)
        .where(
          and(
            eq(improvementWorkItems.githubIssueNumber, issue.number),
            eq(improvementWorkItems.status, "planned"),
          ),
        )
        .limit(1);
      if (alreadyPlannedWorkItem) {
        if (!options.dryRun) {
          const plannedLabels = await addIssueLabels({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: issue.number,
            apiUrl: options.githubApiUrl,
            labels: ["swarm-planned"],
          });
          counts.swarmLabelsAdded += plannedLabels.length;
          const removed = await removeIssueLabels({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: issue.number,
            apiUrl: options.githubApiUrl,
            labels: options.consumeAgentReadyLabel
              ? ["agent-ready", "swarm-active"]
              : ["swarm-active"],
          });
          counts.agentReadyLabelsRemoved += removed.filter(
            (label) => label.toLowerCase() === "agent-ready",
          ).length;
          await db.insert(improvementRuns).values({
            workItemId: alreadyPlannedWorkItem.id,
            runType: "review",
            agentName: options.agentName,
            status: "succeeded",
            summary: `Swarm GitHub label cleanup completed for issue #${issue.number}`,
            metadata: {
              directRunner: true,
              issueNumber: issue.number,
              cleanupOnly: true,
            },
            completedAt: new Date(),
          });
        }
        counts.skipped += 1;
        continue;
      }

      const isActiveResume =
        labels.has("swarm-active") && !labels.has("swarm-planned");
      const planningIssue = isActiveResume
        ? issueWithoutLabels(issue, ["swarm-active"])
        : issue;

      if (!issueLabelsAllowSwarmPlanning(planningIssue.labels)) {
        counts.skipped += 1;
        continue;
      }

      const expectedStatus: ImprovementWorkItemStatus = isActiveResume
        ? "researching"
        : "issue_created";
      const [dbWorkItem] = await db
        .select()
        .from(improvementWorkItems)
        .where(
          and(
            eq(improvementWorkItems.githubIssueNumber, issue.number),
            eq(improvementWorkItems.status, expectedStatus),
          ),
        )
        .limit(1);
      if (!dbWorkItem) {
        counts.skipped += 1;
        continue;
      }
      workItem = dbWorkItem;

      const planned = planSwarmWorkItem(workItem, planningIssue);
      if (planned.status === "skipped") {
        counts.skipped += 1;
        continue;
      }

      if (planned.status === "needs-breakdown") {
        counts.planned += 1;
        counts.breakdownsCreated += 1;
        if (options.dryRun) {
          counts.childIssuesCreated += planned.children.length;
          continue;
        }

        if (isActiveResume) {
          claimed = true;
          activeLabelAdded = true;
        } else {
          const [claimedWorkItem] = await db
            .update(improvementWorkItems)
            .set({
              status: "researching",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(improvementWorkItems.id, planned.workItemId),
                eq(improvementWorkItems.status, "issue_created"),
              ),
            )
            .returning();
          if (!claimedWorkItem) {
            counts.skipped += 1;
            continue;
          }
          claimed = true;
        }

        if (!isActiveResume) {
          const activeLabels = await addIssueLabels({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: planned.issueNumber,
            apiUrl: options.githubApiUrl,
            labels: ["swarm-active"],
          });
          counts.swarmLabelsAdded += activeLabels.length;
          activeLabelAdded = activeLabels.some(
            (label) => label.toLowerCase() === "swarm-active",
          );
        }

        const childIssueUrls: string[] = [];
        for (const child of planned.children) {
          const [existingChild] = await db
            .select()
            .from(improvementWorkItems)
            .where(eq(improvementWorkItems.fingerprint, child.fingerprint))
            .limit(1);
          let childWorkItem = existingChild;
          if (!childWorkItem) {
            const { githubIssueDraft: _draft, ...childValues } = child;
            const [createdChild] = await db
              .insert(improvementWorkItems)
              .values(childValues)
              .returning();
            if (!createdChild) {
              throw new Error("Child work item insert returned no row");
            }
            childWorkItem = createdChild;
            counts.dbUpdated += 1;
          }

          if (childWorkItem.githubIssueUrl) {
            childIssueUrls.push(childWorkItem.githubIssueUrl);
            continue;
          }

          const issueResult = await createGitHubIssue({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            draft: child.githubIssueDraft,
            dryRun: options.dryRun,
            dedupeKey: child.fingerprint,
            apiUrl: options.githubApiUrl,
          });
          if (issueResult.mode === "live") {
            await db
              .update(improvementWorkItems)
              .set({
                githubIssueUrl: issueResult.url,
                githubIssueNumber: issueResult.number,
                status: "issue_created",
                updatedAt: new Date(),
              })
              .where(eq(improvementWorkItems.id, childWorkItem.id));
            counts.dbUpdated += 1;
            counts.childIssuesCreated += 1;
            childIssueUrls.push(issueResult.url);
          }
        }

        let commentUrl: string | null = null;
        if (options.commentOnIssues) {
          const marker = swarmBreakdownCommentMarker(planned);
          const existingComment = await findIssueCommentByMarker({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: planned.issueNumber,
            apiUrl: options.githubApiUrl,
            marker,
          });
          if (existingComment) {
            commentUrl = existingComment.url;
          } else {
            const comment = await commentOnIssue({
              owner: options.owner,
              repo: options.repo,
              token: options.token,
              issueNumber: planned.issueNumber,
              apiUrl: options.githubApiUrl,
              body: buildSwarmBreakdownComment(planned, childIssueUrls),
            });
            commentUrl = comment.url;
            counts.commentsCreated += 1;
          }
          publicCommentCreated = true;
        }

        await db
          .update(improvementWorkItems)
          .set({
            status: "closed",
            updatedAt: new Date(),
          })
          .where(eq(improvementWorkItems.id, planned.workItemId));
        counts.dbUpdated += 1;

        await db.insert(improvementRuns).values({
          workItemId: planned.workItemId,
          runType: "research",
          agentName: options.agentName,
          status: "succeeded",
          summary: `Swarm breakdown created for GitHub issue #${planned.issueNumber}`,
          logsUrl: commentUrl,
          metadata: {
            directRunner: true,
            issueNumber: planned.issueNumber,
            issueUrl: planned.issueUrl,
            childIssueUrls,
            childCount: planned.children.length,
            reason: planned.reason,
          },
          completedAt: new Date(),
        });

        const plannedLabels = await addIssueLabels({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          issueNumber: planned.issueNumber,
          apiUrl: options.githubApiUrl,
          labels: ["swarm-planned"],
        });
        counts.swarmLabelsAdded += plannedLabels.length;

        try {
          const removed = await removeIssueLabels({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: planned.issueNumber,
            apiUrl: options.githubApiUrl,
            labels: options.consumeAgentReadyLabel
              ? ["agent-ready", "swarm-active"]
              : ["swarm-active"],
          });
          counts.agentReadyLabelsRemoved += removed.filter(
            (label) => label.toLowerCase() === "agent-ready",
          ).length;
        } catch (err) {
          counts.failed += 1;
          await db.insert(improvementRuns).values({
            workItemId: planned.workItemId,
            runType: "review",
            agentName: options.agentName,
            status: "failed",
            summary: `Swarm breakdown label cleanup failed: ${errorMessage(err)}`,
            metadata: {
              directRunner: true,
              issueNumber: planned.issueNumber,
              retryable: true,
            },
            completedAt: new Date(),
          });
        }
        continue;
      }

      if (options.dryRun) {
        counts.planned += 1;
        continue;
      }

      if (isActiveResume) {
        claimed = true;
        activeLabelAdded = true;
      } else {
        const [claimedWorkItem] = await db
          .update(improvementWorkItems)
          .set({
            status: "researching",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(improvementWorkItems.id, planned.workItemId),
              eq(improvementWorkItems.status, "issue_created"),
            ),
          )
          .returning();
        if (!claimedWorkItem) {
          counts.skipped += 1;
          continue;
        }
        claimed = true;
      }
      counts.planned += 1;

      if (!isActiveResume) {
        const activeLabels = await addIssueLabels({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          issueNumber: planned.issueNumber,
          apiUrl: options.githubApiUrl,
          labels: ["swarm-active"],
        });
        counts.swarmLabelsAdded += activeLabels.length;
        activeLabelAdded = activeLabels.some(
          (label) => label.toLowerCase() === "swarm-active",
        );
      }

      let commentUrl: string | null = null;
      if (options.commentOnIssues) {
        const marker = swarmPlanCommentMarker(planned);
        const existingComment = await findIssueCommentByMarker({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          issueNumber: planned.issueNumber,
          apiUrl: options.githubApiUrl,
          marker,
        });
        if (existingComment) {
          commentUrl = existingComment.url;
        } else {
          const comment = await commentOnIssue({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            issueNumber: planned.issueNumber,
            apiUrl: options.githubApiUrl,
            body: buildSwarmPlanComment(planned, options.agentName),
          });
          commentUrl = comment.url;
          counts.commentsCreated += 1;
        }
        publicCommentCreated = true;
      }

      await db
        .update(improvementWorkItems)
        .set({
          status: "planned",
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, planned.workItemId));
      counts.dbUpdated += 1;

      await db.insert(improvementRuns).values({
        workItemId: planned.workItemId,
        runType: "research",
        agentName: options.agentName,
        status: "succeeded",
        summary: `Swarm plan created for GitHub issue #${planned.issueNumber}`,
        logsUrl: commentUrl,
        metadata: {
          directRunner: true,
          issueNumber: planned.issueNumber,
          issueUrl: planned.issueUrl,
          riskTier: planned.plan.riskTier,
          autoMergePolicy: planned.plan.autoMergePolicy,
          requiredAgentRoles: planned.plan.requiredAgentRoles,
          requiredChecks: planned.plan.requiredChecks,
        },
        completedAt: new Date(),
      });

      const plannedLabels = await addIssueLabels({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
        issueNumber: planned.issueNumber,
        apiUrl: options.githubApiUrl,
        labels: ["swarm-planned"],
      });
      counts.swarmLabelsAdded += plannedLabels.length;

      try {
        const removed = await removeIssueLabels({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          issueNumber: planned.issueNumber,
          apiUrl: options.githubApiUrl,
          labels: options.consumeAgentReadyLabel
            ? ["agent-ready", "swarm-active"]
            : ["swarm-active"],
        });
        counts.agentReadyLabelsRemoved += removed.filter(
          (label) => label.toLowerCase() === "agent-ready",
        ).length;
      } catch (err) {
        counts.failed += 1;
        await db.insert(improvementRuns).values({
          workItemId: planned.workItemId,
          runType: "review",
          agentName: options.agentName,
          status: "failed",
          summary: `Swarm label cleanup failed: ${errorMessage(err)}`,
          metadata: {
            directRunner: true,
            issueNumber: planned.issueNumber,
            retryable: true,
          },
          completedAt: new Date(),
        });
      }
    } catch (err) {
      counts.failed += 1;
      if (claimed && workItem && !publicCommentCreated && !activeLabelAdded) {
        await db
          .update(improvementWorkItems)
          .set({
            status: "issue_created",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(improvementWorkItems.id, workItem.id),
              eq(improvementWorkItems.status, "researching"),
            ),
          );
      }
      if (!options.dryRun && workItem) {
        await db.insert(improvementRuns).values({
          workItemId: workItem.id,
          runType: "research",
          agentName: options.agentName,
          status: "failed",
          summary: `Swarm planning failed: ${errorMessage(err)}`,
          metadata: {
            directRunner: true,
            issueNumber: issue.number,
            publicCommentCreated,
            retryable: true,
          },
          completedAt: new Date(),
        });
      }
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseSwarmArgs(process.argv.slice(2));
  try {
    const counts = await runImprovementSwarm(options);
    console.log(buildSwarmDigest(counts));
    if (swarmRunShouldFail(counts)) {
      throw new Error(
        `Improvement swarm completed with ${counts.failed} failed item(s).`,
      );
    }
  } finally {
    if (process.env.DATABASE_URL) {
      const { pool } = await import("@workspace/db");
      await pool.end();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exitCode = 1;
  });
}
