import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGithubIssueDraft,
  buildImprovementWorkItemDraft,
  fingerprintImprovementSignal,
  normalizeImprovementSignalInput,
  sanitizeImprovementPayload,
} from "./improvementPipeline";

test("rejects forbidden client context before raw payload is persisted", () => {
  assert.equal(
    normalizeImprovementSignalInput({
      source: "in_app_feedback",
      type: "Bug",
      message: "The app accepted a private image.",
      surface: "match-read",
      clientContext: {
        platform: "ios",
        screenshot: "data:image/png;base64,abc",
      },
      technicalContextConsent: true,
    }),
    null,
  );
});

test("rejects feedback attachment metadata before raw payload is persisted", () => {
  assert.equal(
    normalizeImprovementSignalInput({
      source: "in_app_feedback",
      type: "Bug",
      message: "The in-app feedback screen should stay text-first.",
      surface: "settings-feedback",
      clientContext: {
        platform: "ios",
        feedbackAttachment: {
          objectPath: "/objects/uploads/private-feedback-1",
          contentType: "image/png",
          size: 34567,
        },
      },
      technicalContextConsent: true,
    }),
    null,
  );
});

test("rejects arbitrary feedback attachment keys before raw payload is persisted", () => {
  assert.equal(
    normalizeImprovementSignalInput({
      source: "in_app_feedback",
      type: "Bug",
      message: "The feedback screen needs private attachments.",
      surface: "settings-feedback",
      clientContext: {
        platform: "ios",
        attachmentObjectPath: "feedback/private-image.png",
      },
      technicalContextConsent: true,
    }),
    null,
  );
});

test("keeps raw payload limited to allowlisted technical context", () => {
  const normalized = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Bug",
    message: "Profile analysis failed.",
    surface: "settings-profile",
    clientContext: {
      platform: "ios",
      buildNumber: "3",
      harmlessButUnknown: "not persisted",
    },
    technicalContextConsent: true,
  });
  assert.ok(normalized);

  assert.deepEqual(normalized.rawPayload, {
    source: "in_app_feedback",
    type: "Bug",
    message: "Profile analysis failed.",
    technicalContextConsent: true,
    surface: "settings-profile",
    clientContext: { platform: "ios", buildNumber: "3" },
  });
});

test("does not persist match ids for date-card or share feedback", () => {
  const dateCard = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Confusing",
    message: "The Date Card share flow was unclear.",
    matchId: 42,
    surface: "date-card",
    technicalContextConsent: true,
  });
  assert.ok(dateCard);
  assert.equal(dateCard.matchId, null);
  assert.equal("matchId" in dateCard.rawPayload, false);

  const shareFailure = normalizeImprovementSignalInput({
    source: "share_failure",
    type: "Bug",
    message: "Native share failed.",
    matchId: 42,
    surface: "match-share",
    technicalContextConsent: true,
  });
  assert.ok(shareFailure);
  assert.equal(shareFailure.matchId, null);
  assert.equal("matchId" in shareFailure.rawPayload, false);

  const matchRead = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Bug",
    message: "The match read screen failed.",
    matchId: 42,
    surface: "match-read",
    technicalContextConsent: true,
  });
  assert.ok(matchRead);
  assert.equal(matchRead.matchId, 42);
  assert.equal(matchRead.rawPayload.matchId, 42);
});

test("does not persist match ids for human-readable Date Card improvement surfaces", () => {
  const dateCard = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Bug",
    message: "The recipient Date Card status did not update.",
    matchId: 42,
    surface: "Date Card",
    technicalContextConsent: true,
  });

  assert.ok(dateCard);
  assert.equal(dateCard.matchId, null);
  assert.equal("matchId" in dateCard.rawPayload, false);
});

test("stores sanitized message text in raw payload", () => {
  const normalized = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Safety concern",
    message:
      "Gretchen Smith pressured me for sex near Lincoln Park Zoo and the flow felt unsafe.",
    surface: "date-mode",
    technicalContextConsent: true,
  });

  assert.ok(normalized);
  assert.doesNotMatch(
    String(normalized.rawPayload.message),
    /Smith|sex|Lincoln Park Zoo/,
  );
  assert.match(String(normalized.rawPayload.message), /\[sensitive detail\]/);
});

test("sanitizes private dating details before issue creation", () => {
  const sanitized = sanitizeImprovementPayload({
    source: "in_app_feedback",
    type: "Bug",
    message:
      "Gretchen Smith texted me at 314-555-0199, pressured me for sex, and named Lincoln Park Zoo.",
    surface: "match-read",
  });

  assert.equal(sanitized.privacyRisk, "medium");
  assert.doesNotMatch(sanitized.summary, /314-555-0199/);
  assert.doesNotMatch(sanitized.summary, /Smith|sex|Lincoln Park Zoo/);
  assert.doesNotMatch(
    JSON.stringify(sanitized.sanitizedPayload),
    /314-555-0199|Smith|sex|Lincoln Park Zoo/,
  );
});

test("classifies safety concern as high-review work", () => {
  const normalized = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Safety concern",
    message: "The date escape flow was confusing while I felt unsafe.",
    surface: "date-mode",
    technicalContextConsent: true,
  });
  assert.ok(normalized);

  const workItem = buildImprovementWorkItemDraft({
    signalId: 12,
    sanitizedSummary:
      "The date escape flow was confusing while user felt unsafe.",
    sanitizedPayload: normalized.rawPayload,
    privacyRisk: "high",
    fingerprint: fingerprintImprovementSignal(normalized),
  });

  assert.equal(workItem.category, "safety_issue");
  assert.equal(workItem.riskTier, "extra_agent_review");
  assert.equal(workItem.priority, "p1");
});

test("github issue body includes sanitized reproduction context only", () => {
  const draft = buildGithubIssueDraft({
    title: "Feedback: Upload fails on settings",
    summary: "Profile analysis failed on iOS build 3.",
    category: "bug",
    priority: "p2",
    riskTier: "safe_auto_merge",
    frequencyCount: 2,
    signalIds: [1, 2],
    sanitizedPayload: {
      surface: "settings-profile",
      platform: "ios",
      buildNumber: "3",
      message: "Profile analysis failed.",
    },
  });

  assert.match(draft.body, /No private screenshots\/transcripts included/);
  assert.doesNotMatch(draft.body, /signalIds|314-555|data:image|full private/);
  assert.deepEqual(draft.labels, [
    "feedback",
    "bug",
    "priority:p2",
    "risk:safe_auto_merge",
    "agent-ready",
  ]);
});

test("fingerprints repeated feedback by product surface and sanitized summary", () => {
  const first = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Confusing",
    message: "Profile analysis failed for me.",
    surface: "settings-profile",
    technicalContextConsent: false,
  });
  const second = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Confusing",
    message: "Profile analysis failed for me.",
    surface: "settings-profile",
    technicalContextConsent: true,
    clientContext: { platform: "ios", buildNumber: "4" },
  });

  assert.ok(first);
  assert.ok(second);
  assert.equal(
    fingerprintImprovementSignal(first),
    fingerprintImprovementSignal(second),
  );
});
