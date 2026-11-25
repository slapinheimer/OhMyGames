// Connections puzzle generator — pure logic, no DOM (testable with jsc).
//
// Library format (data/connections/categories.json):
//   { categories: [{ name, level 0-3, words: [...], more?: [...], fits?: [normalized keys], x?: [indices] }] }
// `more` are true members that are never shown; `fits` are other library words
// that would ALSO satisfy a wordplay category; `x` lists categories that must
// never share a puzzle. Membership = words + more + fits (used for ambiguity);
// red herrings only use the explicit lists (words + more).
import { mulberry32, hashString, shuffle } from "../../core/rng.js";

export const LEVELS = 4;

export const normalize = (w) => String(w).toUpperCase().replace(/[^A-Z0-9]/g, "");
const stem = (k) => (k.length > 3 && k.endsWith("S") && !k.endsWith("SS") ? k.slice(0, -1) : k);

/** Index the raw JSON once: membership sets, per-level lists and fixed permutations. */
export function prepareLibrary(data) {
  const cats = data.categories.map((c, i) => {
    const members = new Set(), explicit = new Set();
    const add = (set, k) => { set.add(k); set.add(stem(k)); };
    [...c.words, ...(c.more || [])].forEach((w) => { add(members, normalize(w)); add(explicit, normalize(w)); });
    (c.fits || []).forEach((k) => add(members, k));
    return { name: c.name, level: c.level, words: c.words, index: i, members, explicit, conflicts: new Set(c.x || []) };
  });
  const byLevel = [];
  for (let L = 0; L < LEVELS; L++) byLevel.push(cats.filter((c) => c.level === L));
  // One fixed permutation per level: consecutive daily puzzles walk through it,
  // so a category recurs only after about half the level's size (50+ days).
  const perms = byLevel.map((list, L) =>
    shuffle(list.map((_, i) => i), mulberry32(hashString(`connections:perm:${L}`))));
  return { cats, byLevel, perms };
}

/** Does `word` belong to category `cat` (its full list, wordplay fits, simple plural)? */
export function fits(cat, word, set = cat.members) {
  const k = normalize(word);
  return set.has(k) || set.has(stem(k));
}

const conflict = (a, b) => a === b || a.conflicts.has(b.index) || b.conflicts.has(a.index);

/** Number of ways to split `words` into the given categories, 4 each (1 = uniquely solvable). */
export function countSolutions(words, cats) {
  const options = words.map((w) => cats.map((c, i) => (fits(c, w) ? i : -1)).filter((i) => i >= 0));
  const load = cats.map(() => 0);
  let count = 0;
  const walk = (n) => {
    if (count > 1) return;
    if (n === words.length) { count++; return; }
    for (const i of options[n]) {
      if (load[i] >= 4) continue;
      load[i]++;
      walk(n + 1);
      load[i]--;
    }
  };
  walk(0);
  return count;
}

/** Choose 4 words per category. Returns null when the combination can't work. */
function buildGroups(cats, rng, allowHerring) {
  const unique = cats.map((a) => a.words.filter((w) => cats.every((b) => b === a || !fits(b, w))));
  // Red herring: a word of A that is also explicitly listed in exactly one other
  // chosen category B (and fits no other). It stays uniquely solvable because B
  // is filled by four B-only words.
  let herring = null;
  if (allowHerring) {
    const options = [];
    cats.forEach((a, ai) => a.words.forEach((w) => {
      const others = cats.map((b, bi) => (bi !== ai && fits(b, w) ? bi : -1)).filter((bi) => bi >= 0);
      if (others.length === 1 && fits(cats[others[0]], w, cats[others[0]].explicit) && unique[ai].length >= 3 && unique[others[0]].length >= 4) {
        options.push({ word: w, home: ai, decoy: others[0] });
      }
    }));
    if (options.length) herring = options[Math.floor(rng() * options.length)];
  }
  const groups = [];
  for (let i = 0; i < cats.length; i++) {
    const need = herring && herring.home === i ? 3 : 4;
    if (unique[i].length < need) return null;
    const words = shuffle(unique[i], rng).slice(0, need);
    if (need === 3) words.push(herring.word);
    groups.push({ name: cats[i].name, level: cats[i].level, words });
  }
  const all = groups.flatMap((g) => g.words);
  if (new Set(all.map(normalize)).size !== 16) return null;
  if (countSolutions(all, cats) !== 1) return null;
  return { groups, herring: herring ? herring.word : null };
}

function overlapScore(cats) {
  let score = 0;
  for (let i = 0; i < cats.length; i++) {
    for (let j = 0; j < cats.length; j++) {
      if (i !== j && cats[i].words.some((w) => fits(cats[j], w, cats[j].explicit))) score++;
    }
  }
  return score;
}

/**
 * Build the puzzle for `puzzle` ({ id, number|null }) with `rng` = seededRandom("connections", id).
 * Returns { groups: [{name, level, words[4]}] sorted by level, tiles: [16 shuffled words], herring }.
 */
export function generatePuzzle(lib, puzzle, rng) {
  const slot = puzzle.number ? puzzle.number - 1 : Math.floor(rng() * 1e9);
  const cands = lib.byLevel.map((list, L) => {
    const n = list.length, i = slot % n;
    return [list[lib.perms[L][i]], list[lib.perms[L][(i + Math.floor(n / 2)) % n]]];
  });
  const allowHerring = rng() < 0.8;
  const combos = [];
  for (let mask = 0; mask < 16; mask++) {
    const cats = cands.map((c, L) => c[(mask >> L) & 1]);
    if (cats.some((a, i) => cats.some((b, j) => j > i && conflict(a, b)))) continue;
    const secondaries = [0, 1, 2, 3].filter((L) => (mask >> L) & 1).length;
    const key = (overlapScore(cats) > 0 ? 0 : 10) + secondaries + rng() * 0.9;
    combos.push({ cats, key });
  }
  combos.sort((a, b) => a.key - b.key);
  for (const { cats } of combos) {
    const res = buildGroups(cats, rng, allowHerring) || buildGroups(cats, rng, false);
    if (res) return finish(res, rng);
  }
  // Fallback (rare): random categories per level until something fits.
  for (let tries = 0; tries < 500; tries++) {
    const cats = lib.byLevel.map((list) => list[Math.floor(rng() * list.length)]);
    if (cats.some((a, i) => cats.some((b, j) => j > i && conflict(a, b)))) continue;
    const res = buildGroups(cats, rng, false);
    if (res) return finish(res, rng);
  }
  throw new Error("Connections: could not build a puzzle");
}

function finish(res, rng) {
  const groups = res.groups.slice().sort((a, b) => a.level - b.level);
  const tiles = shuffle(groups.flatMap((g) => g.words), rng);
  return { groups, tiles, herring: res.herring };
}
