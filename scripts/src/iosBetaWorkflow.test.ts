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

test("push iOS beta workflow skips non-mobile package-only changes before EAS", () => {
  assert.match(workflow, /detect-ios-build-scope:/);
  assert.match(workflow, /node scripts\/ci\/ios-beta-build-scope\.mjs/);
  assert.match(workflow, /should_build/);
  assert.match(workflow, /needs:\s+detect-ios-build-scope/);
  assert.match(
    workflow,
    /if:\s+needs\.detect-ios-build-scope\.outputs\.should_build == 'true'/,
  );
  assert.match(workflow, /Skip EAS build[\s\S]*?run:\s+\|/);
});

test("iOS beta workflow reports failed release jobs to GitHub issues", () => {
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /EAS_LOG_PATH="\$\{RUNNER_TEMP\}\/heytelli-eas-ios-build\.log"/);
  assert.match(workflow, /tee "\$\{EAS_LOG_PATH\}"/);
  assert.match(workflow, /PLA Update available\|Program License Agreement/);
  assert.match(
    workflow,
    /HEYTELLI_IOS_BETA_FAILURE_REASON=Apple Developer Program License Agreement requires Account Holder action\./,
  );
  assert.match(workflow, /Release blocker: iOS beta build failed/);
  assert.match(workflow, /gh issue create --title "\$\{title\}" --body "\$\{body\}" "\$\{labels\[@\]\}"/);
  assert.match(workflow, /--label needs-owner-action/);
  assert.match(workflow, /--label agent-ready/);
});
