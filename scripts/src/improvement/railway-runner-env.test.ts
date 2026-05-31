import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptsRoot = path.resolve(import.meta.dirname, "../..");

for (const scriptName of [
  "run-improvement-swarm.sh",
  "run-swarm-executor.sh",
]) {
  test(`${scriptName} clears project-scoped Railway tokens for fallback lookups`, () => {
    const script = readFileSync(path.join(scriptsRoot, scriptName), "utf8");

    assert.match(
      script,
      /env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service heytelli-improvement-worker --json/,
    );
    assert.match(
      script,
      /env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service Postgres --json/,
    );
  });
}

test("run-local-swarm-host exports Railway fallback env for every phase", () => {
  const script = readFileSync(
    path.join(scriptsRoot, "run-local-swarm-host.sh"),
    "utf8",
  );

  assert.match(
    script,
    /env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service heytelli-improvement-worker --json/,
  );
  assert.match(
    script,
    /env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service Postgres --json/,
  );
  assert.match(script, /export HEYTELLI_GITHUB_TOKEN/);
  assert.match(script, /export DATABASE_URL/);
});
