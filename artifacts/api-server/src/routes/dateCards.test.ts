import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./dateCards.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("date card routes expose private recipient links without requiring recipient auth", () => {
  assert.match(app, /dateCardPublicRouter/);
  assert.match(app, /app\.use\(dateCardPublicRouter\)/);
  assert.match(routes, /router\.post\("\/date-cards",\s*requireAuth/);
  assert.match(routes, /dateCardPublicRouter\.get\(\s*"\/c\/:shareToken"/);
  assert.match(
    routes,
    /router\.post\(\s*"\/date-card-shares\/:shareToken\/confirm"/,
  );
  assert.match(index, /dateCardsRouter/);
  assert.doesNotMatch(routes, /matchId|match_id|screenshots|transcript/);
  assert.match(routes, /hashShareToken/);
});
