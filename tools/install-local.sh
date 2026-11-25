#!/bin/zsh
# Install Oh My WORDS! on this Mac only (no Tailscale). Shipped as install.sh at the top of
# OhMyWords-share.zip; after unzipping, run:
#
#   zsh ~/Downloads/OhMyWords/install.sh
#
# Copies the game to ~/OhMyWords, keeps it running at login on port 8788, and opens it.
# Safe to re-run to update. Remove with: zsh ~/OhMyWords/tools/autostart.sh uninstall
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/OhMyWords"
PORT=8788

say() { print -P "%F{green}==>%f $*"; }
die() { print -P "%F{red}xx%f $*"; exit 1; }

[[ "$(uname)" == Darwin ]] || die "This installer is for macOS."
[[ -f "$SRC/serve.py" ]] || die "Run this from inside the unzipped OhMyWords folder."
/usr/bin/python3 -c 'import sys; assert sys.version_info >= (3, 8)' 2>/dev/null \
  || die "Python 3 is missing. Run 'xcode-select --install', let it finish, then run this again."

# Refuse to take over a port another program is using.
for pid in $(lsof -t -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null); do
  ps -o command= -p "$pid" | grep -q "OhMyWords/serve.py" \
    || die "Port $PORT is already used by another program:\n$(ps -o pid=,command= -p "$pid")"
done

# macOS blocks background apps from Downloads/Desktop/Documents, so it lives in ~/OhMyWords.
if [[ "$SRC" != "$DEST" ]]; then
  mkdir -p "$DEST"
  rsync -a --delete --exclude install.sh "$SRC/" "$DEST/"
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
fi
say "Installed into $DEST"

zsh "$DEST/tools/autostart.sh" install >/dev/null
for i in {1..20}; do
  curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.5
done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || die "The game didn't start; see /tmp/ohmywords.log"

say "Done! Play at  http://localhost:$PORT/  (it starts by itself after every restart)"
LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[[ -n "$LAN" ]] && print "   Phones/tablets on the same Wi-Fi:  http://$LAN:$PORT/"
print "   Uninstall:  zsh ~/OhMyWords/tools/autostart.sh uninstall && rm -rf ~/OhMyWords"
open "http://localhost:$PORT/"
