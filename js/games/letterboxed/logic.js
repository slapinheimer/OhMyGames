// Pure Letter Boxed logic (no DOM): board generation, move validation, solving.
import { shuffle } from "../../core/rng.js";

const A = 97;
const bit = (c) => 1 << (c.charCodeAt(0) - A);
export function letterMask(word) {
  let m = 0;
  for (const c of word) m |= bit(c);
  return m;
}
export function popcount(m) {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}

/** Words that could ever appear on a board: a-z, no doubled letters, ≤12 distinct. */
function boardable(w) {
  if (!/^[a-z]+$/.test(w)) return false;
  for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) return false;
  return true;
}

/**
 * Candidate seed words from common.json (Map word->rank), checked against
 * the dictionary Set when provided. Sorted by rank for determinism.
 */
export function candidateWords(common, dict, { maxRank = 15000, minLen = 4, maxLen = 10 } = {}) {
  const out = [];
  for (const [w, rank] of common) {
    if (rank > maxRank || w.length < minLen || w.length > maxLen) continue;
    if (!boardable(w) || (dict && !dict.has(w))) continue;
    const mask = letterMask(w);
    const n = popcount(mask);
    if (n < 3 || n > 11) continue;
    out.push({ w, rank, mask, n });
  }
  out.sort((a, b) => a.rank - b.rank || (a.w < b.w ? -1 : 1));
  return out;
}

/**
 * Split 12 letters into 4 sides of 3 so no consecutive letters in any of
 * `words` share a side. Returns [[c,c,c] x4] or null. Letter order is
 * randomised by rng so different puzzles get different layouts.
 */
export function partitionSides(letters, words, rng) {
  const idx = {};
  letters.forEach((c, i) => (idx[c] = i));
  const adj = letters.map(() => 0);
  for (const w of words) {
    for (let i = 1; i < w.length; i++) {
      const a = idx[w[i - 1]], b = idx[w[i]];
      adj[a] |= 1 << b;
      adj[b] |= 1 << a;
    }
  }
  // Most-constrained letters first, ties broken by rng.
  const order = shuffle(letters.map((_, i) => i), rng).sort((a, b) => popcount(adj[b]) - popcount(adj[a]));
  const side = Array(12).fill(-1);
  const count = [0, 0, 0, 0];
  const sideMask = [0, 0, 0, 0];
  const go = (k) => {
    if (k === 12) return true;
    const v = order[k];
    let usedEmpty = false;
    for (let s = 0; s < 4; s++) {
      if (count[s] === 3 || (sideMask[s] & adj[v])) continue;
      if (count[s] === 0) { if (usedEmpty) continue; usedEmpty = true; } // symmetry
      side[v] = s; count[s]++; sideMask[s] |= 1 << v;
      if (go(k + 1)) return true;
      side[v] = -1; count[s]--; sideMask[s] &= ~(1 << v);
    }
    return false;
  };
  if (!go(0)) return null;
  const sides = [[], [], [], []];
  for (let i = 0; i < 12; i++) sides[side[i]].push(letters[i]);
  return shuffle(sides, rng).map((s) => shuffle(s, rng));
}

/** sides -> { letter: sideIndex } */
export const sideMap = (sides) => {
  const m = {};
  sides.forEach((s, i) => s.forEach((c) => (m[c] = i)));
  return m;
};

/** Can `word` be played on this board (letters present, no same-side neighbours)? */
export function playable(word, sm) {
  for (let i = 0; i < word.length; i++) {
    if (sm[word[i]] === undefined) return false;
    if (i && sm[word[i]] === sm[word[i - 1]]) return false;
  }
  return true;
}

/**
 * Generate a board deterministically from rng.
 * Returns { sides, solution: [w1, w2], par } or null if the time box ran out.
 */
export function generateBoard(rng, cands, { maxTries = 4000 } = {}) {
  const byFirst = {};
  for (const c of cands) (byFirst[c.w[0]] ||= []).push(c);
  for (let t = 0; t < maxTries; t++) {
    const a = cands[Math.floor(rng() * cands.length)];
    if (a.n < 5) continue;
    const list = byFirst[a.w[a.w.length - 1]];
    if (!list) continue;
    const matches = [];
    for (const b of list) {
      if (b.w === a.w || b.n < 4) continue;
      if (popcount(a.mask | b.mask) === 12) matches.push(b);
    }
    if (!matches.length) continue;
    // try a few partners in random order
    for (const b of shuffle(matches, rng).slice(0, 6)) {
      const letters = [];
      for (let i = 0; i < 26; i++) if ((a.mask | b.mask) & (1 << i)) letters.push(String.fromCharCode(A + i));
      const sides = partitionSides(letters, [a.w, b.w], rng);
      if (sides) return { sides, solution: [a.w, b.w] };
    }
  }
  return null;
}

/** All dictionary words (≥3 letters) playable on the board. */
export function playableWords(dictIter, sides) {
  const sm = sideMap(sides);
  const out = [];
  for (const w of dictIter) if (w.length >= 3 && playable(w, sm)) out.push(w);
  return out;
}

/** Par: harder boards (fewer common playable words) get a looser target. */
export function computePar(commonPlayableCount) {
  if (commonPlayableCount >= 750) return 4;
  if (commonPlayableCount >= 260) return 5;
  return 6;
}

/** Validate an attempted word submission. Returns null if OK, else toast text. */
export function validateWord(word, sm, dict) {
  if (word.length < 3) return "Too short";
  if (!playable(word, sm)) return "Letters can't be from the same side";
  if (!dict.has(word)) return "Not a word";
  return null;
}

/** Letters used across committed words. */
export function usedLetters(words) {
  const s = new Set();
  for (const w of words) for (const c of w) s.add(c);
  return s;
}

/**
 * Hint word: the playable word (from `pool`, most common first) that adds the most
 * unused letters, starting where the last word ended. Ties go to the shorter word.
 * null when no word adds a letter.
 */
export function hintWord(words, pool) {
  const used = usedLetters(words);
  const start = words.length ? words[words.length - 1].slice(-1) : "";
  let best = null;
  let bestGain = 0;
  for (const w of pool) {
    if ((start && w[0] !== start) || words.includes(w)) continue;
    let gain = 0;
    for (const c of new Set(w)) if (!used.has(c)) gain++;
    if (gain > bestGain || (gain === bestGain && best && w.length < best.length)) {
      best = w;
      bestGain = gain;
    }
  }
  return bestGain > 0 ? best : null;
}

export function shareText(puzzle, words, won, hints = 0) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Letter Boxed ${puzzle.number}` : "Oh My WORDS! Letter Boxed (practice)";
  const tip = hints ? ` 💡${hints}` : "";
  if (!won) return `${head}: not solved 📦${tip}`;
  return `${head}: solved in ${words.length} word${words.length === 1 ? "" : "s"} 📦${tip}`;
}

/** Board for a puzzle, retrying with derived seeds if the time box runs out. */
export function boardFor(seededRandom, puzzleId, cands) {
  for (let k = 0; k < 20; k++) {
    const b = generateBoard(seededRandom("letterboxed", k ? `${puzzleId}#${k}` : puzzleId), cands);
    if (b) return b;
  }
  return null;
}
