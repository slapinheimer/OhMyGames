#!/usr/bin/env python3
"""Check data/shade/pictures.json.

Every picture must be unique, 5×5 or 10×10 or 15×15, and finished by line
logic from a blank grid (so the clues have one solution). Stdlib only.

    python3 tools/check_shade.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_shade import line_solve

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "shade" / "pictures.json"
NEED = 120
PER_SIZE = 24


def main():
    pics = json.loads(PATH.read_text())
    seen = set()
    names = {5: set(), 10: set(), 15: set()}
    counts = {5: 0, 10: 0, 15: 0}
    for i, pic in enumerate(pics):
        name, size, rows = pic.get("name"), pic.get("size"), pic.get("rows")
        if size not in counts or not isinstance(name, str) or not name:
            raise SystemExit(f"{i}: bad record {pic!r}"[:200])
        if not isinstance(rows, list) or len(rows) != size:
            raise SystemExit(f"{name} {size}: expected {size} rows")
        cells = []
        for r, row in enumerate(rows):
            if not isinstance(row, str) or len(row) != size or any(ch not in "01" for ch in row):
                raise SystemExit(f"{name} {size}: bad row {r}")
            cells.extend(1 if ch == "1" else 0 for ch in row)
        key = (size, tuple(cells))
        if key in seen:
            raise SystemExit(f"duplicate bitmap: {name} {size}")
        if name in names[size]:
            raise SystemExit(f"duplicate name at {size}: {name}")
        seen.add(key)
        names[size].add(name)
        if line_solve(cells, size) is None:
            raise SystemExit(f"not line-solvable: {name} {size}")
        counts[size] += 1
    total = sum(counts.values())
    print(f"{total} pictures ok", counts)
    if total < NEED or min(counts.values()) < PER_SIZE:
        raise SystemExit(f"need at least {NEED} pictures and {PER_SIZE} of each size")


if __name__ == "__main__":
    main()
