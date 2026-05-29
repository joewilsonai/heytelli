import assert from "node:assert/strict";
import test from "node:test";

test("builds private date card share records without match ids or raw tokens", async () => {
  const { buildDateCardCreationPlan } = await import("./dateCards");

  const plan = buildDateCardCreationPlan(
    {
      clientDateId: "date:2026-06-01",
      senderLabel: "Terry Wilson",
      matchFirstName: "Maya Rose",
      venueLabel: "  Paper Plane  ",
      venueArea: "Downtown",
      dateStartAt: "2026-06-01T00:30:00.000Z",
      dateEndAt: "2026-06-01T03:30:00.000Z",
      checkInAt: "2026-06-01T02:00:00.000Z",
      transportPlan: "Rideshare there, own ride home",
      exitPlan: "Call if I miss check-in",
      codeWordHint: "Pineapple",
      senderNote: "Table near the front. No screenshots.",
      recipients: [
        { label: "Claire Wilson", relationshipLabel: "sister" },
        { label: "Maya Hart", relationshipLabel: "roommate" },
      ],
      matchId: 42,
      screenshots: ["private-image"],
      transcript: "private chat",
    } as any,
    {
      userId: 7,
      now: new Date("2026-05-29T12:00:00.000Z"),
      shareBaseUrl: "https://api.heytelli.test",
      tokenGenerator: () => "raw-share-token",
    },
  );

  assert.equal(plan.ok, true);
  if (!plan.ok) return;

  assert.equal(plan.card.userId, 7);
  assert.equal(plan.card.senderLabel, "Terry");
  assert.equal(plan.card.matchFirstName, "Maya");
  assert.equal(plan.card.expiresAt.toISOString(), "2026-06-02T03:30:00.000Z");
  assert.equal(plan.recipients.length, 2);
  assert.deepEqual(
    plan.recipients.map((recipient) => recipient.row.recipientLabel),
    ["Claire", "Maya"],
  );
  assert.ok(plan.recipients[0]?.row.shareTokenHash);
  assert.notEqual(plan.recipients[0]?.row.shareTokenHash, "raw-share-token");
  assert.equal(plan.recipients[0]?.shareToken, "raw-share-token");
  assert.equal(
    plan.recipients[0]?.shareUrl,
    "https://api.heytelli.test/c/raw-share-token",
  );
  assert.doesNotMatch(
    JSON.stringify(plan),
    /matchId|match_id|private-image|private chat/,
  );
});

test("renders recipient date card html from allowed fields only", async () => {
  const { renderDateCardHtml } = await import("./dateCards");

  const html = renderDateCardHtml({
    card: {
      senderLabel: "Terry",
      matchFirstName: "Maya",
      venueLabel: "Paper Plane",
      venueArea: "Downtown",
      dateStartAt: new Date("2026-06-01T00:30:00.000Z"),
      dateEndAt: new Date("2026-06-01T03:30:00.000Z"),
      checkInAt: new Date("2026-06-01T02:00:00.000Z"),
      transportPlan: "Rideshare there & own ride home",
      exitPlan: "Call if check-in is missed",
      codeWordHint: "Pineapple",
      senderNote: "<script>private()</script> Table near the front.",
      status: "sent",
    },
    recipient: {
      recipientLabel: "Claire",
      relationshipLabel: "sister",
      confirmedAt: null,
      viewedAt: new Date("2026-05-29T12:00:00.000Z"),
    },
    shareToken: "raw-token",
    now: new Date("2026-05-29T12:00:00.000Z"),
  });

  assert.match(html, /Terry shared a Date Card with you/);
  assert.match(html, /Date with Maya/);
  assert.match(html, /Paper Plane/);
  assert.match(html, /Downtown/);
  assert.match(html, /Rideshare there &amp; own ride home/);
  assert.match(html, /&lt;script&gt;private\(\)&lt;\/script&gt;/);
  assert.match(html, /\/api\/date-card-shares\/raw-token\/confirm/);
  assert.doesNotMatch(html, /screenshot|transcript|match_id|matchId|red flag/i);
});
