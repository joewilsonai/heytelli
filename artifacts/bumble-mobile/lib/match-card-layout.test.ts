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

function getMatchRowSource(): string {
  const homeScreen = read("../app/index.tsx");
  const start = homeScreen.indexOf("function MatchRow(");
  const end = homeScreen.indexOf("function toneColors(");
  assert.ok(start > -1, "MatchRow should exist on the home screen");
  assert.ok(end > start, "MatchRow should appear before toneColors");
  return homeScreen.slice(start, end);
}

test("home match card keeps long profile jobs inside the card", () => {
  const matchRow = getMatchRowSource();

  assert.match(matchRow, /<View style=\{\{ flex: 1, minWidth: 0, gap: 4 \}\}>/);
  assert.match(
    matchRow,
    /ellipsizeMode="tail"[\s\S]{0,600}\{profileLine \|\| formatTimeAgo\(match\.lastActivityAt\)\}/,
  );
});
