import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import test from "node:test";

import {
  buildLocalDateCardShareEvent,
  upsertLocalDateCardEvent,
} from "./date-card-events.ts";

function readLocal(path: string): string {
  return readFileSync(
    fileURLToPath(new NodeURL(path, import.meta.url)),
    "utf8",
  );
}

const privateDateCardMatch = {
  id: 42,
  name: "Jordan Smith",
  nextDateAt: "2026-06-02T00:00:00.000Z",
  nextDateLocation: "123 Main Street",
  dateSafetyPlan: {
    trustedCircleName: "Maya, Riley",
    transportPlan: "Rideshare there, pickup from 123 Main Street",
    checkInAt: "2026-06-02T01:30:00.000Z",
    expectedEndAt: "2026-06-02T03:00:00.000Z",
    codeWord: "pineapple",
    circleNote: "Call if I mention the red jacket.",
    shareLiveLocation: true,
    safeDateChecklist: {
      publicPlace: true,
      ownTransport: true,
      circleHasPlan: false,
      profileReviewed: true,
      noPrivateLocationPressure: true,
      noMoneyOrPhotoPressure: true,
    },
  },
};

test("date card share events are idempotent and metadata-only", () => {
  const event = buildLocalDateCardShareEvent(
    privateDateCardMatch,
    new Date("2026-05-29T15:00:00.000Z"),
  );
  const repeated = buildLocalDateCardShareEvent(
    privateDateCardMatch,
    new Date("2026-05-29T16:00:00.000Z"),
  );

  assert.equal(event.type, "date_card_shared");
  assert.equal(event.idempotencyKey, repeated.idempotencyKey);
  assert.deepEqual(event.metadata, {
    hasCheckIn: true,
    hasExpectedEnd: true,
    safeDateChecklistReady: true,
    circleContactCount: 2,
    shareLiveLocation: true,
  });

  const serialized = JSON.stringify(event);
  assert.doesNotMatch(
    serialized,
    /Jordan|Smith|Maya|Riley|123 Main|Rideshare|pickup|pineapple|red jacket/i,
  );
  assert.doesNotMatch(serialized, /matchId|recipient|payload|message/i);

  assert.deepEqual(upsertLocalDateCardEvent([event], repeated), [
    { ...event, occurredAt: "2026-05-29T15:00:00.000Z" },
  ]);
});

test("date card share event storage stays local to the phone", () => {
  const localEvents = readLocal("./local-date-card-events.ts");
  const detailScreen = readLocal("../app/match/[id].tsx");

  assert.match(localEvents, /AsyncStorage/);
  assert.match(localEvents, /LOCAL_DATE_CARD_EVENT_STORAGE_KEY/);
  assert.match(localEvents, /recordLocalDateCardShareEvent/);
  assert.doesNotMatch(localEvents, /fetch\(/);
  assert.doesNotMatch(localEvents, /uploadImage/);
  assert.doesNotMatch(localEvents, /updateMatch/);

  assert.match(detailScreen, /recordLocalDateCardShareEvent/);
});
