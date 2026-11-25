// Twofold: slide a 4×4 board. Matching tiles that meet merge into their sum.
// New tiles come from seededRandom(game, "<puzzle id>#<step>"), so a puzzle deals the
// same tiles for the same moves and a reload replays exactly.
import { randInt, seededRandom } from "../../core/rng.js";

export const SIZE = 4;
export const N = 16;
export const TARGET = 2048;
export const DIRS = ["left", "right", "up", "down"];
export const ARROWS = { left: "←", right: "→", up: "↑", down: "↓" };

/** Top-tile buckets for the stats distribution. */
export const TILE_BANDS = ["≤128", "256", "512", "1024", "2048", "4096+"];

export function tileBand(top) {
  if (top >= 4096) return "4096+";
  if (top <= 128) return "≤128";
  return String(top);
}

const range = (n) => Array.from({ length: n }, (_, i) => i);
const ROWS = range(SIZE).map((r) => range(SIZE).map((c) => r * SIZE + c));
const COLS = range(SIZE).map((c) => range(SIZE).map((r) => r * SIZE + c));

/** Per direction: the lines of cell indices, each starting at the edge tiles slide toward. */
const LINES = {
  left: ROWS,
  right: ROWS.map((l) => l.slice().reverse()),
  up: COLS,
  down: COLS.map((l) => l.slice().reverse()),
};

/**
 * Slide every tile toward `dir`. Each tile merges at most once per move.
 * Returns { board, gained, moved, moves: [{ from, to }], merged: [cell] }.
 */
export function slide(board, dir) {
  const out = new Array(N).fill(0);
  const moves = [];
  const merged = [];
  let gained = 0;
  for (const line of LINES[dir]) {
    let next = 0;
    let open = false; // can the last placed tile still take a merge?
    for (const idx of line) {
      const v = board[idx];
      if (!v) continue;
      if (open && out[line[next - 1]] === v) {
        const to = line[next - 1];
        out[to] = v * 2;
        gained += v * 2;
        merged.push(to);
        moves.push({ from: idx, to });
        open = false;
      } else {
        const to = line[next++];
        out[to] = v;
        moves.push({ from: idx, to });
        open = true;
      }
    }
  }
  const moved = merged.length > 0 || moves.some((m) => m.from !== m.to);
  return { board: out, gained, moved, moves, merged };
}

/** Drop a 2 (90%) or 4 (10%) into an empty cell. Returns { board, cell, value } or null. */
export function spawn(board, rng) {
  const empty = range(N).filter((i) => !board[i]);
  if (!empty.length) return null;
  const cell = empty[randInt(rng, empty.length)];
  const value = rng() < 0.1 ? 4 : 2;
  const next = board.slice();
  next[cell] = value;
  return { board: next, cell, value };
}

export const spawnRng = (gameId, puzzleId, step) => seededRandom(gameId, `${puzzleId}#${step}`);

/** A fresh board with two tiles. */
export function startBoard(gameId, puzzleId) {
  let board = new Array(N).fill(0);
  for (const step of ["start-a", "start-b"]) board = spawn(board, spawnRng(gameId, puzzleId, step)).board;
  return board;
}

export function canMove(board) {
  for (let i = 0; i < N; i++) {
    if (!board[i]) return true;
    if (i % SIZE < SIZE - 1 && board[i] === board[i + 1]) return true;
    if (i < N - SIZE && board[i] === board[i + SIZE]) return true;
  }
  return false;
}

export const topTile = (board) => Math.max(0, ...board);

// ---------------------------------------------------------------- hints

// Snake-shaped weights reward big tiles packed along an edge, biggest in a corner.
const SNAKE = [15, 14, 13, 12, 8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3].map((w) => 4 ** (w / 3));
const SYMMETRIES = (() => {
  const maps = [];
  for (const flip of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      maps.push(range(N).map((i) => {
        let r = Math.floor(i / SIZE);
        let c = i % SIZE;
        if (flip) c = SIZE - 1 - c;
        for (let k = 0; k < rot; k++) [r, c] = [c, SIZE - 1 - r];
        return r * SIZE + c;
      }));
    }
  }
  return maps;
})();

function evaluate(board) {
  let best = -Infinity;
  for (const map of SYMMETRIES) {
    let s = 0;
    for (let i = 0; i < N; i++) s += board[map[i]] * SNAKE[i];
    if (s > best) best = s;
  }
  const empty = board.reduce((n, v) => n + (v ? 0 : 1), 0);
  return best + empty * topTile(board) * 2;
}

/** Best value reachable with one more move, averaged over where the next tile lands. */
function expectAfter(board) {
  const empty = range(N).filter((i) => !board[i]);
  if (!empty.length) return evaluate(board);
  let total = 0;
  for (const cell of empty) {
    for (const [value, p] of [[2, 0.9], [4, 0.1]]) {
      const b = board.slice();
      b[cell] = value;
      let best = -Infinity;
      for (const dir of DIRS) {
        const r = slide(b, dir);
        if (r.moved) best = Math.max(best, evaluate(r.board));
      }
      total += p * (best === -Infinity ? 0 : best);
    }
  }
  return total / empty.length;
}

/** The suggested direction for a hint, or null when nothing moves. */
export function bestMove(board) {
  let pick = null;
  let best = -Infinity;
  for (const dir of DIRS) {
    const r = slide(board, dir);
    if (!r.moved) continue;
    const score = expectAfter(r.board);
    if (score > best) {
      best = score;
      pick = dir;
    }
  }
  return pick;
}

// ---------------------------------------------------------------- share

const emoji = (v) => (!v ? "⬜" : v <= 16 ? "🟦" : v <= 128 ? "🟪" : v <= 1024 ? "🟥" : "🟨");

export function shareText({ puzzle, score, top, hints = 0, board }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  const rows = ROWS.map((row) => row.map((i) => emoji(board[i])).join(""));
  return [
    `Oh My NUMBERS! Twofold ${label}${tip}`,
    `Score ${score.toLocaleString("en-US")} · Top tile ${top.toLocaleString("en-US")}`,
    ...rows,
  ].join("\n");
}
