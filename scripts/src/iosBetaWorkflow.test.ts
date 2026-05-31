import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/ios-beta-build.yml", import.meta.url),
  "utf8",
);

test("main push iOS beta builds submit to TestFlight by default", () => {
  assert.match(
    workflow,
    /EAS_SUBMIT:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.submit \|\| 'true'\s*\}\}/,
  );
});

test("manual iOS beta workflow runs can still opt out of submission", () => {
  assert.match(workflow, /submit:\n\s+description: Submit the completed build/);
  assert.match(workflow, /submit:[\s\S]*?default: "true"/);
  assert.match(workflow, /options:\n\s+- "true"\n\s+- "false"/);
});
