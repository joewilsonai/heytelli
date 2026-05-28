import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";

const {
  conversations,
  dateCards,
  improvementRuns,
  improvementSignals,
  improvementWorkItems,
  matches,
  productFeedback,
  users,
} = await import("@workspace/db");

test("private beta data has a user owner in the core schema", () => {
  assert.ok(users.id, "users table should be exported");
  assert.ok(matches.userId, "matches must belong to one signed-in user");
  assert.ok(
    conversations.userId,
    "chat conversations must belong to one signed-in user",
  );
  assert.ok(
    productFeedback.userId,
    "product feedback must retain the signed-in user's tenant",
  );
  assert.ok(dateCards.userId, "date cards must belong to one signed-in user");
  assert.ok(
    dateCards.matchId,
    "date cards must stay scoped to one owned match",
  );
  assert.ok(
    improvementSignals.userId,
    "improvement signals must retain the signed-in user's tenant",
  );
  assert.ok(
    improvementSignals.rawPayload,
    "improvement signals must keep raw payload private in the database",
  );
  assert.ok(
    improvementWorkItems.signalIds,
    "improvement work items must retain private source signal ids",
  );
  assert.ok(
    improvementRuns.workItemId,
    "improvement runs must be linked to one work item",
  );
});
