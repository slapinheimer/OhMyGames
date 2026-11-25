// Classic Quordle rules: four 5-letter words, nine shared guesses.
// Each guess is scored on every still-unsolved board. A board stops
// taking guesses once its word is found.
import { mulberry32, hashString, shuffle, seededRandom } from "../../core/rng.js";
import { scoreGuess } from "../wordle/logic.js";

export const WORD_LEN = 5;
export const BOARDS = 4;
export const MAX_GUESSES = 9;
export const WIN_WORDS = ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew", "Solid", "Close", "Saved"];

const RANK = { absent: 1, present: 2, correct: 3 };
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

export { scoreGuess };

/** Rows actually played on one board (stops at the solving guess). */
export function boardRows(guesses, answer) {
  const rows = [];
  for (const guess of guesses) {
    rows.push({ guess, result: scoreGuess(guess, answer) });
    if (guess === answer) break;
  }
  return rows;
}

export const boardSolved = (rows, answer) => rows.length > 0 && rows[rows.length - 1].guess === answer;

/**
 * Four distinct answers. Dailies walk a fixed permutation four words at a
 * time, so every device gets the same set and days don't repeat quickly.
 * Practice puzzles are a seeded draw from the puzzle id.
 */
export function answersFor(puzzle, list) {
  if (puzzle.isDaily && puzzle.number != null) return dailyAnswers(list, puzzle.number);
  const rng = seededRandom("quordle", puzzle.id);
  return shuffle(list, rng).slice(0, BOARDS);
}

let orderCache = null;
function dailyAnswers(list, number) {
  if (!orderCache || orderCache.n !== list.length) {
    const idx = shuffle(list.map((_, i) => i), mulberry32(hashString("omw-quordle-daily-order-v1")));
    orderCache = { n: list.length, idx };
  }
  const n = list.length;
  const start = (((number - 1) * BOARDS) % n + n) % n;
  const out = [];
  for (let i = 0; i < BOARDS; i++) out.push(list[orderCache.idx[(start + i) % n]]);
  return out;
}

/**
 * Per-letter quadrant colors, board order top-left, top-right,
 * bottom-left, bottom-right. Solved boards are omitted while still playing
 * so their quarters clear. A letter absent on every open board is "dead".
 * Returns { quarters: { ch: (state|null)[4] }, dead: { ch: true } }.
 */
export function keyboardInfo(guesses, answers, hideSolved) {
  const quarters = {};
  const solved = answers.map((answer) => boardSolved(boardRows(guesses, answer), answer));
  const open = solved.map((s) => !(hideSolved && s));
  for (let b = 0; b < BOARDS; b++) {
    if (!open[b]) continue;
    for (const { guess, result } of boardRows(guesses, answers[b])) {
      for (let i = 0; i < guess.length; i++) {
        const c = guess[i];
        if (!quarters[c]) quarters[c] = [null, null, null, null];
        const prev = quarters[c][b];
        if (!prev || RANK[result[i]] > RANK[prev]) quarters[c][b] = result[i];
      }
    }
  }
  const dead = {};
  for (const [c, q] of Object.entries(quarters)) {
    let boards = 0;
    let absent = 0;
    for (let b = 0; b < BOARDS; b++) {
      if (!open[b]) continue;
      boards++;
      if (q[b] === "absent") absent++;
    }
    if (boards > 0 && absent === boards) dead[c] = true;
  }
  return { quarters, dead };
}

/** Most hints per board: always leave at least two letters to work out. */
export const HINTS_PER_BOARD = WORD_LEN - 2;

/**
 * Next hint as [board, position], or null. Picks the unsolved board with the fewest
 * known spots (green in a guess, or hinted), then that board's leftmost unknown spot.
 * hints: [board, position] pairs already given.
 */
export function nextHint(guesses, answers, hints) {
  let best = null;
  answers.forEach((answer, b) => {
    const rows = boardRows(guesses, answer);
    if (boardSolved(rows, answer)) return;
    const mine = hints.filter(([hb]) => hb === b).map(([, pos]) => pos);
    if (mine.length >= HINTS_PER_BOARD) return;
    const known = [...answer].map((_, i) => mine.includes(i) || rows.some((r) => r.result[i] === "correct"));
    const pos = known.indexOf(false);
    if (pos < 0) return;
    const count = known.filter(Boolean).length;
    if (!best || count < best.count) best = { b, pos, count };
  });
  return best ? [best.b, best.pos] : null;
}

/** 2×2 of guess-counts (or 🟥) matching the boards. */
export function shareText({ puzzle, guesses, answers, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Quordle ${puzzle.number}`
    : "Oh My WORDS! Quordle";
  const mark = answers.map((answer) => {
    const rows = boardRows(guesses, answer);
    return boardSolved(rows, answer) ? NUM[rows.length - 1] : "🟥";
  });
  return `${head}${hints ? ` 💡${hints}` : ""}\n${mark[0]}${mark[1]}\n${mark[2]}${mark[3]}`;
}

/** Guess index (1–9) on which the last board was solved, or null on a loss. */
export function finishingGuess(guesses, answers) {
  if (!answers.every((answer) => boardSolved(boardRows(guesses, answer), answer))) return null;
  return guesses.length;
}
