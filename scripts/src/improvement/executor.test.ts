import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildExecutorPrompt,
  buildSwarmExecutorCommandPreview,
  buildSwarmExecutorDigest,
  acquireExecutorRunLock,
  executorPrBodyMarker,
  parseExecutorArgs,
  planSwarmExecutorWorkItem,
  removeExecutorScratchFiles,
  runAgent,
  runCommand,
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

test("builds a private-data-safe executor prompt", () => {
  const plan = planSwarmExecutorWorkItem(safeWorkItem);
  assert.equal(plan.status, "executable");
  if (plan.status !== "executable") return;

  const prompt = buildExecutorPrompt(safeWorkItem, plan);

  assert.match(prompt, /GitHub issue: #88/);
  assert.match(prompt, /Settings copy around Trusted Circle/);
  assert.match(prompt, /Do not request or expose screenshots/);
  assert.match(prompt, /Stay inside the assigned worktree/);
  assert.match(prompt, /Do not run .*git commit.*gh pr/);
  assert.doesNotMatch(prompt, /555-1212|123 Main|raw transcript/i);
  assert.equal(
    executorPrBodyMarker(safeWorkItem),
    "heytelli-swarm-executor:42:88",
  );
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
    autoMergesQueued: 1,
    dbUpdated: 3,
    dryRun: false,
  };

  const digest = buildSwarmExecutorDigest(counts);

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Pull requests created: 1/);
  assert.match(digest, /Auto-merges queued: 1/);
  assert.equal(swarmExecutorRunShouldFail(counts), false);
  assert.equal(swarmExecutorRunShouldFail({ ...counts, failed: 1 }), true);
});
