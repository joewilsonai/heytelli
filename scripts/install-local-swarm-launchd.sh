#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="ai.heytelli.local-swarm"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/heytelli"
INTERVAL_SECONDS="${HEYTELLI_LOCAL_SWARM_INTERVAL_SECONDS:-900}"
LIMIT="${HEYTELLI_LOCAL_SWARM_LIMIT:-5}"
USER_DOMAIN="gui/$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

python3 - "$PLIST" "$ROOT_DIR" "$LOG_DIR" "$INTERVAL_SECONDS" "$LIMIT" <<'PY'
import plistlib
import sys

plist_path, root_dir, log_dir, interval, limit = sys.argv[1:]
command = f"cd {root_dir!r} && ./scripts/run-local-swarm-host.sh --live --limit {limit}"
payload = {
    "Label": "ai.heytelli.local-swarm",
    "ProgramArguments": ["/bin/zsh", "-lc", command],
    "RunAtLoad": True,
    "StartInterval": int(interval),
    "StandardOutPath": f"{log_dir}/local-swarm.out.log",
    "StandardErrorPath": f"{log_dir}/local-swarm.err.log",
    "WorkingDirectory": root_dir,
}

with open(plist_path, "wb") as handle:
    plistlib.dump(payload, handle, sort_keys=False)
PY

launchctl bootout "$USER_DOMAIN" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$USER_DOMAIN" "$PLIST"
launchctl enable "$USER_DOMAIN/$LABEL"
launchctl kickstart -k "$USER_DOMAIN/$LABEL"

echo "Installed $LABEL"
echo "Plist: $PLIST"
echo "Logs: $LOG_DIR/local-swarm.out.log and $LOG_DIR/local-swarm.err.log"
launchctl print "$USER_DOMAIN/$LABEL" | sed -n '1,80p'
