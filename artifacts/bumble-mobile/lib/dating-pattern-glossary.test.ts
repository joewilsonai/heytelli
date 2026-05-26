import assert from "node:assert/strict";
import test from "node:test";

import {
  DATING_PATTERN_GLOSSARY,
  getDatingPatternTerms,
} from "./dating-pattern-glossary.ts";

test("glossary includes common dating behavior shorthand", () => {
  const terms = DATING_PATTERN_GLOSSARY.map((item) => item.term);

  assert.ok(terms.includes("Breadcrumbing"));
  assert.ok(terms.includes("Benching"));
  assert.ok(terms.includes("Love bombing"));
  assert.ok(terms.includes("Situationship"));
});

test("glossary keeps slang educational instead of verdict-like", () => {
  const softboy = DATING_PATTERN_GLOSSARY.find(
    (item) => item.term === "Softboy",
  );

  assert.equal(softboy?.category, "slang");
  assert.match(softboy?.plainMeaning ?? "", /presentation/);
  assert.doesNotMatch(softboy?.plainMeaning ?? "", /dangerous|diagnosed/i);
});

test("filters terms by category", () => {
  const behaviorTerms = getDatingPatternTerms("behavior");

  assert.ok(behaviorTerms.length > 0);
  assert.ok(behaviorTerms.every((term) => term.category === "behavior"));
});
