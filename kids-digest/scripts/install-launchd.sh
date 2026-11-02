#!/usr/bin/env bash
# Installs two launchd agents:
#   - com.kidsdigest.bridge : keeps the WhatsApp bridge running (restarts on crash / login)
#   - com.kidsdigest.digest : runs the daily digest at config.json's schedule
# Re-run after changing the schedule. Remove with: bash scripts/install-launchd.sh --uninstall
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
NODE="$(command -v node)"
LOGS="$ROOT/data/logs"
UID_NUM="$(id -u)"

for label in com.kidsdigest.bridge com.kidsdigest.digest; do
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
mkdir -p "$AGENTS" "$LOGS"

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

launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.kidsdigest.bridge.plist"
launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.kidsdigest.digest.plist"
printf 'Installed. Bridge running in background; digest daily at %02d:%02d.\nLogs: %s\n' "$HOUR" "$MINUTE" "$LOGS"
