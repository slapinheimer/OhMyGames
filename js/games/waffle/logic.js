// Classic waffle: six interlocking 5-letter words, 15 swaps, five stars at par 10.
// Puzzles are built from our answer list. A round is a pure function of the puzzle id.
import { randInt, pick, shuffle, seededRandom } from "../../core/rng.js";

export const SWAPS = 15;
export const PAR = 10;
export const STAR_WORDS = ["Just made it", "One star", "Not bad", "Nice", "Great", "Perfect"];

export const ACROSS_ROWS = [0, 2, 4];
export const DOWN_COLS = [0, 2, 4];

/** The 21 filled squares, row-major. Holes are (1,1), (1,3), (3,1), (3,3). */
export const CELLS = [];
const indexAt = Array.from({ length: 5 }, () => Array(5).fill(-1));
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    if (ACROSS_ROWS.includes(r) || DOWN_COLS.includes(c)) {
      indexAt[r][c] = CELLS.length;
      CELLS.push({ r, c });
    }
  }
}

/** Six words as indexes into the 21-letter string: three across, then three down. */
const WORD_SLOTS = [
  ...ACROSS_ROWS.map((r) => [0, 1, 2, 3, 4].map((c) => indexAt[r][c])),
  ...DOWN_COLS.map((c) => [0, 1, 2, 3, 4].map((r) => indexAt[r][c])),
];

const N = CELLS.length;
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];

/** Stars still available after this many swaps. Par 10 is five stars; 15 and solved is zero. */
export function starsFor(swaps) {
  return Math.max(0, 5 - Math.max(0, swaps - PAR));
}

/**
 * Green means the letter matches the solution in that square.
 * Yellow and gray are scored per word, Wordle-style: greens consume copies,
 * then leftover solution letters are claimed left to right or top to bottom.
 * A square in two words is yellow when either word claims it.
 */
export function colors(board, solution) {
  const correct = [];
  for (let i = 0; i < N; i++) correct.push(board[i] === solution[i]);
  const present = Array(N).fill(false);
  for (const slots of WORD_SLOTS) {
    const remaining = {};
    for (const i of slots) {
      if (correct[i]) continue;
      remaining[solution[i]] = (remaining[solution[i]] || 0) + 1;
    }
    for (const i of slots) {
      if (correct[i]) continue;
      const ch = board[i];
      if (remaining[ch] > 0) {
        present[i] = true;
        remaining[ch]--;
      }
    }
  }
  return correct.map((ok, i) => (ok ? "correct" : present[i] ? "present" : "absent"));
}

/** 21-letter solution, or null when an intersection disagrees. */
export function solutionFrom(across, down) {
  let out = "";
  for (const { r, c } of CELLS) {
    const a = ACROSS_ROWS.includes(r) ? across[ACROSS_ROWS.indexOf(r)][c] : "";
    const d = DOWN_COLS.includes(c) ? down[DOWN_COLS.indexOf(c)][r] : "";
    if (a && d && a !== d) return null;
    const ch = a || d;
    if (!ch) return null;
    out += ch;
  }
  return out.length === N ? out : null;
}

export function readWords(board) {
  const words = WORD_SLOTS.map((slots) => slots.map((i) => board[i]).join(""));
  return { across: words.slice(0, 3), down: words.slice(3) };
}

function cycleCount(assign) {
  const seen = new Uint8Array(N);
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (seen[i]) continue;
    count++;
    let j = i;
    let guard = 0;
    while (!seen[j] && guard++ <= N) {
      seen[j] = 1;
      j = assign[j];
    }
  }
  return count;
}

/**
 * True when some assignment of duplicate letters solves in 7 swaps or fewer.
 * Null when the search is too wide to run; the caller keeps the 10-swap build.
 */
function tooEasy(start, solution) {
  const targets = {};
  const sources = {};
  for (let i = 0; i < N; i++) {
    (targets[solution[i]] ||= []).push(i);
    (sources[start[i]] ||= []).push(i);
  }
  let space = 1;
  const groups = [];
  const assign = Array(N).fill(-1);
  for (const ch of Object.keys(targets)) {
    const t = targets[ch];
    const s = sources[ch];
    if (!s || s.length !== t.length) return true;
    if (t.length === 1) assign[s[0]] = t[0];
    else {
      space *= FACT[t.length] || Infinity;
      if (space > 200000) return null;
      groups.push({ s, t });
    }
  }
  if (!groups.length) return false;
  let easy = false;
  const walk = (g) => {
    if (easy) return;
    if (g === groups.length) {
      if (N - cycleCount(assign) <= 7) easy = true;
      return;
    }
    const { s, t } = groups[g];
    const used = Array(t.length).fill(false);
    const place = (k) => {
      if (easy) return;
      if (k === s.length) { walk(g + 1); return; }
      for (let i = 0; i < t.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        assign[s[k]] = t[i];
        place(k + 1);
        used[i] = false;
      }
    };
    place(0);
  };
  walk(0);
  return easy;
}

/** A 21-letter start with 11 cycles (10 swaps) and 5–8 letters already in place. */
function constructedStart(solution, rng) {
  const fixedCount = 5 + randInt(rng, 4);
  const cyclesNeeded = 11 - fixedCount;
  const lengths = Array(cyclesNeeded).fill(2);
  for (let extra = fixedCount - 1; extra > 0; extra--) lengths[randInt(rng, lengths.length)]++;
  const positions = shuffle([...Array(N).keys()], rng);
  const origin = Array(N);
  for (let i = 0; i < fixedCount; i++) origin[positions[i]] = positions[i];
  let cursor = fixedCount;
  for (const len of lengths) {
    const cycle = positions.slice(cursor, cursor + len);
    cursor += len;
    for (let i = 0; i < len; i++) origin[cycle[i]] = cycle[(i + 1) % len];
  }
  for (let i = 0; i < N; i++) {
    if (origin[i] !== i && solution[origin[i]] === solution[i]) return null;
  }
  if (cycleCount(origin) !== 11) return null;
  return origin.map((o) => solution[o]).join("");
}

function fallbackStart(solution, rng) {
  let best = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const order = shuffle([...Array(N).keys()], rng);
    const origin = [...Array(N).keys()];
    const used = new Set();
    let pairs = 0;
    for (let i = 0; i < N && pairs < 10; i++) {
      const a = order[i];
      if (used.has(a)) continue;
      for (let j = i + 1; j < N; j++) {
        const b = order[j];
        if (used.has(b) || solution[a] === solution[b]) continue;
        origin[a] = b;
        origin[b] = a;
        used.add(a);
        used.add(b);
        pairs++;
        break;
      }
    }
    if (pairs < 8) continue;
    const start = origin.map((o) => solution[o]).join("");
    if (tooEasy(start, solution) === true) continue;
    if (pairs === 10) return start;
    best = start;
  }
  if (best) return best;
  const shuffled = shuffle([...solution], rng).join("");
  return shuffled === solution ? solution.slice(1) + solution[0] : shuffled;
}

export function scramble(solution, rng) {
  for (let i = 0; i < 40; i++) {
    const start = constructedStart(solution, rng);
    if (!start) continue;
    if (tooEasy(start, solution) === true) continue;
    return start;
  }
  return fallbackStart(solution, rng);
}

let indexCache = null;
function indexes(words) {
  if (indexCache && indexCache.words === words) return indexCache;
  const byFirst = {};
  const byEnds = {};
  for (const w of words) {
    (byFirst[w[0]] ||= []).push(w);
    (byEnds[w[0] + w[2] + w[4]] ||= []).push(w);
  }
  indexCache = { words, byFirst, byEnds };
  return indexCache;
}

function takeGrid(a0, d0, d1, d2, byEnds) {
  const used = new Set([a0, d0, d1, d2]);
  if (used.size < 4) return null;
  const mids = (byEnds[d0[2] + d1[2] + d2[2]] || []).filter((w) => !used.has(w));
  if (!mids.length) return null;
  return { used, mids, bots: byEnds[d0[4] + d1[4] + d2[4]] || [] };
}

function finishGrid(a0, d0, d1, d2, a1, a2) {
  const across = [a0, a1, a2];
  const down = [d0, d1, d2];
  const solution = solutionFrom(across, down);
  if (!solution) return null;
  if (new Set([...across, ...down]).size < 6) return null;
  return { across, down, solution };
}

function findGrid(words, rng) {
  const { byFirst, byEnds } = indexes(words);
  const once = () => {
    const a0 = pick(rng, words);
    const A = byFirst[a0[0]];
    const B = byFirst[a0[2]];
    const C = byFirst[a0[4]];
    if (!A || !B || !C) return null;
    const d0 = pick(rng, A);
    const d1 = pick(rng, B);
    const d2 = pick(rng, C);
    const mid = takeGrid(a0, d0, d1, d2, byEnds);
    if (!mid) return null;
    const a1 = pick(rng, mid.mids);
    mid.used.add(a1);
    const bots = mid.bots.filter((w) => !mid.used.has(w));
    if (!bots.length) return null;
    return finishGrid(a0, d0, d1, d2, a1, pick(rng, bots));
  };
  for (let i = 0; i < 8000; i++) {
    const grid = once();
    if (grid) return grid;
  }
  for (const a0 of shuffle(words, rng).slice(0, 80)) {
    const A = byFirst[a0[0]] || [];
    const B = byFirst[a0[2]] || [];
    const C = byFirst[a0[4]] || [];
    if (!A.length || !B.length || !C.length) continue;
    const da = shuffle(A, rng).slice(0, 5);
    const db = shuffle(B, rng).slice(0, 5);
    const dc = shuffle(C, rng).slice(0, 5);
    for (const d0 of da) {
      for (const d1 of db) {
        for (const d2 of dc) {
          const mid = takeGrid(a0, d0, d1, d2, byEnds);
          if (!mid) continue;
          for (const a1 of mid.mids) {
            for (const a2 of mid.bots) {
              if (a2 === a1 || mid.used.has(a2)) continue;
              const grid = finishGrid(a0, d0, d1, d2, a1, a2);
              if (grid) return grid;
            }
          }
        }
      }
    }
  }
  return null;
}

/** { across, down, solution, start } for a currentPuzzle() id. */
export function puzzleFor(puzzle, words) {
  const list = words.filter((w) => w.length === 5);
  const rng = seededRandom("waffle", puzzle.id);
  const grid = findGrid(list, rng);
  if (!grid) throw new Error("Could not build a waffle");
  const start = scramble(grid.solution, rng);
  return { ...grid, start };
}

/**
 * A helpful swap [i, j] for a hint, or null when solved. Prefers a swap that puts both
 * letters in their spots, otherwise one that fixes one letter. Works for any board size
 * (Deluxe Waffle uses it too): only squares not yet right are ever swapped.
 */
export function hintSwap(board, solution) {
  const open = [...board].map((_, i) => i).filter((i) => board[i] !== solution[i]);
  for (const i of open) {
    for (const j of open) {
      if (i < j && board[j] === solution[i] && board[i] === solution[j]) return [i, j];
    }
  }
  for (const i of open) {
    const j = open.find((k) => board[k] === solution[i]);
    if (j != null) return [i, j];
  }
  return null;
}

export function shareText({ puzzle, won, stars, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Waffle ${puzzle.number}`
    : "Oh My WORDS! Waffle";
  const tip = hints ? ` 💡${hints}` : "";
  if (!won) return `${head}\nX/5${tip}`;
  return `${head} ${stars}/5${tip}\n${"⭐".repeat(stars)}${"☆".repeat(5 - stars)}`;
}
