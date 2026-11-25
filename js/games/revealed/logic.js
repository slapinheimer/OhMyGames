// Revealed: guess the topic of a short article with most of its words blacked out.
// Reveal words one at a time; every two Reveals earn a Hint (a letter of the topic).
// The daily topic is a pure function of the puzzle id and data/revealed/topics.json.
import { EPOCH, parseDateKey, seededRandom, shuffle } from "../../core/rng.js";

export const REVEALS_PER_HINT = 2;

/** Words left showing. Everything else in the article starts blacked out. */
export const VISIBLE = new Set((
  "a an the and or but nor of in on at to for from by with as into onto upon over under " +
  "after before about above below between during through across along around among against " +
  "within without toward towards until since than then so if because while though although " +
  "is are was were be been being am has have had do does did can could will would may might " +
  "must shall should it its it's this that these those which who whom whose what when where " +
  "why how there their they them he she his her him we our you your i me my " +
  "not no also more most many much some such each both all other another only very often " +
  "one two three first up out off s"
).split(" "));

/** Lowercase letters and digits only: what a guess or word is compared by. */
export const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Split an article into tokens: { text, word?, key?, topic? }.
 * Word tokens carry `key` (normalized, possessive 's dropped) so every copy of a word
 * reveals together. Words that spell part of the topic are marked `topic` and never reveal.
 */
export function tokenize(paragraphs, topic) {
  const topicKeys = new Set(topic.split(/[\s-]+/).map(norm).filter((k) => k && !VISIBLE.has(k)));
  return paragraphs.map((para) => {
    const out = [];
    const re = /([A-Za-zÀ-ÿ0-9]+(?:['’][A-Za-zÀ-ÿ]+)*)|([^A-Za-zÀ-ÿ0-9]+)/g;
    let m;
    while ((m = re.exec(para))) {
      if (m[2] != null) { out.push({ text: m[2] }); continue; }
      const text = m[1];
      const key = norm(text.replace(/['’]s$/i, ""));
      const topicWord = topicKeys.has(key) || [...topicKeys].some((t) => key === `${t}s` || key === `${t}es`);
      out.push({ text, word: true, key, topic: topicWord, hidden: topicWord || !VISIBLE.has(key) });
    }
    return out;
  });
}

/** Letters of the topic, with spaces and punctuation kept as given. */
export function topicSlots(topic) {
  return [...topic].map((ch) => ({ ch, letter: /[A-Za-z0-9À-ÿ]/.test(ch) }));
}

/** Order the hint letters come in (indexes into topicSlots), fixed per puzzle. */
export function hintOrder(topic, puzzleId) {
  const idx = topicSlots(topic).map((s, i) => (s.letter ? i : -1)).filter((i) => i >= 0);
  return shuffle(idx, seededRandom("revealed-hints", puzzleId));
}

export function hintsEarned(reveals) {
  return Math.floor(reveals / REVEALS_PER_HINT);
}

/** True when the guess names the topic or one of its accepted alternates. */
export function isCorrect(guess, entry) {
  const g = norm(guess);
  if (!g) return false;
  return [entry.topic, ...(entry.alt || [])].some((a) => norm(a) === g);
}

/**
 * Topic for a puzzle. Daily puzzles walk the list in a shuffled order, one per day,
 * so no topic repeats until every one has been used. Practice picks at random by seed.
 */
export function topicFor(puzzle, topics) {
  if (!puzzle.isDaily) {
    const rng = seededRandom("revealed", puzzle.id);
    return topics[Math.floor(rng() * topics.length)];
  }
  const day = Math.round((parseDateKey(puzzle.date) - parseDateKey(EPOCH)) / 86400000);
  const n = topics.length;
  const cycle = Math.floor(day / n);
  const order = shuffle([...Array(n).keys()], seededRandom("revealed-cycle", String(cycle)));
  return topics[order[((day % n) + n) % n]];
}

/** Stats bucket for a finish: Reveals plus Hints used, or X for giving up. */
export function bucketFor({ won, reveals, hints }) {
  if (!won) return "X";
  const used = reveals + hints;
  if (used === 0) return "0";
  if (used <= 3) return "1–3";
  if (used <= 6) return "4–6";
  if (used <= 10) return "7–10";
  if (used <= 15) return "11–15";
  return "16+";
}
export const BUCKETS = ["0", "1–3", "4–6", "7–10", "11–15", "16+", "X"];

/** NYT-style spoiler-free result: one mark per move, in order. */
export function shareText({ puzzle, won, log, reveals, hints, guesses }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Revealed ${puzzle.number}`
    : "Oh My WORDS! Revealed";
  const marks = { r: "⬛", h: "💡", g: "❌", w: "✅", x: "🏳️" };
  const trail = log.map((m) => marks[m] || "").join("");
  const parts = [`${reveals} reveal${reveals === 1 ? "" : "s"}`, `${hints} hint${hints === 1 ? "" : "s"}`];
  if (guesses) parts.push(`${guesses} wrong guess${guesses === 1 ? "" : "es"}`);
  return `${head} ${won ? "✅" : "🏳️"}\n${parts.join(" · ")}\n${trail}`;
}
