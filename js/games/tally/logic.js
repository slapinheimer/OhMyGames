// Tally: a grid of digits with a target sum for every row and column. Cross out
// numbers until each row and column of the numbers left adds up to its target.
// Every day has one grid per size, each with exactly one solution.
import { randInt, seededRandom } from "../../core/rng.js";

/** Grid sizes the player can pick. Each has its own daily grid, progress and stats. */
export const SIZES = [4, 5, 7, 9];
export const DEFAULT_SIZE = 5;
const ATTEMPTS = 400;

/** Stats are kept per size under this id. */
export const statsId = (size) => `tally-${size}`;

/** Solve-time buckets (seconds) for the stats distribution. */
export const TIME_BANDS = ["<1m", "1–2m", "2–4m", "4–8m", "8m+"];
export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 120) return TIME_BANDS[1];
  if (secs < 240) return TIME_BANDS[2];
  if (secs < 480) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

/** Sum of the cells in `line` that aren't crossed out (`out[i]` true). */
export const lineSum = (nums, line, out) => line.reduce((s, i) => s + (out[i] ? 0 : nums[i]), 0);

export function linesOf(size) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < size; r++) rows.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) cols.push(Array.from({ length: size }, (_, r) => r * size + c));
  return { rows, cols };
}

/**
 * Count solutions (stopping at `limit`). A solution is a set of cells to cross out
 * so every row and column hits its target. Returns { count, first } (first: bool[]).
 */
export function solve(size, nums, rowT, colT, limit = 2) {
  const { rows } = linesOf(size);
  // Every keep/cross pattern per row that hits the row's target (bit set = kept).
  const options = rows.map((line, r) => {
    const list = [];
    for (let mask = 0; mask < 1 << size; mask++) {
      let s = 0;
      for (let c = 0; c < size; c++) if (mask & (1 << c)) s += nums[line[c]];
      if (s === rowT[r]) list.push(mask);
    }
    return list;
  });
  // Most constrained rows first.
  const order = rows.map((_, r) => r).sort((a, b) => options[a].length - options[b].length);
  // Largest amount the rows not yet placed could still add to each column.
  const restMax = Array.from({ length: size + 1 }, () => new Array(size).fill(0));
  for (let k = size - 1; k >= 0; k--) {
    for (let c = 0; c < size; c++) restMax[k][c] = restMax[k + 1][c] + nums[order[k] * size + c];
  }
  const colSum = new Array(size).fill(0);
  const pick = new Array(size).fill(0);
  let count = 0;
  let first = null;
  const walk = (k) => {
    if (count >= limit) return;
    if (k === size) {
      for (let c = 0; c < size; c++) if (colSum[c] !== colT[c]) return;
      if (!count) {
        first = new Array(size * size).fill(false);
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) first[r * size + c] = !(pick[r] & (1 << c));
      }
      count++;
      return;
    }
    const r = order[k];
    for (const mask of options[r]) {
      let ok = true;
      for (let c = 0; c < size; c++) {
        const s = colSum[c] + (mask & (1 << c) ? nums[r * size + c] : 0);
        if (s > colT[c] || s + restMax[k + 1][c] < colT[c]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let c = 0; c < size; c++) if (mask & (1 << c)) colSum[c] += nums[r * size + c];
      pick[r] = mask;
      walk(k + 1);
      for (let c = 0; c < size; c++) if (mask & (1 << c)) colSum[c] -= nums[r * size + c];
    }
  };
  walk(0);
  return { count, first };
}

function attempt(rng, size) {
  const n = size * size;
  const nums = Array.from({ length: n }, () => 1 + randInt(rng, 9));
  // Cross out about a third, leaving at least one number in every row and column.
  const out = Array.from({ length: n }, () => rng() < 0.36);
  const { rows, cols } = linesOf(size);
  for (const line of [...rows, ...cols]) {
    if (line.every((i) => out[i])) out[line[randInt(rng, size)]] = false;
    if (!line.some((i) => out[i])) out[line[randInt(rng, size)]] = true;
  }
  const rowT = rows.map((l) => lineSum(nums, l, out));
  const colT = cols.map((l) => lineSum(nums, l, out));
  return { size, nums, out, rowT, colT };
}

/** { size, nums, out (the solution), rowT, colT, unique } for a currentPuzzle() id and size. */
export function puzzleFor(puzzle, size = DEFAULT_SIZE) {
  const rng = seededRandom("tally", `${puzzle.id}:${size}`);
  let fallback = null;
  for (let t = 0; t < ATTEMPTS; t++) {
    const p = attempt(rng, size);
    const { count } = solve(size, p.nums, p.rowT, p.colT, 2);
    if (count === 1) return { ...p, unique: true };
    if (!fallback) fallback = p;
  }
  return { ...fallback, unique: false };
}

/** Does crossing out `out` satisfy every row and column? */
export function solved(p, out) {
  const { rows, cols } = linesOf(p.size);
  return rows.every((l, r) => lineSum(p.nums, l, out) === p.rowT[r])
    && cols.every((l, c) => lineSum(p.nums, l, out) === p.colT[c]);
}

/**
 * Next hint: the first cell whose mark disagrees with the solution (a wrong mark before
 * an unmarked cell). marks[i] is "" | "x" (crossed out) | "o" (kept). Returns index or -1.
 */
export function nextHint(p, marks) {
  let blank = -1;
  for (let i = 0; i < marks.length; i++) {
    const want = p.out[i] ? "x" : "o";
    if (marks[i] === want) continue;
    if (marks[i]) return i;
    if (blank < 0) blank = i;
  }
  return blank;
}

export function shareText({ puzzle, size, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My NUMBERS! Tally ${label}${tip}\n${size}×${size} solved in ${formatTime(time)}`;
}
