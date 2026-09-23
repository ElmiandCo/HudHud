#!/bin/zsh
set -e
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.elmi.hudhud.brain.plist"
NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then echo "Node.js was not found in PATH."; exit 1; fi
if [[ -z "${HUDHUD_BRAIN_TOKEN:-}" ]]; then echo "Set HUDHUD_BRAIN_TOKEN in this Terminal first, then run this script."; exit 1; fi
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.elmi.hudhud.brain</string>
<key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$BRIDGE_DIR/server.mjs</string></array>
<key>WorkingDirectory</key><string>$BRIDGE_DIR</string>
<key>EnvironmentVariables</key><dict><key>HUDHUD_BRAIN_TOKEN</key><string>${HUDHUD_BRAIN_TOKEN}</string><key>HUDHUD_CONTROL_ENABLED</key><string>true</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$BRIDGE_DIR/bridge.log</string>
<key>StandardErrorPath</key><string>$BRIDGE_DIR/bridge-error.log</string>
</dict></plist>
EOF
/bin/launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"
/bin/launchctl kickstart -k "gui/$(id -u)/com.elmi.hudhud.brain"
echo "HudHud Brain Bridge installed as a launch agent."
