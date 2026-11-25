#!/bin/zsh
# Keep Oh My WORDS! running in the background and start it at login (macOS launchd).
#   tools/autostart.sh install     # start now + at every login
#   tools/autostart.sh uninstall   # stop and remove
set -e
LABEL="com.ohmywords.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
case "$1" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$DIR/serve.py</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/ohmywords.log</string>
  <key>StandardErrorPath</key><string>/tmp/ohmywords.log</string>
</dict></plist>
PL
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    # bootout returns before the old job is gone; bootstrapping too soon fails with
    # "Bootstrap failed: 5: Input/output error". Wait for it to go, then retry a few times.
    for i in {1..20}; do
      launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break
      sleep 0.5
    done
    for i in {1..5}; do
      launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null && break
      [ "$i" = 5 ] && launchctl bootstrap "gui/$(id -u)" "$PLIST"
      sleep 1
    done
    echo "Installed. Oh My WORDS! now runs at http://localhost:8788/ (and starts at login)."
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed."
    ;;
  *) echo "usage: $0 install|uninstall"; exit 1 ;;
esac
