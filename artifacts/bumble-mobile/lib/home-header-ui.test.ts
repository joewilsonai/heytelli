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

test("home header keeps utility actions unclipped", () => {
  const screen = read("../app/index.tsx");

  assert.match(screen, /style=\{styles\.headerActions\}/);
  assert.match(screen, /headerActions:\s*\{[\s\S]*flexShrink:\s*0/);
  assert.match(screen, /accessibilityLabel="Trust Center"/);
  assert.match(screen, /accessibilityLabel="My HeyTelli"/);
  assert.match(screen, /accessibilityLabel="HeyTelli chat"/);
});

test("home screen exposes a visible labeled add-profile action", () => {
  const screen = read("../app/index.tsx");

  assert.match(screen, /accessibilityLabel="Add profile"/);
  assert.match(screen, />\s*Add profile\s*</);
  assert.match(screen, /styles\.primaryAddProfileButton/);
  assert.match(
    screen,
    /primaryAddProfileButton:\s*\{[\s\S]*alignSelf:\s*"stretch"/,
  );
  assert.match(
    screen,
    /primaryAddProfileButton:\s*\{[\s\S]*minHeight:\s*48/,
  );
});
