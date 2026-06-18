import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, asc, eq } from "drizzle-orm";
import type {
  ImprovementCategory,
  ImprovementPriority,
  ImprovementRiskTier,
  ImprovementWorkItemStatus,
} from "@workspace/db";
import {
  closeGitHubIssue,
  commentOnIssue,
  fetchGitHubIssue,
  findIssueCommentByMarker,
  githubTokenFromEnv,
  removeIssueLabels,
  type GitHubIssueSummary,
} from "./github";
import {
  agentProfilesForWorkItem,
  buildAgentProfilePromptSection,
} from "./agentProfiles";
import {
  buildExecutorHookPlan,
  validateAgentCommandSafety,
  type HookCommand,
} from "./hooks";
import { buildTraceSpan, traceIdForExecutorRun } from "./trace";
import type { SwarmAgentRole } from "./swarmPlan";

export type SwarmExecutorWorkItem = {
  id: number;
  title: string;
  summary: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  status: ImprovementWorkItemStatus;
  githubIssueUrl: string | null;
  githubIssueNumber: number | null;
  branchName: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
};

export type PlannedExecutorWorkItem = {
  status: "executable";
  workItemId: number;
  issueNumber: number;
  issueUrl: string;
  branchName: string;
  autoMergeAllowed: boolean;
  nextStatus: Extract<
    ImprovementWorkItemStatus,
    "reviewing" | "checks_running"
  >;
};

export type SkippedExecutorWorkItem = {
  status: "skipped";
  workItemId: number;
  reason:
    | "missing-github-issue"
    | "not-planned"
    | "auto-merge-disabled-risk-tier"
    | "source-issue-swarm-blocked";
};

export type SwarmExecutorPlanResult =
  | PlannedExecutorWorkItem
  | SkippedExecutorWorkItem;

export type SwarmExecutorOptions = {
  dryRun: boolean;
  owner: string;
  repo: string;
  token: string | null;
  githubApiUrl?: string;
  limit: number;
  agentName: string;
  baseBranch: string;
  repoRoot: string;
  worktreeRoot: string;
  agentCommand: string | null;
  agentTimeoutMs: number;
  reviewerCommand: string | null;
  reviewerTimeoutMs: number;
  reviewerParallelism: number;
  keepWorktree: boolean;
  allowGuardedAutoMerge: boolean;
  allowExtraAutoMerge: boolean;
};

export type SwarmExecutorRunCounts = {
  read: number;
  executable: number;
  skipped: number;
  failed: number;
  branchesCreated: number;
  pullRequestsCreated: number;
  resolvedWithoutPr: number;
  reviewerAgentsRun: number;
  autoMergesQueued: number;
  dbUpdated: number;
  dryRun: boolean;
};

export type ExecutorCommandPreview = {
  kind:
    | "fetch"
    | "worktree"
    | "install"
    | "agent"
    | "typecheck"
    | "commit"
    | "push"
    | "pr"
    | "review"
    | "automerge";
  command: string;
  args: string[];
  cwd?: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

type CommandRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    stdin?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    timeoutMs?: number;
  },
) => Promise<CommandResult>;

type ExecutorTraceRecorder = (
  span: ReturnType<typeof buildTraceSpan>,
) => Promise<void>;

const DEFAULT_LIMIT = 3;
const DEFAULT_AGENT_TIMEOUT_MS = 600_000;
const DEFAULT_REVIEWER_TIMEOUT_MS = 300_000;
const DEFAULT_REVIEWER_PARALLELISM = 1;
export const EXECUTOR_PROMPT_FILE_NAME = ".heytelli-swarm-prompt.md";
export const EXECUTOR_LOCK_DIR_NAME = ".executor.lock";

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

function emptyCounts(dryRun: boolean): SwarmExecutorRunCounts {
  return {
    read: 0,
    executable: 0,
    skipped: 0,
    failed: 0,
    branchesCreated: 0,
    pullRequestsCreated: 0,
    resolvedWithoutPr: 0,
    reviewerAgentsRun: 0,
    autoMergesQueued: 0,
    dbUpdated: 0,
    dryRun,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "work-item"
  );
}

function issueUrl(owner: string, repo: string, issueNumber: number): string {
  return `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
}

function prNumberFromUrl(url: string): number | null {
  const match = url.match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function githubEnv(token: string | null): NodeJS.ProcessEnv {
  return token
    ? { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token }
    : process.env;
}

export function gitEnv(token: string | null): NodeJS.ProcessEnv {
  const env = githubEnv(token);
  if (!token) {
    return { ...env, GIT_TERMINAL_PROMPT: "0" };
  }

  const existingCount = Number.parseInt(env.GIT_CONFIG_COUNT ?? "0", 10);
  const configIndex =
    Number.isFinite(existingCount) && existingCount >= 0 ? existingCount : 0;

  return {
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: String(configIndex + 1),
    [`GIT_CONFIG_KEY_${configIndex}`]: `url.https://x-access-token:${encodeURIComponent(
      token,
    )}@github.com/.insteadOf`,
    [`GIT_CONFIG_VALUE_${configIndex}`]: "https://github.com/",
  };
}

export function parseExecutorArgs(
  argv: string[],
  env = process.env,
): SwarmExecutorOptions {
  const repoRoot = path.resolve(
    argValue(argv, "--repo-root") || env.HEYTELLI_REPO_ROOT || process.cwd(),
  );
  const dryRun =
    argv.includes("--live") || argv.includes("--no-dry-run")
      ? false
      : argv.includes("--dry-run")
        ? true
        : envFlag(env.IMPROVEMENT_EXECUTOR_DRY_RUN, true);

  return {
    dryRun,
    owner: argValue(argv, "--owner") || env.GITHUB_OWNER || "joewilsonai",
    repo: argValue(argv, "--repo") || env.GITHUB_REPO || "heytelli",
    token: githubTokenFromEnv(env),
    githubApiUrl: argValue(argv, "--github-api-url") || env.GITHUB_API_URL,
    limit: numericArg(
      argv,
      "--limit",
      env.IMPROVEMENT_EXECUTOR_LIMIT,
      DEFAULT_LIMIT,
    ),
    agentName:
      argValue(argv, "--agent-name") ||
      env.IMPROVEMENT_EXECUTOR_AGENT_NAME ||
      "heytelli-swarm-executor",
    baseBranch:
      argValue(argv, "--base-branch") ||
      env.IMPROVEMENT_EXECUTOR_BASE_BRANCH ||
      "main",
    repoRoot,
    worktreeRoot: path.resolve(
      argValue(argv, "--worktree-root") ||
        env.IMPROVEMENT_EXECUTOR_WORKTREE_ROOT ||
        path.join(repoRoot, ".worktrees", "swarm-executor"),
    ),
    agentCommand:
      argValue(argv, "--agent-command") ||
      env.HEYTELLI_SWARM_EXECUTOR_COMMAND ||
      null,
    agentTimeoutMs: numericArg(
      argv,
      "--agent-timeout-ms",
      env.IMPROVEMENT_EXECUTOR_AGENT_TIMEOUT_MS,
      DEFAULT_AGENT_TIMEOUT_MS,
    ),
    reviewerCommand:
      argValue(argv, "--reviewer-command") ||
      env.HEYTELLI_SWARM_REVIEWER_COMMAND ||
      null,
    reviewerTimeoutMs: numericArg(
      argv,
      "--reviewer-timeout-ms",
      env.IMPROVEMENT_REVIEWER_TIMEOUT_MS,
      DEFAULT_REVIEWER_TIMEOUT_MS,
    ),
    reviewerParallelism: numericArg(
      argv,
      "--reviewer-parallelism",
      env.IMPROVEMENT_REVIEWER_PARALLELISM,
      DEFAULT_REVIEWER_PARALLELISM,
    ),
    keepWorktree:
      argv.includes("--keep-worktree") ||
      envFlag(env.IMPROVEMENT_EXECUTOR_KEEP_WORKTREE, false),
    allowGuardedAutoMerge:
      argv.includes("--allow-guarded-auto-merge") ||
      envFlag(env.IMPROVEMENT_EXECUTOR_ALLOW_GUARDED_AUTO_MERGE, false),
    allowExtraAutoMerge:
      argv.includes("--allow-extra-auto-merge") ||
      envFlag(env.IMPROVEMENT_EXECUTOR_ALLOW_EXTRA_AUTO_MERGE, false),
  };
}

export function branchNameForWorkItem(workItem: SwarmExecutorWorkItem): string {
  return (
    workItem.branchName || `swarm/${workItem.id}-${slugify(workItem.title)}`
  );
}

export function executorPrBodyMarker(
  workItem: Pick<SwarmExecutorWorkItem, "id" | "githubIssueNumber">,
): string {
  return `heytelli-swarm-executor:${workItem.id}:${workItem.githubIssueNumber ?? "no-issue"}`;
}

export function resolvedWithoutPrCommentMarker(
  workItem: Pick<SwarmExecutorWorkItem, "id" | "githubIssueNumber">,
): string {
  return `heytelli-swarm-resolved-without-pr:${workItem.id}:${workItem.githubIssueNumber ?? "no-issue"}`;
}

export function planSwarmExecutorWorkItem(
  workItem: SwarmExecutorWorkItem,
  options: Pick<
    SwarmExecutorOptions,
    "allowGuardedAutoMerge" | "allowExtraAutoMerge"
  > & { reviewerCommand?: string | null } = {
    allowGuardedAutoMerge: false,
    allowExtraAutoMerge: false,
    reviewerCommand: null,
  },
): SwarmExecutorPlanResult {
  if (workItem.status !== "planned") {
    return {
      status: "skipped",
      reason: "not-planned",
      workItemId: workItem.id,
    };
  }
  if (workItem.githubIssueNumber == null) {
    return {
      status: "skipped",
      reason: "missing-github-issue",
      workItemId: workItem.id,
    };
  }
  if (workItem.riskTier === "no_auto_merge") {
    return {
      status: "skipped",
      reason: "auto-merge-disabled-risk-tier",
      workItemId: workItem.id,
    };
  }

  const reviewerAgentsEnabled = Boolean(options.reviewerCommand);
  const autoMergeAllowed =
    workItem.riskTier === "safe_auto_merge" ||
    (workItem.riskTier === "guarded_auto_merge" &&
      options.allowGuardedAutoMerge &&
      reviewerAgentsEnabled) ||
    (workItem.riskTier === "extra_agent_review" &&
      options.allowExtraAutoMerge &&
      reviewerAgentsEnabled);

  return {
    status: "executable",
    workItemId: workItem.id,
    issueNumber: workItem.githubIssueNumber,
    issueUrl:
      workItem.githubIssueUrl ??
      issueUrl("joewilsonai", "heytelli", workItem.githubIssueNumber),
    branchName: branchNameForWorkItem(workItem),
    autoMergeAllowed,
    nextStatus: autoMergeAllowed ? "checks_running" : "reviewing",
  };
}

export function issueLabelsAllowExecutor(labels: string[]): boolean {
  const normalized = labels.map((label) => label.trim().toLowerCase());
  return !normalized.some(
    (label) =>
      label === "swarm-blocked" ||
      label === "contains-private-context" ||
      label === "risk:no_auto_merge" ||
      label === "wontfix",
  );
}

export function sourceIssueBlockReason(
  issue: Pick<GitHubIssueSummary, "state" | "labels">,
): "closed" | "blocked" | null {
  if (issue.state.toLowerCase() !== "open") {
    return "closed";
  }
  if (!issueLabelsAllowExecutor(issue.labels)) {
    return "blocked";
  }
  return null;
}

export function buildExecutorPrompt(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
): string {
  return [
    "You are a HeyTelli implementation agent running inside the repo.",
    "",
    `GitHub issue: #${plan.issueNumber}`,
    `Issue URL: ${plan.issueUrl}`,
    `Work item: #${workItem.id}`,
    `Risk tier: ${workItem.riskTier}`,
    `Title: ${workItem.title}`,
    "",
    "Sanitized summary:",
    workItem.summary,
    "",
    "Visibility boundary:",
    "This is a private repo, but GitHub issues, PRs, prompts, CI logs, and integrations are GitHub-visible surfaces. Keep private app/database context out of this worktree handoff.",
    "",
    buildAgentProfilePromptSection(agentProfilesForWorkItem(workItem)),
    "",
    "Implementation rules:",
    "- Before editing, compare the issue against the current repository. If the current implementation already resolves or supersedes the issue, leave `RESOLVED_BY_EXISTING_IMPLEMENTATION: <short reason>` in your final response and make no code changes.",
    "- Make the smallest production change that resolves the issue.",
    "- Add or update focused tests before changing behavior.",
    "- Run relevant tests and typecheck before finishing.",
    "- Do not commit; the executor owns commit, PR, and merge steps.",
    "- Stay inside the assigned worktree.",
    "- Do not run psql, railway, gh, git worktree, git branch, git reset, git push, git commit, or gh pr commands; the parent executor owns infrastructure, branches, commits, PRs, and database state.",
    "- Do not request or expose screenshots, transcripts, names beyond first name, phone numbers, exact addresses, or private dating details.",
    "- If the issue would remove, weaken, or roll back an existing shipped safety or privacy feature, leave `BLOCKED: superseded-by-current-design` in your final response and make no code changes.",
    "- If the issue cannot be resolved safely from the sanitized summary, leave a short BLOCKED note in your final response and do not invent private context.",
  ].join("\n");
}

export function buildPrBody(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
): string {
  return [
    "## Summary",
    `Automated swarm executor PR for issue #${plan.issueNumber}.`,
    "",
    "## Guardrails",
    "- Built from sanitized issue/work-item context only.",
    "- This is a private repo, but this PR is GitHub-visible to repo tools, CI, and integrations.",
    "- No screenshots, transcripts, phone numbers, or private dating details included.",
    `- Risk tier: ${workItem.riskTier}.`,
    `- Auto-merge queued: ${plan.autoMergeAllowed ? "yes" : "no"}.`,
    "",
    "## Verification",
    "- pnpm run typecheck",
    "",
    `Closes #${plan.issueNumber}`,
    "",
    `<!-- ${executorPrBodyMarker(workItem)} -->`,
  ].join("\n");
}

export function extractExistingImplementationResolution(
  output: string,
): string | null {
  const match = output.match(
    /RESOLVED_BY_EXISTING_IMPLEMENTATION:\s*([^\n\r]*)/i,
  );
  if (!match) return null;
  const reason = match[1]?.trim();
  return reason || "Current implementation already resolves this issue.";
}

export type ResolvedWithoutPrDecision =
  | { status: "continue" }
  | { status: "resolved-without-pr"; resolution: string }
  | { status: "blocked"; reason: string; resolution: string };

export function resolvedWithoutPrDecisionFromAgentOutput(
  output: string,
  worktreeState: { hasWorktreeChanges: boolean; hasHeadCommit: boolean },
): ResolvedWithoutPrDecision {
  const resolution = extractExistingImplementationResolution(output);
  if (!resolution) return { status: "continue" };
  if (worktreeState.hasWorktreeChanges || worktreeState.hasHeadCommit) {
    return {
      status: "blocked",
      reason:
        "Executor agent claimed resolved by existing implementation but left repository changes.",
      resolution,
    };
  }
  return { status: "resolved-without-pr", resolution };
}

export function buildResolvedWithoutPrComment(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  resolution: string,
): string {
  return [
    "## HeyTelli swarm executor",
    "",
    "Resolved without PR.",
    "",
    `Reason: ${resolution}`,
    "",
    "The executor compared the sanitized issue against the current repository and found the requested behavior is already implemented, so no code changes were made.",
    "",
    "No private screenshots, transcripts, or dating details were included.",
    "",
    `<!-- ${resolvedWithoutPrCommentMarker(workItem)} -->`,
    `<!-- heytelli-swarm-source-issue:${plan.issueNumber} -->`,
  ].join("\n");
}

export function reviewerRolesForRiskTier(
  riskTier: ImprovementRiskTier,
): SwarmAgentRole[] {
  switch (riskTier) {
    case "safe_auto_merge":
      return ["code_reviewer"];
    case "guarded_auto_merge":
      return ["product_reviewer", "privacy_reviewer", "code_reviewer"];
    case "extra_agent_review":
      return [
        "privacy_reviewer",
        "safety_reviewer",
        "backend_api_reviewer",
        "code_reviewer",
        "test_reviewer",
      ];
    case "no_auto_merge":
      return [];
  }
}

export function buildReviewerAgentPrompt(input: {
  role: SwarmAgentRole;
  workItem: SwarmExecutorWorkItem;
  plan: PlannedExecutorWorkItem;
  prUrl: string;
}): string {
  const { role, workItem, plan, prUrl } = input;
  return [
    `You are the ${role} for a HeyTelli swarm PR.`,
    "",
    `GitHub issue: #${plan.issueNumber}`,
    `Pull request: ${prUrl}`,
    `Work item: #${workItem.id}`,
    `Risk tier: ${workItem.riskTier}`,
    `Title: ${workItem.title}`,
    "",
    "Sanitized summary:",
    workItem.summary,
    "",
    "Visibility boundary:",
    "This is a private repo, but GitHub issues, PRs, prompts, CI logs, and integrations are GitHub-visible surfaces. Review only sanitized repo context and do not request private database rows.",
    "",
    "Review rules:",
    "- Inspect the current worktree and PR-relevant diff.",
    "- Do not edit files, commit, push, merge, or change labels.",
    "- Look for regressions, missing tests, privacy/safety leaks, and weak rollback behavior relevant to your role.",
    "- Output REVIEW_PASS with concise evidence when the change is acceptable.",
    "- Output REVIEW_BLOCKED with concrete file/test reasons when the change should not merge.",
  ].join("\n");
}

export function buildSwarmExecutorCommandPreview(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  options: Pick<
    SwarmExecutorOptions,
    "repoRoot" | "worktreeRoot" | "owner" | "repo" | "baseBranch"
  > & { reviewerCommand?: string | null },
): ExecutorCommandPreview[] {
  const worktreePath = path.join(options.worktreeRoot, String(workItem.id));
  const commands: ExecutorCommandPreview[] = [
    {
      kind: "fetch",
      command: "git",
      args: ["fetch", "origin", options.baseBranch],
      cwd: options.repoRoot,
    },
    {
      kind: "worktree",
      command: "git",
      args: [
        "worktree",
        "add",
        "-B",
        plan.branchName,
        worktreePath,
        `origin/${options.baseBranch}`,
      ],
      cwd: options.repoRoot,
    },
    {
      kind: "install",
      command: "pnpm",
      args: ["install", "--frozen-lockfile"],
      cwd: worktreePath,
    },
    {
      kind: "agent",
      command: "codex",
      args: [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--cd",
        worktreePath,
        "-",
      ],
      cwd: worktreePath,
    },
    {
      kind: "typecheck",
      command: "pnpm",
      args: ["run", "typecheck"],
      cwd: worktreePath,
    },
    {
      kind: "commit",
      command: "git",
      args: [
        "commit",
        "-m",
        `fix: ${slugify(workItem.title).replace(/-/g, " ")}`,
      ],
      cwd: worktreePath,
    },
    {
      kind: "push",
      command: "git",
      args: ["push", "-u", "origin", plan.branchName],
      cwd: worktreePath,
    },
    {
      kind: "pr",
      command: "gh",
      args: [
        "pr",
        "create",
        "--repo",
        `${options.owner}/${options.repo}`,
        "--base",
        options.baseBranch,
        "--head",
        plan.branchName,
      ],
      cwd: worktreePath,
    },
  ];

  if (options.reviewerCommand) {
    for (const role of reviewerRolesForRiskTier(workItem.riskTier)) {
      commands.push({
        kind: "review",
        command: "/bin/zsh",
        args: ["-lc", options.reviewerCommand],
        cwd: worktreePath,
      });
    }
  }

  if (plan.autoMergeAllowed) {
    commands.push({
      kind: "automerge",
      command: "gh",
      args: ["pr", "merge", "--squash", "--auto", "--delete-branch"],
      cwd: worktreePath,
    });
  }

  return commands;
}

export function buildSwarmExecutorDigest(
  counts: SwarmExecutorRunCounts,
): string {
  return [
    "# HeyTelli Swarm Executor Digest",
    "",
    `Mode: ${counts.dryRun ? "dry-run" : "live"}`,
    `Planned work items read: ${counts.read}`,
    `Executable: ${counts.executable}`,
    `Skipped: ${counts.skipped}`,
    `Failed: ${counts.failed}`,
    `Branches created: ${counts.branchesCreated}`,
    `Pull requests created: ${counts.pullRequestsCreated}`,
    `Resolved without PR: ${counts.resolvedWithoutPr}`,
    `Reviewer agents run: ${counts.reviewerAgentsRun}`,
    `Auto-merges queued: ${counts.autoMergesQueued}`,
    `DB rows updated: ${counts.dbUpdated}`,
  ].join("\n");
}

export function swarmExecutorRunShouldFail(
  counts: Pick<SwarmExecutorRunCounts, "failed">,
): boolean {
  return counts.failed > 0;
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    stdin?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let forceKillTimeout: NodeJS.Timeout | undefined;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    const clearTimers = () => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
    };
    const rejectOnce = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(err);
    };
    const resolveOnce = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(result);
    };
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        child.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
        reject(
          new Error(
            `${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms`,
          ),
        );
      }, options.timeoutMs);
    }
    child.on("error", rejectOnce);
    child.on("close", (code) => {
      clearTimers();
      if (settled) return;
      if (code === 0 || options.allowFailure) {
        resolveOnce({ stdout, stderr });
        return;
      }
      rejectOnce(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`,
        ),
      );
    });
    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

export async function runAgent(
  worktreePath: string,
  prompt: string,
  promptPath: string,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
): Promise<CommandResult> {
  if (options.agentCommand) {
    const violations = validateAgentCommandSafety(options.agentCommand);
    if (violations.length > 0) {
      throw new Error(`Unsafe executor agent command: ${violations.join("; ")}`);
    }
    return runner("/bin/zsh", ["-lc", options.agentCommand], {
      cwd: worktreePath,
      env: {
        ...process.env,
        HEYTELLI_SWARM_PROMPT_FILE: promptPath,
        HEYTELLI_SWARM_WORKTREE: worktreePath,
      },
      timeoutMs: options.agentTimeoutMs,
    });
  }

  return runner(
    "codex",
    [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--cd",
      worktreePath,
      "-",
    ],
    { cwd: worktreePath, stdin: prompt, timeoutMs: options.agentTimeoutMs },
  );
}

export async function runReviewerAgents(
  worktreePath: string,
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  prUrl: string,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
): Promise<number> {
  const reviewerCommand = options.reviewerCommand;
  if (!reviewerCommand) return 0;
  const violations = validateAgentCommandSafety(reviewerCommand);
  if (violations.length > 0) {
    throw new Error(`Unsafe reviewer command: ${violations.join("; ")}`);
  }
  const command: string = reviewerCommand;
  let reviewed = 0;
  const roles = reviewerRolesForRiskTier(workItem.riskTier);
  const parallelism = Math.max(1, options.reviewerParallelism);
  async function runRole(role: SwarmAgentRole): Promise<void> {
    const prompt = buildReviewerAgentPrompt({ role, workItem, plan, prUrl });
    await runner("/bin/zsh", ["-lc", command], {
      cwd: worktreePath,
      stdin: prompt,
      env: {
        ...process.env,
        HEYTELLI_SWARM_REVIEW_ROLE: role,
        HEYTELLI_SWARM_REVIEW_PROMPT: prompt,
        HEYTELLI_SWARM_PR_URL: prUrl,
        HEYTELLI_SWARM_WORKTREE: worktreePath,
      },
      timeoutMs: options.reviewerTimeoutMs,
    });
    reviewed += 1;
  }
  for (let index = 0; index < roles.length; index += parallelism) {
    await Promise.all(roles.slice(index, index + parallelism).map(runRole));
  }
  return reviewed;
}

export async function acquireExecutorRunLock(
  worktreeRoot: string,
): Promise<() => Promise<void>> {
  await mkdir(worktreeRoot, { recursive: true });
  const lockDir = path.join(worktreeRoot, EXECUTOR_LOCK_DIR_NAME);
  try {
    await mkdir(lockDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "EEXIST"
    ) {
      throw new Error(
        `Swarm executor already running; lock exists at ${lockDir}`,
      );
    }
    throw err;
  }

  await writeFile(
    path.join(lockDir, "owner"),
    [`pid=${process.pid}`, `startedAt=${new Date().toISOString()}`, ""].join(
      "\n",
    ),
    "utf8",
  );

  return async () => {
    await rm(lockDir, { recursive: true, force: true });
  };
}

export function workItemStatusAfterExecutorFailure(
  err: unknown,
): Extract<ImprovementWorkItemStatus, "planned" | "changes_requested"> {
  const message = errorMessage(err).toLowerCase();
  if (
    message.includes("timed out") ||
    message.includes("tokenrefreshfailed") ||
    message.includes("could not read username") ||
    message.includes("authentication failed")
  ) {
    return "planned";
  }
  return "changes_requested";
}

async function worktreeHasHeadCommit(
  worktreePath: string,
  baseBranch: string,
  runner: CommandRunner,
): Promise<boolean> {
  const result = await runner(
    "git",
    ["rev-list", "--count", `origin/${baseBranch}..HEAD`],
    { cwd: worktreePath },
  );
  return Number.parseInt(result.stdout.trim() || "0", 10) > 0;
}

async function worktreeHasWorkingTreeChanges(
  worktreePath: string,
  runner: CommandRunner,
): Promise<boolean> {
  const status = await runner("git", ["status", "--porcelain"], {
    cwd: worktreePath,
  });
  return Boolean(status.stdout.trim());
}

async function commitIfNeeded(
  worktreePath: string,
  workItem: SwarmExecutorWorkItem,
  baseBranch: string,
  runner: CommandRunner,
): Promise<void> {
  if (await worktreeHasWorkingTreeChanges(worktreePath, runner)) {
    await runner("git", ["add", "-A"], { cwd: worktreePath });
    await runner(
      "git",
      ["commit", "-m", `fix: ${slugify(workItem.title).replace(/-/g, " ")}`],
      { cwd: worktreePath },
    );
    return;
  }

  if (!(await worktreeHasHeadCommit(worktreePath, baseBranch, runner))) {
    throw new Error(
      "Executor agent produced no commit or working tree changes",
    );
  }
}

export async function removeExecutorScratchFiles(
  worktreePath: string,
): Promise<void> {
  await rm(path.join(worktreePath, EXECUTOR_PROMPT_FILE_NAME), {
    force: true,
  });
}

async function recordExecutorStep<T>(
  traceRecorder: ExecutorTraceRecorder | null,
  input: {
    traceId: string;
    workItemId: number;
    runId: number | null;
    agentName: string;
    name: string;
    kind: Parameters<typeof buildTraceSpan>[0]["kind"];
    metadata?: Record<string, unknown>;
  },
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await action();
    await traceRecorder?.(
      buildTraceSpan({
        ...input,
        startedAt,
        endedAt: new Date(),
        status: "succeeded",
      }),
    );
    return result;
  } catch (err) {
    await traceRecorder?.(
      buildTraceSpan({
        ...input,
        startedAt,
        endedAt: new Date(),
        status: "failed",
        errorSummary: errorMessage(err).slice(0, 500),
      }),
    );
    throw err;
  }
}

async function runHookCommand(
  hook: HookCommand,
  runner: CommandRunner,
): Promise<void> {
  await runner(hook.command, hook.args, { cwd: hook.cwd });
}

async function createOrReusePullRequest(
  worktreePath: string,
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
): Promise<{ url: string; number: number | null; created: boolean }> {
  const repo = `${options.owner}/${options.repo}`;
  const existing = await runner(
    "gh",
    ["pr", "view", plan.branchName, "--repo", repo, "--json", "number,url"],
    {
      cwd: worktreePath,
      env: githubEnv(options.token),
      allowFailure: true,
    },
  );
  if (existing.stdout.trim()) {
    try {
      const parsed = JSON.parse(existing.stdout) as {
        number?: unknown;
        url?: unknown;
      };
      if (typeof parsed.url === "string") {
        return {
          url: parsed.url,
          number: typeof parsed.number === "number" ? parsed.number : null,
          created: false,
        };
      }
    } catch {
      // `gh pr view` can print human-readable failures in some auth states.
      // Treat that as "no reusable PR" and attempt creation below.
    }
  }

  const created = await runner(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      options.baseBranch,
      "--head",
      plan.branchName,
      "--title",
      workItem.title,
      "--body",
      buildPrBody(workItem, plan),
    ],
    { cwd: worktreePath, env: githubEnv(options.token) },
  );
  const url = created.stdout
    .trim()
    .split(/\s+/)
    .find((part) => part.startsWith("http"));
  if (!url) {
    throw new Error("gh pr create did not return a PR URL");
  }
  return { url, number: prNumberFromUrl(url), created: true };
}

async function commentOnSourceIssue(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  prUrl: string,
  options: SwarmExecutorOptions,
): Promise<string | null> {
  const marker = executorPrBodyMarker(workItem);
  const existing = await findIssueCommentByMarker({
    owner: options.owner,
    repo: options.repo,
    token: options.token,
    apiUrl: options.githubApiUrl,
    issueNumber: plan.issueNumber,
    marker,
  });
  if (existing) return existing.url;
  const comment = await commentOnIssue({
    owner: options.owner,
    repo: options.repo,
    token: options.token,
    apiUrl: options.githubApiUrl,
    issueNumber: plan.issueNumber,
    body: [
      "## HeyTelli swarm executor",
      "",
      `PR: ${prUrl}`,
      `Auto-merge queued: ${plan.autoMergeAllowed ? "yes" : "no"}`,
      "",
      "No private screenshots, transcripts, or dating details were included.",
      "",
      `<!-- ${marker} -->`,
    ].join("\n"),
  });
  return comment.url;
}

async function commentOnResolvedWithoutPrIssue(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  resolution: string,
  options: SwarmExecutorOptions,
): Promise<string | null> {
  const marker = resolvedWithoutPrCommentMarker(workItem);
  const existing = await findIssueCommentByMarker({
    owner: options.owner,
    repo: options.repo,
    token: options.token,
    apiUrl: options.githubApiUrl,
    issueNumber: plan.issueNumber,
    marker,
  });
  if (existing) return existing.url;
  const comment = await commentOnIssue({
    owner: options.owner,
    repo: options.repo,
    token: options.token,
    apiUrl: options.githubApiUrl,
    issueNumber: plan.issueNumber,
    body: buildResolvedWithoutPrComment(workItem, plan, resolution),
  });
  return comment.url;
}

async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
  runner: CommandRunner,
): Promise<void> {
  await runner("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: repoRoot,
    allowFailure: true,
  });
  await rm(worktreePath, { recursive: true, force: true });
  await runner("git", ["worktree", "prune"], {
    cwd: repoRoot,
    allowFailure: true,
  });
}

async function removeLocalBranch(
  repoRoot: string,
  branchName: string,
  runner: CommandRunner,
): Promise<void> {
  await runner("git", ["branch", "-D", branchName], {
    cwd: repoRoot,
    allowFailure: true,
  });
}

async function executeWorkItem(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
  trace: {
    traceId: string;
    runId: number | null;
    recorder: ExecutorTraceRecorder | null;
  } | null = null,
): Promise<{
  outcome: "pull_request" | "resolved_without_pr";
  branchCreated: boolean;
  prCreated: boolean;
  reviewerAgentsRun: number;
  autoMergeQueued: boolean;
  prUrl: string | null;
  prNumber: number | null;
  issueCommentUrl?: string | null;
  resolution?: string;
}> {
  const worktreePath = path.join(options.worktreeRoot, String(workItem.id));
  const prompt = buildExecutorPrompt(workItem, plan);
  const promptPath = path.join(worktreePath, EXECUTOR_PROMPT_FILE_NAME);
  const hookPlan = buildExecutorHookPlan({
    riskTier: workItem.riskTier,
    repoRoot: options.repoRoot,
    worktreePath,
  });
  const traceId = trace?.traceId ?? `swarm-executor:${workItem.id}:adhoc`;
  async function step<T>(
    name: string,
    kind: Parameters<typeof buildTraceSpan>[0]["kind"],
    metadata: Record<string, unknown>,
    action: () => Promise<T>,
  ): Promise<T> {
    return recordExecutorStep(
      trace?.recorder ?? null,
      {
        traceId,
        workItemId: workItem.id,
        runId: trace?.runId ?? null,
        agentName: options.agentName,
        name,
        kind,
        metadata,
      },
      action,
    );
  }

  await mkdir(options.worktreeRoot, { recursive: true });
  await step("git.fetch", "tool", { baseBranch: options.baseBranch }, () =>
    runner("git", ["fetch", "origin", options.baseBranch], {
      cwd: options.repoRoot,
      env: gitEnv(options.token),
    }),
  );
  await step("worktree.remove_existing", "tool", { worktreePath }, () =>
    removeWorktree(options.repoRoot, worktreePath, runner),
  );
  await step(
    "worktree.add",
    "tool",
    { branchName: plan.branchName, worktreePath },
    () =>
      runner(
        "git",
        [
          "worktree",
          "add",
          "-B",
          plan.branchName,
          worktreePath,
          `origin/${options.baseBranch}`,
        ],
        { cwd: options.repoRoot },
      ),
  );
  for (const hook of hookPlan.pre) {
    await step(`hook.pre.${hook.command}`, "check", { args: hook.args }, () =>
      runHookCommand(hook, runner),
    );
  }
  await writeFile(promptPath, prompt, "utf8");

  await step("pnpm.install", "tool", {}, () =>
    runner("pnpm", ["install", "--frozen-lockfile"], { cwd: worktreePath }),
  );
  const agentResult = await step("agent.implementation", "agent", {}, () =>
    runAgent(worktreePath, prompt, promptPath, options, runner),
  );
  for (const hook of hookPlan.post) {
    await step(`hook.post.${hook.command}`, "check", { args: hook.args }, () =>
      runHookCommand(hook, runner),
    );
  }
  await step("scratch.cleanup", "tool", {}, () =>
    removeExecutorScratchFiles(worktreePath),
  );

  const resolutionText = `${agentResult.stdout}\n${agentResult.stderr}`;
  if (extractExistingImplementationResolution(resolutionText)) {
    const decision = await step(
      "resolution.no_pr_check",
      "check",
      {},
      async () =>
        resolvedWithoutPrDecisionFromAgentOutput(resolutionText, {
          hasWorktreeChanges: await worktreeHasWorkingTreeChanges(
            worktreePath,
            runner,
          ),
          hasHeadCommit: await worktreeHasHeadCommit(
            worktreePath,
            options.baseBranch,
            runner,
          ),
        }),
    );
    if (decision.status === "blocked") {
      throw new Error(decision.reason);
    }
    if (decision.status === "resolved-without-pr") {
      const issueCommentUrl = await step(
        "github.issue_resolved_without_pr_comment",
        "github",
        { issueNumber: plan.issueNumber },
        () =>
          commentOnResolvedWithoutPrIssue(
            workItem,
            plan,
            decision.resolution,
            options,
          ),
      );
      await step(
        "github.issue_close",
        "github",
        { issueNumber: plan.issueNumber },
        () =>
          closeGitHubIssue({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            apiUrl: options.githubApiUrl,
            issueNumber: plan.issueNumber,
          }),
      );
      await step(
        "github.issue_label_cleanup",
        "github",
        { issueNumber: plan.issueNumber },
        () =>
          removeIssueLabels({
            owner: options.owner,
            repo: options.repo,
            token: options.token,
            apiUrl: options.githubApiUrl,
            issueNumber: plan.issueNumber,
            labels: ["agent-ready", "swarm-active", "swarm-planned"],
          }),
      );
      if (!options.keepWorktree) {
        await step("worktree.cleanup", "tool", { worktreePath }, () =>
          removeWorktree(options.repoRoot, worktreePath, runner),
        );
        await step(
          "git.local_branch_cleanup",
          "tool",
          { branchName: plan.branchName },
          () => removeLocalBranch(options.repoRoot, plan.branchName, runner),
        );
      }
      return {
        outcome: "resolved_without_pr",
        branchCreated: true,
        prCreated: false,
        reviewerAgentsRun: 0,
        autoMergeQueued: false,
        prUrl: null,
        prNumber: null,
        issueCommentUrl,
        resolution: decision.resolution,
      };
    }
  }

  await step("git.commit", "tool", {}, () =>
    commitIfNeeded(worktreePath, workItem, options.baseBranch, runner),
  );
  await step("git.push", "tool", { branchName: plan.branchName }, () =>
    runner("git", ["push", "-u", "origin", plan.branchName], {
      cwd: worktreePath,
      env: gitEnv(options.token),
    }),
  );
  const pr = await step("github.pr", "github", {}, () =>
    createOrReusePullRequest(worktreePath, workItem, plan, options, runner),
  );
  await step("github.issue_comment", "github", { prUrl: pr.url }, () =>
    commentOnSourceIssue(workItem, plan, pr.url, options),
  );
  const reviewerAgentsRun = await step("agent.reviewers", "agent", {}, () =>
    runReviewerAgents(worktreePath, workItem, plan, pr.url, options, runner),
  );

  let autoMergeQueued = false;
  if (plan.autoMergeAllowed) {
    await step(
      "github.automerge",
      "github",
      { prNumber: pr.number, prUrl: pr.url },
      () =>
        runner(
          "gh",
          [
            "pr",
            "merge",
            pr.number == null ? pr.url : String(pr.number),
            "--repo",
            `${options.owner}/${options.repo}`,
            "--squash",
            "--auto",
            "--delete-branch",
          ],
          { cwd: worktreePath, env: githubEnv(options.token) },
        ),
    );
    autoMergeQueued = true;
  }

  if (!options.keepWorktree) {
    await step("worktree.cleanup", "tool", { worktreePath }, () =>
      removeWorktree(options.repoRoot, worktreePath, runner),
    );
  }

  return {
    outcome: "pull_request",
    branchCreated: true,
    prCreated: pr.created,
    reviewerAgentsRun,
    autoMergeQueued,
    prUrl: pr.url,
    prNumber: pr.number,
  };
}

export async function runSwarmExecutor(
  options: SwarmExecutorOptions,
  runner: CommandRunner = runCommand,
): Promise<SwarmExecutorRunCounts> {
  const counts = emptyCounts(options.dryRun);
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL missing; swarm executor cannot inspect the private queue.",
    );
  }

  const { db, improvementRuns, improvementTraceSpans, improvementWorkItems } =
    await import("@workspace/db");
  const workItems = (await db
    .select()
    .from(improvementWorkItems)
    .where(eq(improvementWorkItems.status, "planned"))
    .orderBy(asc(improvementWorkItems.createdAt))
    .limit(options.limit)) as SwarmExecutorWorkItem[];

  counts.read = workItems.length;

  for (const workItem of workItems) {
    const plan = planSwarmExecutorWorkItem(workItem, options);
    if (plan.status === "skipped") {
      counts.skipped += 1;
      continue;
    }

    let runId: number | null = null;
    try {
      const sourceIssue = await fetchGitHubIssue({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
        apiUrl: options.githubApiUrl,
        issueNumber: plan.issueNumber,
      });
      const sourceIssueBlock = sourceIssueBlockReason(sourceIssue);
      if (sourceIssueBlock) {
        counts.skipped += 1;
        if (!options.dryRun) {
          const nextStatus =
            sourceIssueBlock === "closed" ? "closed" : "changes_requested";
          await db
            .update(improvementWorkItems)
            .set({
              status: nextStatus,
              updatedAt: new Date(),
            })
            .where(eq(improvementWorkItems.id, workItem.id));
          counts.dbUpdated += 1;
          await db.insert(improvementRuns).values({
            workItemId: workItem.id,
            runType: "review",
            agentName: options.agentName,
            status: "blocked",
            summary:
              sourceIssueBlock === "closed"
                ? `Swarm executor skipped issue #${plan.issueNumber} because the source issue is closed.`
                : `Swarm executor skipped issue #${plan.issueNumber} because the source issue is blocked for recovery.`,
            metadata: {
              issueNumber: plan.issueNumber,
              issueState: sourceIssue.state,
              labels: sourceIssue.labels,
              reason: sourceIssueBlock,
              retryable: false,
            },
            completedAt: new Date(),
          });
        }
        continue;
      }
      counts.executable += 1;
      if (options.dryRun) continue;

      const [claimed] = await db
        .update(improvementWorkItems)
        .set({
          status: "building",
          branchName: plan.branchName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(improvementWorkItems.id, workItem.id),
            eq(improvementWorkItems.status, "planned"),
          ),
        )
        .returning();
      if (!claimed) {
        counts.skipped += 1;
        continue;
      }
      counts.dbUpdated += 1;

      const [run] = await db
        .insert(improvementRuns)
        .values({
          workItemId: workItem.id,
          runType: "implementation",
          agentName: options.agentName,
          status: "started",
          summary: `Swarm executor started issue #${plan.issueNumber}`,
          metadata: {
            issueNumber: plan.issueNumber,
            branchName: plan.branchName,
            riskTier: workItem.riskTier,
            autoMergeAllowed: plan.autoMergeAllowed,
          },
        })
        .returning();
      if (run) {
        runId = run.id;
      }

      const trace =
        runId == null
          ? null
          : {
              traceId: traceIdForExecutorRun(workItem.id, runId),
              runId,
              recorder: async (span: ReturnType<typeof buildTraceSpan>) => {
                await db.insert(improvementTraceSpans).values(span);
              },
            };
      const executed = await executeWorkItem(
        workItem,
        plan,
        options,
        runner,
        trace,
      );
      counts.branchesCreated += executed.branchCreated ? 1 : 0;
      counts.pullRequestsCreated += executed.prCreated ? 1 : 0;
      counts.reviewerAgentsRun += executed.reviewerAgentsRun;
      counts.autoMergesQueued += executed.autoMergeQueued ? 1 : 0;
      counts.resolvedWithoutPr +=
        executed.outcome === "resolved_without_pr" ? 1 : 0;

      if (executed.outcome === "resolved_without_pr") {
        await db
          .update(improvementWorkItems)
          .set({
            status: "closed",
            pullRequestUrl: null,
            pullRequestNumber: null,
            decisionCategory: "already_available",
            decisionDetails: executed.resolution ?? null,
            updatedAt: new Date(),
          })
          .where(eq(improvementWorkItems.id, workItem.id));
      } else {
        await db
          .update(improvementWorkItems)
          .set({
            status: plan.nextStatus,
            pullRequestUrl: executed.prUrl,
            pullRequestNumber: executed.prNumber,
            updatedAt: new Date(),
          })
          .where(eq(improvementWorkItems.id, workItem.id));
      }
      counts.dbUpdated += 1;

      if (run) {
        await db
          .update(improvementRuns)
          .set({
            status: "succeeded",
            summary:
              executed.outcome === "resolved_without_pr"
                ? `Swarm executor resolved issue #${plan.issueNumber} without a PR`
                : `Swarm executor opened PR for issue #${plan.issueNumber}`,
            logsUrl: executed.prUrl ?? executed.issueCommentUrl ?? plan.issueUrl,
            metadata: {
              issueNumber: plan.issueNumber,
              branchName: plan.branchName,
              outcome: executed.outcome,
              prUrl: executed.prUrl,
              prNumber: executed.prNumber,
              issueCommentUrl: executed.issueCommentUrl,
              resolution: executed.resolution,
              reviewerAgentsRun: executed.reviewerAgentsRun,
              autoMergeQueued: executed.autoMergeQueued,
            },
            completedAt: new Date(),
          })
          .where(eq(improvementRuns.id, run.id));
      }
    } catch (err) {
      counts.failed += 1;
      if (options.dryRun) continue;
      const failureStatus = workItemStatusAfterExecutorFailure(err);
      const retryable = failureStatus === "planned";
      const message = errorMessage(err);
      const summary = retryable
        ? `Swarm executor failed and returned issue #${plan.issueNumber} to planned: ${message}`
        : `Swarm executor failed and needs changes for issue #${plan.issueNumber}: ${message}`;
      await db
        .update(improvementWorkItems)
        .set({
          status: failureStatus,
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, workItem.id));
      const runFailure = {
        workItemId: workItem.id,
        runType: "implementation",
        agentName: options.agentName,
        status: "failed",
        summary,
        metadata: {
          issueNumber: plan.issueNumber,
          branchName: plan.branchName,
          retryable,
          nextStatus: failureStatus,
          errorMessage: message,
        },
        completedAt: new Date(),
      } as const;
      if (runId != null) {
        await db
          .update(improvementRuns)
          .set(runFailure)
          .where(eq(improvementRuns.id, runId));
      } else {
        await db.insert(improvementRuns).values(runFailure);
      }
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseExecutorArgs(process.argv.slice(2));
  const releaseLock = options.dryRun
    ? null
    : await acquireExecutorRunLock(options.worktreeRoot);
  try {
    const counts = await runSwarmExecutor(options);
    console.log(buildSwarmExecutorDigest(counts));
    if (swarmExecutorRunShouldFail(counts)) {
      throw new Error(
        `Swarm executor completed with ${counts.failed} failed item(s).`,
      );
    }
  } finally {
    await releaseLock?.();
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
