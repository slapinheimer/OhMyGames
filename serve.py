#!/usr/bin/env python3
"""Serve Oh My GAMES! from this directory.

    python3 serve.py            # http://localhost:8788 (and your LAN address)
    python3 serve.py --port 9000
    python3 serve.py --local    # only this machine (bind 127.0.0.1)

Phones and tablets on the same Wi-Fi can open the LAN URL printed at startup.
"""
import argparse
import gzip
import http.server
import os
import socket
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
COMPRESSIBLE = {".html", ".css", ".js", ".json", ".txt", ".svg"}
_gz_cache = {}  # path -> (mtime, bytes)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        # Pinned so the Windows registry can't mislabel them (it often maps .js to text/plain).
        ".html": "text/html", ".css": "text/css", ".txt": "text/plain",
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Always revalidate so edits show up immediately; data files can be cached briefly.
        if getattr(self, "path", "").startswith("/data/"):
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if (os.path.isfile(path) and os.path.splitext(path)[1] in COMPRESSIBLE
                and "gzip" in self.headers.get("Accept-Encoding", "")
                and "/tools/" not in path):
            mtime = os.path.getmtime(path)
            cached = _gz_cache.get(path)
            if not cached or cached[0] != mtime:
                with open(path, "rb") as f:
                    cached = (mtime, gzip.compress(f.read(), 6))
                _gz_cache[path] = cached
            body = cached[1]
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Last-Modified", self.date_time_string(int(mtime)))
            self.end_headers()
            return _BytesFile(body)
        return super().send_head()

    def log_message(self, fmt, *args):
        pass  # quiet


class _BytesFile:
    def __init__(self, data):
        self.data = data

    def read(self, *_):
        d, self.data = self.data, b""
        return d

    def close(self):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128  # browsers (and tailscale serve) open many connections at once

    def server_bind(self):
        # Refuse to share a port with another server (macOS lets SO_REUSEADDR double-bind).
        if hasattr(socket, "SO_REUSEPORT"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 0)
        super().server_bind()


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8788)))
    ap.add_argument("--local", action="store_true", help="bind to 127.0.0.1 only")
    a = ap.parse_args()
    host = "127.0.0.1" if a.local else "0.0.0.0"
    with Server((host, a.port), Handler) as httpd:
        print(f"Oh My GAMES! is being served at:\n  http://localhost:{a.port}/", flush=True)
        ip = lan_ip()
        if ip and not a.local:
            print(f"  http://{ip}:{a.port}/   (phones & tablets on your Wi-Fi)", flush=True)
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
