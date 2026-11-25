#!/bin/zsh
# Install Oh My WORDS! on a Mac and publish it as a Tailscale Service.
# Run this ON the host Mac (e.g. the Mac mini):
#
#   zsh install-host.sh <bundle-url-or-path> [install-dir]
#
# It (1) unpacks the game into ~/OhMyWords, (2) runs it at login via launchd on
# port 8788, (3) runs `tailscale serve --service=svc:omw` so
# https://omw.<tailnet>.ts.net/ opens the game for every device on your tailnet.
# The service must exist in the admin console (Services) and this Mac must be a
# tagged device on Tailscale 1.86+. Safe to re-run to update.
set -euo pipefail

SRC="${1:?usage: install-host.sh <bundle-url-or-path> [install-dir]}"
DEST="${2:-$HOME/OhMyWords}"
PORT=8788
SERVICE="${OMW_SERVICE:-svc:omw}"

say()  { print -P "%F{green}==>%f $*"; }
warn() { print -P "%F{yellow}!!%f $*"; }
die()  { print -P "%F{red}xx%f $*"; exit 1; }

# ---------------------------------------------------------------- prerequisites
[[ "$(uname)" == Darwin ]] || die "This installer is for macOS."
/usr/bin/python3 -c 'import sys; assert sys.version_info >= (3, 8)' 2>/dev/null \
  || die "python3 is missing. Run 'xcode-select --install', then re-run this script."

TS=""
for c in tailscale /usr/local/bin/tailscale /opt/homebrew/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
  if command -v "$c" >/dev/null 2>&1; then TS="$(command -v "$c")"; break; fi
done
[[ -n "$TS" ]] || die "Tailscale CLI not found. Install Tailscale, or in the Tailscale menu choose Settings → Install CLI."
"$TS" status >/dev/null 2>&1 || die "Tailscale isn't connected on this Mac."
TAILNET_TS="$("$TS" status --json | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip(".").split(".",1)[1])')"
HOSTNAME_TS="${SERVICE#svc:}.$TAILNET_TS"

case "$DEST" in
  "$HOME"/Desktop*|"$HOME"/Documents*|"$HOME"/Downloads*)
    die "Pick a folder outside Desktop/Documents/Downloads (macOS blocks background apps there), e.g. ~/OhMyWords." ;;
esac

# Refuse to take over a port someone else is using.
# (netstat sees every user's sockets; lsof only sees ours.)
if netstat -an -p tcp | grep -qE "[.]$PORT +.*LISTEN"; then
  for pid in $(lsof -t -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null); do
    ps -o command= -p "$pid" | grep -q "OhMyWords/serve.py" \
      || die "Port $PORT is already used by another program on this Mac:\n$(ps -o pid=,command= -p "$pid")"
  done
  lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 \
    || die "Port $PORT is already used by another user's or a system program on this Mac."
fi

# Don't clobber an existing serve setup on the service's HTTPS root.
# Only looks inside our own service, so the node's other rules and other
# services (e.g. svc:hermes) are never touched.
SERVE_JSON="$("$TS" serve status --json 2>/dev/null || echo '{}')"
EXISTING="$(print -r -- "$SERVE_JSON" | SERVICE="$SERVICE" /usr/bin/python3 -c '
import json, os, sys
try: d = json.load(sys.stdin)
except Exception: d = {}
svc = (d.get("Services") or {}).get(os.environ["SERVICE"]) or {}
for host, cfg in (svc.get("Web") or {}).items():
    for path, h in (cfg.get("Handlers") or {}).items():
        if host.endswith(":443") and path == "/":
            print(h.get("Proxy") or h.get("Path") or "something")
')"
# Only an exact match to our own backend counts as "ours" (a bare ":$PORT" substring once matched another app).
if [[ -n "$EXISTING" && "${EXISTING%/}" != "http://127.0.0.1:$PORT" && "${FORCE:-}" != 1 ]]; then
  die "Tailscale already serves '$EXISTING' at https://$HOSTNAME_TS/. Re-run with FORCE=1 to replace it."
fi

# ---------------------------------------------------------------- unpack
say "Fetching the game from $SRC"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [[ "$SRC" == http* ]]; then
  curl -fSL --progress-bar "$SRC" -o "$TMP/bundle.tar.gz"
else
  cp "$SRC" "$TMP/bundle.tar.gz"
fi
mkdir -p "$TMP/x"
tar -xzf "$TMP/bundle.tar.gz" -C "$TMP/x"
[[ -f "$TMP/x/OhMyWords/serve.py" ]] || die "Bundle doesn't look like Oh My WORDS!"

mkdir -p "$DEST"
# Replace code + data; nothing user-specific lives in the folder (progress is in each browser).
rsync -a --delete --exclude 'tools/.sources' "$TMP/x/OhMyWords/" "$DEST/"
say "Installed into $DEST"

# ---------------------------------------------------------------- run at login
say "Starting the server (and at every login) on port $PORT"
zsh "$DEST/tools/autostart.sh" install >/dev/null
for i in {1..20}; do
  curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.5
done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || die "Server didn't start; see /tmp/ohmywords.log"

# ---------------------------------------------------------------- tailscale https
say "Publishing $SERVICE on https://$HOSTNAME_TS/ (your tailnet only)"
if ! "$TS" serve --service="$SERVICE" --bg --https=443 "http://127.0.0.1:$PORT" >/dev/null 2>"$TMP/serve.err"; then
  cat "$TMP/serve.err"
  die "tailscale serve failed. Check: $SERVICE exists in the admin console (Services), this Mac is a tagged device on Tailscale 1.86+, and 'HTTPS Certificates' is on at https://login.tailscale.com/admin/dns."
fi

if curl -fs -o /dev/null --max-time 30 "https://$HOSTNAME_TS/"; then
  say "Done! Play at  https://$HOSTNAME_TS/"
else
  warn "Serve is configured, but https://$HOSTNAME_TS/ didn't answer yet. Either:"
  warn "  - this Mac isn't approved as a host yet: admin console → Services → ${SERVICE#svc:} → Service hosts → Approve, or"
  warn "  - the first certificate is still issuing (takes ~15 s). Try again in a minute."
fi
print "   Stop publishing:  $TS serve --service=$SERVICE --https=443 off"
print "   Stop the server:  zsh $DEST/tools/autostart.sh uninstall"
