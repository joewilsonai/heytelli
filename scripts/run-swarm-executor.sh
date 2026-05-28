#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "$HOME/.luna/secrets/keys.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.luna/secrets/keys.env"
  set +a
fi

if command -v gh >/dev/null 2>&1; then
  gh_token="$(env -u GITHUB_TOKEN -u GH_TOKEN -u HEYTELLI_GITHUB_TOKEN gh auth token 2>/dev/null || true)"
  if [[ -n "$gh_token" ]]; then
    HEYTELLI_GITHUB_TOKEN="$gh_token"
    export HEYTELLI_GITHUB_TOKEN
  fi
fi

if [[ -z "${DATABASE_URL:-}" && -n "${HEYTELLI_DATABASE_URL:-}" ]]; then
  DATABASE_URL="$HEYTELLI_DATABASE_URL"
  export DATABASE_URL
fi

if [[ -z "${DATABASE_URL:-}" ]] && command -v railway >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  railway_vars_json=""
  if ! railway_vars_json="$(railway variable list --service Postgres --json 2>/dev/null)"; then
    railway_vars_json="$(
      env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN railway variable list --service Postgres --json 2>/dev/null || true
    )"
  fi
  DATABASE_URL="$(printf '%s' "$railway_vars_json" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const data = JSON.parse(s); process.stdout.write(data.DATABASE_PUBLIC_URL || data.DATABASE_URL || ""); } catch { process.stdout.write(""); } });')"
  export DATABASE_URL
fi

mode_args=()
case " $* " in
  *" --live "*|*" --no-dry-run "*|*" --dry-run "*) ;;
  *) mode_args=(--dry-run) ;;
esac

repo_root_args=()
case " $* " in
  *" --repo-root "*|*" --repo-root="*) ;;
  *) repo_root_args=(--repo-root "$ROOT_DIR") ;;
esac

execute_args=()
if (( ${#mode_args[@]} > 0 )); then
  execute_args+=("${mode_args[@]}")
fi
if (( ${#repo_root_args[@]} > 0 )); then
  execute_args+=("${repo_root_args[@]}")
fi
execute_args+=("$@")

pnpm --filter @workspace/scripts run improvement:execute -- "${execute_args[@]}"
