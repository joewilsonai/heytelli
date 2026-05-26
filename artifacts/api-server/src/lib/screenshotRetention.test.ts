import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeTranscriptTurns,
  purgeAnalyzedScreenshotObjects,
  selectScreenshotsForVision,
} from "./screenshotRetention";

test("selects only screenshots whose raw image is still retained", () => {
  const retained = selectScreenshotsForVision([
    {
      id: 1,
      objectPath: null,
      rawImagePurgedAt: new Date("2026-05-25T12:00:00.000Z"),
      extractionStatus: "done",
    },
    {
      id: 2,
      objectPath: "/objects/uploads/new",
      rawImagePurgedAt: null,
      extractionStatus: "pending",
    },
    {
      id: 3,
      objectPath: "/objects/uploads/legacy",
      rawImagePurgedAt: undefined,
      extractionStatus: "done",
    },
  ]);

  assert.deepEqual(
    retained.map((s) => s.id),
    [2, 3],
  );
});

test("appends new extracted transcript turns without duplicating prior turns", () => {
  const merged = mergeTranscriptTurns(
    [
      { speaker: "her", text: "How was your weekend?" },
      { speaker: "me", text: "Pretty good, yours?" },
    ],
    [
      { speaker: "me", text: "Pretty good, yours?" },
      { speaker: "her", text: "Low key but nice." },
    ],
  );

  assert.deepEqual(merged, [
    { speaker: "her", text: "How was your weekend?" },
    { speaker: "me", text: "Pretty good, yours?" },
    { speaker: "her", text: "Low key but nice." },
  ]);
});

test("purges analyzed raw objects and clears a cover photo that points to them", async () => {
  const deleted: string[] = [];
  const marked: number[] = [];
  const cleared: string[] = [];

  const result = await purgeAnalyzedScreenshotObjects({
    shots: [
      { id: 1, objectPath: "/objects/uploads/one" },
      { id: 2, objectPath: null },
    ],
    matchPhotoObjectPath: "/objects/uploads/one",
    async deleteObject(objectPath) {
      deleted.push(objectPath);
    },
    async markScreenshotPurged(id) {
      marked.push(id);
    },
    async clearMatchPhotoObjectPath(objectPath) {
      cleared.push(objectPath);
    },
  });

  assert.deepEqual(result, { purgedCount: 1, failedCount: 0 });
  assert.deepEqual(deleted, ["/objects/uploads/one"]);
  assert.deepEqual(marked, [1]);
  assert.deepEqual(cleared, ["/objects/uploads/one"]);
});
