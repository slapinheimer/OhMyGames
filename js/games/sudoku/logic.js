// Sudoku puzzles and moves. Generation is a pure function of the seed.
// Grids are 81 cells, row-major. 0 is empty. Digits are 1–9.
import { seededRandom, shuffle } from "../../core/rng.js";

export const MISTAKE_LIMIT = 3;
export const LEVELS = [
  { id: "easy", name: "Easy", givens: 40 },
  { id: "medium", name: "Medium", givens: 33 },
  { id: "hard", name: "Hard", givens: 28 },
  { id: "expert", name: "Expert", givens: 25 },
  { id: "master", name: "Master", givens: 23 },
  { id: "extreme", name: "Extreme", givens: 22 },
];

const ALL = 0x3fe; // bits 1–9
const LEVEL_IDS = new Set(LEVELS.map((level) => level.id));

export const levelById = (id) => LEVELS.find((level) => level.id === id) || LEVELS[1];
export const boxOf = (i) => (Math.floor(i / 27) * 3) + Math.floor((i % 9) / 3);

const PEERS = Array.from({ length: 81 }, (_, i) => {
  const row = Math.floor(i / 9);
  const col = i % 9;
  const box = boxOf(i);
  const peers = [];
  for (let k = 0; k < 81; k++) {
    if (k !== i && (Math.floor(k / 9) === row || k % 9 === col || boxOf(k) === box)) peers.push(k);
  }
  return peers;
});

export const peersOf = (i) => PEERS[i];

function popcount(mask) {
  let n = 0;
  while (mask) { n++; mask &= mask - 1; }
  return n;
}

/** A finished grid has each digit once in every row, column, and box. */
export function validSolution(grid) {
  if (!grid || grid.length !== 81) return false;
  for (let h = 0; h < 9; h++) {
    let row = 0;
    let col = 0;
    let box = 0;
    for (let k = 0; k < 9; k++) {
      const rv = grid[h * 9 + k];
      const cv = grid[k * 9 + h];
      const br = Math.floor(h / 3) * 3 + Math.floor(k / 3);
      const bc = (h % 3) * 3 + (k % 3);
      const bv = grid[br * 9 + bc];
      if (rv < 1 || rv > 9 || cv < 1 || cv > 9 || bv < 1 || bv > 9) return false;
      row |= 1 << rv;
      col |= 1 << cv;
      box |= 1 << bv;
    }
    if (row !== ALL || col !== ALL || box !== ALL) return false;
  }
  return true;
}

/**
 * How many solutions a puzzle has, up to `limit`. A search that runs too long
 * reports 2, so a removal is kept only when uniqueness is actually proved.
 */
export function solutionCount(grid, limit = 2) {
  const g = grid.slice();
  const rows = Array(9).fill(0);
  const cols = Array(9).fill(0);
  const boxes = Array(9).fill(0);
  const empty = [];
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) { empty.push(i); continue; }
    const bit = 1 << d;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = boxOf(i);
    if ((rows[r] & bit) || (cols[c] & bit) || (boxes[b] & bit)) return 0;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  let count = 0;
  let nodes = 0;
  const cap = 80000;
  function rec() {
    if (count >= limit || ++nodes > cap) {
      if (nodes > cap) count = limit;
      return;
    }
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    let bestAt = -1;
    for (let n = 0; n < empty.length; n++) {
      const i = empty[n];
      if (g[i]) continue;
      const mask = ALL & ~rows[Math.floor(i / 9)] & ~cols[i % 9] & ~boxes[boxOf(i)];
      const size = popcount(mask);
      if (size === 0) return;
      if (size < bestSize) {
        best = i;
        bestMask = mask;
        bestSize = size;
        bestAt = n;
        if (size === 1) break;
      }
    }
    if (best < 0) { count++; return; }
    const r = Math.floor(best / 9);
    const c = best % 9;
    const b = boxOf(best);
    empty.splice(bestAt, 1);
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      g[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      rec();
      g[best] = 0;
      rows[r] ^= bit;
      cols[c] ^= bit;
      boxes[b] ^= bit;
      if (count >= limit) break;
    }
    empty.splice(bestAt, 0, best);
  }
  rec();
  return count;
}

function baseGrid() {
  const grid = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) grid.push(((r * 3 + Math.floor(r / 3) + c) % 9) + 1);
  }
  return grid;
}

const BASE = baseGrid();

function bands(rng) {
  return [shuffle([0, 1, 2], rng), shuffle([0, 1, 2], rng), shuffle([0, 1, 2], rng)];
}

/** A complete grid. Band, stack, row, column, and digit shuffles keep it valid. */
export function completeGrid(rng) {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  const band = shuffle([0, 1, 2], rng);
  const stack = shuffle([0, 1, 2], rng);
  const rowIn = bands(rng);
  const colIn = bands(rng);
  const transpose = rng() < 0.5;
  const grid = Array(81).fill(0);
  for (let r = 0; r < 9; r++) {
    const br = Math.floor(r / 3);
    const rr = band[br] * 3 + rowIn[br][r % 3];
    for (let c = 0; c < 9; c++) {
      const bc = Math.floor(c / 3);
      const cc = stack[bc] * 3 + colIn[bc][c % 3];
      const value = digits[BASE[rr * 9 + cc] - 1];
      if (transpose) grid[c * 9 + r] = value;
      else grid[r * 9 + c] = value;
    }
  }
  return grid;
}

function tryClear(puzzle, index) {
  if (!puzzle[index]) return false;
  const value = puzzle[index];
  puzzle[index] = 0;
  if (solutionCount(puzzle, 2) === 1) return true;
  puzzle[index] = value;
  return false;
}

/** Lift clues in rotational pairs while the solution stays unique. */
export function dig(solution, rng, target) {
  const puzzle = solution.slice();
  let filled = 81;
  const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rng);
  for (const i of order) {
    if (filled <= target) break;
    const other = 80 - i;
    if (i === other) {
      if (tryClear(puzzle, i)) filled--;
      continue;
    }
    const a = puzzle[i];
    const b = puzzle[other];
    if (!a && !b) continue;
    if (a && b && filled - 2 >= target) {
      puzzle[i] = 0;
      puzzle[other] = 0;
      if (solutionCount(puzzle, 2) === 1) { filled -= 2; continue; }
      puzzle[i] = a;
      puzzle[other] = b;
    }
    if (filled > target && tryClear(puzzle, i)) filled--;
    if (filled > target && tryClear(puzzle, other)) filled--;
  }
  return puzzle;
}

/** Today's puzzle is Medium. Practice appends the difficulty to the seed. */
export function makePuzzle(puzzleId, levelId) {
  const level = levelById(LEVEL_IDS.has(levelId) ? levelId : "medium");
  const rng = seededRandom("sudoku", `${puzzleId}:${level.id}`);
  const solution = completeGrid(rng);
  const givens = dig(solution, rng, level.givens);
  return { level, solution, givens };
}

export function givenCount(givens) {
  return givens.reduce((n, v) => n + (v ? 1 : 0), 0);
}

export function lockedAt(state, index) {
  return state.givens[index] !== 0 || state.hinted.includes(index);
}

export function isSolved(state) {
  for (let i = 0; i < 81; i++) if (state.values[i] !== state.solution[i]) return false;
  return true;
}

function clearPeerNotes(state, index, digit) {
  const bit = 1 << digit;
  for (const peer of PEERS[index]) state.notes[peer] &= ~bit;
}

function pushUndo(state, index, extra) {
  state.undo.push({
    i: index,
    value: state.values[index],
    notes: state.notes[index],
    ...extra,
  });
  if (state.undo.length > 80) state.undo.shift();
}

export function freshState(built) {
  return {
    v: 1,
    level: built.level.id,
    givens: built.givens.slice(),
    solution: built.solution.slice(),
    values: built.givens.slice(),
    notes: Array(81).fill(0),
    hinted: [],
    mistakes: 0,
    hints: 0,
    undo: [],
    status: "playing",
    elapsed: 0,
    selected: built.givens.findIndex((v) => !v),
    notesMode: false,
  };
}

export function repair(saved, built) {
  if (!saved || saved.v !== 1 || saved.level !== built.level.id) return freshState(built);
  if (!Array.isArray(saved.givens) || saved.givens.length !== 81) return freshState(built);
  if (!Array.isArray(saved.solution) || saved.solution.length !== 81) return freshState(built);
  if (saved.givens.some((v, i) => v !== built.givens[i])) return freshState(built);
  const values = Array.from({ length: 81 }, (_, i) => {
    const n = saved.values?.[i];
    if (saved.givens[i]) return saved.givens[i];
    return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 0;
  });
  const notes = Array.from({ length: 81 }, (_, i) => {
    const n = saved.notes?.[i];
    return Number.isInteger(n) && n >= 0 && n <= ALL ? n & ALL : 0;
  });
  const hinted = Array.isArray(saved.hinted) ? saved.hinted.filter((n) => Number.isInteger(n) && n >= 0 && n < 81 && !saved.givens[n]) : [];
  for (const i of hinted) values[i] = saved.solution[i];
  let status = saved.status === "won" || saved.status === "lost" ? saved.status : "playing";
  if (values.every((v, i) => v === saved.solution[i])) status = "won";
  return {
    v: 1,
    level: built.level.id,
    givens: built.givens.slice(),
    solution: built.solution.slice(),
    values,
    notes,
    hinted,
    mistakes: Number.isInteger(saved.mistakes) && saved.mistakes >= 0 ? saved.mistakes : 0,
    hints: Number.isInteger(saved.hints) && saved.hints >= 0 ? saved.hints : 0,
    undo: Array.isArray(saved.undo) ? saved.undo.filter((step) => (
      step && Number.isInteger(step.i) && step.i >= 0 && step.i < 81
      && Number.isInteger(step.value) && step.value >= 0 && step.value <= 9
      && Number.isInteger(step.notes) && step.notes >= 0 && step.notes <= ALL
    )).slice(-80) : [],
    status,
    elapsed: Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0,
    selected: Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < 81 ? saved.selected : 0,
    notesMode: !!saved.notesMode,
  };
}

export function applyDigit(state, index, digit, notesMode, limitOn) {
  if (state.status !== "playing" || index < 0 || index > 80 || digit < 1 || digit > 9) return "noop";
  if (lockedAt(state, index)) return "noop";
  if (notesMode) {
    if (state.values[index]) return "noop";
    pushUndo(state, index, {});
    state.notes[index] ^= 1 << digit;
    return "note";
  }
  if (state.values[index] === digit) return "noop";
  pushUndo(state, index, { mistake: digit !== state.solution[index] });
  state.values[index] = digit;
  state.notes[index] = 0;
  if (digit === state.solution[index]) {
    clearPeerNotes(state, index, digit);
    if (isSolved(state)) { state.status = "won"; return "win"; }
    return "ok";
  }
  state.mistakes++;
  if (limitOn && state.mistakes >= MISTAKE_LIMIT) { state.status = "lost"; return "lose"; }
  return "mistake";
}

export function applyErase(state, index) {
  if (state.status !== "playing" || index < 0 || lockedAt(state, index)) return "noop";
  if (!state.values[index] && !state.notes[index]) return "noop";
  pushUndo(state, index, {});
  state.values[index] = 0;
  state.notes[index] = 0;
  return "erase";
}

export function applyUndo(state) {
  if (state.status !== "playing" || !state.undo.length) return "noop";
  const step = state.undo.pop();
  state.values[step.i] = step.value;
  state.notes[step.i] = step.notes;
  if (step.mistake) state.mistakes = Math.max(0, state.mistakes - 1);
  if (step.hint) {
    state.hints = Math.max(0, state.hints - 1);
    state.hinted = state.hinted.filter((n) => n !== step.i);
  }
  return "undo";
}

export function hintIndex(state) {
  const selected = state.selected;
  if (selected >= 0 && selected < 81 && !lockedAt(state, selected) && state.values[selected] !== state.solution[selected]) {
    return selected;
  }
  for (let i = 0; i < 81; i++) {
    if (!lockedAt(state, i) && state.values[i] !== state.solution[i]) return i;
  }
  return -1;
}

export function applyHint(state) {
  if (state.status !== "playing") return "noop";
  const index = hintIndex(state);
  if (index < 0) return "noop";
  pushUndo(state, index, { hint: true });
  state.values[index] = state.solution[index];
  state.notes[index] = 0;
  clearPeerNotes(state, index, state.solution[index]);
  if (!state.hinted.includes(index)) state.hinted.push(index);
  state.hints++;
  if (isSolved(state)) { state.status = "won"; return "win"; }
  return "hint";
}

export function clockText(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function resultBucket(state) {
  if (state.status !== "won") return "X";
  if (state.mistakes >= 3) return "3";
  return String(state.mistakes);
}

export function shareText({ puzzle, level, state }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My NUMBERS! Sudoku ${puzzle.number}`
    : "Oh My NUMBERS! Sudoku";
  const mark = state.status === "won" ? clockText(state.elapsed) : "X";
  const lines = [head, `${level.name} · ${mark}`, `Mistakes: ${state.mistakes}`];
  if (state.hints) lines.push(`💡${state.hints}`);
  return lines.join("\n");
}
