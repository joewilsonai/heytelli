import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutorHookPlan,
  validateAgentCommandSafety,
} from "./hooks";

test("blocks denylisted custom agent commands", () => {
  assert.deepEqual(validateAgentCommandSafety("codex exec -"), []);
  assert.match(
    validateAgentCommandSafety("git reset --hard && codex exec -").join("\n"),
    /git reset --hard/,
  );
  assert.match(
    validateAgentCommandSafety("psql $DATABASE_URL -c 'drop table users'").join(
      "\n",
    ),
    /psql/,
  );
});

test("builds deterministic pre and post executor hook plan", () => {
  const plan = buildExecutorHookPlan({
    riskTier: "extra_agent_review",
    repoRoot: "/repo",
    worktreePath: "/repo/.worktrees/42",
  });

  assert.deepEqual(
    plan.pre.map((command) => command.args.join(" ")),
    ["status --porcelain"],
  );
  assert.deepEqual(
    plan.post.map((command) => command.args.join(" ")),
    ["diff --check", "run typecheck"],
  );
});
