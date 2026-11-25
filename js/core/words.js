// Lazy, cached loaders for the shared word library in /data.
const cache = new Map();

function once(key, loader) {
  if (!cache.has(key)) cache.set(key, loader());
  return cache.get(key);
}

export function loadJSON(path) {
  return once(path, async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  });
}

export function loadText(path) {
  return once(path, async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.text();
  });
}

/** Set of every playable word (lowercase, 3+ letters, ~172k). */
export const loadDictionary = () =>
  once("dict", async () => new Set((await loadText("data/words/dictionary.txt")).split("\n")));

/** Map word -> frequency rank (1 = most common) for ~27k common words. */
export const loadCommon = () =>
  once("common", async () => new Map(Object.entries(await loadJSON("data/words/common.json"))));

export const loadWordleAnswers = () => loadJSON("data/words/wordle-answers.json");
export const loadWordleValid = () => loadJSON("data/words/wordle-valid.json");
export const loadWordle6Answers = () => loadJSON("data/words/wordle6-answers.json");
export const loadWordle6Valid = () => loadJSON("data/words/wordle6-valid.json");

/** { "3": [["ACE", score, ["clue", ...]], ...], ..., "15": [...] } */
export const loadCrosswordWords = () => loadJSON("data/crossword/words.json");
