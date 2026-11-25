#!/usr/bin/env python3
"""Fetch just the part of GloVe that Contexto needs (~52 MB instead of 822 MB).

    python3 tools/fetch_glove.py

glove.6B.zip holds four files (50d, 100d, 200d, 300d), each listing 400,000 words
from most to least frequent. Contexto only uses the 100d file, and only words
common enough to be in data/words/common.json, which all sit near the top. So this
reads the zip's directory with HTTP range requests, downloads the start of the
100d entry, and decompresses it until LINES lines are out. The result is
tools/.sources/glove.6B.100d.top.txt, which tools/build_contexto.py reads.

The partial download is kept in tools/.sources/glove.6B.100d.part, so running the
script again resumes where it stopped. Nothing here is bundled or served.
"""
import struct
import sys
import time
import urllib.request
import zlib
from pathlib import Path

URL = "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip"
MEMBER = "glove.6B.100d.txt"
LINES = 150_000
CHUNK = 1 << 20

SOURCES = Path(__file__).resolve().parent / ".sources"
PART = SOURCES / "glove.6B.100d.part"
OUT = SOURCES / "glove.6B.100d.top.txt"


def fetch(start, end=None, tries=6):
    """Bytes [start, end] of the zip (end inclusive, or to the end of the file)."""
    rng = f"bytes={start}-{'' if end is None else end}"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(URL, headers={"Range": rng, "User-Agent": "OhMyWords-build"})
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status != 206:
                    raise RuntimeError(f"server ignored the range request (HTTP {r.status})")
                return r.read()
        except Exception as err:  # flaky connections: back off and retry
            if attempt == tries - 1:
                raise
            print(f"  retrying after {err}", file=sys.stderr)
            time.sleep(2 + attempt * 3)


def member_location():
    """(data offset, compressed size, method) of MEMBER inside the zip."""
    head = urllib.request.Request(URL, method="HEAD", headers={"User-Agent": "OhMyWords-build"})
    with urllib.request.urlopen(head, timeout=60) as r:
        size = int(r.headers["Content-Length"])
    tail = fetch(max(0, size - 65_536), size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        sys.exit("Could not find the zip directory")
    cd_size, cd_offset = struct.unpack("<II", tail[eocd + 12:eocd + 20])
    directory = fetch(cd_offset, cd_offset + cd_size - 1)
    pos = 0
    while pos < len(directory):
        if directory[pos:pos + 4] != b"PK\x01\x02":
            break
        method, = struct.unpack("<H", directory[pos + 10:pos + 12])
        csize, = struct.unpack("<I", directory[pos + 20:pos + 24])
        nlen, xlen, clen = struct.unpack("<HHH", directory[pos + 28:pos + 34])
        local, = struct.unpack("<I", directory[pos + 42:pos + 46])
        name = directory[pos + 46:pos + 46 + nlen].decode()
        if name == MEMBER:
            header = fetch(local, local + 29)
            lnlen, lxlen = struct.unpack("<HH", header[26:30])
            return local + 30 + lnlen + lxlen, csize, method
        pos += 46 + nlen + xlen + clen
    sys.exit(f"{MEMBER} is not in the zip")


def main():
    SOURCES.mkdir(parents=True, exist_ok=True)
    start, csize, method = member_location()
    if method != 8:
        sys.exit(f"Unexpected compression method {method}")
    print(f"{MEMBER}: {csize / 1e6:.0f} MB compressed; fetching from the start until {LINES:,} lines")

    inflate = zlib.decompressobj(-15)
    lines = 0
    pending = b""
    have = PART.stat().st_size if PART.exists() else 0
    with OUT.open("wb") as out, PART.open("ab") as part:
        offset = 0
        began = time.time()
        while lines < LINES and offset < csize:
            if offset < have:
                with PART.open("rb") as cached:
                    cached.seek(offset)
                    chunk = cached.read(CHUNK)
            else:
                chunk = fetch(start + offset, start + min(offset + CHUNK, csize) - 1)
                part.write(chunk)
                part.flush()
            offset += len(chunk)
            pending += inflate.decompress(chunk)
            *full, pending = pending.split(b"\n")
            for line in full:
                if lines >= LINES:
                    break
                out.write(line + b"\n")
                lines += 1
            rate = max(1, offset - have) / max(0.1, time.time() - began)
            print(f"\r  {offset / 1e6:6.1f} MB read · {lines:,} lines · {rate / 1e3:5.0f} KB/s", end="", flush=True)
    print(f"\nWrote {OUT.relative_to(SOURCES.parent.parent)} ({lines:,} lines)")


if __name__ == "__main__":
    main()
