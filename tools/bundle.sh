#!/bin/zsh
# Package the game into dist/ so another Mac can install/update it with tools/install-host.sh.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/dist"
( cd "$ROOT/.." && COPYFILE_DISABLE=1 tar --exclude "$(basename "$ROOT")/tools/.sources" \
    --exclude "$(basename "$ROOT")/dist" --exclude '.DS_Store' \
    -s ",^$(basename "$ROOT"),OhMyWords," -czf "$ROOT/dist/OhMyWords.tar.gz" "$(basename "$ROOT")" )
cp "$ROOT/tools/install-host.sh" "$ROOT/dist/"
echo "Built dist/OhMyWords.tar.gz ($(du -h "$ROOT/dist/OhMyWords.tar.gz" | cut -f1))"

# Shareable zip for a friend's Mac (no Tailscale): unzip, then `zsh ~/Downloads/OhMyWords/install.sh`.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$ROOT/dist/OhMyWords.tar.gz" -C "$STAGE"
cp "$ROOT/tools/install-local.sh" "$STAGE/OhMyWords/install.sh"
# Drop the section about our own Mac mini / tailnet from the README.
/usr/bin/python3 - "$STAGE/OhMyWords/README.md" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"## Hosting on the Mac mini.*?(?=\n## )", "## Install on another Mac\n\nUnzip, then in Terminal run `zsh ~/Downloads/OhMyWords/install.sh`.\n", s, flags=re.S)
open(p, "w").write(s)
PY
rm -f "$ROOT/dist/OhMyWords-share.zip"
( cd "$STAGE" && zip -qr -X "$ROOT/dist/OhMyWords-share.zip" OhMyWords )
echo "Built dist/OhMyWords-share.zip ($(du -h "$ROOT/dist/OhMyWords-share.zip" | cut -f1))"
