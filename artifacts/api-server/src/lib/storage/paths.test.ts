import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  entityIdToObjectPath,
  joinObjectKey,
  objectPathToEntityId,
} from "./paths";

describe("storage path helpers", () => {
  it("maps object entity ids to stable API object paths", () => {
    assert.equal(
      entityIdToObjectPath("uploads/abc-123"),
      "/objects/uploads/abc-123",
    );
    assert.equal(
      entityIdToObjectPath("/uploads/abc-123/"),
      "/objects/uploads/abc-123",
    );
  });

  it("rejects invalid object entity ids", () => {
    assert.throws(() => entityIdToObjectPath(""));
    assert.throws(() => entityIdToObjectPath("../secret"));
    assert.throws(() => entityIdToObjectPath("uploads/../secret"));
  });

  it("extracts entity ids only from internal object paths", () => {
    assert.equal(
      objectPathToEntityId("/objects/uploads/abc-123"),
      "uploads/abc-123",
    );
    assert.equal(objectPathToEntityId("/public/uploads/abc-123"), null);
    assert.equal(objectPathToEntityId("/objects/../secret"), null);
  });

  it("joins provider prefixes without double slashes", () => {
    assert.equal(joinObjectKey("", "uploads/abc-123"), "uploads/abc-123");
    assert.equal(
      joinObjectKey("/private/", "/uploads/abc-123/"),
      "private/uploads/abc-123",
    );
  });
});
