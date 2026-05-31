import assert from "node:assert/strict";
import test from "node:test";
import { buildUploadRequest, objectPathToUrl } from "./upload";

test("builds safe upload metadata without including raw file content", () => {
  assert.deepEqual(
    buildUploadRequest({
      name: "chat-screenshot.png",
      size: 2048,
      type: "image/png",
    }),
    {
      name: "chat-screenshot.png",
      size: 2048,
      contentType: "image/png",
    },
  );
});

test("rejects non-image uploads before requesting storage URLs", () => {
  assert.throws(
    () => buildUploadRequest({ name: "notes.txt", size: 10, type: "text/plain" }),
    /image/i,
  );
});

test("resolves private object paths through the authenticated API route", () => {
  assert.equal(objectPathToUrl(null), null);
  assert.equal(objectPathToUrl("https://cdn.example.test/a.png"), "https://cdn.example.test/a.png");
  assert.equal(objectPathToUrl("/objects/uploads/a.png"), "/api/storage/objects/uploads/a.png");
  assert.equal(objectPathToUrl("objects/uploads/a.png"), "/api/storage/objects/uploads/a.png");
});
