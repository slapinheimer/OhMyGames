#!/bin/zsh
# Package the game for a Windows PC: dist/OhMyWords-windows.zip.
# The friend unzips it and double-clicks "Install on Windows.bat". (Mac bundles: tools/bundle.sh.)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$ROOT/dist" "$STAGE/OhMyWords"
rsync -a --exclude tools/.sources --exclude __pycache__ --exclude "*.pyc" --exclude dist --exclude .DS_Store "$ROOT/" "$STAGE/OhMyWords/"
W="$STAGE/OhMyWords/tools/windows"
cp "$W/serve_windows.py" "$W/Install on Windows.bat" "$W/Uninstall Oh My GAMES.bat" "$STAGE/OhMyWords/"
# PowerShell 5.1 is happiest with CRLF line endings.
/usr/bin/python3 -c 'import sys; s=open(sys.argv[1]).read().replace("\r\n","\n"); open(sys.argv[2],"w",newline="\r\n").write(s)' \
  "$W/install.ps1" "$STAGE/OhMyWords/install.ps1"
# Drop the section about our own Mac mini / tailnet from the README.
/usr/bin/python3 - "$STAGE/OhMyWords/README.md" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"## Hosting on the Mac mini.*?(?=\n## (?!Sharing with a Windows))", "## Install on Windows\n\nUnzip, then double-click `Install on Windows.bat`. Remove it with `Uninstall Oh My GAMES.bat` in `%LOCALAPPDATA%\\\\OhMyWords`.\n", s, flags=re.S)
open(p, "w").write(s)
PY
rm -f "$ROOT/dist/OhMyWords-windows.zip"
( cd "$STAGE" && zip -qr -X "$ROOT/dist/OhMyWords-windows.zip" OhMyWords )
echo "Built dist/OhMyWords-windows.zip ($(du -h "$ROOT/dist/OhMyWords-windows.zip" | cut -f1))"
