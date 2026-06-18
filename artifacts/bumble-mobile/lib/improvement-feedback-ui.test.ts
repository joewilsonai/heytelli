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
  const upload = read("./upload.ts");

  assert.match(settings, /FeedbackSheet/);
  assert.match(settings, /Send feedback/);
  assert.match(settings, /Feedback status/);
  assert.match(settings, /Feedback timeline/);
  assert.match(settings, /listMyImprovementFeedbackStatuses/);
  assert.match(settings, /refreshFeedbackStatuses/);
  assert.match(settings, /No feedback sent from this phone yet/);
  assert.match(settings, /formatFeedbackStageLabel/);
  assert.match(settings, /status\.timeline/);
  assert.match(settings, /Proof/);
  assert.match(settings, /Already available/);
  assert.match(settings, /Not planned/);
  assert.match(settings, /not_planned/);
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
  assert.match(sheet, /Feedback is text-only during beta/);
  assert.doesNotMatch(sheet, /ImagePicker/);
  assert.doesNotMatch(sheet, /Attach private image/);
  assert.doesNotMatch(sheet, /Remove attachment/);
  assert.doesNotMatch(sheet, /uploadFeedbackAttachment/);
  assert.doesNotMatch(helper, /feedbackAttachment/);
  assert.doesNotMatch(upload, /uploadFeedbackAttachment|FeedbackAttachment/);
  assert.match(helper, /feedbackFollowUpStages/);
  assert.match(helper, /not_planned/);
  assert.match(helper, /Settings build notes/);
  assert.match(helper, /listMyImprovementSignals/);
  assert.match(helper, /listMyImprovementFeedbackStatuses/);
  assert.match(
    sheet,
    /We do not include screenshots or private\s+conversations in engineering issues\./,
  );
  assert.doesNotMatch(sheet, /Attachments stay private/);
  assert.match(helper, /createImprovementSignal/);
  assert.doesNotMatch(
    helper,
    /screenshotObjectPath|rawConversation|rawTranscript|transcriptText/,
  );
});
