// Crowns: place one crown in every row, every column and every colored region.
// Crowns may not touch, not even diagonally. Every board has exactly one solution.
import { randInt, seededRandom, shuffle } from "../../core/rng.js";
import { grade } from "./grade.js";

/** Board sizes the player can pick. Each has its own daily board, progress and stats. */
export const SIZES = [6, 8, 10];
export const DEFAULT_SIZE = 8;
/** Difficulty levels, by the hardest kind of step a board needs (see grade.js). */
export const LEVELS = [
  { id: "easy", name: "Easy", min: 1, max: 2 },
  { id: "medium", name: "Medium", min: 3, max: 3 },
  { id: "hard", name: "Hard", min: 4, max: 4 },
  { id: "expert", name: "Expert", min: 5, max: 5 },
];
export const DEFAULT_LEVEL = "medium";
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
/** Progress and stats are kept per size and level. */
export const boardKey = (size, level) => `${size}-${level}`;
export const statsId = (size, level) => `crowns-${size}-${level}`;
const ATTEMPTS = 2000;

export const TIME_BANDS = ["<1m", "1–2m", "2–4m", "4–8m", "8m+"];
export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 120) return TIME_BANDS[1];
  if (secs < 240) return TIME_BANDS[2];
  if (secs < 480) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

const neighbors4 = (size, i) => {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
};

/**
 * Count solutions up to `limit`. regions[i] is the region of cell i (0..size-1).
 * Returns { count, first, second } where first/second are column-per-row arrays.
 */
export function solve(size, regions, limit = 2) {
  const cols = new Array(size).fill(-1);
  const usedCol = new Array(size).fill(false);
  const usedReg = new Array(size).fill(false);
  const found = [];
  const walk = (r) => {
    if (found.length >= limit) return;
    if (r === size) { found.push(cols.slice()); return; }
    for (let c = 0; c < size; c++) {
      if (usedCol[c]) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      const reg = regions[r * size + c];
      if (usedReg[reg]) continue;
      cols[r] = c; usedCol[c] = usedReg[reg] = true;
      walk(r + 1);
      usedCol[c] = usedReg[reg] = false;
    }
  };
  walk(0);
  return { count: found.length, first: found[0] || null, second: found[1] || null };
}

/** A random crown layout: a column per row, no shared columns, no touching. */
function randomCrowns(rng, size) {
  const cols = [];
  const used = new Array(size).fill(false);
  const walk = (r) => {
    if (r === size) return true;
    for (const c of shuffle(Array.from({ length: size }, (_, k) => k), rng)) {
      if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols[r] = c; used[c] = true;
      if (walk(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  walk(0);
  return cols;
}

/** Grow one region from each crown with a random flood fill. */
function growRegions(rng, size, crowns) {
  const regions = new Array(size * size).fill(-1);
  const frontier = [];
  crowns.forEach((c, r) => {
    const i = r * size + c;
    regions[i] = r;
    frontier.push(i);
  });
  while (frontier.length) {
    const k = randInt(rng, frontier.length);
    const i = frontier[k];
    const open = neighbors4(size, i).filter((j) => regions[j] < 0);
    if (!open.length) { frontier.splice(k, 1); continue; }
    const j = open[randInt(rng, open.length)];
    regions[j] = regions[i];
    frontier.push(j);
  }
  return regions;
}

/** Is region `reg` still connected if cell `skip` leaves it? */
function connectedWithout(size, regions, reg, skip) {
  const cells = [];
  for (let i = 0; i < regions.length; i++) if (regions[i] === reg && i !== skip) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const j of neighbors4(size, i)) {
      if (j !== skip && regions[j] === reg && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

/**
 * Make the solution unique: while another solution exists, move one of its crown cells
 * (one that isn't a real crown) into a neighboring region. Returns regions or null.
 */
function makeUnique(rng, size, crowns, regions) {
  const real = new Set(crowns.map((c, r) => r * size + c));
  for (let step = 0; step < size * size * 3; step++) {
    const { count, first, second } = solve(size, regions, 2);
    if (count === 1) return regions;
    // `first` may be the real answer or the impostor; pick whichever differs from it.
    const other = first.every((c, r) => c === crowns[r]) ? second : first;
    const cells = shuffle(other.map((c, r) => r * size + c).filter((i) => !real.has(i)), rng);
    let moved = false;
    for (const i of cells) {
      const options = shuffle(neighbors4(size, i).map((j) => regions[j]).filter((g) => g !== regions[i]), rng);
      if (!options.length || !connectedWithout(size, regions, regions[i], i)) continue;
      regions[i] = options[0];
      moved = true;
      break;
    }
    if (!moved) return null;
  }
  return null;
}

/**
 * { size, level, grade, regions, crowns (column per row) } for a currentPuzzle() id, size and
 * level. Draws unique boards until one grades inside the level; if none does in ATTEMPTS
 * tries, keeps the one that came closest.
 */
export function boardFor(puzzle, size = DEFAULT_SIZE, level = DEFAULT_LEVEL) {
  const { min, max } = levelById(level);
  const rng = seededRandom("crowns", `${puzzle.id}:${size}:${level}`);
  let closest = null;
  for (let t = 0; t < ATTEMPTS; t++) {
    const crowns = randomCrowns(rng, size);
    const regions = makeUnique(rng, size, crowns, growRegions(rng, size, crowns));
    if (!regions) continue;
    const g = grade(size, regions);
    const board = { size, level, grade: g, regions, crowns };
    if (g >= min && g <= max) return board;
    const off = g === Infinity ? 99 : g < min ? min - g : g - max;
    if (!closest || off < closest.off) closest = { off, board };
  }
  return closest.board;
}

/**
 * Crowns that break a rule (share a row, column or region, or touch). marks[i] is "" | "x" | "c".
 * Returns a Set of cell indexes.
 */
export function conflicts(board, marks) {
  const { size, regions } = board;
  const crowns = [];
  marks.forEach((m, i) => { if (m === "c") crowns.push(i); });
  const bad = new Set();
  for (let a = 0; a < crowns.length; a++) {
    for (let b = a + 1; b < crowns.length; b++) {
      const i = crowns[a];
      const j = crowns[b];
      const ri = Math.floor(i / size), ci = i % size, rj = Math.floor(j / size), cj = j % size;
      if (ri === rj || ci === cj || regions[i] === regions[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Cells a crown rules out (same row, column, region, or touching), for the Auto ✕ option. */
export function blocked(board, marks) {
  const { size, regions } = board;
  const out = new Set();
  marks.forEach((m, i) => {
    if (m !== "c") return;
    const r = Math.floor(i / size), c = i % size;
    for (let j = 0; j < size * size; j++) {
      if (j === i) continue;
      const rj = Math.floor(j / size), cj = j % size;
      if (rj === r || cj === c || regions[j] === regions[i] || (Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1)) out.add(j);
    }
  });
  return out;
}

export const solved = (board, marks) => board.crowns.every((c, r) => marks[r * board.size + c] === "c")
  && marks.filter((m) => m === "c").length === board.size;

/**
 * Next hint: a misplaced crown to remove (wrong: true), else a crown to place, choosing the
 * region with the fewest open cells. Returns { cell, wrong } or null.
 */
export function nextHint(board, marks) {
  const { size, regions, crowns } = board;
  const answer = new Set(crowns.map((c, r) => r * size + c));
  for (let i = 0; i < marks.length; i++) if (marks[i] === "c" && !answer.has(i)) return { cell: i, wrong: true };
  let pick = null;
  for (const i of answer) {
    if (marks[i] === "c") continue;
    const open = marks.filter((m, j) => regions[j] === regions[i] && m !== "x").length;
    if (!pick || open < pick.open) pick = { cell: i, open };
  }
  return pick && { cell: pick.cell, wrong: false };
}

export function shareText({ puzzle, size, level, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My PATTERNS! Crowns ${label}${tip}\n👑 ${size}×${size} ${levelById(level).name} in ${formatTime(time)}`;
}
