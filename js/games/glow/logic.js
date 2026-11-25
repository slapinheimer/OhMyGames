// Glow: pressing a light steps it and its neighbors to the next color. Turn every light off.
// Easy and Medium lights are on/off; Hard and Expert lights cycle off → amber → red → off,
// and an Expert press also reaches the diagonal neighbors. Boards are made by pressing
// random lights on a dark board, so every board can be solved. Par is the fewest presses.
import { seededRandom } from "../../core/rng.js";

export const SIZES = [5, 6, 7];
export const DEFAULT_SIZE = 5;

/** colors: states per light (2 = on/off). shape: "plus" (4 neighbors) or "box" (8). */
export const LEVELS = [
  { id: "easy", name: "Easy", colors: 2, shape: "plus", density: 0.22, minPar: (n) => n - 1 },
  { id: "medium", name: "Medium", colors: 2, shape: "plus", density: 0.4, minPar: (n) => n + 2 },
  { id: "hard", name: "Hard", colors: 3, shape: "plus", density: 0.25, minPar: (n) => n + 4 },
  { id: "expert", name: "Expert", colors: 3, shape: "box", density: 0.25, minPar: (n) => n + 4 },
];
export const DEFAULT_LEVEL = "medium";
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
export const boardKey = (size, level) => `${size}-${level}`;
export const statsId = (size, level) => `glow-${size}-${level}`;

/** Presses-over-par buckets for the stats distribution. */
export const PAR_BANDS = ["Par", "+1–2", "+3–5", "+6–10", "+11"];
export function parBand(over) {
  if (over <= 0) return PAR_BANDS[0];
  if (over <= 2) return PAR_BANDS[1];
  if (over <= 5) return PAR_BANDS[2];
  if (over <= 10) return PAR_BANDS[3];
  return PAR_BANDS[4];
}

/** Cells a press at i reaches (itself and its neighbors). */
export function reach(size, i, shape = "plus") {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (shape === "plus" && dr && dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
}

export function press(size, lights, i, rule = LEVELS[1]) {
  const next = lights.slice();
  for (const j of reach(size, i, rule.shape)) next[j] = (next[j] + 1) % rule.colors;
  return next;
}

const inverse = (v, m) => { for (let k = 1; k < m; k++) if ((v * k) % m === 1) return k; return 0; };
const MAX_FREE = 8;

/**
 * Fewest presses that turn every light off, as presses per cell (0 … colors-1), or null if
 * impossible. Gaussian elimination mod `colors` (a prime), then the smallest solution the free
 * variables allow (searched completely when there are at most MAX_FREE of them).
 */
export function solve(size, lights, rule = LEVELS[1]) {
  const m = rule.colors;
  const n = size * size;
  // Row j: how many steps each press gives light j; the target is whatever turns it off.
  const rows = Array.from({ length: n }, (_, j) => {
    const row = new Int8Array(n + 1);
    for (const i of reach(size, j, rule.shape)) row[i] = 1;
    row[n] = (m - lights[j]) % m;
    return row;
  });
  const pivotCol = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let p = r;
    while (p < n && !rows[p][c]) p++;
    if (p === n) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    const inv = inverse(rows[r][c], m);
    for (let x = c; x <= n; x++) rows[r][x] = (rows[r][x] * inv) % m;
    for (let k = 0; k < n; k++) {
      const f = rows[k][c];
      if (k === r || !f) continue;
      for (let x = c; x <= n; x++) rows[k][x] = (((rows[k][x] - f * rows[r][x]) % m) + m) % m;
    }
    pivotCol.push(c);
    r++;
  }
  for (let k = r; k < n; k++) if (rows[k][n]) return null;
  const pivots = new Set(pivotCol);
  const free = [];
  for (let c = 0; c < n; c++) if (!pivots.has(c)) free.push(c);
  const searched = free.slice(0, MAX_FREE);
  let best = null;
  const total = m ** searched.length;
  for (let combo = 0; combo < total; combo++) {
    const x = new Array(n).fill(0);
    let rest = combo;
    for (const c of searched) { x[c] = rest % m; rest = Math.floor(rest / m); }
    pivotCol.forEach((c, k) => {
      let v = rows[k][n];
      for (const f of free) if (rows[k][f] && x[f]) v -= rows[k][f] * x[f];
      x[c] = ((v % m) + m) % m;
    });
    const count = x.reduce((s, v) => s + v, 0);
    if (!best || count < best.count) best = { count, x };
  }
  return best.x;
}

export const parOf = (size, lights, rule) => solve(size, lights, rule).reduce((s, v) => s + v, 0);

/** { size, level, lights, par } for a currentPuzzle() id, size and level. */
export function boardFor(puzzle, size = DEFAULT_SIZE, level = DEFAULT_LEVEL) {
  const rule = levelById(level);
  const rng = seededRandom("glow", `${puzzle.id}:${size}:${level}`);
  const n = size * size;
  for (;;) {
    let lights = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (rng() < rule.density) lights = press(size, lights, i, rule);
      if (rule.colors > 2 && rng() < rule.density / 2) lights = press(size, lights, i, rule);
    }
    const par = parOf(size, lights, rule);
    if (par >= rule.minPar(size)) return { size, level, lights, par };
  }
}

export const allOff = (lights) => lights.every((v) => !v);

/** A press on the shortest way from here. Returns a cell index, or -1 when already solved. */
export function nextHint(size, lights, rule) {
  return solve(size, lights, rule).findIndex((v) => v > 0);
}

export function shareText({ puzzle, size, level, presses, par, hints = 0 }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  const over = presses - par;
  return `Oh My PATTERNS! Glow ${label}${tip}\n💡 ${size}×${size} ${levelById(level).name} in ${presses} presses (par ${par}${over > 0 ? `, +${over}` : ""})`;
}
