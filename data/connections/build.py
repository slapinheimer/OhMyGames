#!/usr/bin/env python3
"""Compile data/connections/src/level*.txt -> data/connections/categories.json.

Source format (one category per line, '#' comments):
    NAME | WORD, WORD, ...
    NAME | @rule | WORD, WORD, ...

Rules (wordplay categories) let the build find every OTHER library word that
would also satisfy the category; those are stored as "fits" (normalized keys)
so the generator never shows a word that could be argued into this group:
    @suffix:X      word+X is a word         (___X)
    @prefix:X      X+word is a word         (X___)
    @contains:A/B  word contains A or B     (hidden words)
    @startswith:A/B
    @palindrome
    @reverse       reads as a different word backward

Words beyond the 12 shown are kept as explicit-but-unshown members in "more".

Run:  python3 data/connections/build.py      (stdlib only; exits 1 on errors)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MAX_WORDS, MIN_WORDS = 12, 6


def norm(w):
    return re.sub(r"[^A-Z0-9]", "", w.upper())


def load_lexicon():
    words = set()
    with open(os.path.join(ROOT, "data/words/dictionary.txt")) as f:
        words.update(line.strip().upper() for line in f if line.strip())
    try:
        with open(os.path.join(ROOT, "data/crossword/words.json")) as f:
            for entries in json.load(f).values():
                words.update(e[0].upper() for e in entries)
    except OSError:
        pass
    return words


def parse():
    cats, errors = [], []
    for level in range(4):
        path = os.path.join(HERE, "src", f"level{level}.txt")
        with open(path) as f:
            for n, raw in enumerate(f, 1):
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                where = f"level{level}.txt:{n}"
                if len(parts) == 2:
                    name, rule, body = parts[0], None, parts[1]
                elif len(parts) == 3 and parts[1].startswith("@"):
                    name, rule, body = parts[0], parts[1][1:], parts[2]
                else:
                    errors.append(f"{where}: bad line")
                    continue
                words = [w.strip() for w in body.split(",") if w.strip()]
                cats.append({"name": name, "level": level, "rule": rule, "words": words, "where": where})
    return cats, errors


def rule_matcher(rule, lex):
    kind, _, arg = rule.partition(":")
    parts = [norm(a) for a in arg.split("/") if a]
    if kind == "suffix":
        return lambda k: (k + parts[0]) in lex
    if kind == "prefix":
        return lambda k: (parts[0] + k) in lex
    if kind == "contains":
        return lambda k: any(p in k and p != k for p in parts)
    if kind == "startswith":
        return lambda k: any(k.startswith(p) for p in parts)
    if kind == "palindrome":
        return lambda k: len(k) >= 3 and k == k[::-1]
    if kind == "reverse":
        return lambda k: len(k) >= 3 and k[::-1] != k and k[::-1] in lex
    raise ValueError(f"unknown rule {rule}")


def main():
    cats, errors = parse()
    warnings = []
    lex = load_lexicon()
    names = set()
    for c in cats:
        w = c["where"]
        if c["name"] in names:
            errors.append(f"{w}: duplicate category name {c['name']}")
        names.add(c["name"])
        if c["name"] != c["name"].upper():
            errors.append(f"{w}: name not uppercase")
        keys = [norm(x) for x in c["words"]]
        if len(set(keys)) != len(keys):
            dup = sorted({k for k in keys if keys.count(k) > 1})
            errors.append(f"{w}: duplicate words {dup}")
        for x in c["words"]:
            if x != x.upper() or not norm(x):
                errors.append(f"{w}: bad word {x!r}")
        if len(c["words"]) < MIN_WORDS:
            errors.append(f"{w}: only {len(c['words'])} words")

    all_keys = {norm(x) for c in cats for x in c["words"]}
    out = []
    for c in cats:
        own = {norm(x) for x in c["words"]}
        shown, hidden = c["words"][:MAX_WORDS], c["words"][MAX_WORDS:]
        fits = set()
        if c["rule"]:
            match = rule_matcher(c["rule"], lex)
            bad = [x for x in c["words"] if not match(norm(x))]
            if bad and c["rule"].split(":")[0] not in ("prefix", "suffix"):
                warnings.append(f"{c['where']} {c['name']}: own words failing rule: {bad}")
            fits |= {k for k in all_keys - own if match(k)}
        entry = {"name": c["name"], "level": c["level"], "words": shown}
        if hidden:
            entry["more"] = hidden
        if fits:
            entry["fits"] = sorted(fits)
        out.append(entry)

    # ---- conflicts: name-token overlap + hand-written groups (src/conflicts.txt)
    index = {c["name"]: i for i, c in enumerate(out)}
    conflicts = [set() for _ in out]
    STOP = {"OF", "THE", "A", "AN", "AND", "IN", "ON", "TO", "TYPES", "THINGS", "THAT", "YOU", "CAN", "WITH",
            "ARE", "IS", "PARTS", "FAMOUS", "WORDS", "WHO", "FOR", "NEW", "WORD", "ONE", "GET", "GETS", "BE", "TERMS", "TERM"}
    def tokens(name):
        toks = set()
        for t in re.findall(r"[A-Z0-9]+", name.replace("_", " ")):
            if t in STOP:
                continue
            t = t[:-1] if len(t) > 3 and t.endswith("S") and not t.endswith("SS") else t
            if t not in STOP and len(t) > 1:
                toks.add(t)
        return toks
    toks = [tokens(c["name"]) for c in out]
    for i in range(len(out)):
        for j in range(i + 1, len(out)):
            if toks[i] & toks[j]:
                conflicts[i].add(j); conflicts[j].add(i)
    with open(os.path.join(HERE, "src", "conflicts.txt")) as f:
        for n, raw in enumerate(f, 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            ids = []
            for name in (x.strip() for x in line.split(" ~ ")):
                if name not in index:
                    errors.append(f"conflicts.txt:{n}: unknown category {name!r}")
                else:
                    ids.append(index[name])
            for a in ids:
                conflicts[a].update(b for b in ids if b != a)
    for i, e in enumerate(out):
        if conflicts[i]:
            e["x"] = sorted(conflicts[i])

    counts = [sum(1 for c in out if c["level"] == L) for L in range(4)]
    for w in warnings:
        print("warn:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"categories: {len(out)}  per level: {counts}  words: {len(all_keys)} unique")
    if errors:
        sys.exit(1)
    with open(os.path.join(HERE, "categories.json"), "w") as f:
        json.dump({"version": 1, "categories": out}, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote categories.json", os.path.getsize(os.path.join(HERE, "categories.json")), "bytes")


if __name__ == "__main__":
    main()
