#!/usr/bin/env bash
set -euo pipefail

WORKTREE="${HEYTELLI_SWARM_WORKTREE:-$(pwd)}"
ROLE="${HEYTELLI_SWARM_REVIEW_ROLE:-reviewer}"
PR_URL="${HEYTELLI_SWARM_PR_URL:-unknown}"
TMP_DIR="${TMPDIR:-/tmp}"

PROMPT_FILE="$(mktemp "${TMP_DIR%/}/heytelli-swarm-review-prompt.XXXXXX")"
AUGMENTED_PROMPT_FILE="$(mktemp "${TMP_DIR%/}/heytelli-swarm-review-full.XXXXXX")"
SCHEMA_FILE="$(mktemp "${TMP_DIR%/}/heytelli-swarm-review-schema.XXXXXX")"
RESULT_FILE="$(mktemp "${TMP_DIR%/}/heytelli-swarm-review-result.XXXXXX")"

cleanup() {
  rm -f "$PROMPT_FILE" "$AUGMENTED_PROMPT_FILE" "$SCHEMA_FILE" "$RESULT_FILE"
}
trap cleanup EXIT

cat >"$PROMPT_FILE"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI is required for swarm reviewer agents" >&2
  exit 127
fi

cat >"$SCHEMA_FILE" <<'JSON'
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "blocking": { "type": "boolean" },
    "role": { "type": "string" },
    "summary": { "type": "string" },
    "privacyRisk": {
      "type": "string",
      "enum": ["none", "low", "medium", "high"]
    },
    "verification": { "type": "string" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "severity": {
            "type": "string",
            "enum": ["blocker", "high", "medium", "low"]
          },
          "file": { "type": "string" },
          "line": {
            "anyOf": [{ "type": "integer" }, { "type": "null" }]
          },
          "message": { "type": "string" }
        },
        "required": ["severity", "file", "line", "message"]
      }
    }
  },
  "required": [
    "blocking",
    "role",
    "summary",
    "privacyRisk",
    "verification",
    "findings"
  ]
}
JSON

cat >"$AUGMENTED_PROMPT_FILE" <<EOF
You are the HeyTelli swarm reviewer for role: ${ROLE}
PR: ${PR_URL}

Review the current repository diff against origin/main from this worktree:
${WORKTREE}

Hard rules:
- Review only. Do not edit files, commit, push, merge, deploy, label issues, or change external state.
- Stay privacy-safe. Do not copy private dating details, raw transcripts, phone numbers, exact addresses, tokens, cookies, credentials, or screenshots into the output.
- Focus on blockers for this role: privacy leaks, unsafe behavior, user-visible regressions, broken tests/types, broad unrelated changes, or missing verification for risky changes.
- Treat "blocker" and "high" findings as auto-merge blockers.
- If there are no blocking issues, set "blocking": false and keep findings empty or low/medium only.
- Return only JSON matching the provided schema.

Sanitized reviewer prompt from the executor:

$(cat "$PROMPT_FILE")
EOF

codex exec \
  --cd "$WORKTREE" \
  --sandbox read-only \
  --ephemeral \
  --skip-git-repo-check \
  --output-schema "$SCHEMA_FILE" \
  --output-last-message "$RESULT_FILE" \
  - <"$AUGMENTED_PROMPT_FILE" >/dev/null

node --input-type=commonjs - "$RESULT_FILE" <<'NODE'
const fs = require("node:fs");

const resultPath = process.argv[2];
let raw = fs.readFileSync(resultPath, "utf8").trim();
if (raw.startsWith("```")) {
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

let result;
try {
  result = JSON.parse(raw);
} catch (error) {
  console.error("Reviewer returned invalid JSON");
  console.error(raw.slice(0, 2000));
  process.exit(1);
}

if (!result || typeof result.blocking !== "boolean") {
  console.error("Reviewer result is missing required blocking boolean");
  process.exit(1);
}

const findings = Array.isArray(result.findings) ? result.findings : [];
console.log(
  JSON.stringify(
    {
      role: result.role,
      blocking: result.blocking,
      privacyRisk: result.privacyRisk,
      summary: result.summary,
      findings,
      verification: result.verification,
    },
    null,
    2,
  ),
);

if (result.blocking) {
  process.exit(2);
}
NODE
