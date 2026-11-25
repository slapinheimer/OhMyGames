"""Windows launcher for serve.py (the Mac server is left untouched).

Run with pythonw.exe so no console window stays open. Differences from serve.py:
  - errors go to %TEMP%\\ohmywords.log (pythonw has no console to print to)
  - SO_REUSEADDR is off: on Windows it lets a second server silently share the port
"""
import os
import sys
import tempfile

if sys.stderr is None:
    sys.stdout = sys.stderr = open(os.path.join(tempfile.gettempdir(), "ohmywords.log"), "a")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402

serve.Server.allow_reuse_address = False
serve.main()
