// Pure Wordle logic (no DOM) — scoring, hard mode, daily answer selection, sharing.
import { mulberry32, hashString, shuffle, seededRandom, pick } from "../../core/rng.js";

export const WORD_LEN = 5;
export const MAX_GUESSES = 6;
export const WIN_WORDS = ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"];

/**
 * Wordle is 5 letters and 6 tries. Wordle+1 is 6 letters and 7 tries.
 * `id` is the localStorage key, so scores and saved games stay separate.
 */
export const VARIANTS = {
  wordle: {
    id: "wordle",
    label: "Wordle",
    wordLen: 5,
    maxGuesses: 6,
    salt: "omw-wordle-daily-order-v1",
    answers: "data/words/wordle-answers.json",
    valid: "data/words/wordle-valid.json",
    tagline: "Get 6 chances to guess a 5-letter word.",
    winWords: WIN_WORDS,
  },
  plus: {
    id: "wordle6",
    label: "Wordle+1",
    wordLen: 6,
    maxGuesses: 7,
    salt: "omw-wordle6-daily-order-v1",
    answers: "data/words/wordle6-answers.json",
    valid: "data/words/wordle6-valid.json",
    tagline: "Get 7 chances to guess a 6-letter word.",
    winWords: ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Nice", "Phew"],
  },
};

export const MODE_STORAGE_KEY = "wordle-mode";

/** "plus" / "wordle", or null when the value isn't a mode name. */
export function modeFromName(value) {
  const m = String(value || "").toLowerCase();
  if (m === "plus" || m === "6" || m === "wordle+1" || m === "wordle6") return "plus";
  if (m === "wordle" || m === "5") return "wordle";
  return null;
}

/**
 * Score a guess against the answer, NYT style (duplicate letters handled:
 * greens first, then yellows only while unmatched copies remain).
 * Returns an array of "correct" | "present" | "absent".
 */
export function scoreGuess(guess, answer) {
  guess = guess.toLowerCase();
  answer = answer.toLowerCase();
  const res = Array(guess.length).fill("absent");
  const remaining = {};
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) res[i] = "correct";
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (res[i] === "correct") continue;
    const c = guess[i];
    if (remaining[c] > 0) { res[i] = "present"; remaining[c]--; }
  }
  return res;
}

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * Hard mode: every revealed hint must be used. `history` is
 * [{ guess, result }] of previous rows. Returns an error message or null.
 */
export function hardModeError(guess, history) {
  guess = guess.toLowerCase();
  const need = {}; // letter -> minimum count
  for (const { guess: g, result } of history) {
    const counts = {};
    for (let i = 0; i < g.length; i++) {
      if (result[i] === "correct" && guess[i] !== g[i]) {
        return `${ORD[i] || `${i + 1}th`} letter must be ${g[i].toUpperCase()}`;
      }
      if (result[i] !== "absent") counts[g[i]] = (counts[g[i]] || 0) + 1;
    }
    for (const [c, n] of Object.entries(counts)) need[c] = Math.max(need[c] || 0, n);
  }
  for (const [c, n] of Object.entries(need)) {
    const have = [...guess].filter((x) => x === c).length;
    if (have < n) return `Guess must contain ${c.toUpperCase()}`;
  }
  return null;
}

const RANK = { absent: 1, present: 2, correct: 3 };

/** Best known state per letter across all scored rows. */
export function keyStates(rows) {
  const out = {};
  for (const { guess, result } of rows) {
    for (let i = 0; i < guess.length; i++) {
      const c = guess[i], s = result[i];
      if (!out[c] || RANK[s] > RANK[out[c]]) out[c] = s;
    }
  }
  return out;
}

const orderCaches = new Map();
/** Daily answer: fixed seeded permutation of the answer list, indexed by puzzle number. */
export function dailyAnswer(answers, number, salt = "omw-wordle-daily-order-v1") {
  let cache = orderCaches.get(salt);
  if (!cache || cache.n !== answers.length) {
    const idx = shuffle(answers.map((_, i) => i), mulberry32(hashString(salt)));
    cache = { n: answers.length, idx };
    orderCaches.set(salt, cache);
  }
  const n = answers.length;
  return answers[cache.idx[(((number - 1) % n) + n) % n]];
}

/** Answer for any puzzle from currentPuzzle(). `opts.gameId` / `opts.salt` pick the variant. */
export function answerFor(puzzle, answers, opts = {}) {
  const gameId = opts.gameId || "wordle";
  const salt = opts.salt || "omw-wordle-daily-order-v1";
  if (puzzle.isDaily && puzzle.number != null) return dailyAnswer(answers, puzzle.number, salt);
  return pick(seededRandom(gameId, puzzle.id), answers);
}

/** Most hints a round allows: always leave at least two letters to work out. */
export const maxHints = (wordLen) => Math.max(0, wordLen - 2);

/**
 * Next answer position to reveal: the leftmost one not already shown green by a
 * guess and not hinted before. -1 when every position is known.
 */
export function nextHint(answer, rows, hinted) {
  for (let i = 0; i < answer.length; i++) {
    if (hinted.includes(i)) continue;
    if (rows.some((r) => r.result[i] === "correct")) continue;
    return i;
  }
  return -1;
}

export function shareText({ puzzle, rows, won, hard, dark, highContrast, maxGuesses = MAX_GUESSES, name = "Wordle", hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! ${name} ${puzzle.number}` : `Oh My WORDS! ${name} (practice)`;
  const score = `${won ? rows.length : "X"}/${maxGuesses}${hard ? "*" : ""}${hints ? ` 💡${hints}` : ""}`;
  const sq = {
    correct: highContrast ? "🟧" : "🟩",
    present: highContrast ? "🟦" : "🟨",
    absent: dark ? "⬛" : "⬜",
  };
  const grid = rows.map((r) => r.result.map((s) => sq[s]).join("")).join("\n");
  return `${head} ${score}\n\n${grid}`;
}
