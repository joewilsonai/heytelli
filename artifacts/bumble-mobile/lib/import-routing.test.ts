import assert from "node:assert/strict";
import test from "node:test";

import { resolveImportTarget } from "./import-routing.ts";

const baseMatch = {
  id: 1,
  name: "Maya",
  status: "active",
};

test("selects a single active match when the extracted first name matches", () => {
  const result = resolveImportTarget("Maya", [
    baseMatch,
    { id: 2, name: "Sophie", status: "active" },
  ]);

  assert.equal(result.mode, "existing");
  assert.equal(result.match?.id, 1);
});

test("requires a choice when more than one active match has the same first name", () => {
  const result = resolveImportTarget("Sarah", [
    { id: 1, name: "Sarah", status: "active" },
    { id: 2, name: "Sarah M.", status: "active" },
  ]);

  assert.equal(result.mode, "ambiguous");
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.id),
    [1, 2],
  );
});

test("does not auto-select archived matches", () => {
  const result = resolveImportTarget("Maya", [
    { id: 1, name: "Maya", status: "archived" },
  ]);

  assert.equal(result.mode, "new");
});

test("keeps new-match flow when the extracted name is empty or generic", () => {
  assert.equal(resolveImportTarget(null, [baseMatch]).mode, "new");
  assert.equal(resolveImportTarget("New Match", [baseMatch]).mode, "new");
});
