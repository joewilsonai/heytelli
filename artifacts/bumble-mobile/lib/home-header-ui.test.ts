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

test("home header keeps one quiet utility action unclipped", () => {
  const screen = read("../app/index.tsx");

  assert.match(screen, /style=\{styles\.headerActions\}/);
  assert.match(screen, /headerActions:\s*\{[\s\S]*flexShrink:\s*0/);
  assert.match(screen, /accessibilityLabel="My HeyTelli settings"/);
  assert.match(screen, /<H1>Today<\/H1>/);
});

test("home screen exposes compact Today actions for add import chat and privacy", () => {
  const screen = read("../app/index.tsx");

  assert.match(screen, /styles\.todayActionRail/);
  assert.match(screen, /styles\.todayActionButton/);
  assert.match(screen, /accessibilityLabel="Add profile"/);
  assert.match(screen, /accessibilityLabel="Import screenshots"/);
  assert.match(screen, /accessibilityLabel="HeyTelli chat"/);
  assert.match(screen, /accessibilityLabel="Trust Center"/);
  assert.match(screen, /todayActionButton:\s*\{[\s\S]*minHeight:\s*44/);
  assert.doesNotMatch(screen, /primaryAddProfileButton/);
});
