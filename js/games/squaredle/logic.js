// Squaredle: a 4×4 grid. Trace adjacent letters (any direction, no reuse) to spell
// words of 4 or more. Answers are common words the puzzle requires. Bonus words are
// less common and optional. The grid is a pure function of the puzzle id and our lists.
import { pick, randInt, seededRandom, shuffle } from "../../core/rng.js";

export const SIZE = 4;
export const N = 16;
export const MIN_LEN = 4;
export const ANSWER_RANK = 8000;
export const BONUS_RANK = 25000;

const MIN_ANSWERS = 18;
const MAX_ANSWERS = 46;
const MAX_BONUS = 55;
const ATTEMPTS = 100;
const VOWELS = ["a", "e", "i", "o", "u"];

export const NEIGHBORS = Array.from({ length: N }, (_, i) => {
  const r = i >> 2;
  const c = i & 3;
  const ns = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) ns.push((rr << 2) + cc);
    }
  }
  return ns;
});

export function isAdjacent(a, b) {
  return a !== b && NEIGHBORS[a].includes(b);
}

/** Five stars track required answers. The last star arrives with the last answer. */
export function starsFor(found, total) {
  if (total <= 0 || found <= 0) return 0;
  if (found >= total) return 5;
  return Math.floor((found * 5) / total);
}

/** Bonus words already found when the last answer landed. */
export const BONUS_BANDS = ["0", "1–4", "5–9", "10–19", "20+"];

export function bonusBand(n) {
  if (n <= 0) return BONUS_BANDS[0];
  if (n <= 4) return BONUS_BANDS[1];
  if (n <= 9) return BONUS_BANDS[2];
  if (n <= 19) return BONUS_BANDS[3];
  return BONUS_BANDS[4];
}

/**
 * Next hint: the answer to reveal one more letter of, or null. Among unfound answers with
 * letters still hidden, picks the one revealed least, then the shortest, then list order.
 * Every word keeps at least one letter hidden. shown maps word -> letters revealed.
 */
export function nextHint(answers, found, shown) {
  let best = null;
  for (const w of answers) {
    if (found.has(w)) continue;
    const n = shown[w] || 0;
    if (n >= w.length - 1) continue;
    if (!best || n < (shown[best] || 0) || (n === (shown[best] || 0) && w.length < best.length)) best = w;
  }
  return best;
}

export function shareText({ puzzle, found, total, stars, bonus, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Squaredle ${puzzle.number}`
    : "Oh My WORDS! Squaredle";
  const mark = "★".repeat(stars) + "☆".repeat(5 - stars);
  const lines = [head, `${found}/${total} ${mark}${hints ? ` 💡${hints}` : ""}`];
  if (bonus != null) lines.push(`${bonus} bonus`);
  return lines.join("\n");
}

let cache = null;

function prepare(dict, common) {
  if (cache && cache.dict === dict && cache.common === common) return cache;
  const root = { n: Object.create(null), end: 0 };
  const freq = Object.create(null);
  const longs = [];
  const add = (word, kind) => {
    let node = root;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      let child = node.n[ch];
      if (!child) {
        child = { n: Object.create(null), end: 0 };
        node.n[ch] = child;
      }
      node = child;
    }
    if (node.end !== 1) node.end = kind;
  };
  for (const [word, rank] of common) {
    if (word.length < MIN_LEN || word.length > N || !/^[a-z]+$/.test(word) || !dict.has(word)) continue;
    if (rank <= ANSWER_RANK) {
      add(word, 1);
      for (let i = 0; i < word.length; i++) freq[word[i]] = (freq[word[i]] || 0) + 1;
      if (word.length >= 6 && word.length <= 8) longs.push(word);
    } else if (rank <= BONUS_RANK) {
      add(word, 2);
    }
  }
  const letters = Object.keys(freq);
  let total = 0;
  const weights = letters.map((ch) => {
    total += freq[ch];
    return freq[ch];
  });
  cache = { dict, common, root, longs, letters, weights, total };
  return cache;
}

function bitCount(mask) {
  let n = 0;
  for (let i = 0; i < N; i++) if (mask & (1 << i)) n++;
  return n;
}

function search(grid, root) {
  const answers = new Set();
  const bonus = new Set();
  let usedCells = 0;
  let longest = 0;
  const walk = (i, node, used, prefix) => {
    const next = node.n[grid[i]];
    if (!next) return;
    const word = prefix + grid[i];
    const u = used | (1 << i);
    if (next.end && word.length >= MIN_LEN) {
      if (next.end === 1) {
        answers.add(word);
        if (word.length > longest) longest = word.length;
        usedCells |= u;
      } else if (!answers.has(word)) {
        bonus.add(word);
      }
    }
    const nbs = NEIGHBORS[i];
    for (let k = 0; k < nbs.length; k++) {
      const j = nbs[k];
      if (u & (1 << j)) continue;
      if (next.n[grid[j]]) walk(j, next, u, word);
    }
  };
  for (let s = 0; s < N; s++) walk(s, root, 0, "");
  return { answers, bonus, longest, covered: bitCount(usedCells) };
}

function weighted(rng, prep) {
  let x = rng() * prep.total;
  for (let i = 0; i < prep.letters.length; i++) {
    x -= prep.weights[i];
    if (x < 0) return prep.letters[i];
  }
  return prep.letters[prep.letters.length - 1];
}

function pickVowel(grid, rng) {
  const counts = { a: 0, e: 0, i: 0, o: 0, u: 0 };
  for (let i = 0; i < grid.length; i++) {
    const ch = grid[i];
    if (ch && counts[ch] != null) counts[ch]++;
  }
  let best = 99;
  const tie = [];
  for (const v of VOWELS) {
    if (counts[v] < best) {
      best = counts[v];
      tie.length = 0;
      tie.push(v);
    } else if (counts[v] === best) tie.push(v);
  }
  return pick(rng, tie);
}

function letterCount(grid, ch) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] === ch) n++;
  return n;
}

function pickFill(grid, rng, prep) {
  let choice = prep.letters[0];
  for (let t = 0; t < 8; t++) {
    choice = weighted(rng, prep);
    if (letterCount(grid, choice) < 3) return choice;
  }
  return choice;
}

function layWord(grid, word, rng) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = randInt(rng, N);
    const path = [start];
    const used = new Set([start]);
    let ok = true;
    for (let k = 1; k < word.length; k++) {
      const nbs = NEIGHBORS[path[path.length - 1]].filter((j) => !used.has(j));
      if (!nbs.length) { ok = false; break; }
      const next = pick(rng, nbs);
      path.push(next);
      used.add(next);
    }
    if (!ok) continue;
    for (let i = 0; i < path.length; i++) grid[path[i]] = word[i];
    return;
  }
}

function oneGrid(rng, prep) {
  const grid = new Array(N).fill(null);
  layWord(grid, pick(rng, prep.longs), rng);
  const empty = shuffle(grid.map((ch, i) => (ch ? -1 : i)).filter((i) => i >= 0), rng);
  let vowels = 0;
  for (let i = 0; i < N; i++) if (grid[i] && VOWELS.includes(grid[i])) vowels++;
  const target = [6, 6, 7, 7, 8][randInt(rng, 5)];
  let need = Math.max(0, target - vowels);
  for (const i of empty) {
    if (need > 0) {
      grid[i] = pickVowel(grid, rng);
      need--;
    } else {
      grid[i] = pickFill(grid, rng, prep);
    }
  }
  return grid.join("");
}

function acceptable(found) {
  const n = found.answers.size;
  return n >= MIN_ANSWERS && n <= MAX_ANSWERS && found.longest >= 6 && found.bonus.size <= MAX_BONUS && found.covered === N;
}

function scoreOf(found) {
  const n = found.answers.size;
  let score = 0;
  if (n >= MIN_ANSWERS && n <= MAX_ANSWERS) score += 100;
  else score -= Math.abs(n - (n < MIN_ANSWERS ? MIN_ANSWERS : MAX_ANSWERS)) * 3;
  if (found.longest >= 6) score += 30;
  score += found.covered === N ? 40 : found.covered;
  score -= Math.max(0, found.bonus.size - MAX_BONUS) * 2;
  score += Math.min(n, 40);
  return score;
}

const byAlpha = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** { letters, answers, bonus } for a currentPuzzle() id. */
export function puzzleFor(puzzle, dict, common) {
  const prep = prepare(dict, common);
  if (!prep.longs.length) throw new Error("Could not build a Squaredle");
  const rng = seededRandom("squaredle", puzzle.id);
  let best = null;
  for (let t = 0; t < ATTEMPTS; t++) {
    const letters = oneGrid(rng, prep);
    const found = search(letters, prep.root);
    const score = scoreOf(found);
    if (!best || score > best.score) best = { score, letters, found };
    if (acceptable(found)) break;
  }
  return {
    letters: best.letters,
    answers: [...best.found.answers].sort(byAlpha),
    bonus: [...best.found.bonus].sort(byAlpha),
  };
}
