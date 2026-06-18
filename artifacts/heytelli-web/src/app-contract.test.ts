import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function readSourceFiles(dir = path.join(root, "src")): string {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry);
      if (statSync(fullPath).isDirectory()) return readSourceFiles(fullPath);
      if (!/\.(ts|tsx|css)$/.test(entry) || entry.endsWith(".test.ts")) return [];
      return readFileSync(fullPath, "utf8");
    })
    .join("\n");
}

test("registers the core user web app routes", () => {
  const app = read("src/App.tsx");
  for (const route of ['path="/"', 'path="/add"', 'path="/matches/:id"', 'path="/chat"', 'path="/settings"']) {
    assert.match(app, new RegExp(route.replace(/[/:]/g, "\\$&")));
  }
});

test("registers the AI-native improvement control room", () => {
  const app = read("src/App.tsx");
  const shell = read("src/components/AppShell.tsx");
  const page = read("src/pages/ImprovementControlRoom.tsx");

  assert.match(app, /path="\/improvements"/);
  assert.match(shell, /Improvements/);
  assert.match(page, /useGetImprovementControlRoom/);
  assert.match(page, /Feedback-to-feature factory/);
  assert.match(page, /Agent lanes/);
  assert.match(page, /Reconsider queue/);
  assert.match(page, /Demo script/);
});

test("includes Android-friendly screenshot upload controls", () => {
  const addMatch = read("src/pages/AddMatch.tsx");
  assert.match(addMatch, /type="file"/);
  assert.match(addMatch, /accept="image\/\*"/);
  assert.match(addMatch, /multiple/);
});

test("CSS contains mobile web ergonomics and desktop expansion", () => {
  const css = read("src/styles.css");
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.bottom-nav/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /@media\s*\(min-width:\s*760px\)/);
});

test("new consumer source avoids legacy internal product language", () => {
  const source = readSourceFiles().toLowerCase();
  assert.doesNotMatch(source, /bumble|sex potential|conversion ability|chemistry score/);
});

test("settings exposes the theme control used for mobile-web parity", () => {
  const settings = read("src/pages/Settings.tsx");
  const css = read("src/styles.css");

  assert.match(settings, /WEB_COLOR_THEME_OPTIONS/);
  assert.match(settings, /role="radiogroup"/);
  assert.match(settings, /aria-label="Color theme"/);
  assert.match(css, /\.theme-choice-grid/);
  for (const theme of ["rose", "ocean", "sage", "plum", "sunset"]) {
    assert.match(css, new RegExp(`data-color-theme="${theme}"`));
  }
});
