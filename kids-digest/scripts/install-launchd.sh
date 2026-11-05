#!/usr/bin/env bash
# Installs two launchd agents:
#   - com.kidsdigest.bridge : keeps the WhatsApp bridge running (restarts on crash / login)
#   - com.kidsdigest.digest : runs the daily digest at config.json's schedule
#   - com.kidsdigest.reminder : re-sends today's action items at config.json's reminder time
# Re-run after changing the schedule. Remove with: bash scripts/install-launchd.sh --uninstall
# --digest-only reschedules the digest and reminder without restarting the bridge (used from the Kids Digest group).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
NODE="$(command -v node)"
LOGS="$ROOT/data/logs"
UID_NUM="$(id -u)"

LABELS=(com.kidsdigest.bridge com.kidsdigest.digest com.kidsdigest.reminder)
[[ "${1:-}" == "--digest-only" ]] && LABELS=(com.kidsdigest.digest com.kidsdigest.reminder)
for label in "${LABELS[@]}"; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  rm -f "$AGENTS/$label.plist"
done
if [[ "${1:-}" == "--uninstall" ]]; then
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
mkdir -p "$AGENTS" "$LOGS"
chmod 700 "$ROOT/data"
chmod 600 "$ROOT/.env"

if [[ "${1:-}" != "--digest-only" ]]; then
cat > "$AGENTS/com.kidsdigest.bridge.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.kidsdigest.bridge</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>--no-warnings=ExperimentalWarning</string><string>$ROOT/src/bridge.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOGS/bridge.log</string>
  <key>StandardErrorPath</key><string>$LOGS/bridge.log</string>
</dict></plist>
EOF
fi

cat > "$AGENTS/com.kidsdigest.digest.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.kidsdigest.digest</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>--no-warnings=ExperimentalWarning</string><string>$ROOT/src/digest.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOGS/digest.log</string>
  <key>StandardErrorPath</key><string>$LOGS/digest.log</string>
</dict></plist>
EOF

[[ "${1:-}" != "--digest-only" ]] && launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.kidsdigest.bridge.plist"
launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.kidsdigest.digest.plist"
printf 'Installed. Bridge running in background; digest daily at %02d:%02d.\n' "$HOUR" "$MINUTE"

if [[ -n "$R_HOUR" ]]; then
cat > "$AGENTS/com.kidsdigest.reminder.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.kidsdigest.reminder</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>--no-warnings=ExperimentalWarning</string><string>$ROOT/src/reminder.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>$R_HOUR</integer><key>Minute</key><integer>$R_MINUTE</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOGS/digest.log</string>
  <key>StandardErrorPath</key><string>$LOGS/digest.log</string>
</dict></plist>
EOF
launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.kidsdigest.reminder.plist"
printf 'Action-item reminder daily at %02d:%02d.\n' "$R_HOUR" "$R_MINUTE"
fi
printf 'Logs: %s\n' "$LOGS"
