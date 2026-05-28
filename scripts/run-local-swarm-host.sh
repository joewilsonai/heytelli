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
else
  ./scripts/run-improvement-swarm.sh "${run_args[@]}"
fi

echo "[$(timestamp)] HeyTelli local swarm host finished"
