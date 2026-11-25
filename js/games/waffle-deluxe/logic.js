// Deluxe waffle: eight interlocking 7-letter words, 25 swaps, five stars at par 20.
// Puzzles are built from our common-word list. A round is a pure function of the puzzle id.
import { randInt, shuffle, seededRandom } from "../../core/rng.js";

export const SWAPS = 25;
export const PAR = 20;
export const STAR_WORDS = ["Just made it", "One star", "Not bad", "Nice", "Great", "Perfect"];

export const ACROSS_ROWS = [0, 2, 4, 6];
export const DOWN_COLS = [0, 2, 4, 6];

/** The 40 filled squares, row-major. Holes are the nine odd-row, odd-column corners. */
export const CELLS = [];
const indexAt = Array.from({ length: 7 }, () => Array(7).fill(-1));
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 7; c++) {
    if (ACROSS_ROWS.includes(r) || DOWN_COLS.includes(c)) {
      indexAt[r][c] = CELLS.length;
      CELLS.push({ r, c });
    }
  }
}

/** Eight words as indexes into the 40-letter string: four across, then four down. */
const WORD_SLOTS = [
  ...ACROSS_ROWS.map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => indexAt[r][c])),
  ...DOWN_COLS.map((c) => [0, 1, 2, 3, 4, 5, 6].map((r) => indexAt[r][c])),
];

const N = CELLS.length;
const RANK_MAX = 15000;
// Leave strong swears and slurs out of the answer pool.
const BLOCK = new Set([
  "aroused", "buggers", "cocking", "condoms", "cripple", "dicking", "erotica", "faggots",
  "fuckers", "goddamn", "jackass", "midgets", "niggers", "nipples", "orgasms", "panties",
  "penises", "pissant", "pissing", "pussies", "rapists", "redneck", "scumbag", "seduced",
  "shagged", "spastic", "sucking", "titties", "vaginal", "vaginas",
]);

/** Stars still available after this many swaps. Par 20 is five stars; 25 and solved is zero. */
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

/** 40-letter solution, or null when an intersection disagrees. */
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
  return { across: words.slice(0, 4), down: words.slice(4) };
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
 * True when some assignment of duplicate letters solves in 17 swaps or fewer.
 * Null when the search is too wide to run; the caller keeps the 20-swap build.
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
      let fact = 1;
      for (let i = 2; i <= t.length; i++) fact *= i;
      space *= fact;
      if (space > 200000) return null;
      groups.push({ s, t });
    }
  }
  if (!groups.length) return false;
  let easy = false;
  const walk = (g) => {
    if (easy) return;
    if (g === groups.length) {
      if (N - cycleCount(assign) <= 17) easy = true;
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

/** A 40-letter start with 20 cycles (20 swaps) and 8–14 letters already in place. */
function constructedStart(solution, rng) {
  const fixedCount = 8 + randInt(rng, 7);
  const cyclesNeeded = 20 - fixedCount;
  const lengths = Array(cyclesNeeded).fill(2);
  for (let extra = fixedCount; extra > 0; extra--) lengths[randInt(rng, lengths.length)]++;
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
  if (cycleCount(origin) !== 20) return null;
  return origin.map((o) => solution[o]).join("");
}

function fallbackStart(solution, rng) {
  let best = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const order = shuffle([...Array(N).keys()], rng);
    const origin = [...Array(N).keys()];
    const used = new Set();
    let pairs = 0;
    for (let i = 0; i < N && pairs < 20; i++) {
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
    if (pairs < 16) continue;
    const start = origin.map((o) => solution[o]).join("");
    if (tooEasy(start, solution) === true) continue;
    if (pairs === 20) return start;
    best = start;
  }
  if (best) return best;
  const shuffled = shuffle([...solution], rng).join("");
  return shuffled === solution ? solution.slice(1) + solution[0] : shuffled;
}

export function scramble(solution, rng) {
  for (let i = 0; i < 160; i++) {
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
  const byPat = {};
  const pref3 = new Set();
  const byStart = {};
  for (const w of words) {
    const pat = w[0] + w[2] + w[4] + w[6];
    (byPat[pat] ||= []).push(w);
    pref3.add(pat.slice(0, 3));
    (byStart[w[0]] ||= []).push(w);
  }
  indexCache = { words, byPat, pref3, byStart };
  return indexCache;
}

function searchGrid(order, cap, howMany, index, rng) {
  const { byPat, pref3, byStart } = index;
  const limit = Math.min(howMany, order.length);
  for (let n = 0; n < limit; n++) {
    const a0 = order[n];
    const cols = [];
    let ok = true;
    for (const i of [0, 2, 4, 6]) {
      const cands = (byStart[a0[i]] || []).filter((w) => w !== a0);
      if (cands.length < 4) { ok = false; break; }
      cols.push(shuffle(cands, rng).slice(0, cap));
    }
    if (!ok) continue;
    let budget = 6000;
    for (const d0 of cols[0]) {
      for (const d1 of cols[1]) {
        if (d1 === d0) continue;
        const p2 = d0[2] + d1[2];
        const p4 = d0[4] + d1[4];
        const p6 = d0[6] + d1[6];
        const d2s = [];
        for (const d2 of cols[2]) {
          if (d2 === d0 || d2 === d1) continue;
          if (pref3.has(p2 + d2[2]) && pref3.has(p4 + d2[4]) && pref3.has(p6 + d2[6])) d2s.push(d2);
        }
        for (const d2 of d2s) {
          for (const d3 of cols[3]) {
            if (budget-- <= 0) break;
            if (d3 === d0 || d3 === d1 || d3 === d2) continue;
            const A1 = byPat[p2 + d2[2] + d3[2]];
            const A2 = byPat[p4 + d2[4] + d3[4]];
            const A3 = byPat[p6 + d2[6] + d3[6]];
            if (!A1 || !A2 || !A3) continue;
            const used = new Set([a0, d0, d1, d2, d3]);
            for (const a1 of A1) {
              if (used.has(a1)) continue;
              for (const a2 of A2) {
                if (a2 === a1 || used.has(a2)) continue;
                for (const a3 of A3) {
                  if (a3 === a1 || a3 === a2 || used.has(a3)) continue;
                  const across = [a0, a1, a2, a3];
                  const down = [d0, d1, d2, d3];
                  const solution = solutionFrom(across, down);
                  if (!solution) continue;
                  return { across, down, solution };
                }
              }
            }
          }
          if (budget <= 0) break;
        }
        if (budget <= 0) break;
      }
      if (budget <= 0) break;
    }
  }
  return null;
}

function findGrid(words, rng) {
  const index = indexes(words);
  const order = shuffle(words, rng);
  return searchGrid(order, 28, 80, index, rng) || searchGrid(order, 36, 160, index, rng);
}

/** Seven-letter answers common enough to recognize, swears left out. */
export function answerList(common) {
  const out = [];
  for (const [word, rank] of common) {
    if (word.length !== 7 || rank > RANK_MAX || BLOCK.has(word)) continue;
    out.push(word);
  }
  return out;
}

/** { across, down, solution, start } for a currentPuzzle() id. */
export function puzzleFor(puzzle, common) {
  const list = answerList(common);
  const rng = seededRandom("waffle-deluxe", puzzle.id);
  const grid = findGrid(list, rng);
  if (!grid) throw new Error("Could not build a deluxe waffle");
  const start = scramble(grid.solution, rng);
  return { ...grid, start };
}

export function shareText({ puzzle, won, stars, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Deluxe Waffle ${puzzle.number}`
    : "Oh My WORDS! Deluxe Waffle";
  const tip = hints ? ` 💡${hints}` : "";
  if (!won) return `${head}\nX/5${tip}`;
  return `${head} ${stars}/5${tip}\n${"⭐".repeat(stars)}${"☆".repeat(5 - stars)}`;
}
