// Strands puzzle generator — DOM-free so it can be tested headless (jsc).
//
// generatePuzzle(themes, puzzle) -> {
//   themeIndex, clue, cols: 6, rows: 8, letters: [48 chars],
//   words: [{ word, path: [cellIdx...], spangram: bool }]   (spangram first)
// }
// Cells are indexed r * COLS + c. Every cell belongs to exactly one word path;
// paths are 8-connected, never overlap and never cross diagonally.
import { seededRandom, shuffle } from "../../core/rng.js";

export const COLS = 6;
export const ROWS = 8;
export const N = COLS * ROWS;

const NEIGHBORS = [];
for (let i = 0; i < N; i++) {
  const r = Math.floor(i / COLS), c = i % COLS, list = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) list.push(rr * COLS + cc);
    }
  }
  NEIGHBORS.push(list);
}
export const neighbors = (i) => NEIGHBORS[i];
export const isAdjacent = (a, b) => a !== b && NEIGHBORS[a].includes(b);

/** Index of the 2x2 block a diagonal step a->b passes through, or -1 if orthogonal. */
export function diagBlock(a, b) {
  const ra = Math.floor(a / COLS), ca = a % COLS, rb = Math.floor(b / COLS), cb = b % COLS;
  if (ra === rb || ca === cb) return -1;
  return Math.min(ra, rb) * (COLS - 1) + Math.min(ca, cb);
}

// ---------------------------------------------------------------- word choice

/** Theme words usable alongside the spangram (not contained in it or vice versa). */
export function usableWords(theme) {
  const sp = theme.spangram;
  return theme.words.filter((w) => w.length >= 4 && !sp.includes(w) && !w.includes(sp));
}

/** Pick `k` words summing to `target` letters, none containing another. */
function pickSubset(words, target, k, rng) {
  const pool = shuffle(words, rng);
  const chosen = [];
  let budget = 4000;
  const ok = (w) => chosen.every((c) => !c.includes(w) && !w.includes(c));
  const dfs = (start, left) => {
    if (--budget < 0) return false;
    if (chosen.length === k) return left === 0;
    const need = k - chosen.length;
    if (left < need * 4 || left > need * 9) return false;
    for (let i = start; i < pool.length; i++) {
      const w = pool[i];
      if (w.length > left || !ok(w)) continue;
      chosen.push(w);
      if (dfs(i + 1, left - w.length)) return true;
      chosen.pop();
    }
    return false;
  };
  return dfs(0, target) ? chosen.slice() : null;
}

/** Candidate word subsets (lists of words) for a theme, in rng order. */
function subsets(theme, rng, count = 6) {
  const words = usableWords(theme);
  const target = N - theme.spangram.length;
  const avg = words.reduce((s, w) => s + w.length, 0) / Math.max(1, words.length);
  const k0 = Math.round(target / avg);
  const ks = [k0, k0 + 1, k0 - 1, k0 + 2, k0 - 2].filter((k) => k >= 4 && k <= 9);
  const out = [];
  for (let n = 0; n < count; n++) {
    for (const k of ks) {
      const s = pickSubset(words, target, k, rng);
      if (s) { out.push(s); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- tiling

/**
 * Try to tile the board with a spangram of length spLen plus paths of the given
 * lengths. Returns { spangram: path, paths: [path...] (same order as lengths) } or null.
 */
export function tile(spLen, lengths, rng, budget = 30000) {
  const owner = new Int8Array(N).fill(-1);
  const diag = new Uint8Array((ROWS - 1) * (COLS - 1));
  let steps = 0;

  const emptyNeighbors = (i) => {
    let n = 0;
    for (const j of NEIGHBORS[i]) if (owner[j] < 0) n++;
    return n;
  };
  const canStep = (a, b) => {
    if (owner[b] >= 0) return false;
    const d = diagBlock(a, b);
    return d < 0 || !diag[d];
  };
  const setStep = (a, b, v) => {
    const d = diagBlock(a, b);
    if (d >= 0) diag[d] = v;
  };

  // Can the multiset `lens` be split into groups summing to each component size?
  const partition = (sizes, lens) => {
    if (!sizes.length) return lens.length === 0;
    const [size, ...rest] = sizes;
    const used = new Array(lens.length).fill(false);
    const pick = (start, left) => {
      if (left === 0) return partition(rest, lens.filter((_, i) => !used[i]));
      for (let i = start; i < lens.length; i++) {
        if (used[i] || lens[i] > left) continue;
        if (i > start && lens[i] === lens[i - 1] && !used[i - 1]) continue; // skip dup values
        used[i] = true;
        if (pick(i + 1, left - lens[i])) return true;
        used[i] = false;
      }
      return false;
    };
    return pick(0, size);
  };
  const seen = new Int32Array(N);
  let stamp = 0;
  const regionsOk = (lens) => {
    stamp++;
    const sizes = [];
    const stack = [];
    for (let i = 0; i < N; i++) {
      if (owner[i] >= 0 || seen[i] === stamp) continue;
      let size = 0;
      seen[i] = stamp;
      stack.push(i);
      while (stack.length) {
        const x = stack.pop();
        size++;
        for (const j of NEIGHBORS[x]) if (owner[j] < 0 && seen[j] !== stamp) { seen[j] = stamp; stack.push(j); }
      }
      if (size < 4) return false;
      sizes.push(size);
    }
    return partition(sizes.sort((a, b) => a - b), lens.slice().sort((a, b) => a - b));
  };

  // ---- spangram: self-avoiding path touching two opposite sides
  const vertical = spLen >= ROWS && (spLen < COLS || rng() < 0.35);
  const sideA = (i) => (vertical ? Math.floor(i / COLS) === 0 : i % COLS === 0);
  const far = (i) => (vertical ? ROWS - 1 - Math.floor(i / COLS) : COLS - 1 - (i % COLS)); // distance to side B
  const spPath = [];
  const starts = shuffle([...Array(N).keys()].filter(sideA), rng);

  // order neighbors: prefer progress toward the far side a bit, random otherwise
  const growSpangram = () => {
    if (++steps > budget) return false;
    const last = spPath[spPath.length - 1];
    if (spPath.length === spLen) return far(last) === 0 || spPath.some((c) => far(c) === 0) ? regionsOk(lengths) : false;
    const left = spLen - spPath.length;
    const touched = spPath.some((c) => far(c) === 0);
    const cand = shuffle(NEIGHBORS[last], rng)
      .filter((j) => canStep(last, j))
      .map((j) => [j, far(j) + rng() * 1.6]);
    cand.sort((a, b) => a[1] - b[1]);
    for (const [j] of cand) {
      if (!touched && far(j) > left - 1) continue;
      owner[j] = 0;
      setStep(last, j, 1);
      spPath.push(j);
      if (growSpangram()) return true;
      spPath.pop();
      setStep(last, j, 0);
      owner[j] = -1;
    }
    return false;
  };
  let placed = false;
  for (const s of starts.slice(0, 3)) {
    owner[s] = 0;
    spPath.push(s);
    if (growSpangram()) { placed = true; break; }
    spPath.pop();
    owner[s] = -1;
    if (steps > budget) return null;
  }
  if (!placed) return null;

  // ---- fill the rest
  const paths = new Array(lengths.length).fill(null);
  const remaining = lengths.map((len, idx) => ({ len, idx }));

  const fill = () => {
    if (++steps > budget) return false;
    // empty cell with the fewest empty neighbors
    let best = -1, bestN = 9;
    for (let i = 0; i < N; i++) {
      if (owner[i] >= 0) continue;
      const n = emptyNeighbors(i);
      if (n < bestN || (n === bestN && rng() < 0.3)) { best = i; bestN = n; }
    }
    if (best < 0) return true;
    if (bestN === 0) return false;
    const tried = new Set();
    for (const item of shuffle(remaining, rng)) {
      if (tried.has(item.len)) continue;
      tried.add(item.len);
      const path = [best];
      const id = item.idx + 1;
      owner[best] = id;
      const rest = remaining.filter((x) => x !== item);
      const restLens = rest.map((x) => x.len);
      const grow = () => {
        if (++steps > budget) return false;
        if (path.length === item.len) {
          if (!regionsOk(restLens)) return false;
          const at = remaining.indexOf(item);
          remaining.splice(at, 1);
          paths[item.idx] = path.slice();
          if (fill()) return true;
          paths[item.idx] = null;
          remaining.splice(at, 0, item);
          return false;
        }
        const last = path[path.length - 1];
        const cand = NEIGHBORS[last].filter((j) => canStep(last, j))
          .map((j) => [j, emptyNeighbors(j) + rng() * 1.5]);
        cand.sort((a, b) => a[1] - b[1]);
        for (const [j] of cand) {
          owner[j] = id;
          setStep(last, j, 1);
          path.push(j);
          if (grow()) return true;
          path.pop();
          setStep(last, j, 0);
          owner[j] = -1;
          if (steps > budget) return false;
        }
        return false;
      };
      const ok = grow();
      if (ok) return true;
      owner[best] = -1;
      if (steps > budget) return false;
    }
    return false;
  };
  if (!fill()) return null;
  return { spangram: spPath.slice(), paths };
}

// ---------------------------------------------------------------- puzzle

/** Theme index for a puzzle: dailies walk a fixed seeded permutation. */
export function themeOrder(count) {
  return shuffle([...Array(count).keys()], seededRandom("strands", "theme-order-v1"));
}

export function buildFromTheme(theme, rng, maxMs = 600) {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 40; attempt++) {
    if (Date.now() - t0 > maxMs) break;
    const subs = subsets(theme, rng, 1);
    if (!subs.length) return null;
    const words = subs[0];
    const res = tile(theme.spangram.length, words.map((w) => w.length), rng, 20000);
    if (!res) continue;
    const placed = [{ word: theme.spangram, path: rng() < 0.5 ? res.spangram : res.spangram.reverse(), spangram: true }];
    words.forEach((w, i) => {
      const p = res.paths[i];
      placed.push({ word: w, path: rng() < 0.5 ? p : p.slice().reverse(), spangram: false });
    });
    const letters = new Array(N).fill("");
    for (const pw of placed) pw.path.forEach((cell, k) => { letters[cell] = pw.word[k]; });
    return { clue: theme.clue, cols: COLS, rows: ROWS, letters, words: placed, attempts: attempt + 1 };
  }
  return null;
}

export function generatePuzzle(themes, puzzle) {
  const rng = seededRandom("strands", puzzle.id);
  const order = themeOrder(themes.length);
  let start;
  if (puzzle.number) start = (puzzle.number - 1) % themes.length;
  else start = Math.floor(rng() * themes.length);
  for (let k = 0; k < themes.length; k++) {
    const themeIndex = order[(start + k) % themes.length];
    const res = buildFromTheme(themes[themeIndex], rng);
    if (res) return { themeIndex, ...res };
  }
  throw new Error("Could not generate a Strands puzzle");
}

/** Validate a generated puzzle; returns a list of problems (empty = OK). */
export function validatePuzzle(p) {
  const errs = [];
  const owner = new Array(N).fill(-1);
  const diag = new Map();
  p.words.forEach((w, wi) => {
    if (w.path.length !== w.word.length) errs.push(`${w.word}: length mismatch`);
    w.path.forEach((cell, k) => {
      if (owner[cell] >= 0) errs.push(`${w.word}: overlaps at ${cell}`);
      owner[cell] = wi;
      if (p.letters[cell] !== w.word[k]) errs.push(`${w.word}: letter mismatch`);
      if (k) {
        const prev = w.path[k - 1];
        if (!isAdjacent(prev, cell)) errs.push(`${w.word}: not adjacent ${prev}-${cell}`);
        const d = diagBlock(prev, cell);
        if (d >= 0) {
          if (diag.has(d)) errs.push(`${w.word}: diagonal crossing in block ${d} (with ${p.words[diag.get(d)].word})`);
          diag.set(d, wi);
        }
      }
    });
  });
  if (owner.some((o) => o < 0)) errs.push("not fully tiled");
  const sp = p.words.find((w) => w.spangram);
  if (!sp) errs.push("no spangram");
  else {
    const rs = sp.path.map((c) => Math.floor(c / COLS)), cs = sp.path.map((c) => c % COLS);
    const lr = cs.includes(0) && cs.includes(COLS - 1);
    const tb = rs.includes(0) && rs.includes(ROWS - 1);
    if (!lr && !tb) errs.push("spangram does not touch opposite sides");
  }
  return errs;
}
