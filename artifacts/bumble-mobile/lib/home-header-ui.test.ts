import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new NodeURL(relativePath, import.meta.url)),
    "utf8",
  );
}

test("home header keeps add-match button prominent and unclipped", () => {
  const screen = read("../app/index.tsx");

  assert.match(screen, /accessibilityLabel="Add match"/);
  assert.match(screen, /style=\{styles\.headerActions\}/);
  assert.match(screen, /headerActions:\s*\{[\s\S]*flexShrink:\s*0/);
  assert.match(screen, /height:\s*52/);
  assert.match(screen, /width:\s*52/);
  assert.match(screen, /borderWidth:\s*2/);
  assert.match(screen, /borderColor:\s*c\.background/);
  assert.match(screen, /<Feather name="plus" size=\{24\}/);
});
