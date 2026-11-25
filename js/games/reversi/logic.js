// Reversi: you (dark) against the computer (light) on 8×8. Place a disc so it traps a straight
// line of the other color between it and one of yours; the trapped discs turn over. A player
// with no move passes. When neither can move, the most discs wins.
//
// The board is an array of 64: 0 empty, 1 dark, 2 light. The computer searches with alpha-beta
// and scores positions by corners, edges, mobility and square weights; at the end it counts discs.
import { seededRandom } from "../../core/rng.js";

export const N = 8;
export const DARK = 1;
export const LIGHT = 2;
export const other = (p) => 3 - p;

/** depth: moves the computer looks ahead. exact: empties left when it plays the end perfectly. slip: chance of a weaker move. */
export const LEVELS = [
  { id: "easy", name: "Easy", depth: 1, exact: 0, slip: 0.45 },
  { id: "medium", name: "Medium", depth: 2, exact: 6, slip: 0.12 },
  { id: "hard", name: "Hard", depth: 4, exact: 10, slip: 0 },
  { id: "expert", name: "Expert", depth: 5, exact: 12, slip: 0 },
];
export const DEFAULT_LEVEL = "medium";
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
export const statsId = (level) => `reversi-${level}`;

/** Climb: each win moves the computer up a stage, from Easy to Expert in six steps. */
const CLIMB = [
  { depth: 1, exact: 0, slip: 0.45 }, { depth: 1, exact: 4, slip: 0.2 }, { depth: 2, exact: 6, slip: 0.1 },
  { depth: 3, exact: 8, slip: 0 }, { depth: 4, exact: 10, slip: 0 }, { depth: 5, exact: 12, slip: 0 },
];
export const climbRule = (stage) => CLIMB[Math.min(stage, CLIMB.length) - 1];

/** Win-margin buckets for the stats distribution. */
export const MARGIN_BANDS = ["Win 30+", "Win 10–29", "Win 1–9", "Draw", "Loss"];
export function marginBand(margin) {
  if (margin >= 30) return MARGIN_BANDS[0];
  if (margin >= 10) return MARGIN_BANDS[1];
  if (margin > 0) return MARGIN_BANDS[2];
  if (margin === 0) return MARGIN_BANDS[3];
  return MARGIN_BANDS[4];
}

export function startBoard() {
  const b = new Array(N * N).fill(0);
  b[27] = b[36] = LIGHT;
  b[28] = b[35] = DARK;
  return b;
}

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/** Discs that turn over if player p plays at i (empty if the move isn't legal). */
export function flips(board, i, p) {
  if (board[i]) return [];
  const r0 = i >> 3;
  const c0 = i & 7;
  const out = [];
  const o = other(p);
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    const run = [];
    while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === o) {
      run.push(r * N + c);
      r += dr;
      c += dc;
    }
    if (run.length && r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === p) out.push(...run);
  }
  return out;
}

export function legalMoves(board, p) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (!board[i] && flips(board, i, p).length) out.push(i);
  return out;
}

/** A new board with p's move at i played. */
export function play(board, i, p) {
  const next = board.slice();
  next[i] = p;
  for (const j of flips(board, i, p)) next[j] = p;
  return next;
}

export const count = (board, p) => board.reduce((n, v) => n + (v === p), 0);
export const gameOver = (board) => !legalMoves(board, DARK).length && !legalMoves(board, LIGHT).length;

// Square weights: corners are gold, the squares next to an empty corner give it away.
const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];
const CORNERS = [[0, 1, 8, 9], [7, 6, 15, 14], [56, 57, 48, 49], [63, 62, 55, 54]];

/** How good the board is for p (higher is better). */
function evaluate(board, p) {
  const o = other(p);
  let score = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i] === p) score += W[i];
    else if (board[i] === o) score -= W[i];
  }
  // Once a corner is taken, the squares next to it are safe.
  for (const [corner, ...near] of CORNERS) {
    if (!board[corner]) continue;
    for (const j of near) {
      if (board[j] === p) score -= W[j];
      else if (board[j] === o) score += W[j];
    }
  }
  const mine = legalMoves(board, p).length;
  const theirs = legalMoves(board, o).length;
  if (mine + theirs) score += (40 * (mine - theirs)) / (mine + theirs + 2);
  return score;
}

const empties = (board) => board.reduce((n, v) => n + !v, 0);

/** Order moves corners first, then by square weight, so alpha-beta cuts sooner. */
const ordered = (moves) => moves.slice().sort((a, b) => W[b] - W[a]);

let nodes = 0;
const BUDGET = 400000;

function search(board, p, depth, alpha, beta, exact) {
  nodes++;
  const moves = legalMoves(board, p);
  if (!moves.length) {
    if (!legalMoves(board, other(p)).length) {
      const diff = count(board, p) - count(board, other(p));
      return diff * 1000;
    }
    return -search(board, other(p), depth, -beta, -alpha, exact);
  }
  if ((!exact && depth <= 0) || nodes > BUDGET) {
    if (exact) return (count(board, p) - count(board, other(p))) * 1000;
    return evaluate(board, p);
  }
  let best = -Infinity;
  for (const m of ordered(moves)) {
    const v = -search(play(board, m, p), other(p), depth - 1, -beta, -alpha, exact);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The computer's move for player p, or -1 if it must pass. rule: { depth, exact, slip }.
 * seed makes ties and slips the same on every reload.
 */
export function chooseMove(board, p, rule, seed = "") {
  const moves = legalMoves(board, p);
  if (!moves.length) return -1;
  if (moves.length === 1) return moves[0];
  const rng = seededRandom("reversi", `${seed}:${64 - empties(board)}`);
  const exact = rule.exact > 0 && empties(board) <= rule.exact;
  nodes = 0;
  const scored = ordered(moves).map((m) => ({
    m, v: -search(play(board, m, p), other(p), rule.depth - 1, -Infinity, Infinity, exact),
  }));
  scored.sort((a, b) => b.v - a.v);
  // Weaker levels sometimes take a move from the rest of the field.
  if (rule.slip && rng() < rule.slip) {
    const rest = scored.slice(1, Math.max(2, Math.ceil(scored.length / 2)));
    return rest[Math.floor(rng() * rest.length)].m;
  }
  const top = scored.filter((s) => s.v === scored[0].v);
  return top[Math.floor(rng() * top.length)].m;
}

/** A strong move for the player, for hints. */
export const hintMove = (board, p) => chooseMove(board, p, { depth: 4, exact: 10, slip: 0 }, "hint");

export function shareText({ puzzle, level, dark, light, hints = 0 }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  const result = dark > light ? "Won" : dark < light ? "Lost" : "Drew";
  return `Oh My PATTERNS! Reversi ${label}${tip}\n⚫ ${result} ${dark}–${light} vs ${level === "climb" ? "Climb" : levelById(level).name}`;
}
