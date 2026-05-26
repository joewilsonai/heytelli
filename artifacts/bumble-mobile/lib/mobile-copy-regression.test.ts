import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

const files = [
  "../app/index.tsx",
  "../app/match/[id].tsx",
  "../app/settings.tsx",
  "../app/trust.tsx",
  "../components/CheatSheetCard.tsx",
  "../components/DatingPatternGlossaryCard.tsx",
  "../components/RedFlagsCard.tsx",
  "../lib/dating-pattern-glossary.ts",
  "../lib/home-match-card.ts",
  "../lib/user-settings.ts",
].map((path) =>
  readFileSync(fileURLToPath(new NodeURL(path, import.meta.url)), "utf8"),
);

test("mobile copy avoids old product and verdict language", () => {
  const combined = files.join("\n");

  assert.doesNotMatch(combined, /Bumble|Haystack|Wingman|Grok/);
  assert.doesNotMatch(combined, /her signals/);
  assert.doesNotMatch(combined, /Possible concern|Saved concern/);
  assert.doesNotMatch(
    combined,
    /red flags first|flags above|FLAG.*TAKE A BEAT/,
  );
});
