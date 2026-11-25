// Cross Sums: fill the white squares with 1–9 so each run (a line of white squares across or
// down) adds up to the clue at its start, with no digit twice in a run. Every board has one answer.
//
// Sizes count the whole grid, clue squares included (the top row and left column are clues).
// Boards come from a bank (data/sums/boards.json) made by tools/build_sums.mjs, because big
// boards can take seconds to make. A board is made in four steps:
//   1. Lay out black and white squares (point-symmetric), so every run is 2–9 long.
//   2. Fill the white squares with digits, no repeats in a run.
//   3. Keep it only if the clues have exactly one answer.
//   4. Grade it by the hardest step a person needs (see grade()), easing digits toward Easy or
//      Moderate when that level is wanted (see ease()).
import { randInt, seededRandom, shuffle } from "../../core/rng.js";

/** Size groups and their sizes as [rows, cols]. Each day, each group and level gets one of them. */
export const GROUPS = [
  { id: "small", name: "Small", sizes: [[3, 3], [4, 4], [5, 5]] },
  { id: "medium", name: "Medium", sizes: [[6, 6], [7, 7], [8, 8]] },
  { id: "large", name: "Large", sizes: [[9, 9], [10, 10], [9, 11]] },
];
export const DEFAULT_GROUP = "medium";
export const groupById = (id) => GROUPS.find((g) => g.id === id) || GROUPS[1];

/** Levels by the hardest step needed: 1 run combos, 2 combos narrowed by crossing runs, 3 trial and error. */
export const LEVELS = [
  { id: "easy", name: "Easy", grade: 1 },
  { id: "moderate", name: "Moderate", grade: 2 },
  { id: "hard", name: "Hard", grade: 3 },
];
export const DEFAULT_LEVEL = "easy";
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
export const boardKey = (group, level) => `${group}-${level}`;
export const statsId = (group, level) => `sums-${group}-${level}`;

export const TIME_BANDS = ["<1m", "1–3m", "3–6m", "6–12m", "12m+"];
export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 180) return TIME_BANDS[1];
  if (secs < 360) return TIME_BANDS[2];
  if (secs < 720) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

const ALL = 0b1111111110; // bits 1..9
const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const low = (m) => 31 - Math.clz32(m & -m); // the lowest digit in a mask
export const digitsOf = (m) => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };

/** COMBOS[len][sum]: masks of every set of `len` different digits that adds to `sum`. */
const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let m = 2; m <= ALL; m += 2) {
  const ds = digitsOf(m);
  COMBOS[ds.length][ds.reduce((a, b) => a + b, 0)].push(m);
}
/** The digit sets a run of `len` adding to `sum` can use, e.g. combos(2, 4) → [[1, 3]]. */
export const combos = (len, sum) => (COMBOS[len] && COMBOS[len][sum] ? COMBOS[len][sum].map(digitsOf) : []);

// ---------------------------------------------------------------- layout

/**
 * Runs for a layout. white[i] is true for white squares. Returns { runs: [{ cells, dir, clue }],
 * of: [[acrossRun, downRun] per cell] }; clue is the square holding the run's sum.
 */
export function runsOf(rows, cols, white) {
  const runs = [];
  const of = Array.from({ length: rows * cols }, () => [-1, -1]);
  for (const dir of [0, 1]) {
    const outer = dir ? cols : rows;
    const inner = dir ? rows : cols;
    for (let a = 0; a < outer; a++) {
      let cur = null;
      for (let b = 0; b < inner; b++) {
        const i = dir ? b * cols + a : a * cols + b;
        if (white[i]) {
          if (!cur) { cur = { cells: [], dir, clue: dir ? i - cols : i - 1 }; runs.push(cur); }
          cur.cells.push(i);
          of[i][dir] = runs.length - 1;
        } else cur = null;
      }
    }
  }
  return { runs, of };
}

function layoutOk(rows, cols, white) {
  const { runs, of } = runsOf(rows, cols, white);
  if (runs.some((r) => r.cells.length < 2 || r.cells.length > 9)) return false;
  const cells = [];
  for (let i = 0; i < white.length; i++) if (white[i]) cells.push(i);
  if (cells.length < 4 || cells.some((i) => of[i][0] < 0 || of[i][1] < 0)) return false;
  // White squares must all connect.
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const j of [i - 1, i + 1, i - cols, i + cols]) {
      if (j < 0 || j >= white.length || !white[j] || seen.has(j)) continue;
      if ((j === i - 1 || j === i + 1) && Math.floor(j / cols) !== Math.floor(i / cols)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen.size === cells.length;
}

/**
 * A random point-symmetric layout: start all white, then add black squares in mirrored pairs
 * wherever that leaves every run at least 2 long, until about a quarter of the board is black
 * and no run is longer than 9.
 */
function randomLayout(rng, rows, cols) {
  const n = rows * cols;
  const area = (rows - 1) * (cols - 1);
  const target = area <= 9 ? Math.round(area * 0.12) : area <= 25 ? Math.round(area * 0.2) : Math.round(area * 0.28);
  const mirror = (i) => (rows - Math.floor(i / cols)) * cols + (cols - (i % cols));
  for (let attempt = 0; attempt < 40; attempt++) {
    const white = new Array(n).fill(false);
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) white[r * cols + c] = true;
    let black = 0;
    const tryBlack = (i) => {
      if (!white[i]) return false;
      const j = mirror(i);
      white[i] = white[j] = false;
      const { runs, of } = runsOf(rows, cols, white);
      const ok = runs.every((r) => r.cells.length >= 2)
        && white.every((w, k) => !w || (of[k][0] >= 0 && of[k][1] >= 0));
      if (!ok) { white[i] = white[j] = true; return false; }
      black += i === j ? 1 : 2;
      return true;
    };
    const spots = [];
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) spots.push(r * cols + c);
    for (const i of shuffle(spots, rng)) {
      if (black >= target) break;
      tryBlack(i);
    }
    // Split any run that is still longer than 9.
    for (let pass = 0; pass < 4; pass++) {
      const long = runsOf(rows, cols, white).runs.find((r) => r.cells.length > 9);
      if (!long) break;
      for (const i of shuffle(long.cells.slice(2, -2), rng)) if (tryBlack(i)) break;
    }
    if (layoutOk(rows, cols, white)) return white;
  }
  return null;
}

// ---------------------------------------------------------------- filling

/** Digits for every white square, no repeats in a run. Returns an array or null. */
function fill(rng, rows, cols, white, runs, of, budget = 20000) {
  const n = rows * cols;
  const val = new Array(n).fill(0);
  const used = runs.map(() => 0);
  const order = [];
  for (let i = 0; i < n; i++) if (white[i]) order.push(i);
  let steps = 0;
  const walk = (k) => {
    if (k === order.length) return true;
    if (++steps > budget) return false;
    // Fill the square with the fewest choices next.
    let bestK = k;
    let bestCount = 10;
    for (let t = k; t < order.length; t++) {
      const i = order[t];
      const free = ALL & ~used[of[i][0]] & ~used[of[i][1]];
      const c = bits(free);
      if (c < bestCount) { bestCount = c; bestK = t; if (c <= 1) break; }
    }
    [order[k], order[bestK]] = [order[bestK], order[k]];
    const i = order[k];
    const free = ALL & ~used[of[i][0]] & ~used[of[i][1]];
    for (const d of shuffle(digitsOf(free), rng)) {
      val[i] = d;
      used[of[i][0]] |= 1 << d;
      used[of[i][1]] |= 1 << d;
      if (walk(k + 1)) return true;
      used[of[i][0]] &= ~(1 << d);
      used[of[i][1]] &= ~(1 << d);
    }
    val[i] = 0;
    [order[k], order[bestK]] = [order[bestK], order[k]];
    return false;
  };
  return walk(0) ? val : null;
}

// ---------------------------------------------------------------- solving

/**
 * Narrow candidates (cand[i] is a digit mask) until nothing changes. Every pass uses each run's
 * digit sets (from its clue and the digits placed) and puts a digit every set needs where only
 * one square can take it. strong also drops sets that a square's candidates rule out. Returns
 * false on a contradiction.
 */
function propagate(board, cand, strong) {
  const { runs } = board;
  for (let changed = true; changed;) {
    changed = false;
    for (const run of runs) {
      let fixed = 0;
      let union = 0;
      for (const i of run.cells) {
        if (bits(cand[i]) === 1) {
          if (fixed & cand[i]) return false;
          fixed |= cand[i];
        }
        union |= cand[i];
      }
      const sets = COMBOS[run.cells.length][run.sum].filter((m) => (m & fixed) === fixed
        && (!strong || ((m & union) === m && run.cells.every((i) => cand[i] & m))));
      if (!sets.length) return false;
      let allow = 0;
      let need = ALL;
      for (const m of sets) { allow |= m; need &= m; }
      for (const i of run.cells) {
        let next = cand[i] & allow;
        if (bits(cand[i]) !== 1) next &= ~fixed;
        if (!next) return false;
        if (next !== cand[i]) { cand[i] = next; changed = true; }
      }
      {
        // A digit every set needs, with only one square that can take it, goes there.
        for (let m = need & ~fixed; m; m &= m - 1) {
          const d = m & -m;
          const spots = run.cells.filter((i) => cand[i] & d);
          if (!spots.length) return false;
          if (spots.length === 1 && cand[spots[0]] !== d) { cand[spots[0]] = d; changed = true; }
        }
      }
    }
  }
  return true;
}

/** Count answers up to `limit` (propagate, then try each candidate of the tightest square). */
export function countSolutions(board, limit = 2, budget = 200000) {
  const start = new Array(board.rows * board.cols).fill(0);
  for (let i = 0; i < start.length; i++) if (board.white[i]) start[i] = ALL;
  let found = 0;
  let steps = 0;
  const walk = (cand) => {
    if (found >= limit || ++steps > budget) return;
    if (!propagate(board, cand, true)) return;
    let pick = -1;
    for (let i = 0; i < cand.length; i++) {
      if (cand[i] && bits(cand[i]) > 1 && (pick < 0 || bits(cand[i]) < bits(cand[pick]))) pick = i;
    }
    if (pick < 0) { found++; return; }
    for (let m = cand[pick]; m; m &= m - 1) {
      const next = cand.slice();
      next[pick] = m & -m;
      walk(next);
    }
  };
  walk(start);
  return steps > budget && found < limit ? -1 : found;
}

/**
 * The hardest step a person needs: 1 when each run's digit sets (from its clue and placed digits)
 * are enough, 2 when sets must be narrowed by the crossing runs, 3 when it takes trial and error.
 */
export function grade(board) {
  const cand = new Array(board.rows * board.cols).fill(0);
  for (let i = 0; i < cand.length; i++) if (board.white[i]) cand[i] = ALL;
  const done = () => cand.every((m) => !m || bits(m) === 1);
  propagate(board, cand, false);
  if (done()) return 1;
  propagate(board, cand, true);
  return done() ? 2 : 3;
}

// ---------------------------------------------------------------- boards

/** Squares still open after propagating (strong or not) from an empty board. */
function openAfter(board, strong) {
  const cand = new Array(board.rows * board.cols).fill(0);
  for (let i = 0; i < cand.length; i++) if (board.white[i]) cand[i] = ALL;
  if (!propagate(board, cand, strong)) return Infinity;
  return cand.filter((m) => bits(m) > 1).length;
}

/**
 * Make a unique board easier until it grades at `want` (1 or 2): change a digit that is still
 * open after the steps that level allows, keep the change if the answer stays unique and fewer
 * squares stay open. Returns true when it gets there.
 */
export function ease(board, rng, want, tries = 300) {
  const { runs, of, white, solution: val } = board;
  const strong = want >= 2;
  let open = openAfter(board, strong);
  for (let t = 0; t < tries && open > 0; t++) {
    const cand = new Array(val.length).fill(0);
    for (let i = 0; i < cand.length; i++) if (white[i]) cand[i] = ALL;
    propagate(board, cand, strong);
    const loose = [];
    for (let i = 0; i < cand.length; i++) if (bits(cand[i]) > 1) loose.push(i);
    const i = loose[randInt(rng, loose.length)];
    const used = runs[of[i][0]].cells.concat(runs[of[i][1]].cells).filter((j) => j !== i).reduce((m, j) => m | (1 << val[j]), 0);
    const opts = digitsOf(ALL & ~used & ~(1 << val[i]));
    if (!opts.length) continue;
    const old = val[i];
    val[i] = opts[randInt(rng, opts.length)];
    for (const dir of [0, 1]) runs[of[i][dir]].sum += val[i] - old;
    const next = openAfter(board, strong);
    if (next < open && findOther(board) === null) { open = next; continue; }
    for (const dir of [0, 1]) runs[of[i][dir]].sum -= val[i] - old;
    val[i] = old;
  }
  return open === 0;
}

/**
 * Make one board of rows × cols, or null. If the clues allow more than one answer, change a digit
 * where another answer differs (keeping runs free of repeats, and leaning toward sums with few
 * digit sets) and try again.
 */
export function makeBoard(rng, rows, cols) {
  const white = randomLayout(rng, rows, cols);
  if (!white) return null;
  const { runs, of } = runsOf(rows, cols, white);
  const val = fill(rng, rows, cols, white, runs, of);
  if (!val) return null;
  const board = { rows, cols, white, runs, of, solution: val };
  const setSums = () => { for (const run of runs) run.sum = run.cells.reduce((s, i) => s + val[i], 0); };
  for (let t = 0; t < 200; t++) {
    setSums();
    const other = findOther(board);
    if (other === null) return board;
    if (other === -1) return null;
    const diff = [];
    for (let i = 0; i < val.length; i++) if (white[i] && other[i] !== val[i]) diff.push(i);
    const i = diff[randInt(rng, diff.length)];
    const used = runs[of[i][0]].cells.concat(runs[of[i][1]].cells).filter((j) => j !== i).reduce((m, j) => m | (1 << val[j]), 0);
    const opts = digitsOf(ALL & ~used & ~(1 << val[i]));
    if (!opts.length) continue;
    // Prefer the digit that leaves its two runs with the fewest digit sets (most telling sums).
    const sets = (d) => [0, 1].reduce((n, dir) => {
      const run = runs[of[i][dir]];
      const sum = run.sum - val[i] + d;
      return n + COMBOS[run.cells.length][sum].length;
    }, 0) + rng() * 0.9;
    val[i] = opts.reduce((a, b) => (sets(b) < sets(a) ? b : a));
  }
  return null;
}

/** Another answer to the board's clues (an array), null if there is none, or -1 if unsure. */
function findOther(board) {
  const start = new Array(board.rows * board.cols).fill(0);
  for (let i = 0; i < start.length; i++) if (board.white[i]) start[i] = ALL;
  let steps = 0;
  let out = null;
  const walk = (cand) => {
    if (out || ++steps > 40000) return;
    if (!propagate(board, cand, true)) return;
    let pick = -1;
    for (let i = 0; i < cand.length; i++) {
      if (cand[i] && bits(cand[i]) > 1 && (pick < 0 || bits(cand[i]) < bits(cand[pick]))) pick = i;
    }
    if (pick < 0) {
      const vals = cand.map((m) => (m ? low(m) : 0));
      if (vals.some((v, i) => board.white[i] && v !== board.solution[i])) out = vals;
      return;
    }
    for (let m = cand[pick]; m; m &= m - 1) {
      const next = cand.slice();
      next[pick] = m & -m;
      walk(next);
    }
  };
  walk(start);
  if (out) return out;
  return steps > 40000 ? -1 : null;
}

// ---------------------------------------------------------------- the bank

let BANK = null;
/** Install the bank from data/sums/boards.json (see tools/build_sums.mjs). */
export function setBank(bank) { BANK = bank; }

/** A board from its stored string ("." for clue squares, else the answer digit). */
export function decode(rows, cols, s) {
  const white = [...s].map((ch) => ch !== ".");
  const solution = [...s].map((ch) => (ch === "." ? 0 : Number(ch)));
  const { runs, of } = runsOf(rows, cols, white);
  for (const run of runs) run.sum = run.cells.reduce((t, i) => t + solution[i], 0);
  return { rows, cols, white, runs, of, solution };
}

/** Same puzzle, new look: swap every digit d for 10 − d, and flip square boards on the diagonal. */
function variant(rows, cols, s, rng) {
  let cells = [...s];
  if (rng() < 0.5) cells = cells.map((ch) => (ch === "." ? ch : String(10 - Number(ch))));
  if (rows === cols && rng() < 0.5) cells = cells.map((_, i) => cells[(i % cols) * cols + Math.floor(i / cols)]);
  return cells.join("");
}

/**
 * { rows, cols, white, runs, of, solution, id } for a currentPuzzle() id, size group and level.
 * The group's size is picked at random for the day; the board comes from the bank.
 */
export function boardFor(puzzle, group = DEFAULT_GROUP, level = DEFAULT_LEVEL) {
  const rng = seededRandom("sums", `${puzzle.id}:${group}:${level}`);
  const sizes = groupById(group).sizes.filter(([r, c]) => BANK?.[`${r}x${c}`]?.[level]?.length);
  if (!sizes.length) return null;
  const [rows, cols] = sizes[randInt(rng, sizes.length)];
  const list = BANK[`${rows}x${cols}`][level];
  const g = GROUPS.findIndex((x) => x.id === group);
  const l = LEVELS.findIndex((x) => x.id === level);
  // Daily boards walk the bank in a fixed stride; practice boards are random.
  const idx = puzzle.number ? (puzzle.number * 7919 + g * 31 + l * 17) % list.length : randInt(rng, list.length);
  const s = variant(rows, cols, list[idx], rng);
  return { ...decode(rows, cols, s), id: `${rows}x${cols}:${s}` };
}

/**
 * Next hint: a wrong digit to fix, else the open square with the fewest choices (or the selected
 * one, if open). Returns { cell, digit } or null.
 */
export function nextHint(board, values, selected = -1) {
  const { white, solution } = board;
  if (selected >= 0 && white[selected] && values[selected] !== solution[selected]) return { cell: selected, digit: solution[selected] };
  for (let i = 0; i < values.length; i++) if (white[i] && values[i] && values[i] !== solution[i]) return { cell: i, digit: solution[i] };
  const cand = values.map((v, i) => (!white[i] ? 0 : v ? 1 << v : ALL));
  propagate(board, cand, true);
  let pick = -1;
  for (let i = 0; i < values.length; i++) {
    if (white[i] && !values[i] && (pick < 0 || bits(cand[i]) < bits(cand[pick]))) pick = i;
  }
  return pick < 0 ? null : { cell: pick, digit: solution[pick] };
}

/** Squares that clash: a digit repeated in a run, or a full run with the wrong sum. */
export function conflicts(board, values) {
  const bad = new Set();
  for (const run of board.runs) {
    const seen = new Map();
    let sum = 0;
    let full = true;
    for (const i of run.cells) {
      const v = values[i];
      if (!v) { full = false; continue; }
      sum += v;
      if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); } else seen.set(v, i);
    }
    if (full && sum !== run.sum) run.cells.forEach((i) => bad.add(i));
  }
  return bad;
}

export const solved = (board, values) => board.solution.every((v, i) => !board.white[i] || values[i] === v);

export function shareText({ puzzle, rows, cols, level, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My NUMBERS! Cross Sums ${label}${tip}\n➕ ${rows}×${cols} ${levelById(level).name} in ${formatTime(time)}`;
}

