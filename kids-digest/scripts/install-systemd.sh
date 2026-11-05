#!/usr/bin/env bash
# Linux counterpart of install-launchd.sh, using systemd user units (no root needed after
# a one-time `sudo loginctl enable-linger $USER`, which keeps them running when you log out):
#   - kids-digest-bridge   : keeps the WhatsApp bridge running (restarts on crash / boot)
#   - kids-digest-digest   : timer for the daily digest at config.json's schedule
#   - kids-digest-reminder : timer that re-sends today's action items at config.json's reminder time
# Timers are Persistent, so a run missed while the machine was off happens at boot.
# --digest-only reschedules the timers without restarting the bridge (used from the Kids Digest group).
# Remove with: bash scripts/install-systemd.sh --uninstall
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNITS="$HOME/.config/systemd/user"
NODE="$(command -v node)"
LOGS="$ROOT/data/logs"
MODE="${1:-}"

TIMERS=(kids-digest-digest kids-digest-reminder)
ALL=(kids-digest-bridge "${TIMERS[@]}")
REMOVE=("${ALL[@]}")
[[ "$MODE" == "--digest-only" ]] && REMOVE=("${TIMERS[@]}")
for unit in "${REMOVE[@]}"; do
  if [[ "$unit" == kids-digest-bridge ]]; then
    systemctl --user disable --now "$unit.service" 2>/dev/null || true
  else
    systemctl --user disable --now "$unit.timer" 2>/dev/null || true
    rm -f "$UNITS/$unit.timer"
  fi
  rm -f "$UNITS/$unit.service"
done
systemctl --user daemon-reload
if [[ "$MODE" == "--uninstall" ]]; then
  echo "Uninstalled."
  exit 0
fi

[[ -f "$ROOT/config.json" ]] || { echo "config.json missing"; exit 1; }
[[ -f "$ROOT/.env" ]] || { echo ".env missing"; exit 1; }
[[ -d "$ROOT/data/wa-auth" ]] || { echo "Link WhatsApp first: npm run bridge (scan the QR), then Ctrl+C"; exit 1; }

HOUR="$("$NODE" -p "require('$ROOT/config.json').schedule?.hour ?? 19")"
MINUTE="$("$NODE" -p "require('$ROOT/config.json').schedule?.minute ?? 30")"
R_HOUR="$("$NODE" -p "require('$ROOT/config.json').reminder?.hour ?? ''")"
R_MINUTE="$("$NODE" -p "require('$ROOT/config.json').reminder?.minute ?? 0")"
TZ_NAME="$("$NODE" -p "require('$ROOT/config.json').timezone ?? 'Asia/Jerusalem'")"
mkdir -p "$UNITS" "$LOGS"
chmod 700 "$ROOT/data"
chmod 600 "$ROOT/.env"

oneshot() { # name script
  cat > "$UNITS/$1.service" <<EOF
[Unit]
Description=Kids Digest: $1

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$NODE --no-warnings=ExperimentalWarning $ROOT/src/$2
StandardOutput=append:$LOGS/digest.log
StandardError=append:$LOGS/digest.log
EOF
}

timer() { # name hour minute
  cat > "$UNITS/$1.timer" <<EOF
[Unit]
Description=Kids Digest: $1 schedule

[Timer]
OnCalendar=*-*-* $(printf '%02d:%02d' "$2" "$3"):00 $TZ_NAME
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

if [[ "$MODE" != "--digest-only" ]]; then
  cat > "$UNITS/kids-digest-bridge.service" <<EOF
[Unit]
Description=Kids Digest WhatsApp bridge
After=network-online.target

[Service]
WorkingDirectory=$ROOT
ExecStart=$NODE --no-warnings=ExperimentalWarning $ROOT/src/bridge.mjs
Restart=always
RestartSec=30
StandardOutput=append:$LOGS/bridge.log
StandardError=append:$LOGS/bridge.log

[Install]
WantedBy=default.target
EOF
fi

oneshot kids-digest-digest digest.mjs
timer kids-digest-digest "$HOUR" "$MINUTE"
if [[ -n "$R_HOUR" ]]; then
  oneshot kids-digest-reminder reminder.mjs
  timer kids-digest-reminder "$R_HOUR" "$R_MINUTE"
fi

systemctl --user daemon-reload
[[ "$MODE" != "--digest-only" ]] && systemctl --user enable --now kids-digest-bridge.service
systemctl --user enable --now kids-digest-digest.timer
[[ -n "$R_HOUR" ]] && systemctl --user enable --now kids-digest-reminder.timer
printf 'Installed. Digest daily at %02d:%02d' "$HOUR" "$MINUTE"
[[ -n "$R_HOUR" ]] && printf ', action-item reminder at %02d:%02d' "$R_HOUR" "$R_MINUTE"
printf '.\nLogs: %s\n' "$LOGS"
