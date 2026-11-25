#!/usr/bin/env python3
"""Build data/contexto/ (Contexto's word list and meaning vectors).

One-time source download into tools/.sources/ (never bundled or served):

    python3 tools/fetch_glove.py      # ~52 MB slice of GloVe 6B 100d, resumable

(or the whole ~820 MB tools/.sources/glove.6B.zip, which this script also reads).
Then, after tools/build_words.py:

    python3 tools/build_contexto.py

Outputs
  data/contexto/words.json   {"version", "dims", "words": [...], "secrets": [...]}
  data/contexto/vectors.bin  len(words) × dims signed bytes, row i = words[i]

Vocabulary: common words (data/words/common.json) that are playable (ENABLE),
not plain inflections (plurals, past tenses), and present in GloVe 6B 100d.
Each vector is scaled so its largest component is ±127; cosine similarity
ignores that per-word scale, so the game just divides by the stored norms.

Secrets: familiar words used mostly as nouns in WordNet, so puzzles feel fair.
"""
import json
import re
import sys
import zipfile
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_words import is_inflection  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "tools" / ".sources"
OUT = ROOT / "data" / "contexto"
GLOVE_TOP = SOURCES / "glove.6B.100d.top.txt"
GLOVE_ZIP = SOURCES / "glove.6B.zip"
GLOVE_FILE = "glove.6B.100d.txt"
DIMS = 100
RANK_MAX = 30000
SECRET_RANK_MAX = 6000

# Never secret words: crude, upsetting, or too vague to be fun.
SECRET_BLOCK = {
    "abuse", "anus", "bitch", "blood", "bomb", "breast", "butt", "cancer", "corpse", "crap", "damn",
    "death", "dick", "drug", "drugs", "fuck", "gun", "hell", "kill", "murder", "nazi", "penis",
    "porn", "rape", "sex", "shit", "slave", "suicide", "terror", "torture", "vagina", "war", "whore",
    "thing", "stuff", "way", "lot", "kind", "sort", "bit", "part", "case", "point", "fact", "deal",
    "matter", "sense", "side", "end", "place", "time", "day", "year", "people", "guy", "man", "woman",
    # Function words and filler that WordNet also lists as nouns.
    "will", "must", "might", "being", "nothing", "something", "anything", "everything", "someone",
    "anyone", "everyone", "hello", "today", "tonight", "course", "left", "right", "haven", "okay",
    "three", "four", "five", "seven", "eight", "nine", "hundred", "thousand", "million", "zero",
    "else", "even", "back", "well", "still", "just", "maybe", "sorry", "please", "thanks", "yeah",
}


def wordnet_senses():
    """{word: (noun senses, other senses)} from WordNet index files."""
    senses = {}
    for pos in ("noun", "verb", "adj", "adv"):
        for line in (SOURCES / "wn" / "dict" / f"index.{pos}").read_text(errors="ignore").splitlines():
            if line.startswith(" "):
                continue
            parts = line.split()
            word, count = parts[0], int(parts[2])
            if "_" in word:
                continue
            noun, other = senses.get(word, (0, 0))
            senses[word] = (noun + count, other) if pos == "noun" else (noun, other + count)
    return senses


def main():
    if not GLOVE_TOP.exists() and not GLOVE_ZIP.exists():
        sys.exit("Missing GloVe vectors. Run python3 tools/fetch_glove.py first.")
    common = json.loads((ROOT / "data" / "words" / "common.json").read_text())
    enable = set((ROOT / "data" / "words" / "dictionary.txt").read_text().split())

    wanted = {
        w for w, rank in common.items()
        if rank <= RANK_MAX and re.fullmatch(r"[a-z]{3,}", w) and w in enable and not is_inflection(w, enable)
    }
    vectors = {}
    with (GLOVE_TOP.open("rb") if GLOVE_TOP.exists() else zipfile.ZipFile(GLOVE_ZIP).open(GLOVE_FILE)) as f:
        for raw in f:
            line = raw.decode("utf-8", "ignore").rstrip().split(" ")
            if line[0] in wanted and len(line) == DIMS + 1:
                vectors[line[0]] = [float(x) for x in line[1:]]

    words = sorted(vectors, key=lambda w: (common[w], w))
    data = array("b")
    for w in words:
        v = vectors[w]
        peak = max(abs(x) for x in v) or 1.0
        data.extend(max(-127, min(127, round(x / peak * 127))) for x in v)

    senses = wordnet_senses()
    secrets = [
        w for w in words
        if common[w] <= SECRET_RANK_MAX and 4 <= len(w) <= 10 and w not in SECRET_BLOCK
        and not w.endswith(("ing", "ed"))
        and senses.get(w, (0, 0))[0] >= max(2, senses.get(w, (0, 0))[1])
    ]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "vectors.bin").write_bytes(data.tobytes())
    (OUT / "words.json").write_text(json.dumps(
        {"version": 1, "dims": DIMS, "words": words, "secrets": secrets}, separators=(",", ":")))
    size = (OUT / "vectors.bin").stat().st_size + (OUT / "words.json").stat().st_size
    print(f"Wrote data/contexto/: {len(words)} words, {len(secrets)} secrets, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
