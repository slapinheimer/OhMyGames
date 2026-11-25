// Shade: picture-logic puzzles. Clues are the shaded runs in a line, in order,
// with at least one empty cell between runs. A picture ships only when line
// logic (no guessing) fills every cell, which is also the only solution.
import { randInt, seededRandom } from "../../core/rng.js";

/** Grid sizes. Each has its own daily picture, progress and stats. */
export const SIZES = [5, 10, 15];
export const DEFAULT_SIZE = 10;

/** Stats are kept per size under this id. */
export const statsId = (size) => `shade-${size}`;

/** Solve-time buckets (seconds) for the stats distribution. */
export const TIME_BANDS = ["<1m", "1–2m", "2–4m", "4–8m", "8m+"];
export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 120) return TIME_BANDS[1];
  if (secs < 240) return TIME_BANDS[2];
  if (secs < 480) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

/** Lengths of filled runs in a 0/1 line. */
export function cluesOf(line) {
  const clues = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) { clues.push(run); run = 0; }
  }
  if (run) clues.push(run);
  return clues;
}

/** Runs of shaded marks. "" and "x" are gaps. */
export function runsOf(line) {
  const clues = [];
  let run = 0;
  for (const m of line) {
    if (m === "s") run++;
    else if (run) { clues.push(run); run = 0; }
  }
  if (run) clues.push(run);
  return clues;
}

/** A clue is met when the shaded runs match it. Unmarked cells count as gaps. */
export function clueMet(clue, line) {
  const got = runsOf(line);
  if (got.length !== clue.length) return false;
  for (let i = 0; i < got.length; i++) if (got[i] !== clue[i]) return false;
  return true;
}

export function gridClues(cells) {
  const n = Math.round(Math.sqrt(cells.length));
  const rows = [];
  const cols = [];
  for (let r = 0; r < n; r++) rows.push(cluesOf(cells.slice(r * n, r * n + n)));
  for (let c = 0; c < n; c++) {
    const col = [];
    for (let r = 0; r < n; r++) col.push(cells[r * n + c]);
    cols.push(cluesOf(col));
  }
  return { rows, cols };
}

/**
 * Every way to place `clues` on a line of length `n`.
 * known[i] is 0 unknown, 1 filled, -1 empty. Each result is a bit mask of fills.
 */
export function placements(n, clues, known) {
  if (!clues.length) {
    for (let i = 0; i < n; i++) if (known[i] === 1) return [];
    return [0];
  }
  const out = [];
  const rec = (ci, start, mask) => {
    if (ci === clues.length) {
      for (let i = start; i < n; i++) if (known[i] === 1) return;
      out.push(mask);
      return;
    }
    const length = clues[ci];
    let minTail = 0;
    if (ci !== clues.length - 1) {
      let sum = 0;
      for (let k = ci + 1; k < clues.length; k++) sum += clues[k];
      minTail = 1 + sum + (clues.length - ci - 2);
    }
    const last = n - length - minTail;
    for (let s = start; s <= last; s++) {
      let ok = true;
      for (let i = start; i < s; i++) {
        if (known[i] === 1) { ok = false; break; }
      }
      if (!ok) continue;
      let m = mask;
      for (let i = s; i < s + length; i++) {
        if (i >= n || known[i] === -1) { ok = false; break; }
        m |= 1 << i;
      }
      if (!ok) continue;
      const nxt = s + length;
      if (ci < clues.length - 1) {
        if (nxt >= n || known[nxt] === 1) continue;
        rec(ci + 1, nxt + 1, m);
      } else rec(ci + 1, nxt, m);
    }
  };
  rec(0, 0, 0);
  return out;
}

function paint(known, idx, opts) {
  let allAnd = opts[0];
  let anyOr = 0;
  for (const o of opts) {
    allAnd &= o;
    anyOr |= o;
  }
  let changed = false;
  for (let i = 0; i < idx.length; i++) {
    const cell = idx[i];
    if (known[cell] !== 0) continue;
    const bit = 1 << i;
    if (allAnd & bit) { known[cell] = 1; changed = true; }
    else if ((anyOr & bit) === 0) { known[cell] = -1; changed = true; }
  }
  return changed;
}

/** Line-logic fixpoint. Returns the known[] array, or null on a contradiction. */
export function deduce(n, rowClues, colClues, known) {
  for (let step = 0; step < n * n * 2 + 4; step++) {
    let changed = false;
    for (let r = 0; r < n; r++) {
      const idx = [];
      for (let c = 0; c < n; c++) idx.push(r * n + c);
      const opts = placements(n, rowClues[r], idx.map((i) => known[i]));
      if (!opts.length) return null;
      changed = paint(known, idx, opts) || changed;
    }
    for (let c = 0; c < n; c++) {
      const idx = [];
      for (let r = 0; r < n; r++) idx.push(r * n + c);
      const opts = placements(n, colClues[c], idx.map((i) => known[i]));
      if (!opts.length) return null;
      changed = paint(known, idx, opts) || changed;
    }
    if (!changed) break;
  }
  return known;
}

/** Solve from a blank grid. Returns the 0/1 cells, or null if line logic cannot finish. */
export function lineSolve(cells) {
  const n = Math.round(Math.sqrt(cells.length));
  const { rows, cols } = gridClues(cells);
  const known = deduce(n, rows, cols, new Array(n * n).fill(0));
  if (!known || known.some((v) => v === 0)) return null;
  const got = known.map((v) => (v === 1 ? 1 : 0));
  for (let i = 0; i < got.length; i++) if (got[i] !== (cells[i] ? 1 : 0)) return null;
  return got;
}

function model(pic) {
  const cells = [];
  for (const row of pic.rows) for (const ch of row) cells.push(ch === "1" ? 1 : 0);
  const { rows, cols } = gridClues(cells);
  return { name: pic.name, size: pic.size, cells, rowClues: rows, colClues: cols };
}

/** Today's picture for this size. Seeded so a reload picks the same one. */
export function puzzleFor(puzzle, size, pictures) {
  const pool = pictures.filter((p) => p.size === size);
  if (!pool.length) throw new Error(`No Shade pictures at ${size}`);
  const rng = seededRandom("shade", `${puzzle.id}:${size}`);
  return model(pool[randInt(rng, pool.length)]);
}

/** Won when every shaded cell matches the picture. ✕ on empties is optional. */
export function solved(cells, marks) {
  for (let i = 0; i < cells.length; i++) {
    if ((marks[i] === "s") !== (cells[i] === 1)) return false;
  }
  return true;
}

/** A shade on an empty cell, or ✕ on a shaded cell. Unmarked cells are not mistakes. */
export function isMistake(cell, mark) {
  if (mark === "s" && cell !== 1) return true;
  if (mark === "x" && cell === 1) return true;
  return false;
}

/**
 * One cell line logic can fill from the marks that already match the picture.
 * Wrong marks are ignored. Falls back to any cell that is not yet correct.
 * Returns { index, mark } or null when the grid is already fully marked.
 */
export function nextHint(cells, marks) {
  const n = Math.round(Math.sqrt(cells.length));
  const { rows, cols } = gridClues(cells);
  const known = marks.map((m, i) => {
    if (m === "s" && cells[i] === 1) return 1;
    if (m === "x" && cells[i] === 0) return -1;
    return 0;
  });
  const got = deduce(n, rows, cols, known);
  if (got) {
    for (let i = 0; i < got.length; i++) {
      if (got[i] === 1 && marks[i] !== "s") return { index: i, mark: "s" };
      if (got[i] === -1 && marks[i] !== "x") return { index: i, mark: "x" };
    }
  }
  for (let i = 0; i < cells.length; i++) {
    const want = cells[i] ? "s" : "x";
    if (marks[i] !== want) return { index: i, mark: want };
  }
  return null;
}

export function shareText({ puzzle, size, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My PATTERNS! Shade ${label}${tip}\n${size}×${size} solved in ${formatTime(time)}`;
}
