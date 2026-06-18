import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../../.github/workflows/improvement-swarm.yml", import.meta.url),
  "utf8",
);

test("improvement swarm workflow auto-plans agent-ready issues", () => {
  assert.match(workflow, /issues:\n\s+types:\n\s+- opened\n\s+- reopened\n\s+- labeled/);
  assert.match(workflow, /pull_request:\n\s+types:\n\s+- closed/);
  assert.match(workflow, /schedule:\n\s+- cron: "\*\/10 \* \* \* \*"/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /contains\(github\.event\.issue\.labels\.\*\.name, 'agent-ready'\)/);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && inputs\.mode != 'live' && 'true' \|\| 'false'/,
  );
  assert.match(workflow, /pnpm --filter @workspace\/scripts run improvement:lifecycle/);
});
