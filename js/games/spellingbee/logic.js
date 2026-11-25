// Spelling Bee: make words from seven letters, always using the center one.
// The letters, center, and answer list are a pure function of the puzzle id and our word lists.
import { seededRandom, shuffle } from "../../core/rng.js";

export const MIN_LEN = 4;
export const PANGRAM_BONUS = 7;

/** NYT-style ranks: share of the puzzle's total points needed for each. */
export const RANKS = [
  { name: "Beginner", at: 0 },
  { name: "Good Start", at: 0.02 },
  { name: "Moving Up", at: 0.05 },
  { name: "Good", at: 0.08 },
  { name: "Solid", at: 0.15 },
  { name: "Nice", at: 0.25 },
  { name: "Great", at: 0.4 },
  { name: "Amazing", at: 0.5 },
  { name: "Genius", at: 0.7 },
  { name: "Queen Bee", at: 1 },
];
export const GENIUS = RANKS.findIndex((r) => r.name === "Genius");
export const QUEEN = RANKS.length - 1;

const MIN_ANSWERS = 20;
const MAX_ANSWERS = 60;
const MAX_POINTS = 260;

const maskOf = (w) => {
  let m = 0;
  for (let i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - 97);
  return m;
};
const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

/** Points for one answer. */
export function pointsFor(word, letters) {
  const base = word.length === MIN_LEN ? 1 : word.length;
  return base + (isPangram(word, letters) ? PANGRAM_BONUS : 0);
}

export function isPangram(word, letters) {
  return letters.every((ch) => word.includes(ch));
}

/** Index into RANKS for a score. */
export function rankFor(score, total) {
  let r = 0;
  RANKS.forEach((rank, i) => { if (score >= threshold(i, total)) r = i; });
  return r;
}

export function threshold(i, total) {
  return i === QUEEN ? total : Math.round(RANKS[i].at * total);
}

let poolCache = null;
/** Answer pool from data/words/bee-words.json (built by tools/build_bee.py), with letter masks. */
export function wordPool(list) {
  if (poolCache && poolCache.list === list) return poolCache;
  const words = list.map((word) => ({ word, mask: maskOf(word) }));
  const pangrams = words.filter((w) => bits(w.mask) === 7);
  poolCache = { list, words, pangrams };
  return poolCache;
}

/** { letters: [center, ...six others], center, answers, pangrams, total } for a currentPuzzle() id. */
export function puzzleFor(puzzle, pool) {
  const rng = seededRandom("spellingbee", puzzle.id);
  const seen = new Set();
  for (const p of shuffle(pool.pangrams, rng)) {
    if (seen.has(p.mask)) continue;
    seen.add(p.mask);
    const letters = [...new Set(p.word)];
    const fits = pool.words.filter((w) => (w.mask & ~p.mask) === 0);
    for (const center of shuffle(letters, rng)) {
      const c = 1 << (center.charCodeAt(0) - 97);
      const answers = fits.filter((w) => w.mask & c).map((w) => w.word);
      if (answers.length < MIN_ANSWERS || answers.length > MAX_ANSWERS) continue;
      const total = answers.reduce((sum, w) => sum + pointsFor(w, letters), 0);
      if (total > MAX_POINTS) continue;
      const outer = shuffle(letters.filter((ch) => ch !== center), rng);
      return {
        center,
        outer,
        letters: [center, ...outer],
        answers,
        pangrams: answers.filter((w) => isPangram(w, letters)),
        total,
      };
    }
  }
  throw new Error("Could not build a Spelling Bee");
}

/** Why a guess doesn't count, or null when it is a new answer. */
export function judge(word, built, found, dictionary) {
  if (word.length < MIN_LEN) return "Too short";
  if (![...word].every((ch) => built.letters.includes(ch))) return "Bad letters";
  if (!word.includes(built.center)) return "Missing center letter";
  if (found.includes(word)) return "Already found";
  if (!built.answers.includes(word)) return dictionary.has(word) ? "Not in today's list" : "Not in word list";
  return null;
}

/** Hints grid: counts of answers by first letter and length, plus two-letter starts. */
export function hintGrid(answers) {
  const lengths = [...new Set(answers.map((w) => w.length))].sort((a, b) => a - b);
  const firsts = [...new Set(answers.map((w) => w[0]))].sort();
  const grid = firsts.map((f) => lengths.map((n) => answers.filter((w) => w[0] === f && w.length === n).length));
  const twos = {};
  answers.forEach((w) => { const k = w.slice(0, 2); twos[k] = (twos[k] || 0) + 1; });
  return { lengths, firsts, grid, twos };
}

export function shareText({ puzzle, rank, score, words, pangrams }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Spelling Bee ${puzzle.number}`
    : "Oh My WORDS! Spelling Bee";
  const bar = RANKS.slice(1).map((_, i) => (i + 1 <= rank ? "🟨" : "⬜")).join("");
  return `${head}\n🐝 ${RANKS[rank].name} · ${score} point${score === 1 ? "" : "s"}\n` +
    `${words} word${words === 1 ? "" : "s"}${pangrams ? ` · ${pangrams} pangram${pangrams === 1 ? "" : "s"}` : ""}\n${bar}`;
}
