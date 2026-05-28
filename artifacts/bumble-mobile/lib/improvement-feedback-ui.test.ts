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

test("settings and match detail expose privacy-safe improvement feedback", () => {
  const settings = read("../app/settings.tsx");
  const matchDetail = read("../app/match/[id].tsx");
  const sheet = read("../components/FeedbackSheet.tsx");
  const helper = read("./improvement-feedback.ts");

  assert.match(settings, /FeedbackSheet/);
  assert.match(settings, /Send feedback/);
  assert.match(matchDetail, /FeedbackSheet/);
  assert.match(matchDetail, /Tell us more/);
  assert.match(helper, /Bug/);
  assert.match(helper, /Confusing/);
  assert.match(helper, /Idea/);
  assert.match(helper, /Safety concern/);
  assert.match(helper, /Love this/);
  assert.match(sheet, /Include basic app context/);
  assert.match(sheet, /buildFeedbackReceiptMessage/);
  assert.match(sheet, /Feedback saved/);
  assert.match(helper, /feedbackFollowUpStages/);
  assert.match(helper, /Settings build notes/);
  assert.match(
    sheet,
    /We do not include screenshots or private\s+conversations in engineering issues\./,
  );
  assert.match(sheet, /keep it on your phone for now/);
  assert.match(sheet, /redaction, consent, and auto-delete/);
  assert.match(helper, /createImprovementSignal/);
  assert.doesNotMatch(
    helper,
    /screenshotObjectPath|rawConversation|rawTranscript|transcriptText/,
  );
});
