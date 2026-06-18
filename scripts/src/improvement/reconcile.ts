import { execFile } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { ImprovementWorkItemStatus } from "@workspace/db";
import {
  fetchGitHubIssue,
  fetchGitHubPullRequest,
  githubTokenFromEnv,
  removeIssueLabels,
} from "./github";

const execFileAsync = promisify(execFile);

export type ReconciliationWorktree = {
  workItemId: number;
  path: string;
};

export type ReconciliationWorkItem = {
  id: number;
  status: ImprovementWorkItemStatus;
  branchName: string | null;
  githubIssueNumber: number | null;
  pullRequestNumber: number | null;
};

export type ReconciliationIssue = {
  number: number;
  state: string;
  labels: string[];
};

export type ReconciliationPullRequest = {
  number: number;
  state: string;
  mergedAt: string | null;
};

export type ReconciliationAction =
  | {
      type: "remove_worktree";
      workItemId: number;
      path: string;
      reason: string;
    }
  | {
      type: "delete_local_branch";
      workItemId: number;
      branchName: string;
      reason: string;
    }
  | {
      type: "remove_issue_label";
      workItemId: number;
      issueNumber: number;
      label: string;
      reason: string;
    }
  | {
      type: "update_work_item_status";
      workItemId: number;
      nextStatus: ImprovementWorkItemStatus;
      reason: string;
    };

export type ReconciliationPlanInput = {
  worktrees: ReconciliationWorktree[];
  localBranches: string[];
  workItems: ReconciliationWorkItem[];
  issues: ReconciliationIssue[];
  pullRequests: ReconciliationPullRequest[];
};

export type ReconciliationOptions = {
  dryRun: boolean;
  repoRoot: string;
  worktreeRoot: string;
  owner: string;
  repo: string;
  token: string | null;
  githubApiUrl?: string;
};

const TERMINAL_STATUSES = new Set<ImprovementWorkItemStatus>([
  "closed",
  "merged",
  "deployed",
  "rolled_back",
]);

const ACTIVE_SWARM_LABEL_STATUSES = new Set<ImprovementWorkItemStatus>([
  "researching",
  "building",
  "checks_running",
]);

function workItemById(
  workItems: ReconciliationWorkItem[],
): Map<number, ReconciliationWorkItem> {
  return new Map(workItems.map((item) => [item.id, item]));
}

function workItemByIssue(
  workItems: ReconciliationWorkItem[],
): Map<number, ReconciliationWorkItem> {
  return new Map(
    workItems.flatMap((item) =>
      item.githubIssueNumber == null ? [] : [[item.githubIssueNumber, item]],
    ),
  );
}

function workItemByPullRequest(
  workItems: ReconciliationWorkItem[],
): Map<number, ReconciliationWorkItem> {
  return new Map(
    workItems.flatMap((item) =>
      item.pullRequestNumber == null ? [] : [[item.pullRequestNumber, item]],
    ),
  );
}

export function planImprovementReconciliation(
  input: ReconciliationPlanInput,
): ReconciliationAction[] {
  const actions: ReconciliationAction[] = [];
  const byId = workItemById(input.workItems);
  for (const worktree of input.worktrees) {
    const item = byId.get(worktree.workItemId);
    if (!item || !TERMINAL_STATUSES.has(item.status)) continue;
    actions.push({
      type: "remove_worktree",
      workItemId: item.id,
      path: worktree.path,
      reason: `Generated worktree belongs to terminal ${item.status} work item.`,
    });
  }

  for (const item of input.workItems) {
    if (
      item.branchName &&
      item.branchName.startsWith("swarm/") &&
      TERMINAL_STATUSES.has(item.status) &&
      input.localBranches.includes(item.branchName)
    ) {
      actions.push({
        type: "delete_local_branch",
        workItemId: item.id,
        branchName: item.branchName,
        reason: `Generated branch belongs to terminal ${item.status} work item.`,
      });
    }
  }

  const byIssue = workItemByIssue(input.workItems);
  for (const issue of input.issues) {
    const item = byIssue.get(issue.number);
    if (
      item &&
      issue.state === "open" &&
      issue.labels.includes("swarm-active") &&
      !ACTIVE_SWARM_LABEL_STATUSES.has(item.status)
    ) {
      actions.push({
        type: "remove_issue_label",
        workItemId: item.id,
        issueNumber: issue.number,
        label: "swarm-active",
        reason:
          "Issue has swarm-active but the work item is not in an active executor state.",
      });
    }
  }

  const byPullRequest = workItemByPullRequest(input.workItems);
  for (const pullRequest of input.pullRequests) {
    const item = byPullRequest.get(pullRequest.number);
    if (
      item &&
      pullRequest.mergedAt &&
      !["merged", "deployed", "monitoring", "closed"].includes(item.status)
    ) {
      actions.push({
        type: "update_work_item_status",
        workItemId: item.id,
        nextStatus: "merged",
        reason:
          "GitHub pull request is merged but the work item has not caught up.",
      });
    }
  }

  return actions;
}

export function buildReconciliationDigest(input: {
  dryRun: boolean;
  actions: ReconciliationAction[];
}): string {
  const counts = input.actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.type] = (acc[action.type] ?? 0) + 1;
    return acc;
  }, {});
  return [
    "# HeyTelli Swarm Reconciliation Digest",
    "",
    `Mode: ${input.dryRun ? "dry run" : "live"}`,
    `Actions planned: ${input.actions.length}`,
    ...Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `${type}: ${count}`),
  ].join("\n");
}

function argValue(argv: string[], flag: string): string | null {
  const eqPrefix = `${flag}=`;
  const withEquals = argv.find((arg) => arg.startsWith(eqPrefix));
  if (withEquals) return withEquals.slice(eqPrefix.length);
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function parseReconciliationArgs(
  argv: string[],
  env = process.env,
): ReconciliationOptions {
  const repoRoot = path.resolve(argValue(argv, "--repo-root") || process.cwd());
  return {
    dryRun:
      argv.includes("--live") || argv.includes("--no-dry-run")
        ? false
        : argv.includes("--dry-run")
          ? true
          : envFlag(env.IMPROVEMENT_RECONCILE_DRY_RUN, true),
    repoRoot,
    worktreeRoot: path.resolve(
      argValue(argv, "--worktree-root") ||
        path.join(repoRoot, ".worktrees", "swarm-executor"),
    ),
    owner: argValue(argv, "--owner") || env.GITHUB_OWNER || "joewilsonai",
    repo: argValue(argv, "--repo") || env.GITHUB_REPO || "heytelli",
    token: githubTokenFromEnv(env),
    githubApiUrl: argValue(argv, "--github-api-url") || env.GITHUB_API_URL,
  };
}

async function listGeneratedWorktrees(
  worktreeRoot: string,
): Promise<ReconciliationWorktree[]> {
  try {
    const entries = await readdir(worktreeRoot, { withFileTypes: true });
    return entries.flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const workItemId = Number.parseInt(entry.name, 10);
      if (!Number.isInteger(workItemId) || workItemId <= 0) return [];
      return [{ workItemId, path: path.join(worktreeRoot, entry.name) }];
    });
  } catch {
    return [];
  }
}

async function listLocalBranches(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname:short)", "refs/heads/swarm"],
      { cwd: repoRoot },
    );
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: repoRoot,
  }).catch(async () => {
    await rm(worktreePath, { recursive: true, force: true });
  });
  await execFileAsync("git", ["worktree", "prune"], { cwd: repoRoot }).catch(
    () => {},
  );
}

async function deleteLocalBranch(
  repoRoot: string,
  branchName: string,
): Promise<void> {
  await execFileAsync("git", ["branch", "-D", branchName], { cwd: repoRoot });
}

async function executeAction(
  action: ReconciliationAction,
  options: ReconciliationOptions,
): Promise<void> {
  if (options.dryRun) return;
  if (action.type === "remove_worktree") {
    await removeWorktree(options.repoRoot, action.path);
    return;
  }
  if (action.type === "delete_local_branch") {
    await deleteLocalBranch(options.repoRoot, action.branchName);
    return;
  }
  if (action.type === "remove_issue_label") {
    await removeIssueLabels({
      owner: options.owner,
      repo: options.repo,
      token: options.token,
      issueNumber: action.issueNumber,
      labels: [action.label],
      apiUrl: options.githubApiUrl,
    });
    return;
  }
  if (action.type === "update_work_item_status") {
    const { db, improvementWorkItems } = await import("@workspace/db");
    await db
      .update(improvementWorkItems)
      .set({ status: action.nextStatus, updatedAt: new Date() })
      .where(eq(improvementWorkItems.id, action.workItemId));
  }
}

export async function runImprovementReconciliation(
  options: ReconciliationOptions,
): Promise<ReconciliationAction[]> {
  if (!process.env.DATABASE_URL) return [];
  const { db, improvementWorkItems } = await import("@workspace/db");
  const workItems = await db
    .select({
      id: improvementWorkItems.id,
      status: improvementWorkItems.status,
      branchName: improvementWorkItems.branchName,
      githubIssueNumber: improvementWorkItems.githubIssueNumber,
      pullRequestNumber: improvementWorkItems.pullRequestNumber,
    })
    .from(improvementWorkItems);

  const [worktrees, localBranches] = await Promise.all([
    listGeneratedWorktrees(options.worktreeRoot),
    listLocalBranches(options.repoRoot),
  ]);

  const issues: ReconciliationIssue[] = [];
  const pullRequests: ReconciliationPullRequest[] = [];
  if (options.token) {
    for (const item of workItems) {
      if (item.githubIssueNumber != null) {
        await fetchGitHubIssue({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          issueNumber: item.githubIssueNumber,
          apiUrl: options.githubApiUrl,
        })
          .then((issue) => {
            issues.push({
              number: issue.number,
              state: issue.state,
              labels: issue.labels,
            });
          })
          .catch(() => {});
      }
      if (item.pullRequestNumber != null) {
        await fetchGitHubPullRequest({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          pullRequestNumber: item.pullRequestNumber,
          apiUrl: options.githubApiUrl,
        })
          .then((pullRequest) => {
            pullRequests.push({
              number: pullRequest.number,
              state: pullRequest.state,
              mergedAt: pullRequest.mergedAt,
            });
          })
          .catch(() => {});
      }
    }
  }

  const actions = planImprovementReconciliation({
    worktrees,
    localBranches,
    workItems,
    issues,
    pullRequests,
  });
  for (const action of actions) {
    await executeAction(action, options);
  }
  return actions;
}

async function main(): Promise<void> {
  const options = parseReconciliationArgs(process.argv.slice(2));
  const actions = await runImprovementReconciliation(options);
  console.log(buildReconciliationDigest({ dryRun: options.dryRun, actions }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
