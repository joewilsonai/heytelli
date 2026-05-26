import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";
process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ??= "http://127.0.0.1:1/openrouter";
process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ??= "test-openrouter-key";

test("deleteMatchAndHistory deletes linked chat history before deleting the match", async () => {
  const { deleteMatchAndHistory } = await import("./matches");
  const { conversations, matches } = await import("@workspace/db");
  const calls: string[] = [];

  const tx = {
    delete(table: unknown) {
      const tableName =
        table === conversations
          ? "conversations"
          : table === matches
            ? "matches"
            : "unknown";
      calls.push(`delete:${tableName}`);
      return {
        where() {
          calls.push(`where:${tableName}`);
          return {
            returning() {
              calls.push(`returning:${tableName}`);
              return Promise.resolve([{ id: 42 }]);
            },
          };
        },
      };
    },
  };

  const db = {
    transaction<T>(fn: (transaction: typeof tx) => Promise<T>) {
      calls.push("transaction");
      return fn(tx);
    },
  };

  const deleted = await deleteMatchAndHistory(db as any, 42);

  assert.equal(deleted?.id, 42);
  assert.deepEqual(calls, [
    "transaction",
    "delete:conversations",
    "where:conversations",
    "delete:matches",
    "where:matches",
    "returning:matches",
  ]);
});

test("deleteMatchObjects deletes unique stored objects and reports failures", async () => {
  const { deleteMatchObjects } = await import("./matches");
  const deleted: string[] = [];

  const storage = {
    async getObjectEntityFile(objectPath: string) {
      if (objectPath === "/objects/missing") {
        throw new Error("not found");
      }
      return {
        async delete() {
          deleted.push(objectPath);
        },
      };
    },
  };

  const result = await deleteMatchObjects(storage as any, [
    "/objects/photo",
    "/objects/photo",
    null,
    "/objects/screenshot",
    "/objects/missing",
  ]);

  assert.deepEqual(deleted, ["/objects/photo", "/objects/screenshot"]);
  assert.deepEqual(result, { deletedCount: 2, failedCount: 1 });
});
