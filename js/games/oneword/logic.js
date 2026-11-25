// One Word Search: ten rounds, one hidden 5-letter word on a 5×5 grid each round.
// A word may run across, down, or diagonally, forwards or backwards.
// Each grid hides exactly one dictionary word. A round is a pure function of the puzzle id.
import { randInt, shuffle, seededRandom } from "../../core/rng.js";

export const SIZE = 5;
export const WORD_COUNT = 10;
export const STAR_WORDS = ["", "Took your time", "Not bad", "Nice", "Great", "Perfect"];

const WEIGHT = "eeeeeeeeeeeeaaaaaaaaaiiiiiiiiioooooooonnnnnnrrrrrrttttttllllssssuuuuddddgggbbccmmppffhhvvwwyykjxqz";
const SPARE = "bcdfghjklmnpqrstvwxyz";

/** Stars for a finished time. A clock reading of 1:00 or less is five. Each minute on the clock after that costs a star. */
export function starsFor(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs <= 60) return 5;
  if (secs <= 120) return 4;
  if (secs <= 180) return 3;
  if (secs <= 240) return 2;
  return 1;
}

export function clockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function placements() {
  const list = [];
  for (let r = 0; r < SIZE; r++) {
    list.push({ r, c: 0, dr: 0, dc: 1 });
    list.push({ r, c: SIZE - 1, dr: 0, dc: -1 });
  }
  for (let c = 0; c < SIZE; c++) {
    list.push({ r: 0, c, dr: 1, dc: 0 });
    list.push({ r: SIZE - 1, c, dr: -1, dc: 0 });
  }
  list.push({ r: 0, c: 0, dr: 1, dc: 1 });
  list.push({ r: SIZE - 1, c: SIZE - 1, dr: -1, dc: -1 });
  list.push({ r: 0, c: SIZE - 1, dr: 1, dc: -1 });
  list.push({ r: SIZE - 1, c: 0, dr: -1, dc: 1 });
  return list;
}

/** Twelve readings: every full row, column, and long diagonal, each way. */
export function readingsOf(letters) {
  const at = (r, c) => letters[r * SIZE + c];
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push([0, 1, 2, 3, 4].map((c) => at(r, c)).join(""));
  for (let c = 0; c < SIZE; c++) lines.push([0, 1, 2, 3, 4].map((r) => at(r, c)).join(""));
  lines.push([0, 1, 2, 3, 4].map((i) => at(i, i)).join(""));
  lines.push([0, 1, 2, 3, 4].map((i) => at(i, SIZE - 1 - i)).join(""));
  const out = [];
  for (const line of lines) {
    out.push(line);
    out.push([...line].reverse().join(""));
  }
  return out;
}

function soleWord(letters, dict) {
  const hits = [...new Set(readingsOf(letters).filter((w) => dict.has(w)))];
  return hits.length === 1 ? hits[0] : "";
}

function buildRound(word, rng, dict) {
  const rev = [...word].reverse().join("");
  if (rev !== word && dict.has(rev)) return null;
  for (const place of shuffle(placements(), rng)) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const letters = Array(SIZE * SIZE).fill("");
      const path = [];
      for (let i = 0; i < SIZE; i++) {
        const r = place.r + i * place.dr;
        const c = place.c + i * place.dc;
        const index = r * SIZE + c;
        letters[index] = word[i];
        path.push(index);
      }
      const bag = attempt < 28 ? WEIGHT : SPARE;
      for (let i = 0; i < letters.length; i++) {
        if (!letters[i]) letters[i] = bag[randInt(rng, bag.length)];
      }
      const text = letters.join("");
      if (soleWord(text, dict) === word) return { word, letters: text, path };
    }
  }
  return null;
}

/**
 * { rounds: [{ word, letters, path }] } for a currentPuzzle() id.
 * `answers` supplies the hidden words. `valid` is every 5-letter word that must not sneak in beside them.
 */
export function puzzleFor(puzzle, answers, valid) {
  const dict = new Set(valid);
  for (const w of answers) dict.add(w);
  const rng = seededRandom("oneword", puzzle.id);
  const pool = shuffle(answers.filter((w) => w.length === 5 && /^[a-z]{5}$/.test(w)), rng);
  const rounds = [];
  for (const word of pool) {
    if (rounds.length === WORD_COUNT) break;
    if (rounds.some((r) => r.word === word)) continue;
    const round = buildRound(word, rng, dict);
    if (round) rounds.push(round);
  }
  if (rounds.length < WORD_COUNT) throw new Error("Could not build a one word search");
  return { rounds };
}

export function shareText({ puzzle, stars, ms, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! One Word Search ${puzzle.number}`
    : "Oh My WORDS! One Word Search";
  return `${head} ${stars}/5\n${"⭐".repeat(stars)}${"☆".repeat(5 - stars)}\n${clockText(ms)}${hints ? ` 💡${hints}` : ""}`;
}
