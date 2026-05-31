#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

echo "[$(timestamp)] HeyTelli local swarm host starting"

if [[ -f "$HOME/.luna/secrets/keys.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.luna/secrets/keys.env"
  set +a
fi

if [[ -z "${HEYTELLI_GITHUB_TOKEN:-}" ]] && command -v railway >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  railway_worker_vars_json=""
  if ! railway_worker_vars_json="$(railway variable list --service heytelli-improvement-worker --json 2>/dev/null)"; then
    railway_worker_vars_json="$(
      env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service heytelli-improvement-worker --json 2>/dev/null || true
    )"
  fi
  HEYTELLI_GITHUB_TOKEN="$(printf '%s' "$railway_worker_vars_json" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const data = JSON.parse(s); process.stdout.write(data.HEYTELLI_GITHUB_TOKEN || ""); } catch { process.stdout.write(""); } });')"
  export HEYTELLI_GITHUB_TOKEN
fi

if [[ -z "${HEYTELLI_GITHUB_TOKEN:-}" ]] && command -v gh >/dev/null 2>&1; then
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
      env -u RAILWAY_TOKEN -u RAILWAY_API_TOKEN -u RAILWAY_PROJECT_TOKEN railway variable list --service Postgres --json 2>/dev/null || true
    )"
  fi
  DATABASE_URL="$(printf '%s' "$railway_vars_json" | node -e 'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const data = JSON.parse(s); process.stdout.write(data.DATABASE_PUBLIC_URL || data.DATABASE_URL || ""); } catch { process.stdout.write(""); } });')"
  export DATABASE_URL
fi

if command -v tailscale >/dev/null 2>&1; then
  if ! tailscale status --json >/dev/null 2>&1; then
    echo "[$(timestamp)] Tailscale is not responding; opening the app"
    open -ga Tailscale >/dev/null 2>&1 || true
    sleep 3
  fi
fi

pnpm --filter @workspace/scripts run local-swarm-host:check

mode_args=()
case " $* " in
  *" --live "*|*" --no-dry-run "*|*" --dry-run "*) ;;
  *) mode_args=(--dry-run) ;;
esac

run_args=()
if (( ${#mode_args[@]} > 0 )); then
  run_args+=("${mode_args[@]}")
fi
run_args+=("$@")

if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu ./scripts/run-improvement-swarm.sh "${run_args[@]}"
  caffeinate -dimsu ./scripts/run-swarm-executor.sh "${run_args[@]}"
  caffeinate -dimsu pnpm --filter @workspace/scripts run improvement:lifecycle -- "${run_args[@]}"
  caffeinate -dimsu pnpm --filter @workspace/scripts run ios-beta:monitor || echo "[$(timestamp)] iOS beta monitor failed; continuing"
else
  ./scripts/run-improvement-swarm.sh "${run_args[@]}"
  ./scripts/run-swarm-executor.sh "${run_args[@]}"
  pnpm --filter @workspace/scripts run improvement:lifecycle -- "${run_args[@]}"
  pnpm --filter @workspace/scripts run ios-beta:monitor || echo "[$(timestamp)] iOS beta monitor failed; continuing"
fi

echo "[$(timestamp)] HeyTelli local swarm host finished"
