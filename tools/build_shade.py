#!/usr/bin/env python3
"""Build data/shade/pictures.json — original Shade pictures that line-logic solves.

Each picture is a small bitmap (5×5, 10×10, or 15×15). A picture is kept only when
a line solver fills every cell with no guessing, which also means the clues have
one solution. Run from the repo root: python3 tools/build_shade.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "shade" / "pictures.json"

# ---------------------------------------------------------------- line solver

def placements(n, clues, known):
    if not clues:
        if any(v == 1 for v in known):
            return []
        return [0]
    out = []

    def rec(ci, start, mask):
        if ci == len(clues):
            for i in range(start, n):
                if known[i] == 1:
                    return
            out.append(mask)
            return
        length = clues[ci]
        if ci == len(clues) - 1:
            min_tail = 0
        else:
            min_tail = 1 + sum(clues[ci + 1 :]) + (len(clues) - ci - 2)
        last = n - length - min_tail
        for s in range(start, last + 1):
            ok = True
            for i in range(start, s):
                if known[i] == 1:
                    ok = False
                    break
            if not ok:
                continue
            m = mask
            for i in range(s, s + length):
                if i >= n or known[i] == -1:
                    ok = False
                    break
                m |= 1 << i
            if not ok:
                continue
            nxt = s + length
            if ci < len(clues) - 1:
                if nxt >= n or known[nxt] == 1:
                    continue
                rec(ci + 1, nxt + 1, m)
            else:
                rec(ci + 1, nxt, m)

    rec(0, 0, 0)
    return out


def clues_of(line):
    clues, run = [], 0
    for v in line:
        if v:
            run += 1
        elif run:
            clues.append(run)
            run = 0
    if run:
        clues.append(run)
    return clues


def paint(known, idx, opts):
    all_and = opts[0]
    any_or = 0
    for o in opts:
        all_and &= o
        any_or |= o
    changed = False
    for i, cell in enumerate(idx):
        if known[cell] != 0:
            continue
        bit = 1 << i
        if all_and & bit:
            known[cell] = 1
            changed = True
        elif not (any_or & bit):
            known[cell] = -1
            changed = True
    return changed


def line_solve(cells, n):
    """Return the solved 0/1 grid, or None if line logic cannot finish it."""
    rows = [clues_of(cells[r * n : (r + 1) * n]) for r in range(n)]
    cols = [clues_of([cells[r * n + c] for r in range(n)]) for c in range(n)]
    known = [0] * (n * n)
    for _ in range(n * n * 2 + 4):
        changed = False
        for r in range(n):
            idx = [r * n + c for c in range(n)]
            opts = placements(n, rows[r], [known[i] for i in idx])
            if not opts:
                return None
            changed |= paint(known, idx, opts)
        for c in range(n):
            idx = [r * n + c for r in range(n)]
            opts = placements(n, cols[c], [known[i] for i in idx])
            if not opts:
                return None
            changed |= paint(known, idx, opts)
        if not changed:
            break
    if any(v == 0 for v in known):
        return None
    got = [1 if v == 1 else 0 for v in known]
    return got if got == cells else None


# ---------------------------------------------------------------- drawing

def blank(n):
    return [[0] * n for _ in range(n)]


def put(g, r, c, v=1):
    n = len(g)
    if 0 <= r < n and 0 <= c < n:
        g[r][c] = v


def rect(g, r, c, h, w, v=1):
    for y in range(r, r + h):
        for x in range(c, c + w):
            put(g, y, x, v)


def frame(g, r, c, h, w, t=1, v=1):
    rect(g, r, c, t, w, v)
    rect(g, r + h - t, c, t, w, v)
    rect(g, r, c, h, t, v)
    rect(g, r, c + w - t, h, t, v)


def disc(g, cy, cx, ry, rx=None, v=1):
    if rx is None:
        rx = ry
    n = len(g)
    for y in range(n):
        for x in range(n):
            if ry and rx and ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2 <= 1:
                g[y][x] = v


def tri(g, apex_r, apex_c, base_r, half):
    """Filled triangle from an apex row to a base row."""
    if base_r == apex_r:
        put(g, apex_r, apex_c)
        return
    step = 1 if base_r > apex_r else -1
    span = abs(base_r - apex_r)
    r = apex_r
    for i in range(span + 1):
        w = round(half * i / span)
        for c in range(apex_c - w, apex_c + w + 1):
            put(g, r, c)
        r += step


def poly_fill(g, rows):
    """rows of '#' and '.' ."""
    for r, line in enumerate(rows):
        for c, ch in enumerate(line):
            if ch == "#":
                put(g, r, c)


def cells_of(g):
    return [v for row in g for v in row]


def upscale(cells, n, k):
    m = n * k
    out = [0] * (m * m)
    for r in range(n):
        for c in range(n):
            if cells[r * n + c]:
                for dr in range(k):
                    for dc in range(k):
                        out[(r * k + dr) * m + (c * k + dc)] = 1
    return out


# ---------------------------------------------------------------- 5×5 bitmaps

FIVES = {
"Plus": ["..#..", "..#..", "#####", "..#..", "..#.."],
"Box": ["#####", "#...#", "#...#", "#...#", "#####"],
"Heart": [".#.#.", "#####", "#####", ".###.", "..#.."],
"House": ["..#..", ".###.", "#####", "#...#", "#.#.#"],
"Tree": ["..#..", ".###.", "#####", "..#..", "..#.."],
"Arrow": ["..#..", ".###.", "#####", ".###.", "..#.."],
"Gem": ["..#..", ".###.", "#####", ".###.", "..#.."],
"Smile": ["#####", "#...#", "#.#.#", "#...#", ".###."],
"Fish": ["..#..", ".####", "#####", ".####", "..#.."],
"Star": ["..#..", "#####", ".###.", "#.#.#", "#...#"],
"Moon": ["###..", "####.", "###..", "####.", "###.."],
"Sun": [".###.", "#####", "#####", "#####", ".###."],
"Cup": ["#...#", "#...#", "#####", ".###.", "..#.."],
"Key": ["..#..", ".###.", "..#..", ".##..", "..##."],
"Flag": ["####.", "#.#..", "####.", "..#..", "..#.."],
"Boat": ["..#..", ".###.", "#####", "#####", ".###."],
"Cat": ["#...#", "#####", "#.#.#", "#####", ".###."],
"Bird": ["..##.", ".###.", "#####", ".###.", "..#.."],
"Apple": [".##..", ".###.", "#####", "#####", ".###."],
"Bell": ["..#..", ".###.", "#####", "#####", ".###."],
"Drop": ["..#..", ".###.", "#####", ".###.", "..#.."],
"Leaf": ["..##.", ".###.", "#####", ".###.", "..#.."],
"Gift": ["#####", "#.#.#", "#####", "#...#", "#####"],
"Crown": ["#.#.#", "#####", "#####", ".###.", "..#.."],
"Toad": [".###.", "#.#.#", "#####", "#...#", ".###."],
"Ghost": [".###.", "#####", "#.#.#", "#####", "#.#.#"],
"Anchor": ["..#..", ".###.", "..#..", "#####", ".#.#."],
"Plane": ["..#..", "#####", "..#..", ".###.", "..#.."],
"Car": [".....", ".###.", "#####", "#.#.#", "....."],
"Duck": ["....#", ".####", "#####", ".###.", "..#.."],
"Frog": ["#...#", "#####", "#.#.#", "#####", ".#.#."],
"Bee": [".###.", "#####", ".#.#.", "#####", ".###."],
"Cake": ["..#..", ".###.", "#####", "#####", "#####"],
"Candy": [".###.", "#####", ".###.", "#####", ".###."],
"Egg": ["..#..", ".###.", "#####", "#####", ".###."],
"Bone": ["#...#", "#####", ".###.", "#####", "#...#"],
"Paw": ["#.#.#", ".#.#.", ".###.", "#####", ".###."],
"Eye": ["#####", "#...#", "#.#.#", "#...#", "#####"],
"Hat": ["..#..", ".###.", "#####", "#####", "....."],
"Boot": ["###..", "#.#..", "###..", "####.", "#####"],
"Cloud": [".....", ".###.", "#####", "#####", "....."],
"Peak": ["..#..", ".###.", "#####", "#####", "#####"],
"Tent": ["..#..", ".###.", "#####", "#...#", "#...#"],
"Barn": ["#####", "#.#.#", "#####", "#...#", "#.#.#"],
"Book": ["####.", "####.", "####.", "####.", "####."],
"Note": ["..###", "..##.", "..#..", ".##..", ".#..."],
"Bolt": ["..##.", ".###.", "..#..", ".###.", ".##.."],
"Cross": ["..#..", "..#..", "#####", "..#..", "..#.."],
"Ring": [".....", ".###.", "#...#", ".###.", "....."],
"Steps": ["....#", "...##", "..###", ".####", "#####"],
"Balloon": ["..#..", ".###.", ".###.", "..#..", "..#.."],
"Kite": ["..#..", ".###.", "#####", ".#.#.", "#...#"],
"Bloom": [".#.#.", "#####", "##.##", "#####", "..#.."],
"Cactus": [".#.#.", ".###.", "..#..", "..#..", ".###."],
"Moth": ["#...#", "#####", "#.#.#", ".###.", "..#.."],
"Whale": [".....", ".####", "#####", "#####", ".###."],
"Turtle": ["..#..", ".###.", "#####", "#.#.#", "#...#"],
"Snail": [".###.", "##..#", "#####", ".###.", "....."],
"Robot": ["#####", "#.#.#", "#####", ".#.#.", "#...#"],
"Phone": [".###.", ".#.#.", ".#.#.", ".#.#.", ".###."],
"Lock": [".###.", "#...#", "#####", "#####", "#####"],
"Bellhop": ["..#..", "#####", ".###.", "..#..", ".###."],
"Cheese": ["#####", "#.#.#", "#####", "#.#.#", "#####"],
"Slice": ["#####", ".####", "..###", "...##", "....#"],
"Mug": [".....", "####.", "#..##", "####.", "....."],
"Drop2": ["..#..", ".###.", ".###.", ".###.", "..#.."],
"Spade": ["..#..", ".###.", "#####", "..#..", ".###."],
"Club": ["#.#.#", "#####", ".###.", "..#..", ".###."],
"Diamond": ["..#..", ".#.#.", "#...#", ".#.#.", "..#.."],
"Window": ["#####", "#.#.#", "#####", "#.#.#", "#####"],
"Door": [".###.", "#...#", "#.#.#", "#...#", "#####"],
"Stairs": ["#....", "##...", "###..", "####.", "#####"],
"Bridge": [".....", "#####", "#.#.#", "#...#", "....."],
"Igloo": ["..#..", ".###.", "#####", "#####", "##.##"],
"Pear": ["..##.", ".###.", "#####", "#####", ".###."],
"Cherry": ["##.##", "#.#.#", "#####", ".###.", "..#.."],
"Acorn": ["..##.", ".###.", ".###.", "#####", ".###."],
"Owl": ["#...#", "#####", "#.#.#", "#####", ".###."],
"Fox": ["#...#", "#####", ".###.", "..#..", ".###."],
"Bear": ["#...#", "#####", "#.#.#", ".###.", "#####"],
"Mouse": [".....", "#...#", "#####", "#.#.#", ".###."],
"Swan": ["...##", "..###", ".####", "#####", ".###."],
"Crab": ["#...#", "#####", "##.##", ".###.", "#...#"],
"Shell": ["..#..", ".###.", "#####", "#####", ".###."],
"Palm": ["..#..", ".#.#.", "..#..", "..#..", ".###."],
"Hive": [".###.", "#####", ".###.", "#####", ".###."],
"Wand": ["....#", "...#.", "..#..", ".#...", "#...."],
"Shield": [".###.", "#####", "#####", ".###.", "..#.."],
"Medal": ["..#..", ".###.", "#####", ".###.", "..#.."],
"Comet": ["....#", "...##", "..###", ".####", "#####"],
"Wave": [".....", "..#.#", ".#####", "#####", "....."],
"Umbrella": ["..#..", ".###.", "#####", "..#..", "..##."],
"Spoon": ["..#..", ".###.", "..#..", "..#..", "..#.."],
"Fork": ["#.#.#", "#.#.#", ".###.", "..#..", "..#.."],
"Knife": ["....#", "...#.", "..#..", ".#...", "###.."],
"Plate": [".....", ".###.", "#####", ".###.", "....."],
"Bowl": [".....", "#####", ".###.", "..#..", "....."],
"Loaf": [".....", ".###.", "#####", "#####", ".###."],
"Pretzel": ["#...#", "##.##", ".###.", "##.##", "#...#"],
"Cookie": [".###.", "##.##", "#.#.#", "##.##", ".###."],
"Pepper": ["..#..", "..#..", ".###.", "#####", ".###."],
"Carrot": ["..#..", "..#..", ".###.", ".###.", "#####"],
"Corncob": [".#.#.", "#####", "#####", "#####", ".###."],
"Turnip": [".###.", "#####", "#####", ".###.", "..#.."],
"Chili": ["..##.", ".###.", "#####", ".###.", "#...."],
"Olive": ["..#..", ".###.", "#.#.#", ".###.", "..#.."],
"Lemon": [".#...", ".###.", "#####", "#####", ".###."],
"Berry": ["#.#.#", "#####", "#.#.#", "#####", ".###."],
"Grape": [".#.#.", "##.##", "#####", ".###.", "..#.."],
"Pea": [".....", ".#.#.", "#####", ".###.", "....."],
"Bean": [".....", "..###", ".####", "#####", ".###."],
"Nut": [".###.", "#...#", "#####", "#####", ".###."],
"Axe": ["####.", "..##.", "..#..", "..#..", ".###."],
"Hammer": ["#####", ".###.", "..#..", "..#..", "..#.."],
"Saw": ["#####", "#.#.#", "..#..", "..#..", "..#.."],
"Plug": [".#.#.", ".#.#.", "#####", "#####", ".###."],
"Bulb": [".###.", "#####", "#####", ".###.", "..#.."],
"Candle": ["..#..", "..#..", ".###.", ".###.", "#####"],
"Lamp": [".###.", "#...#", ".###.", "..#..", "#####"],
"Couch": [".....", "#...#", "#####", "#####", "#...#"],
"Chair": [".....", ".###.", ".#...", ".#...", ".###."],
"Table": [".....", "#####", "..#..", "..#..", ".#.#."],
"Bed": [".....", "#....", "#####", "#####", "#...#"],
"Clock": [".###.", "#.#.#", "##..#", "#...#", ".###."],
"Radio": [".....", "#####", "#.#.#", "#####", ".#.#."],
"Camera": [".....", ".#...", "#####", "#.#.#", "#####"],
"Letter": ["#####", "#...#", ".#.#.", "..#..", "....."],
"Tag": ["#####", "##..#", "#.#.#", "#..##", "#####"],
"Pin": ["..#..", ".###.", "..#..", "..#..", ".###."],
"Button": [".....", ".###.", "#.#.#", ".###.", "....."],
"Spool": ["#####", ".###.", ".###.", ".###.", "#####"],
"Yarn": [".###.", "##.##", "#.#.#", "##.##", ".###."],
"Scarf": ["##...", ".##..", "..##.", "...##", "....#"],
"Glove": ["#.#.#", "#####", "#####", ".###.", ".###."],
"Sock": ["..##.", "..##.", "..##.", ".###.", "#####"],
"Shirt": ["#...#", "#####", ".###.", ".###.", ".###."],
"Dress": ["..#..", ".###.", "#####", ".###.", "#...#"],
"Bow": ["#...#", "##.##", ".###.", "##.##", "#...#"],
"Tie": ["..#..", ".###.", "..#..", ".###.", "..#.."],
"Bag": [".###.", "#...#", "#####", "#####", "#####"],
"Purse": ["#####", ".###.", "#####", "#####", ".###."],
"Safe": ["#####", "#.#.#", "#####", "#...#", "#####"],
"Chest": ["#####", "#...#", "#####", "#.#.#", "#####"],
"Map": ["#####", "#..##", "#.#.#", "##..#", "#####"],
"Compass": ["..#..", ".###.", "##.##", ".###.", "..#.."],
}


def from_five(art):
    g = blank(5)
    poly_fill(g, art)
    return cells_of(g)


# ---------------------------------------------------------------- larger scenes

def scene_sun(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.36, n * 0.36)
    return g

def scene_moon(n):
    g = blank(n)
    disc(g, (n - 1) / 2, n * 0.42, n * 0.40, n * 0.34)
    disc(g, (n - 1) / 2, n * 0.62, n * 0.34, n * 0.30, 0)
    return g

def scene_heart(n):
    g = blank(n)
    cy = n * 0.38
    r = n * 0.22
    disc(g, cy, n * 0.32, r, r)
    disc(g, cy, n * 0.68, r, r)
    tri(g, int(n * 0.42), n // 2, n - 2, n // 2 - 1)
    return g

def scene_house(n):
    g = blank(n)
    tri(g, 1, n // 2, n // 2, n // 2 - 1)
    rect(g, n // 2, 2, n // 2 - 1, n - 4)
    rect(g, n // 2 + n // 5, n // 2 - 1, n // 2 - n // 5, 2, 0)
    return g

def scene_tree(n):
    g = blank(n)
    tri(g, 0, n // 2, int(n * 0.72), n // 2)
    rect(g, int(n * 0.72), n // 2 - max(1, n // 10), n - int(n * 0.72), max(2, n // 5))
    return g

def scene_pine(n):
    g = blank(n)
    tri(g, 0, n // 2, int(n * 0.45), int(n * 0.28))
    tri(g, int(n * 0.28), n // 2, int(n * 0.7), int(n * 0.42))
    rect(g, int(n * 0.7), n // 2 - 1, n - int(n * 0.7), max(2, n // 7))
    return g

def scene_arrow(n):
    g = blank(n)
    mid = n // 2
    tri(g, mid, n - 2, 1, mid)
    # the tri above is sideways? tri is vertical. Draw a right arrow manually.
    g = blank(n)
    for r in range(n):
        span = r if r <= mid else n - 1 - r
        for c in range(n - 1 - span, n):
            g[r][c] = 1
    rect(g, mid - max(1, n // 10), 0, max(2, n // 5), int(n * 0.55))
    return g

def scene_fish(n):
    g = blank(n)
    disc(g, (n - 1) / 2, n * 0.42, n * 0.28, n * 0.36)
    tri(g, n // 2, 1, n // 2, 0)  # noop-ish
    # tail on the left
    tri(g, n // 2, 0, 1, n // 5)
    # redo tail as two triangles meeting at the body
    g2 = blank(n)
    disc(g2, (n - 1) / 2, n * 0.55, n * 0.30, n * 0.34)
    for r in range(n):
        if r < n * 0.25 or r > n * 0.75:
            continue
    # tail wedge
    tri(g2, 1, 1, n // 2, n // 3)
    tri(g2, n - 2, 1, n // 2, n // 3)
    # eye
    put(g2, n // 2 - n // 8, int(n * 0.68), 0)
    put(g2, n // 2 - n // 8, int(n * 0.68) + (1 if n > 8 else 0), 0)
    return g2

def scene_boat(n):
    g = blank(n)
    # hull
    for r in range(int(n * 0.62), int(n * 0.82)):
        inset = int((r - n * 0.62) * 0.8)
        rect(g, r, 1 + inset, 1, n - 2 - 2 * inset)
    # sail
    tri(g, 1, n // 2, int(n * 0.58), n // 3)
    rect(g, 1, n // 2, int(n * 0.62), 1)
    return g

def scene_car(n):
    g = blank(n)
    rect(g, int(n * 0.42), int(n * 0.22), int(n * 0.22), int(n * 0.56))
    rect(g, int(n * 0.58), 1, int(n * 0.22), n - 2)
    # wheels erased then redraw as blocks with gap
    rect(g, int(n * 0.78), int(n * 0.18), max(2, n // 6), max(2, n // 6))
    rect(g, int(n * 0.78), int(n * 0.64), max(2, n // 6), max(2, n // 6))
    return g

def scene_cup(n):
    g = blank(n)
    rect(g, int(n * 0.22), int(n * 0.22), int(n * 0.5), max(1, n // 8))
    rect(g, int(n * 0.22), int(n * 0.62), int(n * 0.5), max(1, n // 8))
    rect(g, int(n * 0.62), int(n * 0.22), max(2, n // 6), int(n * 0.48))
    disc(g, n * 0.45, n * 0.78, n * 0.16, n * 0.12)
    disc(g, n * 0.45, n * 0.78, n * 0.08, n * 0.05, 0)
    return g

def scene_cake(n):
    g = blank(n)
    rect(g, int(n * 0.28), 2, max(2, n // 8), n - 4)
    rect(g, int(n * 0.42), 1, int(n * 0.28), n - 2)
    rect(g, int(n * 0.68), 2, int(n * 0.22), n - 4)
    put(g, int(n * 0.18), n // 2)
    rect(g, int(n * 0.18), n // 2, int(n * 0.12), 1)
    return g

def scene_mushroom(n):
    g = blank(n)
    disc(g, n * 0.36, (n - 1) / 2, n * 0.28, n * 0.42)
    rect(g, int(n * 0.48), n // 2 - max(1, n // 8), int(n * 0.42), max(2, n // 4))
    return g

def scene_flower(n):
    g = blank(n)
    c = (n - 1) / 2
    rad = n * 0.16
    for dy, dx in ((-0.28, 0), (0.28, 0), (0, -0.28), (0, 0.28), (0, 0)):
        disc(g, c + dy * n, c + dx * n, rad, rad)
    rect(g, int(n * 0.62), n // 2, n - int(n * 0.62), 1)
    return g

def scene_leaf(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.42, n * 0.22)
    # rotate-ish by shearing: fill a diagonal leaf
    g = blank(n)
    for r in range(n):
        for c in range(n):
            x = (c - n / 2) / (n * 0.34)
            y = (r - n / 2) / (n * 0.46)
            xr, yr = (x + y) * 0.8, (y - x) * 0.8
            if xr * xr + yr * yr <= 1:
                g[r][c] = 1
    for i in range(1, n - 1):
        put(g, i, i, 0)
    return g

def scene_cactus(n):
    g = blank(n)
    w = max(2, n // 5)
    rect(g, int(n * 0.28), n // 2 - w // 2, int(n * 0.62), w)
    rect(g, int(n * 0.38), int(n * 0.18), w, int(n * 0.28))
    rect(g, int(n * 0.22), int(n * 0.18), int(n * 0.28), w)
    rect(g, int(n * 0.48), int(n * 0.62), w, int(n * 0.22))
    rect(g, int(n * 0.32), n - w - int(n * 0.16), int(n * 0.28), w)
    return g

def scene_star(n):
    g = blank(n)
    mid = n // 2
    rect(g, 0, mid - max(0, n // 12), n, max(1, n // 6 + 1))
    rect(g, mid - max(0, n // 12), 0, max(1, n // 6 + 1), n)
    disc(g, mid, mid, n * 0.22, n * 0.22)
    return g

def scene_cross(n):
    g = blank(n)
    w = max(1, n // 5)
    rect(g, 0, n // 2 - w // 2, n, w)
    rect(g, n // 2 - w // 2, 0, w, n)
    return g

def scene_cat(n):
    g = blank(n)
    # ears
    tri(g, 0, int(n * 0.22), int(n * 0.28), int(n * 0.16))
    tri(g, 0, int(n * 0.78), int(n * 0.28), int(n * 0.16))
    disc(g, n * 0.58, (n - 1) / 2, n * 0.36, n * 0.40)
    # eyes
    eye = max(1, n // 10)
    rect(g, int(n * 0.48), int(n * 0.32), eye, eye, 0)
    rect(g, int(n * 0.48), int(n * 0.62), eye, eye, 0)
    return g

def scene_bird(n):
    g = blank(n)
    disc(g, n * 0.55, n * 0.58, n * 0.28, n * 0.30)
    disc(g, n * 0.32, n * 0.72, n * 0.16, n * 0.16)
    tri(g, n // 2, 0, int(n * 0.22), int(n * 0.28))
    tri(g, n // 2, 0, int(n * 0.78), int(n * 0.28))
    put(g, int(n * 0.28), int(n * 0.78), 0)
    return g

def scene_duck(n):
    g = blank(n)
    disc(g, n * 0.62, n * 0.40, n * 0.28, n * 0.32)
    disc(g, n * 0.32, n * 0.70, n * 0.16, n * 0.18)
    rect(g, int(n * 0.78), int(n * 0.18), max(2, n // 8), int(n * 0.5))
    return g

def scene_butterfly(n):
    g = blank(n)
    disc(g, n * 0.38, n * 0.28, n * 0.22, n * 0.20)
    disc(g, n * 0.38, n * 0.72, n * 0.22, n * 0.20)
    disc(g, n * 0.68, n * 0.30, n * 0.18, n * 0.16)
    disc(g, n * 0.68, n * 0.70, n * 0.18, n * 0.16)
    rect(g, int(n * 0.15), n // 2, int(n * 0.75), max(1, n // 12 + 1))
    return g

def scene_turtle(n):
    g = blank(n)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.28, n * 0.32)
    disc(g, n * 0.28, n * 0.72, n * 0.12, n * 0.12)
    for dx, dy in ((0.18, 0.78), (0.82, 0.78), (0.18, 0.42), (0.82, 0.42)):
        disc(g, n * dy, n * dx, n * 0.08, n * 0.08)
    return g

def scene_whale(n):
    g = blank(n)
    disc(g, n * 0.58, n * 0.48, n * 0.28, n * 0.40)
    tri(g, int(n * 0.35), int(n * 0.15), int(n * 0.08), int(n * 0.12))
    put(g, int(n * 0.48), int(n * 0.68), 0)
    return g

def scene_ghost(n):
    g = blank(n)
    disc(g, n * 0.36, (n - 1) / 2, n * 0.30, n * 0.32)
    rect(g, int(n * 0.40), int(n * 0.18), int(n * 0.48), int(n * 0.64))
    # hem bumps
    bump = max(2, n // 6)
    for i, x in enumerate(range(int(n * 0.18), int(n * 0.82), bump)):
        if i % 2 == 0:
            rect(g, int(n * 0.78), x, n - int(n * 0.78), bump, 0)
    rect(g, int(n * 0.42), int(n * 0.32), max(1, n // 10), max(1, n // 10), 0)
    rect(g, int(n * 0.42), int(n * 0.58), max(1, n // 10), max(1, n // 10), 0)
    return g

def scene_robot(n):
    g = blank(n)
    rect(g, int(n * 0.08), int(n * 0.22), int(n * 0.36), int(n * 0.56))
    rect(g, int(n * 0.50), int(n * 0.18), int(n * 0.40), int(n * 0.64))
    rect(g, int(n * 0.20), int(n * 0.32), max(1, n // 10), max(1, n // 10), 0)
    rect(g, int(n * 0.20), int(n * 0.58), max(1, n // 10), max(1, n // 10), 0)
    rect(g, int(n * 0.62), int(n * 0.36), max(2, n // 8), int(n * 0.28), 0)
    return g

def scene_phone(n):
    g = blank(n)
    frame(g, 1, int(n * 0.28), n - 2, int(n * 0.44), max(1, n // 10))
    rect(g, int(n * 0.22), int(n * 0.36), int(n * 0.48), int(n * 0.28), 0)
    return g

def scene_book(n):
    g = blank(n)
    rect(g, 2, int(n * 0.22), n - 4, int(n * 0.62))
    rect(g, 2, int(n * 0.22), n - 4, max(1, n // 12), 0)
    return g

def scene_gift(n):
    g = blank(n)
    rect(g, int(n * 0.32), 2, n - int(n * 0.42), n - 4)
    ribbon = max(1, n // 8)
    rect(g, int(n * 0.32), n // 2 - ribbon // 2, n - int(n * 0.32) - 1, ribbon, 0)
    rect(g, int(n * 0.32) + (n - int(n * 0.42)) // 2, 2, ribbon, n - 4, 0)
    disc(g, n * 0.24, n * 0.40, n * 0.10, n * 0.10)
    disc(g, n * 0.24, n * 0.60, n * 0.10, n * 0.10)
    return g

def scene_balloon(n):
    g = blank(n)
    disc(g, n * 0.36, (n - 1) / 2, n * 0.30, n * 0.26)
    rect(g, int(n * 0.66), n // 2, n - int(n * 0.66) - 1, 1)
    return g

def scene_cloud(n):
    g = blank(n)
    disc(g, n * 0.55, n * 0.35, n * 0.22, n * 0.22)
    disc(g, n * 0.50, n * 0.58, n * 0.26, n * 0.26)
    disc(g, n * 0.62, n * 0.48, n * 0.18, n * 0.28)
    return g

def scene_mountain(n):
    g = blank(n)
    tri(g, 1, int(n * 0.36), n - 2, int(n * 0.34))
    tri(g, int(n * 0.28), int(n * 0.68), n - 2, int(n * 0.30))
    return g

def scene_tent(n):
    g = blank(n)
    tri(g, 1, n // 2, n - 2, n // 2 - 1)
    tri(g, n - 3, n // 2, int(n * 0.45), max(1, n // 8))
    # cut a door by erasing a notch — tri already filled. Erase door.
    rect(g, int(n * 0.62), n // 2 - max(1, n // 10), n - int(n * 0.62) - 1, max(2, n // 5), 0)
    return g

def scene_umbrella(n):
    g = blank(n)
    disc(g, n * 0.34, (n - 1) / 2, n * 0.28, n * 0.42)
    rect(g, int(n * 0.34), 0, int(n * 0.20), n, 0)  # keep only the top of the disc
    # redo canopy as upper disc
    g = blank(n)
    cy, cx, ry, rx = n * 0.42, (n - 1) / 2, n * 0.36, n * 0.46
    for y in range(n):
        for x in range(n):
            if y <= cy and ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2 <= 1:
                g[y][x] = 1
    rect(g, int(cy), n // 2, int(n * 0.40), 1)
    rect(g, int(n * 0.78), n // 2, max(2, n // 8), max(2, n // 6))
    return g

def scene_key(n):
    g = blank(n)
    disc(g, n * 0.24, n * 0.62, n * 0.16, n * 0.16)
    disc(g, n * 0.24, n * 0.62, n * 0.07, n * 0.07, 0)
    rect(g, int(n * 0.20), int(n * 0.12), max(2, n // 8), int(n * 0.48))
    rect(g, int(n * 0.20), int(n * 0.12), int(n * 0.22), max(2, n // 8))
    rect(g, int(n * 0.20), int(n * 0.28), int(n * 0.16), max(2, n // 10))
    return g

def scene_bell(n):
    g = blank(n)
    tri(g, int(n * 0.18), n // 2, int(n * 0.78), n // 2 - 1)
    disc(g, n * 0.22, (n - 1) / 2, n * 0.12, n * 0.20)
    rect(g, int(n * 0.76), 1, max(2, n // 8), n - 2)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.08, n * 0.08, 0)
    return g

def scene_crown(n):
    g = blank(n)
    rect(g, int(n * 0.55), 1, int(n * 0.28), n - 2)
    tri(g, 1, int(n * 0.18), int(n * 0.58), int(n * 0.14))
    tri(g, 1, n // 2, int(n * 0.58), int(n * 0.14))
    tri(g, 1, int(n * 0.82), int(n * 0.58), int(n * 0.14))
    return g

def scene_hat(n):
    g = blank(n)
    rect(g, int(n * 0.22), int(n * 0.32), int(n * 0.40), int(n * 0.36))
    rect(g, int(n * 0.58), 1, max(2, n // 6), n - 2)
    return g

def scene_boot(n):
    g = blank(n)
    rect(g, 1, int(n * 0.28), int(n * 0.72), int(n * 0.28))
    rect(g, int(n * 0.62), int(n * 0.28), int(n * 0.28), int(n * 0.55))
    return g

def scene_paw(n):
    g = blank(n)
    disc(g, n * 0.66, (n - 1) / 2, n * 0.22, n * 0.26)
    for dx in (0.22, 0.40, 0.60, 0.78):
        disc(g, n * 0.30, n * dx, n * 0.10, n * 0.10)
    return g

def scene_bone(n):
    g = blank(n)
    rect(g, n // 2 - max(1, n // 12), int(n * 0.22), max(2, n // 6), int(n * 0.56))
    rad = n * 0.14
    for cy, cx in ((0.38, 0.22), (0.62, 0.22), (0.38, 0.78), (0.62, 0.78)):
        disc(g, n * cy, n * cx, rad, rad)
    return g

def scene_egg(n):
    g = blank(n)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.38, n * 0.28)
    return g

def scene_apple(n):
    g = blank(n)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.34, n * 0.36)
    rect(g, int(n * 0.12), n // 2, int(n * 0.18), max(1, n // 12))
    disc(g, n * 0.20, n * 0.64, n * 0.10, n * 0.12)
    return g

def scene_cherry(n):
    g = blank(n)
    disc(g, n * 0.70, n * 0.32, n * 0.18, n * 0.18)
    disc(g, n * 0.70, n * 0.68, n * 0.18, n * 0.18)
    # stems
    for i in range(int(n * 0.18), int(n * 0.55)):
        put(g, i, int(n * 0.32 + (i * 0.15)))
        put(g, i, n - 1 - int(n * 0.32))
    return g

def scene_ice(n):
    g = blank(n)
    disc(g, n * 0.32, (n - 1) / 2, n * 0.22, n * 0.22)
    tri(g, int(n * 0.40), n // 2, n - 2, int(n * 0.28))
    return g

def scene_candy(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.22, n * 0.28)
    tri(g, n // 2, 0, int(n * 0.28), int(n * 0.18))
    tri(g, n // 2, 0, int(n * 0.72), int(n * 0.18))
    tri(g, n // 2, n - 1, int(n * 0.28), int(n * 0.18))
    tri(g, n // 2, n - 1, int(n * 0.72), int(n * 0.18))
    return g

def scene_donut(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.40, n * 0.40)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.14, n * 0.14, 0)
    return g

def scene_slice(n):
    g = blank(n)
    tri(g, 1, 1, n - 2, n - 3)
    return g

def scene_cheese(n):
    g = blank(n)
    tri(g, 1, 1, n - 2, n - 3)
    disc(g, n * 0.45, n * 0.40, n * 0.08, n * 0.08, 0)
    disc(g, n * 0.65, n * 0.58, n * 0.07, n * 0.07, 0)
    return g

def scene_mug(n):
    g = blank(n)
    rect(g, int(n * 0.22), int(n * 0.15), int(n * 0.58), int(n * 0.55))
    rect(g, int(n * 0.32), int(n * 0.28), int(n * 0.38), int(n * 0.30), 0)
    disc(g, n * 0.48, n * 0.78, n * 0.16, n * 0.14)
    disc(g, n * 0.48, n * 0.78, n * 0.08, n * 0.06, 0)
    return g

def scene_bowl(n):
    g = blank(n)
    disc(g, n * 0.42, (n - 1) / 2, n * 0.36, n * 0.42)
    rect(g, 0, 0, int(n * 0.42), n, 0)
    return g

def scene_flag(n):
    g = blank(n)
    rect(g, 1, int(n * 0.22), n - 2, max(1, n // 10))
    rect(g, 1, int(n * 0.22), int(n * 0.42), int(n * 0.55))
    return g

def scene_anchor(n):
    g = blank(n)
    disc(g, n * 0.18, (n - 1) / 2, n * 0.10, n * 0.10)
    rect(g, int(n * 0.18), n // 2, int(n * 0.62), max(1, n // 10))
    rect(g, int(n * 0.40), int(n * 0.22), max(2, n // 8), int(n * 0.56))
    disc(g, n * 0.78, n * 0.28, n * 0.16, n * 0.16)
    disc(g, n * 0.78, n * 0.72, n * 0.16, n * 0.16)
    rect(g, int(n * 0.55), int(n * 0.18), int(n * 0.28), int(n * 0.22), 0)
    rect(g, int(n * 0.55), int(n * 0.60), int(n * 0.28), int(n * 0.22), 0)
    return g

def scene_plane(n):
    g = blank(n)
    rect(g, n // 2 - max(1, n // 12), 1, max(2, n // 7), n - 2)
    tri(g, n // 2, int(n * 0.7), int(n * 0.12), int(n * 0.28))
    tri(g, n // 2, int(n * 0.7), int(n * 0.88), int(n * 0.28))
    tri(g, n // 2, int(n * 0.22), int(n * 0.28), int(n * 0.12))
    tri(g, n // 2, int(n * 0.22), int(n * 0.72), int(n * 0.12))
    return g

def scene_note(n):
    g = blank(n)
    disc(g, n * 0.72, n * 0.32, n * 0.14, n * 0.16)
    rect(g, int(n * 0.18), int(n * 0.42), int(n * 0.58), max(1, n // 10))
    rect(g, int(n * 0.18), int(n * 0.42), max(2, n // 8), int(n * 0.28))
    return g

def scene_drop(n):
    g = blank(n)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.30, n * 0.28)
    tri(g, 1, n // 2, int(n * 0.55), int(n * 0.28))
    return g

def scene_bolt(n):
    g = blank(n)
    tri(g, 0, int(n * 0.7), n // 2, int(n * 0.35))
    tri(g, n - 1, int(n * 0.3), n // 2, int(n * 0.35))
    return g

def scene_smile(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.46, n * 0.46)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.34, n * 0.34, 0)
    # eyes and smile as filled again on the ring face — make a solid face with holes
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.46, n * 0.46)
    eye = max(1, n // 8)
    rect(g, int(n * 0.32), int(n * 0.28), eye, eye, 0)
    rect(g, int(n * 0.32), int(n * 0.62), eye, eye, 0)
    for c in range(int(n * 0.30), int(n * 0.70)):
        put(g, int(n * 0.68), c, 0)
    return g

def scene_eye(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.28, n * 0.44)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.12, n * 0.12, 0)
    return g

def scene_window(n):
    g = blank(n)
    frame(g, 1, 1, n - 2, n - 2, max(1, n // 8))
    mid = n // 2
    t = max(1, n // 10)
    rect(g, 1, mid - t // 2, n - 2, t)
    rect(g, mid - t // 2, 1, t, n - 2)
    return g

def scene_door(n):
    g = blank(n)
    frame(g, 1, int(n * 0.22), n - 2, int(n * 0.56), max(1, n // 8))
    disc(g, n * 0.55, n * 0.64, n * 0.06, n * 0.06, 0)
    return g

def scene_stairs(n):
    g = blank(n)
    steps = 5
    for i in range(steps):
        h = max(1, n // steps)
        rect(g, n - (i + 1) * h, 0, h, max(1, (i + 1) * n // steps))
    return g

def scene_bridge(n):
    g = blank(n)
    rect(g, int(n * 0.55), 0, max(2, n // 8), n)
    rect(g, int(n * 0.35), 1, int(n * 0.25), max(2, n // 8))
    rect(g, int(n * 0.35), n - 1 - max(2, n // 8), int(n * 0.25), max(2, n // 8))
    # arch erase
    disc(g, n * 0.62, (n - 1) / 2, n * 0.22, n * 0.28, 0)
    rect(g, int(n * 0.55), 0, max(2, n // 8), n)  # restore deck
    return g

def scene_igloo(n):
    g = blank(n)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.48, n * 0.46)
    rect(g, int(n * 0.62), 0, n, n, 0)
    rect(g, int(n * 0.62), n // 2 - max(1, n // 8), n - int(n * 0.62), max(2, n // 4), 0)
    return g

def scene_barn(n):
    g = blank(n)
    tri(g, 1, n // 2, int(n * 0.40), n // 2 - 1)
    rect(g, int(n * 0.40), 1, n - int(n * 0.42), n - 2)
    rect(g, int(n * 0.58), n // 2 - max(1, n // 8), n - int(n * 0.58), max(2, n // 4), 0)
    return g

def scene_church(n):
    g = blank(n)
    rect(g, int(n * 0.35), int(n * 0.28), n - int(n * 0.37), int(n * 0.44))
    tri(g, int(n * 0.18), n // 2, int(n * 0.38), int(n * 0.24))
    rect(g, 1, n // 2, int(n * 0.22), max(1, n // 10))
    rect(g, int(n * 0.08), n // 2 - int(n * 0.08), max(1, n // 12), int(n * 0.18))
    rect(g, int(n * 0.62), n // 2 - max(1, n // 10), n - int(n * 0.62), max(2, n // 5), 0)
    return g

def scene_castle(n):
    g = blank(n)
    rect(g, int(n * 0.35), 1, n - int(n * 0.37), n - 2)
    mer = max(2, n // 6)
    for x in range(1, n - 1, mer):
        rect(g, int(n * 0.18), x, int(n * 0.20), mer // 2 + 1)
    rect(g, int(n * 0.62), n // 2 - max(1, n // 10), n - int(n * 0.62), max(2, n // 5), 0)
    return g

def scene_rocket(n):
    g = blank(n)
    tri(g, 0, n // 2, int(n * 0.28), int(n * 0.18))
    rect(g, int(n * 0.26), n // 2 - max(1, n // 8), int(n * 0.50), max(2, n // 4))
    tri(g, int(n * 0.70), int(n * 0.28), int(n * 0.95), int(n * 0.12))
    tri(g, int(n * 0.70), int(n * 0.72), int(n * 0.95), int(n * 0.12))
    return g

def scene_ufo(n):
    g = blank(n)
    disc(g, n * 0.42, (n - 1) / 2, n * 0.16, n * 0.18)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.12, n * 0.42)
    return g

def scene_crab(n):
    g = blank(n)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.24, n * 0.30)
    disc(g, n * 0.32, n * 0.12, n * 0.12, n * 0.12)
    disc(g, n * 0.32, n * 0.88, n * 0.12, n * 0.12)
    for dx in (0.22, 0.40, 0.60, 0.78):
        rect(g, int(n * 0.75), int(n * dx), int(n * 0.18), max(1, n // 12))
    return g

def scene_frog(n):
    g = blank(n)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.30, n * 0.36)
    disc(g, n * 0.28, n * 0.28, n * 0.14, n * 0.14)
    disc(g, n * 0.28, n * 0.72, n * 0.14, n * 0.14)
    put(g, int(n * 0.26), int(n * 0.28), 0)
    put(g, int(n * 0.26), int(n * 0.72), 0)
    return g

def scene_owl(n):
    g = blank(n)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.40, n * 0.32)
    # ear tufts
    tri(g, 0, int(n * 0.28), int(n * 0.22), int(n * 0.10))
    tri(g, 0, int(n * 0.72), int(n * 0.22), int(n * 0.10))
    disc(g, n * 0.48, n * 0.35, n * 0.10, n * 0.10, 0)
    disc(g, n * 0.48, n * 0.65, n * 0.10, n * 0.10, 0)
    return g

def scene_fox(n):
    g = blank(n)
    tri(g, 0, int(n * 0.22), int(n * 0.28), int(n * 0.14))
    tri(g, 0, int(n * 0.78), int(n * 0.28), int(n * 0.14))
    disc(g, n * 0.55, (n - 1) / 2, n * 0.32, n * 0.36)
    tri(g, int(n * 0.55), n // 2, int(n * 0.85), int(n * 0.12))
    return g

def scene_bear(n):
    g = blank(n)
    disc(g, n * 0.22, n * 0.22, n * 0.14, n * 0.14)
    disc(g, n * 0.22, n * 0.78, n * 0.14, n * 0.14)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.36, n * 0.38)
    rect(g, int(n * 0.48), int(n * 0.36), max(1, n // 10), max(1, n // 10), 0)
    rect(g, int(n * 0.48), int(n * 0.56), max(1, n // 10), max(1, n // 10), 0)
    return g

def scene_mouse(n):
    g = blank(n)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.32, n * 0.34)
    disc(g, n * 0.28, n * 0.22, n * 0.16, n * 0.14)
    disc(g, n * 0.28, n * 0.78, n * 0.16, n * 0.14)
    return g

def scene_swan(n):
    g = blank(n)
    disc(g, n * 0.70, n * 0.40, n * 0.22, n * 0.28)
    # neck
    for i in range(int(n * 0.15), int(n * 0.70)):
        c = int(n * 0.55 + (i - n * 0.15) * 0.15)
        put(g, i, c)
        put(g, i, min(n - 1, c + 1))
    disc(g, n * 0.18, n * 0.72, n * 0.10, n * 0.12)
    return g

def scene_snail(n):
    g = blank(n)
    disc(g, n * 0.42, n * 0.58, n * 0.28, n * 0.28)
    disc(g, n * 0.42, n * 0.58, n * 0.10, n * 0.10, 0)
    rect(g, int(n * 0.62), int(n * 0.15), max(2, n // 6), int(n * 0.55))
    return g

def scene_bee(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.22, n * 0.36)
    # stripes
    for r in range(n):
        if int(r / max(1, n // 7)) % 2 == 0:
            for c in range(n):
                if g[r][c]:
                    pass
    band = max(1, n // 8)
    for b in range(3):
        y = int(n * 0.32) + b * band * 2
        rect(g, y, int(n * 0.28), band, int(n * 0.44), 0)
    disc(g, n * 0.28, n * 0.22, n * 0.10, n * 0.12)
    disc(g, n * 0.28, n * 0.78, n * 0.10, n * 0.12)
    return g

def scene_ladybug(n):
    g = blank(n)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.34, n * 0.36)
    disc(g, n * 0.28, (n - 1) / 2, n * 0.14, n * 0.18)
    rect(g, int(n * 0.30), n // 2, int(n * 0.55), max(1, n // 12), 0)
    return g

def scene_spider(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.18, n * 0.22)
    for ang in range(8):
        # 8 legs as short rects
        pass
    rect(g, n // 2, 0, max(1, n // 12), n)
    rect(g, 0, n // 2, n, max(1, n // 12))
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.16, n * 0.20)
    return g

def scene_bat(n):
    g = blank(n)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.18, n * 0.16)
    tri(g, int(n * 0.45), int(n * 0.15), int(n * 0.15), int(n * 0.20))
    tri(g, int(n * 0.45), int(n * 0.85), int(n * 0.15), int(n * 0.20))
    tri(g, int(n * 0.70), int(n * 0.20), int(n * 0.45), int(n * 0.18))
    tri(g, int(n * 0.70), int(n * 0.80), int(n * 0.45), int(n * 0.18))
    return g

def scene_palm(n):
    g = blank(n)
    rect(g, int(n * 0.35), n // 2, n - int(n * 0.35), max(1, n // 8))
    tri(g, int(n * 0.15), n // 2, int(n * 0.40), int(n * 0.40))
    return g

def scene_tulip(n):
    g = blank(n)
    disc(g, n * 0.28, (n - 1) / 2, n * 0.20, n * 0.16)
    tri(g, int(n * 0.22), n // 2, int(n * 0.48), int(n * 0.18))
    rect(g, int(n * 0.45), n // 2, n - int(n * 0.45), 1)
    return g

def scene_pear(n):
    g = blank(n)
    disc(g, n * 0.32, (n - 1) / 2, n * 0.16, n * 0.16)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.28, n * 0.26)
    return g

def scene_grapes(n):
    g = blank(n)
    spots = [(0.28, 0.40), (0.28, 0.62), (0.45, 0.30), (0.45, 0.52), (0.45, 0.74),
             (0.62, 0.40), (0.62, 0.62), (0.76, 0.50)]
    rad = n * 0.12
    for dy, dx in spots:
        disc(g, n * dy, n * dx, rad, rad)
    rect(g, 1, n // 2, int(n * 0.18), 1)
    return g

def scene_pepper(n):
    g = blank(n)
    disc(g, n * 0.58, (n - 1) / 2, n * 0.32, n * 0.22)
    rect(g, int(n * 0.10), n // 2, int(n * 0.22), max(1, n // 10))
    return g

def scene_carrot(n):
    g = blank(n)
    tri(g, int(n * 0.22), n // 2, n - 2, int(n * 0.28))
    for dx in (-2, 0, 2):
        rect(g, 1, n // 2 + dx, int(n * 0.18), 1)
    return g

def scene_corn(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.42, n * 0.18)
    for r in range(2, n - 2, max(2, n // 6)):
        rect(g, r, int(n * 0.38), 1, int(n * 0.24), 0)
    return g

def scene_chili(n):
    g = blank(n)
    for r in range(n):
        for c in range(n):
            x = (c - n * 0.55) / (n * 0.22)
            y = (r - n * 0.5) / (n * 0.40)
            if x * x + y * y <= 1 and c < n * 0.75:
                g[r][c] = 1
    rect(g, int(n * 0.08), int(n * 0.62), int(n * 0.16), max(1, n // 10))
    return g

def scene_lemon(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.32, n * 0.40)
    put(g, n // 2, 1)
    put(g, n // 2, n - 2)
    return g

def scene_acorn(n):
    g = blank(n)
    disc(g, n * 0.30, (n - 1) / 2, n * 0.16, n * 0.28)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.28, n * 0.24)
    return g

def scene_loaf(n):
    g = blank(n)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.36, n * 0.42)
    rect(g, int(n * 0.62), 0, n, n, 0)
    rect(g, int(n * 0.55), int(n * 0.12), int(n * 0.18), int(n * 0.76))
    return g

def scene_pretzel(n):
    g = blank(n)
    frame(g, int(n * 0.15), int(n * 0.15), int(n * 0.70), int(n * 0.70), max(2, n // 7))
    # cross
    t = max(2, n // 7)
    rect(g, n // 2 - t // 2, int(n * 0.2), t, int(n * 0.6))
    return g

def scene_cookie(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.40, n * 0.40)
    for dy, dx in ((0.35, 0.35), (0.35, 0.65), (0.6, 0.3), (0.62, 0.68), (0.48, 0.5)):
        disc(g, n * dy, n * dx, n * 0.06, n * 0.06, 0)
    return g

def scene_eggcup(n):
    g = blank(n)
    disc(g, n * 0.32, (n - 1) / 2, n * 0.20, n * 0.16)
    tri(g, int(n * 0.40), n // 2, n - 2, int(n * 0.28))
    return g

def scene_teapot(n):
    g = blank(n)
    disc(g, n * 0.58, n * 0.48, n * 0.28, n * 0.30)
    rect(g, int(n * 0.28), n // 2 - max(1, n // 12), int(n * 0.22), max(2, n // 6))
    rect(g, int(n * 0.48), int(n * 0.08), max(2, n // 8), int(n * 0.28))
    disc(g, n * 0.48, n * 0.82, n * 0.12, n * 0.10)
    return g

def scene_pan(n):
    g = blank(n)
    disc(g, (n - 1) / 2, n * 0.40, n * 0.32, n * 0.32)
    disc(g, (n - 1) / 2, n * 0.40, n * 0.20, n * 0.20, 0)
    rect(g, n // 2, int(n * 0.68), max(2, n // 8), int(n * 0.28))
    return g

def scene_spoon(n):
    g = blank(n)
    disc(g, n * 0.28, (n - 1) / 2, n * 0.16, n * 0.12)
    rect(g, int(n * 0.40), n // 2, n - int(n * 0.42), max(1, n // 10))
    return g

def scene_fork(n):
    g = blank(n)
    t = max(1, n // 12)
    for dx in (-2 * t, 0, 2 * t):
        rect(g, 1, n // 2 + dx, int(n * 0.40), t)
    rect(g, int(n * 0.36), n // 2 - t // 2, n - int(n * 0.40), max(2, n // 6))
    return g

def scene_knife(n):
    g = blank(n)
    tri(g, 1, int(n * 0.35), int(n * 0.7), int(n * 0.10))
    rect(g, 1, int(n * 0.35), int(n * 0.72), max(1, n // 10))
    rect(g, int(n * 0.70), int(n * 0.28), int(n * 0.22), int(n * 0.22))
    return g

def scene_axe(n):
    g = blank(n)
    rect(g, 1, n // 2, n - 2, max(1, n // 10))
    disc(g, n * 0.30, n * 0.32, n * 0.18, n * 0.16)
    return g

def scene_hammer(n):
    g = blank(n)
    rect(g, int(n * 0.18), int(n * 0.15), int(n * 0.22), int(n * 0.70))
    rect(g, int(n * 0.30), n // 2, n - int(n * 0.32), max(2, n // 7))
    return g

def scene_saw(n):
    g = blank(n)
    rect(g, int(n * 0.35), 1, max(2, n // 6), n - 2)
    tooth = max(2, n // 6)
    for x in range(1, n - 1, tooth):
        tri(g, int(n * 0.48), x + tooth // 2, int(n * 0.72), tooth // 2)
    rect(g, int(n * 0.22), int(n * 0.15), int(n * 0.16), int(n * 0.25))
    return g

def scene_bulb(n):
    g = blank(n)
    disc(g, n * 0.38, (n - 1) / 2, n * 0.28, n * 0.26)
    rect(g, int(n * 0.64), n // 2 - max(1, n // 8), int(n * 0.22), max(2, n // 4))
    return g

def scene_candle(n):
    g = blank(n)
    rect(g, int(n * 0.35), n // 2 - max(1, n // 8), int(n * 0.50), max(2, n // 4))
    disc(g, n * 0.22, (n - 1) / 2, n * 0.12, n * 0.10)
    rect(g, int(n * 0.82), int(n * 0.25), max(2, n // 8), int(n * 0.50))
    return g

def scene_lamp(n):
    g = blank(n)
    tri(g, int(n * 0.15), n // 2, int(n * 0.55), int(n * 0.32))
    rect(g, int(n * 0.55), n // 2, int(n * 0.25), max(1, n // 10))
    rect(g, int(n * 0.78), int(n * 0.25), max(2, n // 8), int(n * 0.50))
    return g

def scene_couch(n):
    g = blank(n)
    rect(g, int(n * 0.35), 1, int(n * 0.45), n - 2)
    rect(g, int(n * 0.28), 1, int(n * 0.50), max(2, n // 6))
    rect(g, int(n * 0.28), n - 1 - max(2, n // 6), int(n * 0.50), max(2, n // 6))
    return g

def scene_chair(n):
    g = blank(n)
    rect(g, int(n * 0.15), int(n * 0.25), int(n * 0.45), max(2, n // 6))
    rect(g, int(n * 0.50), int(n * 0.25), max(2, n // 7), int(n * 0.50))
    rect(g, int(n * 0.65), int(n * 0.25), int(n * 0.25), max(2, n // 7))
    rect(g, int(n * 0.65), int(n * 0.60), int(n * 0.25), max(2, n // 7))
    return g

def scene_table(n):
    g = blank(n)
    rect(g, int(n * 0.32), 1, max(2, n // 7), n - 2)
    rect(g, int(n * 0.45), int(n * 0.22), int(n * 0.40), max(2, n // 8))
    rect(g, int(n * 0.45), int(n * 0.68), int(n * 0.40), max(2, n // 8))
    return g

def scene_bed(n):
    g = blank(n)
    rect(g, int(n * 0.40), int(n * 0.12), int(n * 0.40), int(n * 0.76))
    rect(g, int(n * 0.28), int(n * 0.12), int(n * 0.22), int(n * 0.18))
    return g

def scene_clock(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.42, n * 0.42)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.30, n * 0.30, 0)
    rect(g, n // 2, n // 2, max(1, n // 12), int(n * 0.18))
    rect(g, int(n * 0.35), n // 2, int(n * 0.16), max(1, n // 12))
    return g

def scene_camera(n):
    g = blank(n)
    rect(g, int(n * 0.32), int(n * 0.12), int(n * 0.48), int(n * 0.76))
    rect(g, int(n * 0.18), int(n * 0.28), int(n * 0.16), int(n * 0.28))
    disc(g, n * 0.56, n * 0.50, n * 0.14, n * 0.14, 0)
    return g

def scene_letter(n):
    g = blank(n)
    rect(g, int(n * 0.22), int(n * 0.12), int(n * 0.56), int(n * 0.76))
    tri(g, int(n * 0.22), int(n * 0.12), int(n * 0.50), int(n * 0.38))
    # erase below the flap diagonals roughly by keeping the rect and a V of empties
    return g

def scene_lock(n):
    g = blank(n)
    frame(g, int(n * 0.12), int(n * 0.28), int(n * 0.36), int(n * 0.44), max(2, n // 8))
    rect(g, int(n * 0.40), int(n * 0.18), int(n * 0.48), int(n * 0.64))
    disc(g, n * 0.60, (n - 1) / 2, n * 0.06, n * 0.06, 0)
    return g

def scene_safe(n):
    g = blank(n)
    frame(g, 1, 1, n - 2, n - 2, max(2, n // 8))
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.16, n * 0.16, 0)
    return g

def scene_chest(n):
    g = blank(n)
    disc(g, n * 0.45, (n - 1) / 2, n * 0.30, n * 0.42)
    rect(g, int(n * 0.45), int(n * 0.08), int(n * 0.40), int(n * 0.84))
    rect(g, int(n * 0.58), int(n * 0.20), max(1, n // 12), int(n * 0.60), 0)
    return g

def scene_map(n):
    g = blank(n)
    frame(g, 1, 1, n - 2, n - 2, max(1, n // 10))
    # a river
    for i in range(2, n - 2):
        put(g, i, int(n * 0.3 + (i % 3)))
        put(g, int(n * 0.6), i)
    return g

def scene_compass(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.42, n * 0.42)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.30, n * 0.30, 0)
    tri(g, int(n * 0.15), n // 2, n // 2, int(n * 0.10))
    tri(g, int(n * 0.85), n // 2, n // 2, int(n * 0.10))
    return g

def scene_medal(n):
    g = blank(n)
    tri(g, 0, int(n * 0.30), int(n * 0.28), int(n * 0.12))
    tri(g, 0, int(n * 0.70), int(n * 0.28), int(n * 0.12))
    disc(g, n * 0.62, (n - 1) / 2, n * 0.28, n * 0.28)
    return g

def scene_shield(n):
    g = blank(n)
    rect(g, 1, int(n * 0.15), int(n * 0.45), int(n * 0.70))
    tri(g, int(n * 0.45), n // 2, n - 2, int(n * 0.35))
    return g

def scene_gemstone(n):
    g = blank(n)
    tri(g, 1, n // 2, int(n * 0.35), int(n * 0.40))
    tri(g, n - 2, n // 2, int(n * 0.35), int(n * 0.40))
    return g

def scene_ring(n):
    g = blank(n)
    disc(g, n * 0.40, (n - 1) / 2, n * 0.22, n * 0.18)
    disc(g, n * 0.40, (n - 1) / 2, n * 0.10, n * 0.08, 0)
    rect(g, int(n * 0.58), n // 2 - max(1, n // 10), int(n * 0.32), max(2, n // 5))
    return g

def scene_balloon_dog(n):
    # a simple poodle-ish balloon: three discs and a snout
    g = blank(n)
    disc(g, n * 0.62, n * 0.40, n * 0.22, n * 0.22)
    disc(g, n * 0.35, n * 0.62, n * 0.16, n * 0.16)
    disc(g, n * 0.28, n * 0.80, n * 0.10, n * 0.12)
    return g

def scene_snowman(n):
    g = blank(n)
    disc(g, n * 0.28, (n - 1) / 2, n * 0.16, n * 0.16)
    disc(g, n * 0.55, (n - 1) / 2, n * 0.20, n * 0.20)
    disc(g, n * 0.82, (n - 1) / 2, n * 0.16, n * 0.18)
    return g

def scene_mitten(n):
    g = blank(n)
    disc(g, n * 0.62, n * 0.48, n * 0.30, n * 0.26)
    disc(g, n * 0.40, n * 0.22, n * 0.14, n * 0.12)
    return g

def scene_scarf(n):
    g = blank(n)
    t = max(2, n // 5)
    rect(g, int(n * 0.15), int(n * 0.1), t, int(n * 0.8))
    rect(g, int(n * 0.15), int(n * 0.55), int(n * 0.7), t)
    return g

def scene_glove(n):
    g = blank(n)
    rect(g, int(n * 0.45), int(n * 0.25), int(n * 0.45), int(n * 0.50))
    fw = max(1, n // 10)
    for i, dx in enumerate((0.22, 0.38, 0.54, 0.70)):
        h = int(n * (0.40 if i < 3 else 0.28))
        rect(g, int(n * 0.48) - h, int(n * dx), h, fw)
    return g

def scene_sock(n):
    g = blank(n)
    rect(g, 1, int(n * 0.40), int(n * 0.65), int(n * 0.25))
    disc(g, n * 0.70, n * 0.45, n * 0.22, n * 0.28)
    return g

def scene_shirt(n):
    g = blank(n)
    rect(g, int(n * 0.28), int(n * 0.30), int(n * 0.60), int(n * 0.40))
    tri(g, int(n * 0.28), int(n * 0.15), int(n * 0.55), int(n * 0.16))
    tri(g, int(n * 0.28), int(n * 0.85), int(n * 0.55), int(n * 0.16))
    rect(g, int(n * 0.28), n // 2 - max(1, n // 8), int(n * 0.12), max(2, n // 4), 0)
    return g

def scene_dress(n):
    g = blank(n)
    rect(g, int(n * 0.15), n // 2 - max(1, n // 8), int(n * 0.30), max(2, n // 4))
    tri(g, int(n * 0.40), n // 2, n - 2, int(n * 0.40))
    return g

def scene_bow(n):
    g = blank(n)
    tri(g, n // 2, n // 2, int(n * 0.2), int(n * 0.35))
    tri(g, n // 2, n // 2, int(n * 0.8), int(n * 0.35))
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.10, n * 0.10)
    return g

def scene_tie(n):
    g = blank(n)
    tri(g, int(n * 0.12), n // 2, int(n * 0.32), int(n * 0.18))
    rect(g, int(n * 0.30), n // 2 - max(1, n // 12), int(n * 0.35), max(1, n // 6))
    tri(g, int(n * 0.85), n // 2, int(n * 0.60), int(n * 0.16))
    return g

def scene_bag(n):
    g = blank(n)
    rect(g, int(n * 0.32), int(n * 0.18), int(n * 0.55), int(n * 0.64))
    frame(g, int(n * 0.12), int(n * 0.30), int(n * 0.28), int(n * 0.40), max(1, n // 12))
    return g

def scene_purse(n):
    g = blank(n)
    disc(g, n * 0.60, (n - 1) / 2, n * 0.32, n * 0.36)
    rect(g, int(n * 0.35), int(n * 0.15), max(2, n // 8), int(n * 0.70))
    return g

def scene_tag(n):
    g = blank(n)
    rect(g, int(n * 0.2), int(n * 0.15), int(n * 0.6), int(n * 0.7))
    # cut a corner
    tri(g, int(n * 0.2), int(n * 0.85), int(n * 0.4), int(n * 0.15))
    # the tri adds rather than cuts. Erase the corner.
    for r in range(int(n * 0.2), int(n * 0.4)):
        for c in range(int(n * 0.7), n):
            if c + r > n * 1.05:
                put(g, r, c, 0)
    disc(g, n * 0.35, n * 0.32, n * 0.06, n * 0.06, 0)
    return g

def scene_pin(n):
    g = blank(n)
    disc(g, n * 0.30, (n - 1) / 2, n * 0.16, n * 0.16)
    rect(g, int(n * 0.42), n // 2, int(n * 0.45), max(1, n // 12))
    return g

def scene_button(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.40, n * 0.40)
    for dy, dx in ((-0.1, -0.1), (-0.1, 0.1), (0.1, -0.1), (0.1, 0.1)):
        disc(g, n * (0.5 + dy), n * (0.5 + dx), n * 0.05, n * 0.05, 0)
    return g

def scene_spool(n):
    g = blank(n)
    rect(g, int(n * 0.15), int(n * 0.2), int(n * 0.7), int(n * 0.6))
    rect(g, int(n * 0.30), int(n * 0.32), int(n * 0.40), int(n * 0.36), 0)
    return g

def scene_pencil(n):
    g = blank(n)
    rect(g, n // 2 - max(1, n // 10), 1, max(2, n // 5), int(n * 0.7))
    tri(g, n // 2, n - 2, n // 2 - int(n * 0.15), int(n * 0.12))
    tri(g, n // 2, n - 2, n // 2 + int(n * 0.15), int(n * 0.12))
    return g

def scene_crayon(n):
    g = scene_pencil(n)
    return g

def scene_ruler(n):
    g = blank(n)
    rect(g, n // 2 - max(1, n // 8), 0, max(2, n // 4), n)
    for x in range(1, n, max(2, n // 7)):
        rect(g, n // 2 - max(1, n // 8), x, max(1, n // 10), 1, 0)
    return g

def scene_magnet(n):
    g = blank(n)
    t = max(2, n // 4)
    rect(g, int(n * 0.2), int(n * 0.2), int(n * 0.65), t)
    rect(g, int(n * 0.2), int(n * 0.6), int(n * 0.65), t)
    rect(g, int(n * 0.2), int(n * 0.2), t, int(n * 0.6))
    return g

def scene_plug(n):
    g = blank(n)
    rect(g, int(n * 0.35), int(n * 0.25), int(n * 0.45), int(n * 0.5))
    rect(g, int(n * 0.15), int(n * 0.35), int(n * 0.22), max(2, n // 8))
    rect(g, int(n * 0.15), int(n * 0.55), int(n * 0.22), max(2, n // 8))
    return g

def scene_battery(n):
    g = blank(n)
    frame(g, int(n * 0.3), int(n * 0.15), int(n * 0.4), int(n * 0.7), max(1, n // 10))
    rect(g, n // 2 - max(1, n // 12), int(n * 0.82), max(2, n // 6), int(n * 0.1))
    return g

def scene_floppy(n):
    g = blank(n)
    rect(g, 1, 1, n - 2, n - 2)
    rect(g, 1, int(n * 0.35), int(n * 0.22), int(n * 0.45), 0)
    rect(g, int(n * 0.55), int(n * 0.25), int(n * 0.28), int(n * 0.5), 0)
    return g

def scene_gamepad(n):
    g = blank(n)
    disc(g, (n - 1) / 2, (n - 1) / 2, n * 0.28, n * 0.46)
    rect(g, n // 2, int(n * 0.22), max(1, n // 10), int(n * 0.18), 0)
    rect(g, n // 2 - int(n * 0.08), int(n * 0.28), int(n * 0.18), max(1, n // 10), 0)
    disc(g, n * 0.42, n * 0.68, n * 0.06, n * 0.06, 0)
    disc(g, n * 0.58, n * 0.76, n * 0.06, n * 0.06, 0)
    return g

def scene_dice(n):
    g = blank(n)
    frame(g, 1, 1, n - 2, n - 2, max(2, n // 7))
    rad = n * 0.07
    for dy, dx in ((0.3, 0.3), (0.5, 0.5), (0.7, 0.7)):
        disc(g, n * dy, n * dx, rad, rad)
    return g

def scene_pawn(n):
    g = blank(n)
    disc(g, n * 0.28, (n - 1) / 2, n * 0.16, n * 0.16)
    tri(g, int(n * 0.40), n // 2, int(n * 0.75), int(n * 0.16))
    rect(g, int(n * 0.78), int(n * 0.25), max(2, n // 8), int(n * 0.5))
    return g

def scene_knight(n):
    g = blank(n)
    # chess knight silhouette, chunky
    rect(g, int(n * 0.35), int(n * 0.25), int(n * 0.45), int(n * 0.35))
    disc(g, n * 0.32, n * 0.55, n * 0.22, n * 0.24)
    rect(g, int(n * 0.25), int(n * 0.65), int(n * 0.12), int(n * 0.2))
    rect(g, int(n * 0.78), int(n * 0.18), max(2, n // 8), int(n * 0.6))
    return g

def scene_cupcake(n):
    g = blank(n)
    disc(g, n * 0.32, (n - 1) / 2, n * 0.20, n * 0.22)
    tri(g, int(n * 0.40), n // 2, n - 2, int(n * 0.32))
    # wrapper stripes
    return g

def scene_lollipop(n):
    g = blank(n)
    disc(g, n * 0.32, (n - 1) / 2, n * 0.26, n * 0.26)
    rect(g, int(n * 0.55), n // 2, n - int(n * 0.55), max(1, n // 10))
    return g

def scene_popsicle(n):
    g = blank(n)
    rect(g, 1, int(n * 0.3), int(n * 0.62), int(n * 0.4))
    # round top
    disc(g, n * 0.2, (n - 1) / 2, n * 0.16, n * 0.2)
    rect(g, int(n * 0.6), n // 2 - max(1, n // 16), int(n * 0.3), max(1, n // 8))
    return g

def scene_watermelon(n):
    g = blank(n)
    disc(g, n * 0.85, (n - 1) / 2, n * 0.7, n * 0.7)
    rect(g, 0, 0, int(n * 0.55), n, 0)
    return g

def scene_pineapple(n):
    g = blank(n)
    disc(g, n * 0.62, (n - 1) / 2, n * 0.32, n * 0.26)
    tri(g, int(n * 0.08), n // 2, int(n * 0.35), int(n * 0.2))
    tri(g, int(n * 0.05), int(n * 0.35), int(n * 0.32), int(n * 0.1))
    tri(g, int(n * 0.05), int(n * 0.65), int(n * 0.32), int(n * 0.1))
    return g

def scene_strawberry(n):
    g = blank(n)
    tri(g, int(n * 0.3), n // 2, n - 2, int(n * 0.32))
    disc(g, n * 0.4, (n - 1) / 2, n * 0.2, n * 0.28)
    for dx in (-1, 1):
        tri(g, 1, n // 2 + dx * int(n * 0.12), int(n * 0.25), int(n * 0.08))
    return g

def scene_mushroom2(n):
    return scene_mushroom(n)

def scene_log(n):
    g = blank(n)
    disc(g, (n - 1) / 2, n * 0.3, n * 0.28, n * 0.28)
    rect(g, int(n * 0.22), int(n * 0.3), int(n * 0.56), int(n * 0.6))
    disc(g, (n - 1) / 2, n * 0.85, n * 0.28, n * 0.2)
    disc(g, (n - 1) / 2, n * 0.3, n * 0.12, n * 0.12, 0)
    return g

def scene_bucket(n):
    g = blank(n)
    tri(g, int(n * 0.25), n // 2, n - 2, int(n * 0.4))
    # actually a trapezoid wider at top: invert
    g = blank(n)
    top = int(n * 0.28)
    for i, r in enumerate(range(top, n - 1)):
        inset = i // 3
        rect(g, r, 1 + inset, 1, n - 2 - 2 * inset)
    frame(g, int(n * 0.1), int(n * 0.3), int(n * 0.22), int(n * 0.4), max(1, n // 12))
    return g

def scene_well(n):
    g = blank(n)
    rect(g, int(n * 0.4), int(n * 0.2), int(n * 0.4), int(n * 0.6))
    rect(g, int(n * 0.5), int(n * 0.32), int(n * 0.22), int(n * 0.36), 0)
    rect(g, int(n * 0.2), int(n * 0.15), max(2, n // 8), max(2, n // 8))
    rect(g, int(n * 0.2), int(n * 0.7), max(2, n // 8), max(2, n // 8))
    rect(g, int(n * 0.25), int(n * 0.2), max(1, n // 12), int(n * 0.6))
    return g

def scene_fence(n):
    g = blank(n)
    t = max(1, n // 10)
    rect(g, int(n * 0.35), 0, t, n)
    rect(g, int(n * 0.6), 0, t, n)
    for x in range(1, n, max(2, n // 5)):
        rect(g, int(n * 0.2), x, int(n * 0.65), t)
    return g

def scene_windmill(n):
    g = blank(n)
    rect(g, int(n * 0.4), n // 2 - max(1, n // 12), int(n * 0.55), max(2, n // 6))
    tri(g, int(n * 0.15), n // 2, int(n * 0.45), int(n * 0.35))
    # blades
    rect(g, n // 2 - max(1, n // 14), int(n * 0.15), max(1, n // 7), int(n * 0.7))
    rect(g, int(n * 0.15), n // 2 - max(1, n // 14), int(n * 0.7), max(1, n // 7))
    return g

def scene_lighthouse(n):
    g = blank(n)
    tri(g, int(n * 0.2), n // 2, n - 2, int(n * 0.28))
    rect(g, int(n * 0.12), n // 2 - max(1, n // 8), int(n * 0.14), max(2, n // 4))
    disc(g, n * 0.1, (n - 1) / 2, n * 0.08, n * 0.08)
    return g

def scene_sail(n):
    return scene_boat(n)

def scene_sub(n):
    g = blank(n)
    disc(g, n * 0.6, (n - 1) / 2, n * 0.18, n * 0.4)
    rect(g, int(n * 0.35), n // 2 - max(1, n // 8), int(n * 0.25), max(2, n // 4))
    rect(g, int(n * 0.22), n // 2 - int(n * 0.12), max(2, n // 10), int(n * 0.24))
    return g

def scene_train(n):
    g = blank(n)
    rect(g, int(n * 0.35), int(n * 0.15), int(n * 0.4), int(n * 0.55))
    rect(g, int(n * 0.45), int(n * 0.65), int(n * 0.3), int(n * 0.25))
    disc(g, n * 0.78, n * 0.3, n * 0.1, n * 0.1)
    disc(g, n * 0.78, n * 0.7, n * 0.1, n * 0.1)
    rect(g, int(n * 0.45), int(n * 0.25), int(n * 0.15), int(n * 0.25), 0)
    return g

def scene_truck(n):
    g = blank(n)
    rect(g, int(n * 0.35), int(n * 0.08), int(n * 0.35), int(n * 0.45))
    rect(g, int(n * 0.48), int(n * 0.5), int(n * 0.22), int(n * 0.4))
    disc(g, n * 0.78, n * 0.25, n * 0.1, n * 0.1)
    disc(g, n * 0.78, n * 0.72, n * 0.1, n * 0.1)
    return g

def scene_bus(n):
    g = blank(n)
    rect(g, int(n * 0.28), 1, int(n * 0.48), n - 2)
    for x in (0.2, 0.4, 0.6):
        rect(g, int(n * 0.38), int(n * x), int(n * 0.18), int(n * 0.12), 0)
    disc(g, n * 0.78, n * 0.25, n * 0.08, n * 0.08)
    disc(g, n * 0.78, n * 0.75, n * 0.08, n * 0.08)
    return g

def scene_bike(n):
    g = blank(n)
    disc(g, n * 0.65, n * 0.25, n * 0.18, n * 0.18)
    disc(g, n * 0.65, n * 0.25, n * 0.08, n * 0.08, 0)
    disc(g, n * 0.65, n * 0.75, n * 0.18, n * 0.18)
    disc(g, n * 0.65, n * 0.75, n * 0.08, n * 0.08, 0)
    rect(g, int(n * 0.4), int(n * 0.3), max(1, n // 12), int(n * 0.4))
    rect(g, int(n * 0.28), int(n * 0.55), int(n * 0.2), max(1, n // 12))
    return g

def scene_helicopter(n):
    g = blank(n)
    disc(g, n * 0.55, n * 0.45, n * 0.2, n * 0.32)
    rect(g, int(n * 0.22), int(n * 0.1), max(2, n // 8), int(n * 0.8))
    rect(g, int(n * 0.35), int(n * 0.75), int(n * 0.2), max(2, n // 8))
    return g

def scene_rocket2(n):
    return scene_rocket(n)

def scene_alien(n):
    g = blank(n)
    disc(g, n * 0.45, (n - 1) / 2, n * 0.28, n * 0.36)
    rect(g, int(n * 0.35), int(n * 0.3), max(1, n // 8), max(1, n // 8), 0)
    rect(g, int(n * 0.35), int(n * 0.58), max(1, n // 8), max(1, n // 8), 0)
    rect(g, int(n * 0.7), int(n * 0.3), int(n * 0.2), max(1, n // 10))
    rect(g, int(n * 0.7), int(n * 0.6), int(n * 0.2), max(1, n // 10))
    return g

def scene_skull(n):
    g = blank(n)
    disc(g, n * 0.4, (n - 1) / 2, n * 0.32, n * 0.32)
    rect(g, int(n * 0.6), int(n * 0.3), int(n * 0.28), int(n * 0.4))
    rect(g, int(n * 0.38), int(n * 0.3), max(2, n // 8), max(2, n // 8), 0)
    rect(g, int(n * 0.38), int(n * 0.55), max(2, n // 8), max(2, n // 8), 0)
    return g

def scene_horn(n):
    g = blank(n)
    # french horn-ish blob
    disc(g, n * 0.55, n * 0.4, n * 0.3, n * 0.3)
    disc(g, n * 0.55, n * 0.4, n * 0.14, n * 0.14, 0)
    rect(g, int(n * 0.3), int(n * 0.6), max(2, n // 6), int(n * 0.3))
    return g

def scene_drum(n):
    g = blank(n)
    disc(g, n * 0.35, (n - 1) / 2, n * 0.12, n * 0.36)
    rect(g, int(n * 0.35), int(n * 0.14), int(n * 0.35), int(n * 0.72))
    disc(g, n * 0.7, (n - 1) / 2, n * 0.12, n * 0.36)
    return g

def scene_guitar(n):
    g = blank(n)
    disc(g, n * 0.68, n * 0.55, n * 0.22, n * 0.2)
    disc(g, n * 0.68, n * 0.55, n * 0.08, n * 0.08, 0)
    rect(g, int(n * 0.1), n // 2 - max(1, n // 16), int(n * 0.5), max(1, n // 8))
    return g

def scene_bell2(n):
    return scene_bell(n)

def scene_present(n):
    return scene_gift(n)

def scene_house2(n):
    return scene_house(n)

def scene_cabin(n):
    g = scene_house(n)
    # chimney
    rect(g, int(n * 0.12), int(n * 0.7), int(n * 0.25), max(2, n // 8))
    return g

def scene_silo(n):
    g = blank(n)
    disc(g, n * 0.25, (n - 1) / 2, n * 0.18, n * 0.22)
    rect(g, int(n * 0.25), int(n * 0.28), int(n * 0.65), int(n * 0.44))
    return g

def scene_tractor(n):
    g = blank(n)
    rect(g, int(n * 0.4), int(n * 0.35), int(n * 0.28), int(n * 0.4))
    disc(g, n * 0.72, n * 0.28, n * 0.16, n * 0.16)
    disc(g, n * 0.7, n * 0.72, n * 0.12, n * 0.12)
    rect(g, int(n * 0.55), int(n * 0.15), max(2, n // 8), int(n * 0.3))
    return g

def scene_boot2(n):
    return scene_boot(n)

def scene_cap(n):
    g = blank(n)
    disc(g, n * 0.45, (n - 1) / 2, n * 0.28, n * 0.36)
    rect(g, int(n * 0.45), 0, n, n, 0)
    rect(g, int(n * 0.4), int(n * 0.1), max(2, n // 7), int(n * 0.8))
    return g

def scene_glasses(n):
    g = blank(n)
    frame(g, int(n * 0.3), int(n * 0.05), int(n * 0.4), int(n * 0.38), max(1, n // 12))
    frame(g, int(n * 0.3), int(n * 0.57), int(n * 0.4), int(n * 0.38), max(1, n // 12))
    rect(g, int(n * 0.42), int(n * 0.4), max(1, n // 10), int(n * 0.2))
    return g

def scene_mustache(n):
    g = blank(n)
    disc(g, n * 0.45, n * 0.3, n * 0.18, n * 0.22)
    disc(g, n * 0.45, n * 0.7, n * 0.18, n * 0.22)
    rect(g, 0, 0, int(n * 0.4), n, 0)
    return g

def scene_lips(n):
    g = blank(n)
    disc(g, n * 0.4, (n - 1) / 2, n * 0.2, n * 0.4)
    disc(g, n * 0.6, (n - 1) / 2, n * 0.2, n * 0.4)
    return g

def scene_tooth(n):
    g = blank(n)
    rect(g, int(n * 0.2), int(n * 0.3), int(n * 0.65), int(n * 0.4))
    disc(g, n * 0.25, (n - 1) / 2, n * 0.16, n * 0.2)
    return g

def scene_feather(n):
    g = blank(n)
    for r in range(n):
        for c in range(n):
            x = c - n * 0.5
            y = r - n * 0.15
            if abs(x) <= (n - r) * 0.35 and r > n * 0.1:
                g[r][c] = 1
    for r in range(int(n * 0.2), n - 1):
        put(g, r, n // 2, 0)
    return g

def scene_wing(n):
    g = blank(n)
    tri(g, n // 2, 1, 1, n - 3)
    tri(g, n // 2, 1, n - 2, int(n * 0.45))
    return g

def scene_shell2(n):
    g = blank(n)
    disc(g, n * 0.6, (n - 1) / 2, n * 0.4, n * 0.4)
    rect(g, int(n * 0.6), 0, n, n, 0)
    for i in range(1, 4):
        rect(g, int(n * 0.15 + i * n * 0.12), n // 2 - max(1, n // 16), 1, int(n * 0.35), 0)
    return g

def scene_starfish(n):
    g = blank(n)
    mid = n // 2
    w = max(1, n // 7)
    rect(g, 0, mid - w // 2, n, w)
    rect(g, mid - w // 2, 0, w, n)
    # diagonals roughly
    for i in range(n):
        for dw in range(-(w // 2), w // 2 + 1):
            put(g, i, min(n - 1, max(0, i + dw)))
            put(g, i, min(n - 1, max(0, n - 1 - i + dw)))
    return g

def scene_clover(n):
    g = blank(n)
    rad = n * 0.16
    for dy, dx in ((0.32, 0.35), (0.32, 0.65), (0.55, 0.35), (0.55, 0.65)):
        disc(g, n * dy, n * dx, rad, rad)
    rect(g, int(n * 0.6), n // 2, int(n * 0.35), max(1, n // 10))
    return g

def scene_sprout(n):
    g = blank(n)
    disc(g, n * 0.35, n * 0.35, n * 0.16, n * 0.14)
    disc(g, n * 0.35, n * 0.65, n * 0.16, n * 0.14)
    rect(g, int(n * 0.4), n // 2, int(n * 0.5), max(1, n // 10))
    return g

def scene_pot(n):
    g = blank(n)
    tri(g, int(n * 0.35), n // 2, n - 2, int(n * 0.35))
    # wider at top — rebuild trapezoid
    g = blank(n)
    top = int(n * 0.4)
    rows = n - 2 - top
    for i in range(rows):
        inset = int(i * 0.25)
        rect(g, top + i, 1 + inset, 1, n - 2 - 2 * inset)
    disc(g, n * 0.28, n * 0.4, n * 0.12, n * 0.1)
    disc(g, n * 0.26, n * 0.6, n * 0.1, n * 0.08)
    rect(g, int(n * 0.35), n // 2, int(n * 0.15), 1)
    return g

SCENES = [
    ("Sun", scene_sun), ("Moon", scene_moon), ("Heart", scene_heart), ("House", scene_house),
    ("Tree", scene_tree), ("Pine", scene_pine), ("Arrow", scene_arrow), ("Fish", scene_fish),
    ("Boat", scene_boat), ("Car", scene_car), ("Cup", scene_cup), ("Cake", scene_cake),
    ("Mushroom", scene_mushroom), ("Flower", scene_flower), ("Leaf", scene_leaf), ("Cactus", scene_cactus),
    ("Star", scene_star), ("Cross", scene_cross), ("Cat", scene_cat), ("Bird", scene_bird),
    ("Duck", scene_duck), ("Butterfly", scene_butterfly), ("Turtle", scene_turtle), ("Whale", scene_whale),
    ("Ghost", scene_ghost), ("Robot", scene_robot), ("Phone", scene_phone), ("Book", scene_book),
    ("Gift", scene_gift), ("Balloon", scene_balloon), ("Cloud", scene_cloud), ("Mountain", scene_mountain),
    ("Tent", scene_tent), ("Umbrella", scene_umbrella), ("Key", scene_key), ("Bell", scene_bell),
    ("Crown", scene_crown), ("Hat", scene_hat), ("Boot", scene_boot), ("Paw", scene_paw),
    ("Bone", scene_bone), ("Egg", scene_egg), ("Apple", scene_apple), ("Cherry", scene_cherry),
    ("Ice", scene_ice), ("Candy", scene_candy), ("Donut", scene_donut), ("Slice", scene_slice),
    ("Cheese", scene_cheese), ("Mug", scene_mug), ("Bowl", scene_bowl), ("Flag", scene_flag),
    ("Anchor", scene_anchor), ("Plane", scene_plane), ("Note", scene_note), ("Drop", scene_drop),
    ("Bolt", scene_bolt), ("Smile", scene_smile), ("Eye", scene_eye), ("Window", scene_window),
    ("Door", scene_door), ("Stairs", scene_stairs), ("Bridge", scene_bridge), ("Igloo", scene_igloo),
    ("Barn", scene_barn), ("Church", scene_church), ("Castle", scene_castle), ("Rocket", scene_rocket),
    ("Ufo", scene_ufo), ("Crab", scene_crab), ("Frog", scene_frog), ("Owl", scene_owl),
    ("Fox", scene_fox), ("Bear", scene_bear), ("Mouse", scene_mouse), ("Swan", scene_swan),
    ("Snail", scene_snail), ("Bee", scene_bee), ("Ladybug", scene_ladybug), ("Spider", scene_spider),
    ("Bat", scene_bat), ("Palm", scene_palm), ("Tulip", scene_tulip), ("Pear", scene_pear),
    ("Grapes", scene_grapes), ("Pepper", scene_pepper), ("Carrot", scene_carrot), ("Corn", scene_corn),
    ("Chili", scene_chili), ("Lemon", scene_lemon), ("Acorn", scene_acorn), ("Loaf", scene_loaf),
    ("Pretzel", scene_pretzel), ("Cookie", scene_cookie), ("Eggcup", scene_eggcup), ("Teapot", scene_teapot),
    ("Pan", scene_pan), ("Spoon", scene_spoon), ("Fork", scene_fork), ("Knife", scene_knife),
    ("Axe", scene_axe), ("Hammer", scene_hammer), ("Saw", scene_saw), ("Bulb", scene_bulb),
    ("Candle", scene_candle), ("Lamp", scene_lamp), ("Couch", scene_couch), ("Chair", scene_chair),
    ("Table", scene_table), ("Bed", scene_bed), ("Clock", scene_clock), ("Camera", scene_camera),
    ("Letter", scene_letter), ("Lock", scene_lock), ("Safe", scene_safe), ("Chest", scene_chest),
    ("Map", scene_map), ("Compass", scene_compass), ("Medal", scene_medal), ("Shield", scene_shield),
    ("Gemstone", scene_gemstone), ("Ring", scene_ring), ("Poodle", scene_balloon_dog), ("Snowman", scene_snowman),
    ("Mitten", scene_mitten), ("Scarf", scene_scarf), ("Glove", scene_glove), ("Sock", scene_sock),
    ("Shirt", scene_shirt), ("Dress", scene_dress), ("Bow", scene_bow), ("Tie", scene_tie),
    ("Bag", scene_bag), ("Purse", scene_purse), ("Tag", scene_tag), ("Pin", scene_pin),
    ("Button", scene_button), ("Spool", scene_spool), ("Pencil", scene_pencil), ("Ruler", scene_ruler),
    ("Magnet", scene_magnet), ("Plug", scene_plug), ("Battery", scene_battery), ("Floppy", scene_floppy),
    ("Gamepad", scene_gamepad), ("Dice", scene_dice), ("Pawn", scene_pawn), ("Knight", scene_knight),
    ("Cupcake", scene_cupcake), ("Lollipop", scene_lollipop), ("Popsicle", scene_popsicle),
    ("Melon", scene_watermelon), ("Pineapple", scene_pineapple), ("Berry", scene_strawberry),
    ("Log", scene_log), ("Bucket", scene_bucket), ("Well", scene_well), ("Fence", scene_fence),
    ("Windmill", scene_windmill), ("Lighthouse", scene_lighthouse), ("Sub", scene_sub),
    ("Train", scene_train), ("Truck", scene_truck), ("Bus", scene_bus), ("Bike", scene_bike),
    ("Copter", scene_helicopter), ("Alien", scene_alien), ("Skull", scene_skull), ("Horn", scene_horn),
    ("Drum", scene_drum), ("Guitar", scene_guitar), ("Cabin", scene_cabin), ("Silo", scene_silo),
    ("Tractor", scene_tractor), ("Cap", scene_cap), ("Glasses", scene_glasses), ("Mustache", scene_mustache),
    ("Lips", scene_lips), ("Tooth", scene_tooth), ("Feather", scene_feather), ("Wing", scene_wing),
    ("Shell", scene_shell2), ("Starfish", scene_starfish), ("Clover", scene_clover), ("Sprout", scene_sprout),
    ("Pot", scene_pot),
]


def rows_of(cells, n):
    return ["".join(str(cells[r * n + c]) for c in range(n)) for r in range(n)]


def consider(bucket, seen, name, cells, n, source):
    filled = sum(cells)
    if filled < n * n * 0.12 or filled > n * n * 0.78:
        return False
    if len(set(cells)) < 2:
        return False
    key = (n, tuple(cells))
    if key in seen:
        return False
    if line_solve(cells, n) is None:
        return False
    seen.add(key)
    bucket.append({"name": name, "size": n, "rows": rows_of(cells, n)})
    return True


def main():
    pics = []
    seen = set()
    names_at = {5: set(), 10: set(), 15: set()}

    # Authored 5×5, plus block-scaled copies when the larger grid still solves.
    for name, art in FIVES.items():
        cells = from_five(art)
        if consider(pics, seen, name, cells, 5, "five"):
            names_at[5].add(name)
            for k, size in ((2, 10), (3, 15)):
                big = upscale(cells, 5, k)
                if name not in names_at[size] and consider(pics, seen, name, big, size, "scale"):
                    names_at[size].add(name)

    # Original drawings at 10 and 15 (5×5 scenes too, under the same name only if new).
    for size in (10, 15):
        for name, fn in SCENES:
            if name in names_at[size]:
                continue
            try:
                g = fn(size)
            except Exception:
                continue
            if not g or len(g) != size:
                continue
            cells = cells_of(g)
            if len(cells) != size * size:
                continue
            if consider(pics, seen, name, cells, size, "scene"):
                names_at[size].add(name)

    pics.sort(key=lambda p: (p["size"], p["name"]))
    counts = {5: 0, 10: 0, 15: 0}
    for p in pics:
        counts[p["size"]] += 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pics, separators=(",", ":")) + "\n")
    print(f"wrote {len(pics)} pictures -> {OUT}")
    print("counts", counts)
    if len(pics) < 120 or min(counts.values()) < 24:
        raise SystemExit(f"not enough pictures: {counts}")


if __name__ == "__main__":
    main()
