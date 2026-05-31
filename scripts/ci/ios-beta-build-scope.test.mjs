import assert from "node:assert/strict";
import test from "node:test";

import {
  decideIosBetaBuild,
  isIosBetaImpactingFile,
  parseChangedFiles,
} from "./ios-beta-build-scope.mjs";

test("manual iOS beta runs are always allowed", () => {
  const decision = decideIosBetaBuild({
    eventName: "workflow_dispatch",
    changedFiles: ["artifacts/heytelli-web/src/App.tsx"],
  });

  assert.equal(decision.shouldBuild, true);
  assert.match(decision.reason, /requested explicitly/);
});

test("mobile and generated API client changes trigger iOS beta builds", () => {
  assert.equal(isIosBetaImpactingFile("artifacts/bumble-mobile/app/settings.tsx"), true);
  assert.equal(isIosBetaImpactingFile("lib/api-client-react/src/generated/index.ts"), true);
  assert.equal(isIosBetaImpactingFile("lib/api-spec/openapi.yaml"), true);
  assert.equal(isIosBetaImpactingFile("lib/api-zod/src/generated/index.ts"), true);
  assert.equal(isIosBetaImpactingFile("tsconfig.base.json"), true);
  assert.equal(isIosBetaImpactingFile("pnpm-workspace.yaml"), true);
});

test("web and package-only push changes skip the EAS lane", () => {
  const decision = decideIosBetaBuild({
    eventName: "push",
    changedFiles: [
      "artifacts/heytelli-web/src/App.tsx",
      "artifacts/heytelli-web/package.json",
      "package.json",
      "pnpm-lock.yaml",
      "docs/user-facing-web.md",
    ],
  });

  assert.equal(decision.shouldBuild, false);
  assert.match(decision.reason, /non-mobile/);
});

test("push changes fail open when Git history cannot report files", () => {
  const decision = decideIosBetaBuild({
    eventName: "push",
    changedFiles: [],
  });

  assert.equal(decision.shouldBuild, true);
  assert.match(decision.reason, /failing open/);
});

test("changed file parsing trims empty lines", () => {
  assert.deepEqual(
    parseChangedFiles(" artifacts/bumble-mobile/app/index.tsx\n\nREADME.md\n"),
    ["artifacts/bumble-mobile/app/index.tsx", "README.md"],
  );
});
