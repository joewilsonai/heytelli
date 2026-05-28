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
  commentOnIssue,
  findIssueCommentByMarker,
  githubTokenFromEnv,
} from "./github";

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
    | "auto-merge-disabled-risk-tier";
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
  },
) => Promise<CommandResult>;

const DEFAULT_LIMIT = 3;

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

export function planSwarmExecutorWorkItem(
  workItem: SwarmExecutorWorkItem,
  options: Pick<
    SwarmExecutorOptions,
    "allowGuardedAutoMerge" | "allowExtraAutoMerge"
  > = { allowGuardedAutoMerge: false, allowExtraAutoMerge: false },
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

  const autoMergeAllowed =
    workItem.riskTier === "safe_auto_merge" ||
    (workItem.riskTier === "guarded_auto_merge" &&
      options.allowGuardedAutoMerge) ||
    (workItem.riskTier === "extra_agent_review" && options.allowExtraAutoMerge);

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
    "Implementation rules:",
    "- Make the smallest production change that resolves the issue.",
    "- Add or update focused tests before changing behavior.",
    "- Run relevant tests and typecheck before finishing.",
    "- Do not commit; the executor owns commit, PR, and merge steps.",
    "- Do not request or expose screenshots, transcripts, names beyond first name, phone numbers, exact addresses, or private dating details.",
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

export function buildSwarmExecutorCommandPreview(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  options: Pick<
    SwarmExecutorOptions,
    "repoRoot" | "worktreeRoot" | "owner" | "repo" | "baseBranch"
  >,
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
    `Auto-merges queued: ${counts.autoMergesQueued}`,
    `DB rows updated: ${counts.dbUpdated}`,
  ].join("\n");
}

export function swarmExecutorRunShouldFail(
  counts: Pick<SwarmExecutorRunCounts, "failed">,
): boolean {
  return counts.failed > 0;
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    stdin?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
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

async function runAgent(
  worktreePath: string,
  prompt: string,
  promptPath: string,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
): Promise<void> {
  if (options.agentCommand) {
    await runner("/bin/zsh", ["-lc", options.agentCommand], {
      cwd: worktreePath,
      env: {
        ...process.env,
        HEYTELLI_SWARM_PROMPT_FILE: promptPath,
        HEYTELLI_SWARM_WORKTREE: worktreePath,
      },
    });
    return;
  }

  await runner(
    "codex",
    [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--cd",
      worktreePath,
      "-",
    ],
    { cwd: worktreePath, stdin: prompt },
  );
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

async function commitIfNeeded(
  worktreePath: string,
  workItem: SwarmExecutorWorkItem,
  baseBranch: string,
  runner: CommandRunner,
): Promise<void> {
  const status = await runner("git", ["status", "--porcelain"], {
    cwd: worktreePath,
  });
  if (status.stdout.trim()) {
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

async function executeWorkItem(
  workItem: SwarmExecutorWorkItem,
  plan: PlannedExecutorWorkItem,
  options: SwarmExecutorOptions,
  runner: CommandRunner,
): Promise<{
  branchCreated: boolean;
  prCreated: boolean;
  autoMergeQueued: boolean;
  prUrl: string;
  prNumber: number | null;
}> {
  const worktreePath = path.join(options.worktreeRoot, String(workItem.id));
  const prompt = buildExecutorPrompt(workItem, plan);
  const promptPath = path.join(worktreePath, ".heytelli-swarm-prompt.md");

  await mkdir(options.worktreeRoot, { recursive: true });
  await runner("git", ["fetch", "origin", options.baseBranch], {
    cwd: options.repoRoot,
  });
  await removeWorktree(options.repoRoot, worktreePath, runner);
  await runner(
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
  );
  await writeFile(promptPath, prompt, "utf8");

  await runner("pnpm", ["install", "--frozen-lockfile"], { cwd: worktreePath });
  await runAgent(worktreePath, prompt, promptPath, options, runner);
  await runner("pnpm", ["run", "typecheck"], { cwd: worktreePath });
  await commitIfNeeded(worktreePath, workItem, options.baseBranch, runner);
  await runner("git", ["push", "-u", "origin", plan.branchName], {
    cwd: worktreePath,
  });
  const pr = await createOrReusePullRequest(
    worktreePath,
    workItem,
    plan,
    options,
    runner,
  );
  await commentOnSourceIssue(workItem, plan, pr.url, options);

  let autoMergeQueued = false;
  if (plan.autoMergeAllowed) {
    await runner(
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
    );
    autoMergeQueued = true;
  }

  if (!options.keepWorktree) {
    await removeWorktree(options.repoRoot, worktreePath, runner);
  }

  return {
    branchCreated: true,
    prCreated: pr.created,
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

  const { db, improvementRuns, improvementWorkItems } =
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
    counts.executable += 1;
    if (options.dryRun) continue;

    try {
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

      const executed = await executeWorkItem(workItem, plan, options, runner);
      counts.branchesCreated += executed.branchCreated ? 1 : 0;
      counts.pullRequestsCreated += executed.prCreated ? 1 : 0;
      counts.autoMergesQueued += executed.autoMergeQueued ? 1 : 0;

      await db
        .update(improvementWorkItems)
        .set({
          status: plan.nextStatus,
          pullRequestUrl: executed.prUrl,
          pullRequestNumber: executed.prNumber,
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, workItem.id));
      counts.dbUpdated += 1;

      if (run) {
        await db
          .update(improvementRuns)
          .set({
            status: "succeeded",
            summary: `Swarm executor opened PR for issue #${plan.issueNumber}`,
            logsUrl: executed.prUrl,
            metadata: {
              issueNumber: plan.issueNumber,
              branchName: plan.branchName,
              prUrl: executed.prUrl,
              prNumber: executed.prNumber,
              autoMergeQueued: executed.autoMergeQueued,
            },
            completedAt: new Date(),
          })
          .where(eq(improvementRuns.id, run.id));
      }
    } catch (err) {
      counts.failed += 1;
      await db
        .update(improvementWorkItems)
        .set({
          status: "changes_requested",
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, workItem.id));
      await db.insert(improvementRuns).values({
        workItemId: workItem.id,
        runType: "implementation",
        agentName: options.agentName,
        status: "failed",
        summary: `Swarm executor failed: ${errorMessage(err)}`,
        metadata: {
          issueNumber: plan.issueNumber,
          branchName: plan.branchName,
          retryable: true,
        },
        completedAt: new Date(),
      });
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseExecutorArgs(process.argv.slice(2));
  try {
    const counts = await runSwarmExecutor(options);
    console.log(buildSwarmExecutorDigest(counts));
    if (swarmExecutorRunShouldFail(counts)) {
      throw new Error(
        `Swarm executor completed with ${counts.failed} failed item(s).`,
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
