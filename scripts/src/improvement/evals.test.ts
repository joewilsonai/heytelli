import assert from "node:assert/strict";
import test from "node:test";

import { evaluateImprovementCases, improvementEvalCases } from "./evals";

test("historical improvement evals cover category risk and issue policy", () => {
  const report = evaluateImprovementCases(improvementEvalCases);

  assert.equal(report.total, improvementEvalCases.length);
  assert.equal(report.failed, 0);
  assert.ok(report.total >= 4);
  assert.deepEqual(
    improvementEvalCases.map((item) => item.expected.outcome).sort(),
    ["blocked", "issue", "issue", "issue"].sort(),
  );
});
