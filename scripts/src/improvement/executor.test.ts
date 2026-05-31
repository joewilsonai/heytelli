import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPrBody,
  buildExecutorPrompt,
  buildReviewerAgentPrompt,
  buildSwarmExecutorCommandPreview,
  buildSwarmExecutorDigest,
  acquireExecutorRunLock,
  executorPrBodyMarker,
  gitEnv,
  issueLabelsAllowExecutor,
  parseExecutorArgs,
  planSwarmExecutorWorkItem,
  removeExecutorScratchFiles,
  runAgent,
  runCommand,
  runReviewerAgents,
  reviewerRolesForRiskTier,
  sourceIssueBlockReason,
  swarmExecutorRunShouldFail,
  workItemStatusAfterExecutorFailure,
} from "./executor";

const safeWorkItem = {
  id: 42,
  title: "Feedback: settings - clearer circle copy",
  summary: "Settings copy around Trusted Circle labels is confusing.",
  category: "copy" as const,
  priority: "p3" as const,
  riskTier: "safe_auto_merge" as const,
  status: "planned" as const,
  githubIssueNumber: 88,
  githubIssueUrl: "https://github.com/joewilsonai/heytelli/issues/88",
  branchName: null,
  pullRequestUrl: null,
  pullRequestNumber: null,
};

test("plans safe work items for PR creation and auto-merge", () => {
  const result = planSwarmExecutorWorkItem(safeWorkItem);

  assert.equal(result.status, "executable");
  if (result.status !== "executable") return;
  assert.equal(
    result.branchName,
    "swarm/42-feedback-settings-clearer-circle-copy",
  );
  assert.equal(result.autoMergeAllowed, true);
  assert.equal(result.nextStatus, "checks_running");
});

test("keeps guarded and extra-review work out of auto-merge by default", () => {
  const guarded = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "guarded_auto_merge",
  });
  assert.equal(guarded.status, "executable");
  if (guarded.status !== "executable") return;
  assert.equal(guarded.autoMergeAllowed, false);
  assert.equal(guarded.nextStatus, "reviewing");

  const extra = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "extra_agent_review",
  });
  assert.equal(extra.status, "executable");
  if (extra.status !== "executable") return;
  assert.equal(extra.autoMergeAllowed, false);
  assert.equal(extra.nextStatus, "reviewing");
});

test("requires configured reviewer agents before guarded or extra auto-merge", () => {
  const guardedWithoutReviewer = planSwarmExecutorWorkItem(
    {
      ...safeWorkItem,
      riskTier: "guarded_auto_merge",
    },
    { allowGuardedAutoMerge: true, allowExtraAutoMerge: false },
  );
  assert.equal(guardedWithoutReviewer.status, "executable");
  if (guardedWithoutReviewer.status !== "executable") return;
  assert.equal(guardedWithoutReviewer.autoMergeAllowed, false);

  const guardedWithReviewer = planSwarmExecutorWorkItem(
    {
      ...safeWorkItem,
      riskTier: "guarded_auto_merge",
    },
    {
      allowGuardedAutoMerge: true,
      allowExtraAutoMerge: false,
      reviewerCommand: "codex exec -",
    },
  );
  assert.equal(guardedWithReviewer.status, "executable");
  if (guardedWithReviewer.status !== "executable") return;
  assert.equal(guardedWithReviewer.autoMergeAllowed, true);
});

test("blocks no-auto-merge and issue-less work items", () => {
  assert.deepEqual(
    planSwarmExecutorWorkItem({
      ...safeWorkItem,
      riskTier: "no_auto_merge",
    }),
    {
      status: "skipped",
      reason: "auto-merge-disabled-risk-tier",
      workItemId: 42,
    },
  );

  assert.deepEqual(
    planSwarmExecutorWorkItem({
      ...safeWorkItem,
      githubIssueNumber: null,
      githubIssueUrl: null,
    }),
    {
      status: "skipped",
      reason: "missing-github-issue",
      workItemId: 42,
    },
  );
});

test("allows review-gated recovery work but blocks unsafe recovery labels", () => {
  assert.equal(
    issueLabelsAllowExecutor([
      "swarm-planned",
      "swarm-recovery",
      "risk:extra_agent_review",
    ]),
    true,
  );
  assert.equal(
    issueLabelsAllowExecutor(["swarm-planned", "swarm-blocked"]),
    false,
  );
  assert.equal(
    issueLabelsAllowExecutor(["contains-private-context", "agent-ready"]),
    false,
  );
  assert.equal(
    issueLabelsAllowExecutor(["agent-ready", "risk:no_auto_merge"]),
    false,
  );
});

test("blocks closed or recovery-blocked source issues before worker execution", () => {
  assert.equal(
    sourceIssueBlockReason({ state: "closed", labels: ["swarm-planned"] }),
    "closed",
  );
  assert.equal(
    sourceIssueBlockReason({ state: "open", labels: ["swarm-blocked"] }),
    "blocked",
  );
  assert.equal(
    sourceIssueBlockReason({
      state: "open",
      labels: ["swarm-planned", "risk:extra_agent_review"],
    }),
    null,
  );
});

test("builds a private-data-safe executor prompt", () => {
  const plan = planSwarmExecutorWorkItem(safeWorkItem);
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const prompt = buildExecutorPrompt(safeWorkItem, plan);

  assert.match(prompt, /GitHub issue: #88/);
  assert.match(prompt, /Settings copy around Trusted Circle/);
  assert.match(prompt, /Do not request or expose screenshots/);
  assert.match(prompt, /Stay inside the assigned worktree/);
  assert.match(prompt, /private repo/i);
  assert.match(prompt, /GitHub-visible/i);
  assert.match(prompt, /Do not run .*git commit.*gh pr/);
  assert.match(prompt, /RESOLVED_BY_EXISTING_IMPLEMENTATION/);
  assert.match(prompt, /superseded-by-current-design/);
  assert.doesNotMatch(prompt, /555-1212|123 Main|raw transcript/i);
  assert.equal(
    executorPrBodyMarker(safeWorkItem),
    "heytelli-swarm-executor:42:88",
  );

  const body = buildPrBody(safeWorkItem, plan);
  assert.match(body, /private repo/i);
  assert.match(body, /GitHub-visible/i);
  assert.doesNotMatch(body, /public GitHub|public handoff/i);
});

test("builds reviewer agent prompts from sanitized repo-visible context", () => {
  const plan = planSwarmExecutorWorkItem(safeWorkItem);
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  assert.deepEqual(reviewerRolesForRiskTier("extra_agent_review"), [
    "privacy_reviewer",
    "safety_reviewer",
    "backend_api_reviewer",
    "code_reviewer",
    "test_reviewer",
  ]);

  const prompt = buildReviewerAgentPrompt({
    role: "privacy_reviewer",
    workItem: { ...safeWorkItem, riskTier: "extra_agent_review" },
    plan,
    prUrl: "https://github.com/joewilsonai/heytelli/pull/91",
  });

  assert.match(prompt, /privacy_reviewer/);
  assert.match(prompt, /REVIEW_PASS/);
  assert.match(prompt, /REVIEW_BLOCKED/);
  assert.match(prompt, /private repo/i);
  assert.match(prompt, /GitHub-visible/i);
  assert.match(prompt, /Do not edit files/);
  assert.doesNotMatch(prompt, /raw transcript|555-1212|123 Main/i);
});

test("previews command sequence including auto-merge only when allowed", () => {
  const plan = planSwarmExecutorWorkItem(safeWorkItem);
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const commands = buildSwarmExecutorCommandPreview(safeWorkItem, plan, {
    repoRoot: "/repo",
    worktreeRoot: "/repo/.worktrees/swarm-executor",
    owner: "joewilsonai",
    repo: "heytelli",
    baseBranch: "main",
  });

  assert.deepEqual(
    commands.map((command) => command.kind),
    [
      "fetch",
      "worktree",
      "install",
      "agent",
      "typecheck",
      "commit",
      "push",
      "pr",
      "automerge",
    ],
  );

  const guarded = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "guarded_auto_merge",
  });
  assert.equal(guarded.status, "executable");
  if (guarded.status !== "executable") return;
  assert.ok(
    !buildSwarmExecutorCommandPreview(safeWorkItem, guarded, {
      repoRoot: "/repo",
      worktreeRoot: "/repo/.worktrees/swarm-executor",
      owner: "joewilsonai",
      repo: "heytelli",
      baseBranch: "main",
    }).some((command) => command.kind === "automerge"),
  );
});

test("previews configured reviewer agent commands", () => {
  const plan = planSwarmExecutorWorkItem(
    {
      ...safeWorkItem,
      riskTier: "extra_agent_review",
    },
    {
      allowGuardedAutoMerge: false,
      allowExtraAutoMerge: true,
      reviewerCommand: "codex exec -",
    },
  );
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const commands = buildSwarmExecutorCommandPreview(
    { ...safeWorkItem, riskTier: "extra_agent_review" },
    plan,
    {
      repoRoot: "/repo",
      worktreeRoot: "/repo/.worktrees/swarm-executor",
      owner: "joewilsonai",
      repo: "heytelli",
      baseBranch: "main",
      reviewerCommand: "codex exec -",
    },
  );

  assert.equal(
    commands.filter((command) => command.kind === "review").length,
    5,
  );
  assert.equal(commands.at(-1)?.kind, "automerge");
});

test("removes executor scratch prompt before commit staging", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "heytelli-executor-"));
  try {
    const promptPath = path.join(tempDir, ".heytelli-swarm-prompt.md");
    const realChangePath = path.join(tempDir, "real-change.txt");
    await writeFile(promptPath, "sanitized executor prompt", "utf8");
    await writeFile(realChangePath, "keep me", "utf8");

    await removeExecutorScratchFiles(tempDir);

    await assert.rejects(stat(promptPath), /ENOENT/);
    assert.equal(await readFile(realChangePath, "utf8"), "keep me");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parses executor CLI options", () => {
  const options = parseExecutorArgs(
    [
      "--live",
      "--limit",
      "3",
      "--owner",
      "joewilsonai",
      "--repo=heytelli",
      "--base-branch",
      "main",
      "--allow-guarded-auto-merge",
      "--reviewer-command",
      "codex exec -",
      "--agent-name",
      "local-executor",
    ],
    {},
  );

  assert.equal(options.dryRun, false);
  assert.equal(options.limit, 3);
  assert.equal(options.owner, "joewilsonai");
  assert.equal(options.repo, "heytelli");
  assert.equal(options.baseBranch, "main");
  assert.equal(options.allowGuardedAutoMerge, true);
  assert.equal(options.allowExtraAutoMerge, false);
  assert.equal(options.agentName, "local-executor");
  assert.equal(options.agentTimeoutMs, 600_000);
  assert.equal(options.reviewerCommand, "codex exec -");
  assert.equal(options.reviewerTimeoutMs, 300_000);
  assert.equal(options.reviewerParallelism, 1);
});

test("parses executor agent timeout from CLI or env", () => {
  assert.equal(
    parseExecutorArgs(["--agent-timeout-ms", "120000"], {}).agentTimeoutMs,
    120_000,
  );
  assert.equal(
    parseExecutorArgs([], {
      IMPROVEMENT_EXECUTOR_AGENT_TIMEOUT_MS: "90000",
    }).agentTimeoutMs,
    90_000,
  );
});

test("builds non-interactive git auth env from the GitHub token", () => {
  const env = gitEnv("secret-token");

  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GH_TOKEN, "secret-token");
  assert.equal(env.GITHUB_TOKEN, "secret-token");
  assert.equal(env.GIT_CONFIG_COUNT, "1");
  assert.equal(
    env.GIT_CONFIG_KEY_0,
    "url.https://x-access-token:secret-token@github.com/.insteadOf",
  );
  assert.equal(env.GIT_CONFIG_VALUE_0, "https://github.com/");
});

test("passes a timeout to child agent execution", async () => {
  const calls: Array<{ command: string; timeoutMs?: number }> = [];
  const options = {
    ...parseExecutorArgs([], {}),
    agentCommand: "echo ok",
    agentTimeoutMs: 1234,
  };

  await runAgent(
    "/tmp/worktree",
    "prompt",
    "/tmp/prompt.md",
    options,
    async (command, _args, runOptions) => {
      calls.push({ command, timeoutMs: runOptions?.timeoutMs });
      return { stdout: "", stderr: "" };
    },
  );

  assert.deepEqual(calls, [{ command: "/bin/zsh", timeoutMs: 1234 }]);
});

test("runs configured reviewer agents with role-specific environment", async () => {
  const calls: Array<{
    role?: string;
    stdin?: string;
    timeoutMs?: number;
  }> = [];
  const plan = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "guarded_auto_merge",
  });
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const count = await runReviewerAgents(
    "/tmp/worktree",
    { ...safeWorkItem, riskTier: "guarded_auto_merge" },
    plan,
    "https://github.com/joewilsonai/heytelli/pull/91",
    {
      ...parseExecutorArgs([], {}),
      reviewerCommand: "reviewer",
      reviewerTimeoutMs: 123,
    },
    async (_command, _args, runOptions) => {
      calls.push({
        role: runOptions?.env?.HEYTELLI_SWARM_REVIEW_ROLE,
        stdin: runOptions?.stdin,
        timeoutMs: runOptions?.timeoutMs,
      });
      return { stdout: "REVIEW_PASS", stderr: "" };
    },
  );

  assert.equal(count, 3);
  assert.deepEqual(
    calls.map((call) => call.role),
    ["product_reviewer", "privacy_reviewer", "code_reviewer"],
  );
  assert.equal(calls[0]?.timeoutMs, 123);
  assert.match(calls[0]?.stdin ?? "", /REVIEW_PASS/);
});

test("runs reviewer agents with bounded parallelism", async () => {
  let active = 0;
  let maxActive = 0;
  const plan = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "extra_agent_review",
  });
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const count = await runReviewerAgents(
    "/tmp/worktree",
    { ...safeWorkItem, riskTier: "extra_agent_review" },
    plan,
    "https://github.com/joewilsonai/heytelli/pull/91",
    {
      ...parseExecutorArgs([], {}),
      reviewerCommand: "reviewer",
      reviewerParallelism: 2,
    },
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { stdout: "REVIEW_PASS", stderr: "" };
    },
  );

  assert.equal(count, 5);
  assert.equal(maxActive, 2);
});

test("reviewer agent failures block the executor", async () => {
  const plan = planSwarmExecutorWorkItem({
    ...safeWorkItem,
    riskTier: "safe_auto_merge",
  });
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  await assert.rejects(
    runReviewerAgents(
      "/tmp/worktree",
      safeWorkItem,
      plan,
      "https://github.com/joewilsonai/heytelli/pull/91",
      {
        ...parseExecutorArgs([], {}),
        reviewerCommand: "reviewer",
      },
      async () => {
        throw new Error("review blocked");
      },
    ),
    /review blocked/,
  );
});

test("kills child commands that exceed their timeout", async () => {
  await assert.rejects(
    runCommand(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
      timeoutMs: 50,
    }),
    /timed out after 50ms/,
  );
});

test("serializes live executor runs with a lock directory", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "heytelli-executor-lock-"));
  try {
    const release = await acquireExecutorRunLock(tempDir);

    await assert.rejects(acquireExecutorRunLock(tempDir), /already running/);

    await release();
    const releaseAgain = await acquireExecutorRunLock(tempDir);
    await releaseAgain();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("retryable executor failures return work items to planned", () => {
  assert.equal(
    workItemStatusAfterExecutorFailure(
      new Error("codex exec timed out after 600000ms"),
    ),
    "planned",
  );
  assert.equal(
    workItemStatusAfterExecutorFailure(
      new Error('Auth(TokenRefreshFailed("Failed to parse server response"))'),
    ),
    "planned",
  );
  assert.equal(
    workItemStatusAfterExecutorFailure(
      new Error("fatal: could not read Username for 'https://github.com'"),
    ),
    "planned",
  );
  assert.equal(
    workItemStatusAfterExecutorFailure(
      new Error("remote: Invalid username or token. Authentication failed"),
    ),
    "planned",
  );
  assert.equal(
    workItemStatusAfterExecutorFailure(new Error("typecheck failed")),
    "changes_requested",
  );
});

test("executor digest reports PR and merge progress", () => {
  const counts = {
    read: 2,
    executable: 1,
    skipped: 1,
    failed: 0,
    branchesCreated: 1,
    pullRequestsCreated: 1,
    reviewerAgentsRun: 2,
    autoMergesQueued: 1,
    dbUpdated: 3,
    dryRun: false,
  };

  const digest = buildSwarmExecutorDigest(counts);

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Pull requests created: 1/);
  assert.match(digest, /Reviewer agents run: 2/);
  assert.match(digest, /Auto-merges queued: 1/);
  assert.equal(swarmExecutorRunShouldFail(counts), false);
  assert.equal(swarmExecutorRunShouldFail({ ...counts, failed: 1 }), true);
});
