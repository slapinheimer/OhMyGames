// Registry of every game in Oh My GAMES! (used by the hubs, nav drawer, splash).
// Games belong to a collection: Oh My WORDS! (listed here), Oh My NUMBERS! (number-games.js)
// or Oh My PATTERNS! (pattern-games.js), so authors of those games only touch their own file.
import { EPOCH, parseDateKey, todayKey } from "./rng.js";
import { get } from "./storage.js";
import { MODE_STORAGE_KEY, VARIANTS } from "../games/wordle/logic.js";
import { NUMBER_GAMES } from "./number-games.js";
import { PATTERN_GAMES } from "./pattern-games.js";

export const APP_NAME = "Oh My GAMES!";

/** Collections, in the order the home page and switchers show them. */
export const COLLECTIONS = [
  {
    id: "words", name: "Oh My WORDS!", short: "Words", hub: "words.html", icon: "img/words.svg",
    accent: "var(--accent-words)", tagline: "Guess, swap, trace and solve: daily word puzzles.",
  },
  {
    id: "numbers", name: "Oh My NUMBERS!", short: "Numbers", hub: "numbers.html", icon: "img/numbers.svg",
    accent: "var(--accent-numbers)", tagline: "Slide, merge, add and deduce: daily number puzzles.",
  },
  {
    id: "patterns", name: "Oh My PATTERNS!", short: "Patterns", hub: "patterns.html", icon: "img/patterns.svg",
    accent: "var(--accent-patterns)", tagline: "Match, layer and clear: daily pattern puzzles.",
  },
];

const WORD_GAMES = [
  {
    id: "wordle", name: "Wordle", page: "wordle.html", icon: "img/wordle.svg",
    accent: "var(--accent-wordle)", tagline: "5 letters in 6 tries, or Wordle+1 with 6 letters in 7.",
  },
  {
    id: "quordle", name: "Quordle", page: "quordle.html", icon: "img/quordle.svg",
    accent: "var(--accent-quordle)", tagline: "Solve four words at once in nine guesses.",
  },
  {
    id: "waffle", name: "Waffle", page: "waffle.html", icon: "img/waffle.svg",
    accent: "var(--accent-waffle)", tagline: "Swap letters to spell six words. Fifteen swaps.",
  },
  {
    id: "waffle-deluxe", name: "Deluxe Waffle", page: "waffle-deluxe.html", icon: "img/waffle-deluxe.svg",
    accent: "var(--accent-waffle-deluxe)", tagline: "Swap letters to spell eight words. Twenty-five swaps.",
  },
  {
    id: "stackdown", name: "Stackdown", page: "stackdown.html", icon: "img/stackdown.svg",
    accent: "var(--accent-stackdown)", tagline: "Clear a stack of tiles to spell six words.",
  },
  {
    id: "oneword", name: "One Word Search", page: "oneword.html", icon: "img/oneword.svg",
    accent: "var(--accent-oneword)", tagline: "Find one hidden word, ten times. Five stars in a minute.",
  },
  {
    id: "tagline", name: "Tagline", page: "tagline.html", icon: "img/tagline.svg",
    accent: "var(--accent-tagline)", tagline: "Three phrases from seven letters. Three stars with no hints.",
  },
  {
    id: "connections", name: "Connections", page: "connections.html", icon: "img/connections.svg",
    accent: "var(--accent-connections)", tagline: "Group words that share a common thread.",
  },
  {
    id: "strands", name: "Strands", page: "strands.html", icon: "img/strands.svg",
    accent: "var(--accent-strands)", tagline: "Find hidden words and uncover the day's theme.",
  },
  {
    id: "letterboxed", name: "Letter Boxed", page: "letterboxed.html", icon: "img/letterboxed.svg",
    accent: "var(--accent-letterboxed)", tagline: "Create words using letters around the square.",
  },
  {
    id: "mini", name: "The Mini", page: "mini.html", icon: "img/mini.svg",
    accent: "var(--accent-mini)", tagline: "Solve this bite-sized puzzle in just a few minutes.",
  },
  {
    id: "midi", name: "The Midi", page: "midi.html", icon: "img/midi.svg",
    accent: "var(--accent-midi)", tagline: "A mid-sized crossword for your coffee break.",
  },
  {
    id: "crossword", name: "The Crossword", page: "crossword.html", icon: "img/crossword.svg",
    accent: "var(--accent-crossword)", tagline: "The full-size daily crossword.",
  },
  {
    id: "lettergrams", name: "Lettergrams", page: "lettergrams.html", icon: "img/lettergrams.svg",
    accent: "var(--accent-lettergrams)", tagline: "Clear the rack onto the board. Score big with bonus squares.",
  },
  {
    id: "revealed", name: "Revealed", page: "revealed.html", icon: "img/revealed.svg",
    accent: "var(--accent-revealed)", tagline: "Uncover words in a hidden article and name its topic.",
  },
  {
    id: "spellingbee", name: "Spelling Bee", page: "spellingbee.html", icon: "img/spellingbee.svg",
    accent: "var(--accent-spellingbee)", tagline: "How many words can you make with 7 letters?",
  },
  {
    id: "squaredle", name: "Squaredle", page: "squaredle.html", icon: "img/squaredle.svg",
    accent: "var(--accent-squaredle)", tagline: "Trace every word through a 4×4 grid.",
  },
  {
    id: "contexto", name: "Contexto", page: "contexto.html", icon: "img/contexto.svg",
    accent: "var(--accent-contexto)", tagline: "Find the secret word. Every guess shows how close you are.",
  },
];

export const GAMES = [
  ...WORD_GAMES.map((g) => ({ ...g, collection: "words" })),
  ...NUMBER_GAMES.map((g) => ({ ...g, collection: "numbers" })),
  ...PATTERN_GAMES.map((g) => ({ ...g, collection: "patterns" })),
];

export const gameById = (id) => GAMES.find((g) => g.id === id);

/** Saved-game id the hub should read. Wordle+1 keeps its own progress. */
export function progressId(gameId) {
  if (gameId === "wordle" && get(MODE_STORAGE_KEY) === "plus") return VARIANTS.plus.id;
  return gameId;
}

/**
 * Page for a game (or a hub page) given { date, practice }.
 * Today is a clean URL. Archive days use ?date=. Practice uses ?random=1.
 */
export function playHref(pageOrGame, { date, practice } = {}) {
  const page = typeof pageOrGame === "string" ? pageOrGame : pageOrGame.page;
  if (practice) return `${page}?random=1`;
  const today = todayKey();
  if (date && date !== today && parseDateKey(date) && date >= EPOCH && date <= today) {
    return `${page}?date=${date}`;
  }
  return page;
}

export const collectionById = (id) => COLLECTIONS.find((c) => c.id === id) || COLLECTIONS[0];
/** The collection a game (or game id) belongs to. */
export const collectionOf = (game) => collectionById((typeof game === "string" ? gameById(game) : game)?.collection);
export const gamesIn = (collectionId) => GAMES.filter((g) => g.collection === collectionId);

/** A collection's hub page for { date, practice }. */
export const hubHref = (choice, collectionId = "words") => playHref(collectionById(collectionId).hub, choice);
