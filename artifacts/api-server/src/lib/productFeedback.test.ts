import assert from "node:assert/strict";
import test from "node:test";

test("normalizes product feedback without accepting arbitrary sensitive context", async () => {
  const { normalizeProductFeedback } = await import("./productFeedback");

  const feedback = normalizeProductFeedback({
    event: "date-card-shared",
    answer: "would-use",
    matchId: 42,
    context: {
      surface: "date-card",
      prompt: "Would you send this to a friend?",
      phone: "314-555-0199",
      screenshotObjectPath: "screenshots/private.png",
    },
  });

  assert.deepEqual(feedback, {
    event: "date-card-shared",
    answer: "would-use",
    matchId: null,
    context: {
      surface: "date-card",
      prompt: "Would you send this to a friend?",
    },
  });
});

test("rejects empty feedback events and answers", async () => {
  const { normalizeProductFeedback } = await import("./productFeedback");

  assert.equal(normalizeProductFeedback({ event: "", answer: "yes" }), null);
  assert.equal(normalizeProductFeedback({ event: "share", answer: "" }), null);
});
