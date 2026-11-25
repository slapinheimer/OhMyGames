#!/usr/bin/env python3
"""Build the Oh My WORDS! word library from public word sources.

Sources (downloaded into tools/.sources/ if missing):
  - ENABLE word list (public domain)            -> validity of guesses / words
  - FrequencyWords en_50k (OpenSubtitles, MIT)  -> how common a word is
  - Princeton WordNet 3.1                       -> crossword clues & phrases

Outputs (data/words/ and data/crossword/):
  dictionary.txt       every playable word, one per line, lowercase (3+ letters)
  common.json          {"word": rank} for the ~30k most common playable words
  wordle-answers.json  curated 5-letter answer pool
  wordle-valid.json    every acceptable 5-letter guess
  wordle6-answers.json curated 6-letter answer pool (Wordle+1)
  wordle6-valid.json   every acceptable 6-letter guess
  crossword/words.json {"3": [["ACE", score, ["clue", ...]], ...], ...}

Run:  python3 tools/build_words.py
"""
import json
import math
import os
import re
import tarfile
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", ".sources")
OUT_WORDS = os.path.join(ROOT, "data", "words")
OUT_XW = os.path.join(ROOT, "data", "crossword")

URLS = {
    "en_50k.txt": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
    "enable1.txt": "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt",
    "wn.tar.gz": "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz",
}

# Words we never want to show as an answer, clue or grid entry.
BLOCK = set("""
anal anus arse arsehole ass asses asshole bastard bitch bitches blowjob bollocks boner boob boobs
bugger butthole clit cock cocks coon crap cum cunt cunts dago damn dick dicks dildo dyke fag faggot
fags fuck fucked fucker fucking fucks gook homo honky jap jizz kike kkk lesbo milf nazi nazis negro
nigga nigger niggers paki pecker penis piss pissed poof poon porn porno prick pube pubes pussy queer
rape raped rapes rapist retard retards scrotum semen sex sexy shag shit shits shitty skank slut sluts
smut spic spick spunk tit tits titty tranny turd twat vagina wank wanker wetback whore whores wop
negroes orgasm orgy horny hooker hookers boobie boobies booby crotch genital genitals nude nudes
nudity sperm testes testicle erotic coitus incest pedo pedophile molest molested heroin cocaine
""".split())


def fetch_sources():
    os.makedirs(SRC, exist_ok=True)
    for name, url in URLS.items():
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            print("downloading", url)
            urllib.request.urlretrieve(url, path)
    wn_dir = os.path.join(SRC, "wn")
    if not os.path.isdir(wn_dir):
        with tarfile.open(os.path.join(SRC, "wn.tar.gz")) as t:
            t.extractall(wn_dir)


def load_enable():
    with open(os.path.join(SRC, "enable1.txt")) as f:
        return {w.strip() for w in f if w.strip().isalpha()} - BLOCK


def load_freq():
    rank = {}
    with open(os.path.join(SRC, "en_50k.txt"), encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            w = line.split(" ")[0].strip().lower()
            if w.isalpha() and w.isascii() and w not in rank:
                rank[w] = i
    return rank


def is_inflection(w, enable):
    """Plural / past tense / comparative forms whose base word also exists."""
    if w.endswith("ies") and (w[:-3] + "y") in enable:
        return True
    if w.endswith("es") and w[:-2] in enable and w[-3] in "sxzh":
        return True
    if w.endswith("s") and not w.endswith("ss") and w[:-1] in enable:
        return True
    if w.endswith("ed") and (w[:-2] in enable or w[:-1] in enable or (w[:-3] in enable and w[-3] == w[-4])):
        return True
    if w.endswith("ied") and (w[:-3] + "y") in enable:
        return True
    return False


# ---------------------------------------------------------------- WordNet

def wn_path(name):
    return os.path.join(SRC, "wn", "dict", name)


def load_sense_counts():
    """lemma -> total tagged-sense count, (lemma, synset offset+pos) -> count."""
    lemma_total = defaultdict(int)
    sense_cnt = {}
    pos_map = {"1": "n", "2": "v", "3": "a", "4": "r", "5": "a"}
    with open(wn_path("index.sense")) as f:
        for line in f:
            key, offset, _sn, cnt = line.split()
            lemma, rest = key.split("%", 1)
            pos = pos_map[rest[0]]
            c = int(cnt)
            lemma_total[lemma] += c
            sense_cnt[(lemma, offset + pos)] = c
    return lemma_total, sense_cnt


def load_synsets():
    """offset+pos -> (list of lemmas, gloss)."""
    synsets = {}
    for pos, fname in (("n", "data.noun"), ("v", "data.verb"), ("a", "data.adj"), ("r", "data.adv")):
        with open(wn_path(fname), encoding="latin-1") as f:
            for line in f:
                if line.startswith("  "):
                    continue
                head, _, gloss = line.partition(" | ")
                parts = head.split()
                offset = parts[0]
                n = int(parts[3], 16)
                lemmas = []
                for i in range(n):
                    lemma = parts[4 + i * 2]
                    lemma = re.sub(r"\(.*\)$", "", lemma)  # adj markers like (a)
                    lemmas.append(lemma)
                synsets[offset + pos] = (lemmas, gloss.strip())
    return synsets


def wordnet_lemmas():
    out = set()
    for fname in ("index.noun", "index.verb", "index.adj", "index.adv"):
        with open(wn_path(fname), encoding="latin-1") as f:
            for line in f:
                if not line.startswith(" "):
                    out.add(line.split(" ", 1)[0])
    return out


def clean_gloss(gloss):
    g = gloss.split(";")[0]
    g = re.sub(r'"[^"]*"', "", g)
    g = re.sub(r"^\([^)]*\)\s*", "", g).strip(" ,;:")
    return g


def mentions(answer, clue):
    """True if the clue gives the answer away."""
    a = answer.lower()
    stem = a[: max(3, len(a) - 2)] if len(a) > 4 else a
    for tok in re.findall(r"[a-z]+", clue.lower()):
        if tok == a or (len(tok) >= 3 and (tok.startswith(stem) or a.startswith(tok) and len(tok) >= len(a) - 1)):
            return True
    compact = re.sub(r"[^a-z]", "", clue.lower())
    return a in compact and len(a) >= 4


def cap(s):
    return s[:1].upper() + s[1:]


def pluralize(word):
    if re.search(r"[^aeiou]y$", word):
        return word[:-1] + "ies"
    if re.search(r"(s|x|z|ch|sh)$", word):
        return word + "es"
    return word + "s"


def build_crossword(enable, rank):
    lemma_total, sense_cnt = load_sense_counts()
    synsets = load_synsets()

    # lemma -> list of (count, synset id)
    lemma_senses = defaultdict(list)
    for sid, (lemmas, _g) in synsets.items():
        for lem in lemmas:
            l = lem.lower()
            lemma_senses[lem].append((sense_cnt.get((l, sid), 0), sid))

    entries = {}

    def add(answer, score, clues):
        if answer in entries:
            old_score, old_clues = entries[answer]
            for c in clues:
                if c not in old_clues:
                    old_clues.append(c)
            entries[answer] = (max(old_score, score), old_clues[:4])
        else:
            entries[answer] = (score, clues[:4])

    noun_syn_clues = {}

    for lemma, senses in lemma_senses.items():
        if lemma != lemma.lower() or not re.fullmatch(r"[a-z]+(_[a-z]+){0,2}", lemma):
            continue
        parts = lemma.split("_")
        answer = "".join(parts).upper()
        if not 3 <= len(answer) <= 15:
            continue
        if any(p in BLOCK for p in parts):
            continue
        if len(parts) == 1:
            w = parts[0]
            if w not in enable:
                continue
            if w in rank:
                score = max(10, int(100 - 70 * math.log(rank[w]) / math.log(50000)))
            elif lemma_total.get(lemma, 0) >= 1 or len(w) <= 5:
                score = 12  # real but uncommon word: usable fill, low priority
            else:
                continue
        else:
            if lemma_total.get(lemma, 0) < 1:
                continue
            if any(rank.get(p, 99999) > 20000 for p in parts):
                continue
            score = min(80, 40 + 8 * lemma_total[lemma])

        senses.sort(key=lambda s: -s[0])
        clues = []
        for cnt, sid in senses[:3]:
            lemmas, gloss = synsets[sid]
            syns = [s.replace("_", " ") for s in lemmas if s.lower() != lemma and s == s.lower()]
            syns = [s for s in syns if not mentions(answer, s) and 3 <= len(s) <= 24]
            syns.sort(key=len)
            if syns:
                clues.append(cap(syns[0]))
                if sid.endswith("n") and len(parts) == 1 and " " not in syns[0]:
                    noun_syn_clues.setdefault(lemma, cap(pluralize(syns[0])))
            g = clean_gloss(gloss)
            if 6 <= len(g) <= 80 and not mentions(answer, g):
                clues.append(cap(g))
            if len(clues) >= 4:
                break
        # de-dupe, keep order
        seen, uniq = set(), []
        for c in clues:
            if c.lower() not in seen:
                seen.add(c.lower())
                uniq.append(c)
        if uniq:
            add(answer, score, uniq)

    # Plurals of nouns, clued with a pluralized synonym (crucial for grid fill).
    for base, clue in noun_syn_clues.items():
        pl = pluralize(base)
        if pl in enable and 3 <= len(pl) <= 15 and not mentions(pl.upper(), clue):
            base_score = entries.get(base.upper(), (30, []))[0]
            if pl.upper() not in entries:
                add(pl.upper(), max(10, base_score - 10), [clue])

    by_len = defaultdict(list)
    for answer, (score, clues) in entries.items():
        by_len[len(answer)].append([answer, score, clues])
    for L in by_len:
        by_len[L].sort(key=lambda e: (-e[1], e[0]))
    return {str(k): by_len[k] for k in sorted(by_len)}


def wordle_lists(enable, rank, wn_lemmas, length):
    """Acceptable guesses and the curated answer pool for one word length.

    Same bar as classic Wordle: common enough to be fair, not an obvious
    plural or past tense, and a real WordNet lemma unless it is very common.
    """
    valid = sorted(w for w in enable if len(w) == length and w.isascii())
    answers = sorted(
        w for w in valid
        if rank.get(w, 10**9) <= 32000 and not is_inflection(w, enable)
        and (w in wn_lemmas or rank[w] <= 6000)
    )
    return valid, answers


def write_wordle_lists(enable, rank, wn_lemmas):
    written = {}
    for length, valid_name, answer_name in (
        (5, "wordle-valid.json", "wordle-answers.json"),
        (6, "wordle6-valid.json", "wordle6-answers.json"),
    ):
        valid, answers = wordle_lists(enable, rank, wn_lemmas, length)
        with open(os.path.join(OUT_WORDS, valid_name), "w") as f:
            json.dump(valid, f, separators=(",", ":"))
        with open(os.path.join(OUT_WORDS, answer_name), "w") as f:
            json.dump(answers, f, separators=(",", ":"))
        written[length] = (len(valid), len(answers))
    return written


def main():
    fetch_sources()
    enable = load_enable()
    rank = load_freq()
    os.makedirs(OUT_WORDS, exist_ok=True)
    os.makedirs(OUT_XW, exist_ok=True)

    dictionary = sorted(w for w in enable if len(w) >= 3)
    with open(os.path.join(OUT_WORDS, "dictionary.txt"), "w") as f:
        f.write("\n".join(dictionary))

    common = {w: r for w, r in rank.items() if w in enable and len(w) >= 3 and r <= 40000}
    with open(os.path.join(OUT_WORDS, "common.json"), "w") as f:
        json.dump(common, f, separators=(",", ":"))

    wn_lemmas = wordnet_lemmas()
    pools = write_wordle_lists(enable, rank, wn_lemmas)

    xw = build_crossword(enable, rank)
    with open(os.path.join(OUT_XW, "words.json"), "w") as f:
        json.dump(xw, f, separators=(",", ":"))

    print("dictionary:", len(dictionary))
    print("common:", len(common))
    for length, (valid_n, answer_n) in pools.items():
        print(f"wordle {length}: valid {valid_n} answers {answer_n}")
    print("crossword entries:", sum(len(v) for v in xw.values()),
          {k: len(v) for k, v in xw.items()})


if __name__ == "__main__":
    main()
