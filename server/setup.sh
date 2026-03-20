#!/usr/bin/env bash
# One-time setup: register the executable-code-block server as a system service
# so it starts automatically on login.
#
# Usage:  cd server && npm install && bash setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_JS="$SCRIPT_DIR/server.js"
NODE_BIN="$(which node)"

if [[ ! -f "$SERVER_JS" ]]; then
  echo "Error: server.js not found at $SERVER_JS" >&2
  exit 1
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Error: node not found in PATH" >&2
  exit 1
fi

echo "Node:   $NODE_BIN"
echo "Server: $SERVER_JS"
echo ""

# ── macOS (launchd) ──────────────────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST="$PLIST_DIR/com.logseq.executable-code-block.plist"
  LOG_DIR="$HOME/Library/Logs"

  mkdir -p "$PLIST_DIR"

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.logseq.executable-code-block</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SERVER_JS</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/logseq-executable-code-block.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/logseq-executable-code-block.log</string>
</dict>
</plist>
EOF

  # Unload first in case it already exists
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"

  echo "✓ Service registered (macOS launchd)"
  echo "  Label:   com.logseq.executable-code-block"
  echo "  Log:     $LOG_DIR/logseq-executable-code-block.log"
  echo ""
  echo "  To stop:    launchctl unload $PLIST"
  echo "  To restart: launchctl unload $PLIST && launchctl load $PLIST"

# ── Linux (systemd user) ─────────────────────────────────────────────────────
elif [[ "$(uname)" == "Linux" ]]; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE="$SERVICE_DIR/logseq-executable-code-block.service"

  mkdir -p "$SERVICE_DIR"

  cat > "$SERVICE" <<EOF
[Unit]
Description=Logseq Executable Code Block WebSocket Server
After=network.target

[Service]
ExecStart=$NODE_BIN $SERVER_JS
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now logseq-executable-code-block.service

  echo "✓ Service registered (systemd user)"
  echo "  Unit: logseq-executable-code-block.service"
  echo ""
  echo "  Status:  systemctl --user status logseq-executable-code-block"
  echo "  Logs:    journalctl --user -u logseq-executable-code-block -f"
  echo "  Stop:    systemctl --user stop logseq-executable-code-block"

else
  echo "Unsupported OS: $(uname)" >&2
  echo "Please use setup.ps1 on Windows or start the server manually:" >&2
  echo "  node $SERVER_JS" >&2
  exit 1
fi

echo ""
echo "The server will now start automatically on login."
echo "Reload Logseq to connect."
