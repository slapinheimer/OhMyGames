#!/usr/bin/env python3
"""Build data/words/bee-words.json, the Spelling Bee answer pool.

Run after tools/build_words.py (it reads that script's outputs):

    python3 tools/build_bee.py

A word qualifies when it is common (data/words/common.json), playable
(data/words/dictionary.txt), has four or more letters, no S, and at most seven
different letters, and when it or its base form (-ed / -ing / -er / -est
stripped) has a WordNet definition in data/crossword/words.json. The definition
check keeps out names and interjections that the subtitle frequency list picks up.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "data" / "words"
RANK_MAX = 30000

# Strong swears, slurs, and crude words never count as answers.
BLOCK = {
    "anal", "anus", "arse", "bitch", "boob", "butt", "cock", "coon", "crap", "cunt", "damn", "dick",
    "dildo", "dyke", "fagot", "fart", "fuck", "fucked", "fucker", "fucking", "homo", "horny", "jizz",
    "kike", "nazi", "nigga", "nigger", "orgy", "paki", "penis", "piss", "pissed", "poop", "porn",
    "porno", "prick", "pube", "pussy", "rape", "raped", "rapist", "retard", "scrotum", "semen", "sexy",
    "shit", "slut", "spic", "tits", "titty", "turd", "twat", "vagina", "wank", "whore",
}


def bases(word):
    """Possible base forms of an inflected word, including the word itself."""
    out = {word}
    for suffix in ("ing", "ed", "er", "est"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            stem = word[: -len(suffix)]
            out.update({stem, stem + "e"})
            if len(stem) >= 2 and stem[-1] == stem[-2]:
                out.add(stem[:-1])
            if stem.endswith("i"):
                out.add(stem[:-1] + "y")
    return out


def main():
    common = json.loads((WORDS / "common.json").read_text())
    dictionary = set((WORDS / "dictionary.txt").read_text().split())
    crossword = json.loads((ROOT / "data" / "crossword" / "words.json").read_text())
    defined = {entry[0].lower() for entries in crossword.values() for entry in entries}

    pool = []
    for word, rank in common.items():
        if rank > RANK_MAX or len(word) < 4 or "s" in word or word in BLOCK:
            continue
        if not re.fullmatch(r"[a-z]+", word) or word not in dictionary or len(set(word)) > 7:
            continue
        if not bases(word) & defined:
            continue
        pool.append(word)
    pool.sort()
    out = WORDS / "bee-words.json"
    out.write_text(json.dumps(pool, separators=(",", ":")))
    pangrams = sum(1 for w in pool if len(set(w)) == 7)
    print(f"Wrote {out.relative_to(ROOT)}: {len(pool)} words, {pangrams} pangram candidates")


if __name__ == "__main__":
    main()
