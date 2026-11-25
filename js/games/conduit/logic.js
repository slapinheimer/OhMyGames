// Conduit: connect matching fittings with pipes that fill the grid.
// Each size and difficulty has its own daily puzzle, seeded from the puzzle id, with one solution.
import { seededRandom } from "../../core/rng.js";

export const SIZES = [5, 7, 9];
export const DEFAULT_SIZE = 5;
export const DIFFICULTIES = [
  { id: "easy", name: "Easy" },
  { id: "medium", name: "Medium" },
  { id: "hard", name: "Hard" },
  { id: "expert", name: "Expert" },
];
export const DEFAULT_DIFFICULTY = "medium";

/**
 * Medium, Hard and Expert boards come from data/conduit/boards.json, built offline by
 * tools/build_conduit.mjs: pipes that wind, so the shortest route is usually wrong.
 * The page loads it with setBank() before asking for a puzzle.
 */
let BANK = null;
export function setBank(bank) { BANK = bank; }
export const TIME_BANDS = ["<1m", "1–2m", "2–4m", "4–8m", "8m+"];

/** Letters sit on the fittings so a pair is readable without its color. */
export const PALETTE = [
  { letter: "A", fill: "#1d6fdb", ink: "#ffffff" },
  { letter: "B", fill: "#e2a31b", ink: "#1a1a1a" },
  { letter: "C", fill: "#1f9d62", ink: "#ffffff" },
  { letter: "D", fill: "#d6456a", ink: "#ffffff" },
  { letter: "E", fill: "#7b4fe0", ink: "#ffffff" },
  { letter: "F", fill: "#e06a14", ink: "#ffffff" },
  { letter: "G", fill: "#1497a6", ink: "#ffffff" },
  { letter: "H", fill: "#8c8f1a", ink: "#1a1a1a" },
  { letter: "I", fill: "#d13b3b", ink: "#ffffff" },
  { letter: "J", fill: "#5d4a93", ink: "#ffffff" },
  { letter: "K", fill: "#0f766e", ink: "#ffffff" },
  { letter: "L", fill: "#b45309", ink: "#ffffff" },
  { letter: "M", fill: "#be185d", ink: "#ffffff" },
  { letter: "N", fill: "#3f6212", ink: "#ffffff" },
  { letter: "O", fill: "#1e3a8a", ink: "#ffffff" },
  { letter: "P", fill: "#9a3412", ink: "#ffffff" },
];

export const statsId = (size, difficulty = DEFAULT_DIFFICULTY) => `conduit-${size}-${difficulty}`;

export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 120) return TIME_BANDS[1];
  if (secs < 240) return TIME_BANDS[2];
  if (secs < 480) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

export function shareText({ puzzle, size, difficulty = DEFAULT_DIFFICULTY, time, hints = 0, formatTime }) {
  const label = puzzle.number ? ` #${puzzle.number}` : "";
  const name = (DIFFICULTIES.find((level) => level.id === difficulty) || DIFFICULTIES[1]).name;
  const tip = hints ? ` 💡${hints}` : "";
  return `Oh My PATTERNS! Conduit${label}\n${size}×${size} ${name} in ${formatTime(time)}${tip}`;
}

export function adjacent(a, b, n) {
  const ar = (a / n) | 0;
  const ac = a - ar * n;
  const br = (b / n) | 0;
  const bc = b - br * n;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function neighbors(i, n) {
  const r = (i / n) | 0;
  const c = i - r * n;
  const out = [];
  if (r > 0) out.push(i - n);
  if (r + 1 < n) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c + 1 < n) out.push(i + 1);
  return out;
}

/** Cells from `head` to `cell` along a straight row or column, excluding `head`. */
export function stepLine(head, cell, n) {
  if (head === cell) return [];
  const hr = (head / n) | 0;
  const hc = head - hr * n;
  const r = (cell / n) | 0;
  const c = cell - r * n;
  if (hr === r) {
    const step = hc < c ? 1 : -1;
    const cells = [];
    for (let x = hc + step; x !== c + step; x += step) cells.push(hr * n + x);
    return cells;
  }
  if (hc === c) {
    const step = hr < r ? 1 : -1;
    const cells = [];
    for (let y = hr + step; y !== r + step; y += step) cells.push(y * n + hc);
    return cells;
  }
  return null;
}

function manhattan(a, b, n) {
  const ar = (a / n) | 0;
  const ac = a - ar * n;
  const br = (b / n) | 0;
  const bc = b - br * n;
  return Math.abs(ar - br) + Math.abs(ac - bc);
}

/**
 * How much a board's pipes wind. detour: cells walked beyond each pipe's shortest route, as a
 * share of the board. shortest: share of pipes that take a shortest route (obvious ones).
 */
export function routeStats(n, paths) {
  let extra = 0;
  let straight = 0;
  for (const path of paths) {
    const d = manhattan(path[0], path[path.length - 1], n);
    extra += path.length - 1 - d;
    if (path.length - 1 === d) straight++;
  }
  return { detour: extra / (n * n), shortest: straight / paths.length };
}

/** Which banked level a board's winding earns (tools/build_conduit.mjs), or null. */
export function levelFromStats(n, { detour, shortest }) {
  const t = BANK_LEVELS[n];
  if (detour >= t.expert[0] && shortest <= t.expert[1]) return "expert";
  if (detour >= t.hard[0] && shortest <= t.hard[1]) return "hard";
  if (detour >= t.medium[0] && shortest <= t.medium[1]) return "medium";
  return null;
}
// [minimum detour, maximum shortest-route share] per level and size.
const BANK_LEVELS = {
  5: { medium: [0.1, 0.8], hard: [0.24, 0.6], expert: [0.36, 0.5] },
  7: { medium: [0.1, 0.8], hard: [0.22, 0.7], expert: [0.32, 0.6] },
  9: { medium: [0.1, 0.85], hard: [0.2, 0.75], expert: [0.3, 0.65] },
};

function straightFill(n, horizontal) {
  const paths = [];
  if (horizontal) {
    for (let r = 0; r < n; r++) {
      const path = [];
      for (let c = 0; c < n; c++) path.push(r * n + c);
      paths.push(path);
    }
  } else {
    for (let c = 0; c < n; c++) {
      const path = [];
      for (let r = 0; r < n; r++) path.push(r * n + c);
      paths.push(path);
    }
  }
  return paths;
}

/**
 * Tile the grid with straight bars. Each bar is a shortest pipe, the bars
 * use every cell once, and a zero-slack board has no room for a second route.
 * Bars only grow right or down from the first empty cell, so the search stays small.
 */
function barTilings(n, rng, limit) {
  const total = n * n;
  const maxColors = Math.min(PALETTE.length, n + 7);
  const seen = new Uint8Array(total);
  const paths = [];
  const found = [];
  let steps = 0;

  function dead() {
    for (let i = 0; i < total; i++) {
      if (seen[i]) continue;
      let open = false;
      for (const j of neighbors(i, n)) if (!seen[j]) { open = true; break; }
      if (!open) return true;
    }
    return false;
  }

  function options(start) {
    const r = (start / n) | 0;
    const c = start - r * n;
    const opts = [];
    let run = 0;
    for (let cc = c; cc < n && !seen[r * n + cc]; cc++) run++;
    const cap = Math.min(run, Math.max(4, n - 2));
    for (let len = 2; len <= cap; len++) {
      const path = [];
      for (let k = 0; k < len; k++) path.push(r * n + c + k);
      opts.push(path);
    }
    run = 0;
    for (let rr = r; rr < n && !seen[rr * n + c]; rr++) run++;
    const vcap = Math.min(run, Math.max(4, n - 2));
    for (let len = 2; len <= vcap; len++) {
      const path = [];
      for (let k = 0; k < len; k++) path.push((r + k) * n + c);
      opts.push(path);
    }
    const keyed = opts.map((path) => ({ path, k: path.length + rng() }));
    keyed.sort((a, b) => b.k - a.k);
    return keyed.map((item) => item.path);
  }

  function recurse() {
    if (found.length >= limit || steps > total * 80) return;
    steps++;
    if (paths.reduce((sum, path) => sum + path.length, 0) === total) {
      found.push(paths.map((path) => path.slice()));
      return;
    }
    if (paths.length >= maxColors) return;
    const start = seen.indexOf(0);
    if (start < 0) return;
    for (const path of options(start)) {
      if (found.length >= limit) return;
      for (const cell of path) seen[cell] = 1;
      paths.push(path);
      if (!dead()) recurse();
      paths.pop();
      for (const cell of path) seen[cell] = 0;
    }
  }

  recurse();
  return found;
}

function validCover(n, paths) {
  const total = n * n;
  const seen = new Uint8Array(total);
  for (const path of paths) {
    if (path.length < 2) return false;
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      if (cell < 0 || cell >= total || seen[cell]) return false;
      seen[cell] = 1;
      if (i > 0 && !adjacent(path[i - 1], cell, n)) return false;
    }
  }
  for (let i = 0; i < total; i++) if (!seen[i]) return false;
  return true;
}

/**
 * Count fillings of `ends` (stop at `limit`). Returns -1 when the search budget
 * runs out before the count is finished, so a hard board is retried rather than
 * treated as unique.
 */
export function solutionCount(puzzle, limit = 2, nodeCap = 100000) {
  return countSolutions(puzzle.size, puzzle.ends, limit, nodeCap);
}

function countSolutions(size, ends, limit, nodeCap) {
  const n = size;
  const total = n * n;
  const colors = ends.length;
  const occ = new Int16Array(total).fill(-1);
  const tip0 = new Int16Array(colors);
  const tip1 = new Int16Array(colors);
  const done = new Uint8Array(colors);
  for (let c = 0; c < colors; c++) {
    const a = ends[c][0];
    const b = ends[c][1];
    if (a === b || occ[a] >= 0 || occ[b] >= 0) return 0;
    occ[a] = c;
    occ[b] = c;
    tip0[c] = a;
    tip1[c] = b;
  }
  let solutions = 0;
  let nodes = 0;
  let capped = false;
  const mark = new Uint32Array(total);
  let stamp = 1;

  const snap = () => ({ occ: occ.slice(), tip0: tip0.slice(), tip1: tip1.slice(), done: done.slice() });
  const restore = (s) => { occ.set(s.occ); tip0.set(s.tip0); tip1.set(s.tip1); done.set(s.done); };

  function moves(c, side) {
    const tip = side === 0 ? tip0[c] : tip1[c];
    const other = side === 0 ? tip1[c] : tip0[c];
    const out = [];
    for (const j of neighbors(tip, n)) if (j === other || occ[j] === -1) out.push(j);
    return out;
  }

  function apply(c, side, j) {
    const other = side === 0 ? tip1[c] : tip0[c];
    if (j === other) {
      done[c] = 1;
      return;
    }
    occ[j] = c;
    if (side === 0) tip0[c] = j;
    else tip1[c] = j;
  }

  function forceAll() {
    for (let guard = 0; guard < total + colors + 2; guard++) {
      let acted = false;
      for (let c = 0; c < colors; c++) {
        if (done[c]) continue;
        const m0 = moves(c, 0);
        const m1 = moves(c, 1);
        if (m0.length === 0 && m1.length === 0) return false;
        if (m0.length === 1) { apply(c, 0, m0[0]); acted = true; break; }
        if (m1.length === 1) { apply(c, 1, m1[0]); acted = true; break; }
      }
      if (!acted) return true;
    }
    return false;
  }

  function emptyCount() {
    let empty = 0;
    for (let i = 0; i < total; i++) if (occ[i] < 0) empty++;
    return empty;
  }

  function canMeet(c) {
    const a = tip0[c];
    const b = tip1[c];
    if (adjacent(a, b, n)) return true;
    stamp++;
    const q = [a];
    mark[a] = stamp;
    for (let qi = 0; qi < q.length; qi++) {
      for (const nb of neighbors(q[qi], n)) {
        if (nb === b) return true;
        if (occ[nb] === -1 && mark[nb] !== stamp) {
          mark[nb] = stamp;
          q.push(nb);
        }
      }
    }
    return false;
  }

  function regionsOk() {
    stamp++;
    for (let i = 0; i < total; i++) {
      if (occ[i] >= 0 || mark[i] === stamp) continue;
      const q = [i];
      mark[i] = stamp;
      let touch = false;
      for (let qi = 0; qi < q.length; qi++) {
        for (const nb of neighbors(q[qi], n)) {
          if (occ[nb] < 0) {
            if (mark[nb] !== stamp) { mark[nb] = stamp; q.push(nb); }
          } else if (!done[occ[nb]] && (tip0[occ[nb]] === nb || tip1[occ[nb]] === nb)) {
            touch = true;
          }
        }
      }
      if (!touch) return false;
    }
    return true;
  }

  function viable() {
    let need = 0;
    for (let c = 0; c < colors; c++) {
      if (done[c]) continue;
      need += manhattan(tip0[c], tip1[c], n) - 1;
    }
    const empty = emptyCount();
    if (need > empty || ((empty - need) & 1) !== 0) return false;
    for (let c = 0; c < colors; c++) if (!done[c] && !canMeet(c)) return false;
    return regionsOk();
  }

  function allDone() {
    for (let c = 0; c < colors; c++) if (!done[c]) return false;
    return true;
  }

  function mostConstrained() {
    let best = null;
    let bestN = 99;
    for (let c = 0; c < colors; c++) {
      if (done[c]) continue;
      const opts = [];
      for (const j of moves(c, 0)) opts.push({ c, side: 0, j });
      for (const j of moves(c, 1)) if (j !== tip0[c]) opts.push({ c, side: 1, j });
      if (!opts.length) return null;
      if (opts.length < bestN) { bestN = opts.length; best = opts; }
    }
    return best;
  }

  function search() {
    if (solutions >= limit || capped) return;
    nodes++;
    if (nodes > nodeCap) { capped = true; return; }
    const saved = snap();
    if (!forceAll() || !viable()) { restore(saved); return; }
    if (allDone()) {
      if (emptyCount() === 0) solutions++;
      restore(saved);
      return;
    }
    const choice = mostConstrained();
    if (!choice) { restore(saved); return; }
    for (const opt of choice) {
      if (solutions >= limit || capped) break;
      const branch = snap();
      apply(opt.c, opt.side, opt.j);
      if (viable()) search();
      restore(branch);
    }
    restore(saved);
  }

  if (!viable()) return 0;
  search();
  return capped ? -1 : solutions;
}

function pack(size, paths) {
  return { size, colors: paths.length, ends: paths.map((path) => [path[0], path[path.length - 1]]), paths };
}

function bendCount(paths) {
  let bends = 0;
  for (const path of paths) {
    if (!pathTurns(path)) continue;
    bends++;
  }
  return bends;
}

function pathTurns(path) {
  if (!path || path.length < 3) return false;
  const step = path[1] - path[0];
  for (let i = 2; i < path.length; i++) {
    if (path[i] - path[i - 1] !== step) return true;
  }
  return false;
}

/**
 * Bands of elbow shelves. Every pipe is a shortest path, the pipes fill the
 * grid, and the lengths add up with no spare cells, so the routing is forced.
 * A 3-row shelf contributes two bends; a 2-row shelf contributes one or two.
 */
const BANDS = {
  5: [[3, 2], [2, 3]],
  7: [[3, 2, 2], [2, 3, 2], [2, 2, 3], [3, 3, 1], [3, 1, 3], [1, 3, 3]],
  9: [[3, 3, 3], [3, 2, 2, 2], [2, 3, 2, 2], [2, 2, 3, 2], [2, 2, 2, 3], [3, 3, 2, 1], [3, 2, 3, 1], [2, 3, 3, 1]],
};

function minBends(n) {
  if (n >= 9) return 4;
  if (n >= 7) return 3;
  return 2;
}

function minBandCost(h) {
  if (h === 1) return 1;
  if (h === 2) return 3;
  return 4;
}

function baseShelf3(w) {
  const corner = [[0, 0], [0, 1], [1, 1]];
  const elbow = [[1, 0], [2, 0]];
  for (let c = 1; c < w; c++) elbow.push([2, c]);
  const top = [];
  const mid = [];
  for (let c = 2; c < w; c++) {
    top.push([0, c]);
    mid.push([1, c]);
  }
  return [corner, elbow, top, mid];
}

function baseShelf2(w) {
  const elbow = [];
  for (let c = 0; c < w - 1; c++) elbow.push([0, c]);
  elbow.push([1, w - 2]);
  const cap = [[0, w - 1], [1, w - 1]];
  const rail = [];
  for (let c = 0; c < w - 2; c++) rail.push([1, c]);
  return [elbow, cap, rail];
}

/** Two elbows sharing a 2-row band. `drop` is the column where the left one turns. */
function baseDouble2(w, drop) {
  const left = [];
  for (let c = 0; c <= drop; c++) left.push([0, c]);
  left.push([1, drop]);
  const right = [];
  for (let c = drop + 1; c < w; c++) right.push([0, c]);
  right.push([1, w - 1]);
  const lowL = [];
  for (let c = 0; c < drop; c++) lowL.push([1, c]);
  const lowR = [];
  for (let c = drop + 1; c <= w - 2; c++) lowR.push([1, c]);
  return [left, right, lowL, lowR];
}

function placeLocals(locals, h, w, mirror, flip, row, col, n) {
  return locals.map((path) => path.map(([r, c]) => {
    if (mirror) c = w - 1 - c;
    if (flip) r = h - 1 - r;
    return (row + r) * n + (col + c);
  }));
}

function columnPath(n, row, col, h) {
  const path = [];
  for (let r = 0; r < h; r++) path.push((row + r) * n + col);
  return path;
}

function rowPath(n, row) {
  const path = [];
  for (let c = 0; c < n; c++) path.push(row * n + c);
  return path;
}

function placeBand(n, row, h, rng, allow) {
  if (h === 1) return [rowPath(n, row)];
  const mirror = rng() < 0.5;
  const flip = rng() < 0.5;
  let doubled = h === 2 && n >= 6 && allow >= 4 && rng() < 0.7;
  let room = doubled ? Math.min(n - 6, allow - 4) : Math.min(n - 4, allow - (h === 3 ? 4 : 3));
  if (room < 0) {
    doubled = false;
    room = Math.min(n - 4, allow - (h === 3 ? 4 : 3));
  }
  const margin = room > 0 ? (rng() * (room + 1)) | 0 : 0;
  const onLeft = rng() < 0.5;
  const paths = [];
  const vStart = onLeft ? 0 : n - margin;
  for (let i = 0; i < margin; i++) paths.push(columnPath(n, row, vStart + i, h));
  const w = n - margin;
  const col = onLeft ? margin : 0;
  let locals;
  if (h === 3) locals = baseShelf3(w);
  else if (doubled && w >= 6) {
    const drop = 2 + ((rng() * (w - 5)) | 0);
    locals = baseDouble2(w, drop);
  } else locals = baseShelf2(w);
  paths.push(...placeLocals(locals, h, w, mirror, flip, row, col, n));
  return paths;
}

function splitStraights(paths, rng, slots) {
  for (let i = 0; i < paths.length && slots > 0; i++) {
    const path = paths[i];
    if (pathTurns(path) || path.length < 6) continue;
    if (rng() >= 0.8) continue;
    const cut = 2 + ((rng() * (path.length - 4)) | 0);
    paths.splice(i, 1, path.slice(0, cut), path.slice(cut));
    slots--;
    i++;
  }
  return paths;
}

function shufflePaths(paths, rng) {
  for (let i = paths.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = paths[i];
    paths[i] = paths[j];
    paths[j] = tmp;
  }
  return paths;
}

function transposePaths(paths, n) {
  return paths.map((path) => path.map((cell) => {
    const r = (cell / n) | 0;
    return (cell - r * n) * n + r;
  }));
}

function windPaths(n, rng) {
  const options = BANDS[n];
  const parts = options[(rng() * options.length) | 0];
  const paths = [];
  let row = 0;
  let budget = PALETTE.length;
  for (let i = 0; i < parts.length; i++) {
    let reserve = 0;
    for (let k = i + 1; k < parts.length; k++) reserve += minBandCost(parts[k]);
    const made = placeBand(n, row, parts[i], rng, budget - reserve);
    paths.push(...made);
    budget -= made.length;
    row += parts[i];
  }
  splitStraights(paths, rng, budget);
  shufflePaths(paths, rng);
  if (rng() < 0.5) return transposePaths(paths, n);
  return paths;
}

function generate(size, rng) {
  const cap = size >= 9 ? 4000 : 6000;
  for (let attempt = 0; attempt < 12; attempt++) {
    const paths = windPaths(size, rng);
    if (!validCover(size, paths) || paths.length > PALETTE.length || bendCount(paths) < minBends(size)) continue;
    const ends = paths.map((path) => [path[0], path[path.length - 1]]);
    if (countSolutions(size, ends, 2, cap) === 1) return pack(size, paths);
  }
  const tilings = barTilings(size, rng, 4);
  for (const paths of tilings) {
    if (!validCover(size, paths) || bendCount(paths) < 1) continue;
    if (countSolutions(size, paths.map((path) => [path[0], path[path.length - 1]]), 2, 800) === 1) return pack(size, paths);
  }
  return pack(size, straightFill(size, rng() < 0.5));
}

/**
 * Medium and Hard. Every pipe is a shortest hook that turns, so a fitting
 * and its match sit around a corner instead of a cell apart. Nothing is left
 * over, which keeps the proof that the board has one answer small. A search
 * that runs out of budget returns -1 and is thrown away. Easy stays on generate().
 */
const TWIST = {
  medium: {
    5: { minLen: 4, maxLen: 6, minTurns: 1, attempts: 10, cap: 4000 },
    7: { minLen: 5, maxLen: 9, minTurns: 1, attempts: 8, cap: 6000 },
    9: { minLen: 6, maxLen: 12, minTurns: 1, attempts: 6, cap: 8000 },
  },
  hard: {
    5: { minLen: 5, maxLen: 5, minTurns: 1, attempts: 8, cap: 6000 },
    7: { minLen: 7, maxLen: 7, minTurns: 1, attempts: 6, cap: 12000 },
    9: { minLen: 9, maxLen: 9, minTurns: 1, attempts: 6, cap: 20000 },
  },
};

function turnCount(path) {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    if (path[i] - path[i - 1] !== path[i - 1] - path[i - 2]) turns++;
  }
  return turns;
}

function sameAxis(a, b, n) {
  return ((a / n) | 0) === ((b / n) | 0) || (a % n) === (b % n);
}

function mapCell(cell, n, kind) {
  let r = (cell / n) | 0;
  let c = cell - r * n;
  if (kind === 1) c = n - 1 - c;
  else if (kind === 2) r = n - 1 - r;
  else if (kind === 3) { r = n - 1 - r; c = n - 1 - c; }
  else if (kind === 4) { const t = r; r = c; c = t; }
  else if (kind === 5) { const t = r; r = c; c = n - 1 - t; }
  else if (kind === 6) { const t = r; r = n - 1 - c; c = t; }
  else if (kind === 7) { const t = r; r = n - 1 - c; c = n - 1 - t; }
  return r * n + c;
}

function stepDelta(head, delta, n) {
  const r = (head / n) | 0;
  const c = head - r * n;
  if (delta === 1) return c + 1 < n ? head + 1 : -1;
  if (delta === -1) return c > 0 ? head - 1 : -1;
  if (delta === n) return r + 1 < n ? head + n : -1;
  if (delta === -n) return r > 0 ? head - n : -1;
  return -1;
}

function regionsOk(seen, n, rule) {
  const total = n * n;
  const mark = new Uint8Array(total);
  const exact = rule.minLen === rule.maxLen;
  for (let i = 0; i < total; i++) {
    if (seen[i] || mark[i]) continue;
    const queue = [i];
    mark[i] = 1;
    let size = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      size++;
      for (const nb of neighbors(queue[qi], n)) {
        if (!seen[nb] && !mark[nb]) {
          mark[nb] = 1;
          queue.push(nb);
        }
      }
    }
    if (exact ? size % rule.minLen !== 0 : size < rule.minLen) return false;
  }
  return true;
}

/** Monotone hooks from `start` that still turn. Shorter ones are listed first on Medium. */
function enumerateHooks(seen, n, start, rule, rng, plain) {
  const total = n * n;
  let empty = 0;
  for (let i = 0; i < total; i++) if (!seen[i]) empty++;
  const quads = [[1, n], [1, -n], [-1, n], [-1, -n]];
  if (!plain) {
    for (let i = quads.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = quads[i];
      quads[i] = quads[j];
      quads[j] = tmp;
    }
  }
  const found = [];
  const limit = plain ? 24 : 12;
  const cur = [start];
  seen[start] = 1;
  for (let q = 0; q < quads.length && found.length < limit; q++) {
    const d1 = quads[q][0];
    const d2 = quads[q][1];
    const first = !plain && rng() < 0.5 ? d2 : d1;
    const second = first === d1 ? d2 : d1;
    const walk = (head, used1, used2) => {
      const len = cur.length;
      if (len > rule.maxLen || found.length >= limit) return;
      if (len >= rule.minLen && used1 && used2 && turnCount(cur) >= rule.minTurns) {
        const rest = empty - len;
        if (rest === 0 || rest >= rule.minLen) found.push(cur.slice());
      }
      if (len === rule.maxLen || found.length >= limit) return;
      const nextA = stepDelta(head, first, n);
      if (nextA >= 0 && !seen[nextA]) {
        seen[nextA] = 1;
        cur.push(nextA);
        walk(nextA, used1 || first === d1, used2 || first === d2);
        cur.pop();
        seen[nextA] = 0;
      }
      if (found.length >= limit) return;
      const nextB = stepDelta(head, second, n);
      if (nextB >= 0 && !seen[nextB]) {
        seen[nextB] = 1;
        cur.push(nextB);
        walk(nextB, used1 || second === d1, used2 || second === d2);
        cur.pop();
        seen[nextB] = 0;
      }
    };
    walk(start, false, false);
  }
  seen[start] = 0;
  if (!plain) {
    for (let i = found.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = found[i];
      found[i] = found[j];
      found[j] = tmp;
    }
  }
  // Medium tries the shorter hooks first. Equal lengths keep the shuffle above.
  if (rule.minLen !== rule.maxLen) found.sort((a, b) => a.length - b.length);
  return found;
}

function tileHooks(n, rng, rule, plain) {
  const total = n * n;
  const seen = new Uint8Array(total);
  const paths = [];
  let nodes = 0;
  const cap = plain ? Math.max(rule.cap, 20000) : rule.cap;

  function search() {
    if (++nodes > cap) return false;
    let start = -1;
    for (let i = 0; i < total; i++) if (!seen[i]) { start = i; break; }
    if (start < 0) return paths.length >= 2 && paths.length <= PALETTE.length;
    if (!regionsOk(seen, n, rule)) return false;
    const candidates = enumerateHooks(seen, n, start, rule, rng, plain);
    for (const path of candidates) {
      for (const cell of path) seen[cell] = 1;
      paths.push(path);
      if (regionsOk(seen, n, rule) && search()) return true;
      paths.pop();
      for (const cell of path) seen[cell] = 0;
      if (nodes > cap) return false;
    }
    return false;
  }

  return search() ? paths.map((path) => path.slice()) : null;
}

function hooksMeet(paths, n, rule) {
  if (!paths || !validCover(n, paths) || paths.length > PALETTE.length) return false;
  for (const path of paths) {
    if (path.length < rule.minLen || path.length > rule.maxLen) return false;
    if (turnCount(path) < rule.minTurns) return false;
    if (sameAxis(path[0], path[path.length - 1], n)) return false;
    if (path.length - 1 !== manhattan(path[0], path[path.length - 1], n)) return false;
  }
  return true;
}

function orientPaths(paths, n, rng) {
  const kind = (rng() * 8) | 0;
  const next = paths.map((path) => path.map((cell) => mapCell(cell, n, kind)));
  return rng() < 0.5 ? next.map((path) => path.slice().reverse()) : next;
}

function coverKey(paths) {
  const pairs = [];
  for (const path of paths) {
    const a = path[0];
    const b = path[path.length - 1];
    pairs.push(a < b ? a * 100 + b : b * 100 + a);
  }
  pairs.sort((a, b) => a - b);
  return pairs.join(".");
}

function generateTwist(size, rng, level) {
  const rule = TWIST[level][size];
  const tries = size === 5 ? 12 : rule.attempts;
  const goal = size === 5 ? 4 : 1;
  const bank = [];
  const seenKeys = new Set();
  for (let attempt = 0; attempt < tries && bank.length < goal; attempt++) {
    const plain = attempt + 1 === tries;
    const tiled = tileHooks(size, rng, rule, plain);
    if (!hooksMeet(tiled, size, rule)) continue;
    const key = coverKey(tiled);
    if (seenKeys.has(key)) continue;
    if (countSolutions(size, tiled.map((path) => [path[0], path[path.length - 1]]), 2, 8000) !== 1) continue;
    seenKeys.add(key);
    bank.push(tiled);
  }
  if (!bank.length) return generate(size, rng);
  const tiled = bank[(rng() * bank.length) | 0];
  const spun = size < 9 ? orientPaths(tiled, size, rng) : tiled;
  return pack(size, shufflePaths(spun.map((path) => path.slice()), rng));
}

/** One daily puzzle. The seed mixes the puzzle id, the size, and the difficulty. */
export function puzzleFor(puzzle, size = DEFAULT_SIZE, difficulty = DEFAULT_DIFFICULTY) {
  const n = SIZES.includes(size) ? size : DEFAULT_SIZE;
  const level = DIFFICULTIES.some((item) => item.id === difficulty) ? difficulty : DEFAULT_DIFFICULTY;
  const rng = seededRandom("conduit", `${puzzle.id}:${n}:${level}`);
  if (level === "easy") return generate(n, rng);
  const list = BANK && BANK[n] && BANK[n][level];
  if (list && list.length) return fromBank(list, puzzle, n, rng);
  return generateTwist(n, rng, level === "expert" ? "hard" : level);
}

/**
 * A banked board, turned or mirrored and with its colors shuffled. Daily boards step through
 * the bank by a large prime, so a board doesn't come back until the whole bank has been used.
 */
function fromBank(list, puzzle, n, rng) {
  const idx = puzzle.number ? (puzzle.number * 7919 + n * 31) % list.length : (rng() * list.length) | 0;
  const kind = (rng() * 8) | 0;
  const paths = list[idx].map((path) => {
    const mapped = path.map((cell) => mapCell(cell, n, kind));
    return rng() < 0.5 ? mapped.reverse() : mapped;
  });
  return pack(n, shufflePaths(paths, rng));
}

export function freshPipes(puzzle) {
  return Array.from({ length: puzzle.colors }, () => []);
}

function asSet(locked) {
  if (!locked) return new Set();
  return locked instanceof Set ? locked : new Set(locked);
}

function isEnd(puzzle, color, cell) {
  const pair = puzzle.ends[color];
  return cell === pair[0] || cell === pair[1];
}

function foreignEnd(puzzle, color, cell) {
  for (let c = 0; c < puzzle.colors; c++) {
    if (c !== color && isEnd(puzzle, c, cell)) return true;
  }
  return false;
}

/**
 * Begin a stroke on `cell`. A fitting starts its pipe. A cell already on a pipe
 * trims that pipe so the cell is the free end. Hinted pipes stay put.
 */
export function startStroke(pipes, cell, puzzle, locked) {
  const held = asSet(locked);
  for (let c = 0; c < puzzle.colors; c++) {
    if (!isEnd(puzzle, c, cell) && !pipes[c].includes(cell)) continue;
    if (held.has(c)) return { locked: true, color: c };
    const at = pipes[c].indexOf(cell);
    if (at >= 0) {
      let path = pipes[c].slice();
      if (at === 0) path.reverse();
      else if (at !== path.length - 1) path = path.slice(0, at + 1);
      return { color: c, path };
    }
    return { color: c, path: [cell] };
  }
  return null;
}

/**
 * Extend, shorten, or cut. `path` is the active color's current cells.
 * Returns { type: "set", path, cuts } or { type: "stay" }.
 */
export function dragTo(pipes, color, path, cell, puzzle, locked) {
  const held = asSet(locked);
  const head = path[path.length - 1];
  if (!adjacent(head, cell, puzzle.size)) return { type: "stay" };
  if (path.length >= 2 && cell === path[path.length - 2]) {
    return { type: "set", path: path.slice(0, -1), cuts: [] };
  }
  const self = path.indexOf(cell);
  if (self >= 0) return { type: "set", path: path.slice(0, self + 1), cuts: [] };
  const pair = puzzle.ends[color];
  const tail = path[path.length - 1];
  if (path.length >= 2 && ((path[0] === pair[0] && tail === pair[1]) || (path[0] === pair[1] && tail === pair[0]))) {
    return { type: "stay" };
  }
  if (isEnd(puzzle, color, cell)) return { type: "set", path: path.concat(cell), cuts: [] };
  if (foreignEnd(puzzle, color, cell)) return { type: "stay" };
  for (const c of held) {
    if (pipes[c] && pipes[c].includes(cell)) return { type: "stay" };
  }
  const cuts = [];
  for (let c = 0; c < pipes.length; c++) {
    if (c === color) continue;
    const at = pipes[c].indexOf(cell);
    if (at < 0) continue;
    const kept = pipes[c].slice(0, at);
    cuts.push({ color: c, path: kept.length && isEnd(puzzle, c, kept[0]) ? kept : [] });
  }
  return { type: "set", path: path.concat(cell), cuts };
}

export function samePipe(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return false;
  let forward = true;
  let reverse = true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) forward = false;
    if (a[i] !== b[b.length - 1 - i]) reverse = false;
  }
  return forward || reverse;
}

export function isSolved(pipes, puzzle) {
  const total = puzzle.size * puzzle.size;
  const seen = new Uint8Array(total);
  for (let c = 0; c < puzzle.colors; c++) {
    const path = pipes[c];
    const [a, b] = puzzle.ends[c];
    if (!path || path.length < 2) return false;
    if (path[0] === path[path.length - 1]) return false;
    const ends = new Set([path[0], path[path.length - 1]]);
    if (!ends.has(a) || !ends.has(b)) return false;
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      if (seen[cell]) return false;
      seen[cell] = 1;
      if (i > 0 && !adjacent(path[i - 1], cell, puzzle.size)) return false;
    }
  }
  for (let i = 0; i < total; i++) if (!seen[i]) return false;
  return true;
}

/** Lay one full correct pipe that the player has not already finished. */
export function applyHint(pipes, puzzle, hinted) {
  const held = asSet(hinted);
  for (let c = 0; c < puzzle.colors; c++) {
    if (held.has(c) || samePipe(pipes[c], puzzle.paths[c])) continue;
    const reveal = puzzle.paths[c].slice();
    const block = new Set(reveal);
    const next = pipes.map((path) => path.slice());
    next[c] = reveal;
    for (let k = 0; k < next.length; k++) {
      if (k === c || held.has(k)) continue;
      const at = next[k].findIndex((cell) => block.has(cell));
      if (at >= 0) next[k] = next[k].slice(0, at);
    }
    return { pipes: next, color: c };
  }
  return null;
}
