import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import type {
  ImprovementCategory,
  ImprovementPriority,
  ImprovementPrivacyRisk,
  ImprovementRiskTier,
  ImprovementRunType,
  ImprovementWorkItemStatus,
} from "@workspace/db";
import {
  addIssueLabels,
  commentOnIssue,
  findIssueCommentByMarker,
  githubTokenFromEnv,
  listAgentReadyIssues,
  removeIssueLabels,
  type GitHubIssueSummary,
} from "./github";
import {
  buildSwarmPlan,
  issueLabelsAllowSwarmPlanning,
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

export type SwarmWorkItemPlanResult =
  | PlannedSwarmWorkItem
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
  dbUpdated: number;
  dryRun: boolean;
};

const DEFAULT_LIMIT = 10;

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
