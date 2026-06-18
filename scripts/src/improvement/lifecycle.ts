import { pathToFileURL } from "node:url";
import { eq, inArray } from "drizzle-orm";
import type { ImprovementWorkItemStatus } from "@workspace/db";
import {
  commentOnIssue,
  fetchGitHubPullRequest,
  findIssueCommentByMarker,
  githubTokenFromEnv,
  type GitHubPullRequestSummary,
} from "./github";

export type LifecycleWorkItem = {
  id: number;
  status: ImprovementWorkItemStatus;
  githubIssueNumber: number | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};

export type LifecycleOptions = {
  dryRun: boolean;
  owner: string;
  repo: string;
  token: string | null;
  githubApiUrl?: string;
  limit: number;
  agentName: string;
  commentOnIssues: boolean;
};

export type LifecycleRunCounts = {
  read: number;
  updated: number;
  merged: number;
  closed: number;
  reviewing: number;
  failed: number;
  commentsCreated: number;
  dryRun: boolean;
};

const DEFAULT_LIMIT = 25;

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

export function parseLifecycleArgs(
  argv: string[],
  env = process.env,
): LifecycleOptions {
  const dryRun =
    argv.includes("--live") || argv.includes("--no-dry-run")
      ? false
      : argv.includes("--dry-run")
        ? true
        : envFlag(env.IMPROVEMENT_LIFECYCLE_DRY_RUN, true);
  return {
    dryRun,
    owner: argValue(argv, "--owner") || env.GITHUB_OWNER || "joewilsonai",
    repo: argValue(argv, "--repo") || env.GITHUB_REPO || "heytelli",
    token: githubTokenFromEnv(env),
    githubApiUrl: argValue(argv, "--github-api-url") || env.GITHUB_API_URL,
    limit: numericEnv(
      argValue(argv, "--limit") || env.IMPROVEMENT_LIFECYCLE_LIMIT,
      DEFAULT_LIMIT,
    ),
    agentName:
      argValue(argv, "--agent-name") ||
      env.IMPROVEMENT_LIFECYCLE_AGENT_NAME ||
      "heytelli-swarm-lifecycle",
    commentOnIssues:
      !argv.includes("--no-comment") &&
      envFlag(env.IMPROVEMENT_LIFECYCLE_COMMENT_ON_ISSUES, true),
  };
}

export function workItemStatusFromPullRequest(
  currentStatus: ImprovementWorkItemStatus,
  pr: Pick<GitHubPullRequestSummary, "state" | "draft" | "mergedAt">,
): ImprovementWorkItemStatus {
  if (pr.mergedAt) return "merged";
  if (pr.state.toLowerCase() === "closed") return "closed";
  if (pr.draft) return "reviewing";
  if (currentStatus === "monitoring") return "monitoring";
  return currentStatus === "reviewing" ? "reviewing" : "checks_running";
}

export function buildLifecycleDigest(counts: LifecycleRunCounts): string {
  return [
    "# HeyTelli Swarm Lifecycle Digest",
    "",
    `Mode: ${counts.dryRun ? "dry-run" : "live"}`,
    `PR-linked work items read: ${counts.read}`,
    `Updated: ${counts.updated}`,
    `Merged: ${counts.merged}`,
    `Closed: ${counts.closed}`,
    `Still reviewing/checking: ${counts.reviewing}`,
    `Failed: ${counts.failed}`,
    `Comments created: ${counts.commentsCreated}`,
  ].join("\n");
}

function emptyCounts(dryRun: boolean): LifecycleRunCounts {
  return {
    read: 0,
    updated: 0,
    merged: 0,
    closed: 0,
    reviewing: 0,
    failed: 0,
    commentsCreated: 0,
    dryRun,
  };
}

export function lifecycleResultCommentMarker(
  workItem: Pick<LifecycleWorkItem, "id" | "githubIssueNumber">,
  nextStatus: ImprovementWorkItemStatus,
): string {
  return `heytelli-swarm-lifecycle:${workItem.id}:${workItem.githubIssueNumber ?? "no-issue"}:${nextStatus}`;
}

function decisionForLifecycleStatus(
  workItem: Pick<LifecycleWorkItem, "pullRequestNumber">,
  nextStatus: ImprovementWorkItemStatus,
): {
  decisionCategory?: "shipped" | "not_planned";
  decisionDetails?: string;
} {
  if (nextStatus === "merged") {
    return {
      decisionCategory: "shipped",
      decisionDetails: `Merged in PR #${workItem.pullRequestNumber}; release verification is running.`,
    };
  }
  if (nextStatus === "closed") {
    return {
      decisionCategory: "not_planned",
      decisionDetails: `PR #${workItem.pullRequestNumber} closed without merging, so this is not shipping right now.`,
    };
  }
  return {};
}

export function buildLifecycleResultComment(input: {
  workItem: Pick<
    LifecycleWorkItem,
    "id" | "githubIssueNumber" | "pullRequestNumber" | "pullRequestUrl"
  >;
  nextStatus: ImprovementWorkItemStatus;
  pr: Pick<GitHubPullRequestSummary, "mergedAt" | "url">;
  agentName: string;
}): string {
  const marker = lifecycleResultCommentMarker(input.workItem, input.nextStatus);
  const prLine =
    input.workItem.pullRequestNumber == null
      ? input.pr.url
      : `#${input.workItem.pullRequestNumber} (${input.pr.url})`;
  const result =
    input.nextStatus === "merged"
      ? [
          "Result: shipped/resolved.",
          input.pr.mergedAt
            ? `Merged at: ${input.pr.mergedAt}.`
            : "Merged; release verification is running.",
          "User-facing status: Settings feedback status will show this as shipped or resolved.",
        ]
      : [
          "Result: not shipping right now.",
          "Reason: the implementation PR closed without merging.",
          "User-facing status: Settings feedback status will show this as not planned right now with a reconsideration note.",
        ];

  return [
    "## HeyTelli swarm lifecycle",
    "",
    `Agent: ${input.agentName}`,
    `Work item: #${input.workItem.id}`,
    `PR: ${prLine}`,
    ...result,
    "",
    "Only sanitized repo-visible lifecycle metadata was used.",
    "",
    `<!-- ${marker} -->`,
  ].join("\n");
}

async function commentOnLifecycleResult(input: {
  options: LifecycleOptions;
  workItem: Pick<
    LifecycleWorkItem,
    "id" | "githubIssueNumber" | "pullRequestNumber" | "pullRequestUrl"
  >;
  nextStatus: ImprovementWorkItemStatus;
  pr: GitHubPullRequestSummary;
}): Promise<{ url: string; created: boolean } | null> {
  if (!input.options.commentOnIssues || input.workItem.githubIssueNumber == null) {
    return null;
  }
  const marker = lifecycleResultCommentMarker(input.workItem, input.nextStatus);
  const existingComment = await findIssueCommentByMarker({
    owner: input.options.owner,
    repo: input.options.repo,
    token: input.options.token,
    issueNumber: input.workItem.githubIssueNumber,
    apiUrl: input.options.githubApiUrl,
    marker,
  });
  if (existingComment) return { url: existingComment.url, created: false };

  const comment = await commentOnIssue({
    owner: input.options.owner,
    repo: input.options.repo,
    token: input.options.token,
    issueNumber: input.workItem.githubIssueNumber,
    apiUrl: input.options.githubApiUrl,
    body: buildLifecycleResultComment({
      workItem: input.workItem,
      nextStatus: input.nextStatus,
      pr: input.pr,
      agentName: input.options.agentName,
    }),
  });
  return { url: comment.url, created: true };
}

export async function runSwarmLifecycle(
  options: LifecycleOptions,
): Promise<LifecycleRunCounts> {
  if (!process.env.DATABASE_URL) {
    return emptyCounts(options.dryRun);
  }

  const { db, improvementRuns, improvementWorkItems } =
    await import("@workspace/db");
  const workItems = (await db
    .select({
      id: improvementWorkItems.id,
      status: improvementWorkItems.status,
      githubIssueNumber: improvementWorkItems.githubIssueNumber,
      pullRequestNumber: improvementWorkItems.pullRequestNumber,
      pullRequestUrl: improvementWorkItems.pullRequestUrl,
    })
    .from(improvementWorkItems)
    .where(
      inArray(improvementWorkItems.status, [
        "reviewing",
        "checks_running",
        "monitoring",
      ]),
    )
    .limit(options.limit)) as LifecycleWorkItem[];

  const counts = emptyCounts(options.dryRun);
  counts.read = workItems.length;

  for (const workItem of workItems) {
    if (workItem.pullRequestNumber == null) {
      counts.reviewing += 1;
      continue;
    }

    try {
      const pr = await fetchGitHubPullRequest({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
        apiUrl: options.githubApiUrl,
        pullRequestNumber: workItem.pullRequestNumber,
      });
      const nextStatus = workItemStatusFromPullRequest(workItem.status, pr);
      if (nextStatus === "merged") counts.merged += 1;
      else if (nextStatus === "closed") counts.closed += 1;
      else counts.reviewing += 1;

      if (nextStatus === workItem.status || options.dryRun) continue;

      await db
        .update(improvementWorkItems)
        .set({
          status: nextStatus,
          ...decisionForLifecycleStatus(workItem, nextStatus),
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, workItem.id));

      let lifecycleCommentUrl: string | null = null;
      try {
        const lifecycleComment = await commentOnLifecycleResult({
          options,
          workItem,
          nextStatus,
          pr,
        });
        lifecycleCommentUrl = lifecycleComment?.url ?? null;
        if (lifecycleComment?.created) {
          counts.commentsCreated += 1;
        }
      } catch (err) {
        counts.failed += 1;
        await db.insert(improvementRuns).values({
          workItemId: workItem.id,
          runType: "monitor",
          agentName: options.agentName,
          status: "failed",
          summary:
            err instanceof Error
              ? `Lifecycle comment failed: ${err.message}`
              : "Lifecycle comment failed",
          logsUrl: workItem.pullRequestUrl,
          metadata: {
            prNumber: workItem.pullRequestNumber,
            nextStatus,
            retryable: true,
          },
          completedAt: new Date(),
        });
      }

      await db.insert(improvementRuns).values({
        workItemId: workItem.id,
        runType: nextStatus === "merged" ? "merge" : "review",
        agentName: options.agentName,
        status: "succeeded",
        summary: `PR #${workItem.pullRequestNumber} moved work item to ${nextStatus}.`,
        logsUrl: lifecycleCommentUrl ?? workItem.pullRequestUrl,
        metadata: {
          prNumber: workItem.pullRequestNumber,
          prState: pr.state,
          mergedAt: pr.mergedAt,
          previousStatus: workItem.status,
          nextStatus,
          lifecycleCommentUrl,
        },
        completedAt: new Date(),
      });
      counts.updated += 1;
    } catch (err) {
      counts.failed += 1;
      if (options.dryRun) continue;
      await db.insert(improvementRuns).values({
        workItemId: workItem.id,
        runType: "monitor",
        agentName: options.agentName,
        status: "failed",
        summary:
          err instanceof Error
            ? `Lifecycle monitor failed: ${err.message}`
            : "Lifecycle monitor failed",
        metadata: {
          prNumber: workItem.pullRequestNumber,
          retryable: true,
        },
        completedAt: new Date(),
      });
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseLifecycleArgs(process.argv.slice(2));
  const counts = await runSwarmLifecycle(options);
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL missing; no swarm lifecycle rows were updated.");
  }
  console.log(buildLifecycleDigest(counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
