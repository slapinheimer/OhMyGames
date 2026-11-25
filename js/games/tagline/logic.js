// Tagline: three phrases, each spelled from the same seven letters.
// The stack for a phrase shows how many times each letter appears in that phrase.
import { randInt, seededRandom } from "../../core/rng.js";

export const LEVELS = 3;
export const STAR_WORDS = ["Revealed", "You did it", "Nice", "Perfect"];

/** 0 hints is three stars. One or two hints is two. Any more is one. Giving up a phrase is zero. */
export function starsFor(hints, failed) {
  if (failed) return 0;
  const n = Math.max(0, Math.floor(Number(hints) || 0));
  if (n <= 0) return 3;
  if (n <= 2) return 2;
  return 1;
}

export function letterList(phrase) {
  return [...phrase.toUpperCase()].filter((ch) => ch >= "A" && ch <= "Z");
}

/** Words of letter slots and punctuation. Letter slots share one running index. */
export function boardOf(phrase) {
  const words = [];
  let index = 0;
  for (const word of phrase.split(" ")) {
    if (!word) continue;
    const cells = [];
    for (const ch of word) {
      const up = ch.toUpperCase();
      if (up >= "A" && up <= "Z") cells.push({ kind: "letter", char: up, index: index++ });
      else cells.push({ kind: "mark", char: ch });
    }
    words.push(cells);
  }
  return { words, length: index, letters: letterList(phrase) };
}

export function countsOf(letters) {
  const counts = {};
  for (const ch of letters) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

/**
 * Today's puzzle is bank[(number - 1) % length]. A practice id picks with the tagline seed.
 */
export function puzzleFor(puzzle, bank) {
  const n = bank.length;
  const index = puzzle.isDaily && puzzle.number
    ? (puzzle.number - 1) % n
    : randInt(seededRandom("tagline", puzzle.id), n);
  const built = bank[index];
  const letters = [...built.letters].sort().join("");
  return {
    index,
    letters,
    levels: built.levels.map((level) => ({
      clue: level.clue,
      phrase: level.phrase.toUpperCase(),
      prefill: [...level.prefill],
      board: boardOf(level.phrase),
    })),
  };
}

export function shareText({ puzzle, letters, stars, hints }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Tagline ${puzzle.number}`
    : "Oh My WORDS! Tagline";
  return `${head}\n${letters}\nHints: ${hints}\n${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}`;
}
