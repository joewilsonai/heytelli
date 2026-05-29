import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

test("builds a private date card API request without match ids or media", async () => {
  const { buildCreateDateCardRequest } = await import("./date-card-links");

  const request = buildCreateDateCardRequest({
    senderLabel: "Terry Wilson",
    match: {
      id: 42,
      name: "Maya Rose",
      nextDateAt: "2026-06-01T00:30:00.000Z",
      nextDateLocation: "Paper Plane - Downtown",
      photoObjectPath: "private-profile-photo",
      screenshotObjectPath: "private-screenshot",
      screenshots: [{ objectPath: "private-screenshot-two" }],
      dateSafetyPlan: {
        trustedCircleName: "Claire Wilson, Roommate",
        transportPlan: "Rideshare there, own ride home",
        checkInAt: "2026-06-01T02:00:00.000Z",
        expectedEndAt: "2026-06-01T03:30:00.000Z",
        codeWord: "Pineapple",
        circleNote: "Table near the front.",
        shareLiveLocation: false,
        safeDateChecklist: {
          publicPlace: true,
          ownTransport: true,
          profileReviewed: true,
          noPrivateLocationPressure: true,
          noMoneyOrPhotoPressure: true,
        },
      },
    },
  });

  assert.equal(request.senderLabel, "Terry");
  assert.equal(request.matchFirstName, "Maya");
  assert.equal(request.venueLabel, "Paper Plane");
  assert.equal(request.venueArea, "Downtown");
  assert.deepEqual(
    request.recipients.map((recipient) => recipient.label),
    ["Claire", "Roommate"],
  );
  assert.equal(request.dateEndAt, "2026-06-01T03:30:00.000Z");
  assert.doesNotMatch(
    JSON.stringify(request),
    /matchId|match_id|private-profile-photo|private-screenshot|Wilson|Rose/,
  );
});

test("adds recipient-specific private links to the share message", async () => {
  const { appendDateCardLinksToMessage } = await import("./date-card-links");

  const message = appendDateCardLinksToMessage("HeyTelli Date Card", [
    { recipientLabel: "Claire", shareUrl: "https://api.heytelli.test/c/one" },
    { recipientLabel: "Roommate", shareUrl: "https://api.heytelli.test/c/two" },
  ]);

  assert.match(message, /HeyTelli Date Card/);
  assert.match(message, /Private links/);
  assert.match(message, /Claire: https:\/\/api\.heytelli\.test\/c\/one/);
  assert.match(message, /Roommate: https:\/\/api\.heytelli\.test\/c\/two/);
});

test("finds and summarizes sender Date Card status by local date id", async () => {
  const { findPrivateDateCardForMatch, summarizePrivateDateCardStatus } =
    await import("./date-card-links");

  const card = findPrivateDateCardForMatch(
    [
      {
        id: "card-1",
        clientDateId:
          "date:2026-06-01T00:30:00.000Z:2026-06-01T02:00:00.000Z:2026-06-01T03:30:00.000Z",
        status: "sent",
        expiresAt: "2026-06-02T03:30:00.000Z",
        recipients: [
          {
            recipientLabel: "Claire",
            viewedAt: "2026-05-29T12:00:00.000Z",
            confirmedAt: null,
          },
          {
            recipientLabel: "Roommate",
            viewedAt: "2026-05-29T12:05:00.000Z",
            confirmedAt: "2026-05-29T12:06:00.000Z",
          },
        ],
      },
    ],
    {
      name: "Maya",
      nextDateAt: "2026-06-01T00:30:00.000Z",
      dateSafetyPlan: {
        checkInAt: "2026-06-01T02:00:00.000Z",
        expectedEndAt: "2026-06-01T03:30:00.000Z",
      },
    },
  );

  assert.ok(card);
  assert.equal(summarizePrivateDateCardStatus(card), "1/2 confirmed");
});

test("match detail share flow creates private links before native sharing", () => {
  const screen = readFileSync(
    fileURLToPath(new NodeURL("../app/match/[id].tsx", import.meta.url)),
    "utf8",
  );

  assert.match(screen, /createPrivateDateCardLinks/);
  assert.match(screen, /listPrivateDateCards/);
  assert.match(screen, /appendDateCardLinksToMessage/);
  assert.match(screen, /Couldn't create private link/);
});
