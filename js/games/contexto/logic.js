// Contexto: find the secret word. Every guess shows how close in meaning it is, as a rank
// among all the words we know (1 is the secret). Closeness comes from GloVe word vectors
// in data/contexto/ (built by tools/build_contexto.py); everything runs in the browser.
import { EPOCH, parseDateKey, seededRandom, shuffle } from "../../core/rng.js";

export const GREEN = 300;
export const YELLOW = 1500;

/** Words + int8 vectors -> { words, index, vecs, norms, dims }. */
export function loadModel(meta, buffer) {
  const vecs = new Int8Array(buffer);
  const { dims, words } = meta;
  if (vecs.length !== words.length * dims) throw new Error("Contexto vectors don't match the word list");
  const norms = new Float64Array(words.length);
  for (let i = 0; i < words.length; i++) {
    let s = 0;
    for (let d = i * dims, end = d + dims; d < end; d++) s += vecs[d] * vecs[d];
    norms[i] = Math.sqrt(s) || 1;
  }
  const index = new Map(words.map((w, i) => [w, i]));
  return { words, index, vecs, norms, dims };
}

/** rank[i] for every word i, by cosine similarity to the secret (the secret itself is 1). */
export function rankingFor(model, secret) {
  const { vecs, norms, dims, words } = model;
  const n = words.length;
  const base = secret * dims;
  const score = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * dims;
    for (let d = 0; d < dims; d++) s += vecs[base + d] * vecs[off + d];
    score[i] = s / norms[i];
  }
  score[secret] = Infinity;
  const order = [...Array(n).keys()].sort((a, b) => score[b] - score[a] || a - b);
  const rank = new Int32Array(n);
  order.forEach((w, k) => { rank[w] = k + 1; });
  return { rank, order };
}

/**
 * Secret word index for a puzzle. Daily puzzles walk the secret list in a shuffled
 * order, one per day, so none repeats until all are used. Practice picks by seed.
 */
export function secretFor(puzzle, model, secrets) {
  const pool = secrets.map((w) => model.index.get(w)).filter((i) => i != null);
  if (!puzzle.isDaily) return pool[Math.floor(seededRandom("contexto", puzzle.id)() * pool.length)];
  const day = Math.round((parseDateKey(puzzle.date) - parseDateKey(EPOCH)) / 86400000);
  const n = pool.length;
  const order = shuffle([...Array(n).keys()], seededRandom("contexto-cycle", String(Math.floor(day / n))));
  return pool[order[((day % n) + n) % n]];
}

/** Word index for a typed guess, accepting plurals and simple verb forms. -1 if unknown. */
export function lookup(model, raw) {
  const w = raw.toLowerCase().trim().replace(/[^a-z]/g, "");
  if (!w) return -1;
  const tries = [w];
  if (w.endsWith("ies")) tries.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) tries.push(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) tries.push(w.slice(0, -1));
  if (w.endsWith("ied")) tries.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("ed")) tries.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
  if (w.endsWith("ing")) tries.push(w.slice(0, -3), `${w.slice(0, -3)}e`, w.slice(0, -4));
  for (const t of tries) {
    const i = model.index.get(t);
    if (i != null) return i;
  }
  return -1;
}

export function colorFor(rank) {
  return rank <= GREEN ? "green" : rank <= YELLOW ? "yellow" : "red";
}

/** Bar length for a rank: full at 1, shrinking on a log scale. */
export function barFor(rank, total) {
  return Math.max(0.03, 1 - Math.log(rank) / Math.log(total));
}

/**
 * Hint word: an unguessed word about halfway between the best guess and the secret.
 * With no guesses yet, it starts around rank 300. Never the secret itself.
 */
export function hintWord(ranking, guessed, bestRank) {
  const n = ranking.order.length;
  const target = Math.min(n, Math.max(2, Math.floor((bestRank || 600) / 2)));
  const taken = new Set(guessed);
  for (let r = target; r <= n; r++) {
    const w = ranking.order[r - 1];
    if (!taken.has(w)) return w;
  }
  for (let r = target - 1; r >= 2; r--) {
    const w = ranking.order[r - 1];
    if (!taken.has(w)) return w;
  }
  return -1;
}

export function bucketFor(won, guesses) {
  if (!won) return "X";
  if (guesses <= 10) return "1–10";
  if (guesses <= 20) return "11–20";
  if (guesses <= 35) return "21–35";
  if (guesses <= 60) return "36–60";
  if (guesses <= 100) return "61–100";
  return "100+";
}
export const BUCKETS = ["1–10", "11–20", "21–35", "36–60", "61–100", "100+", "X"];

export function shareText({ puzzle, won, guesses, hints, ranks }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Contexto ${puzzle.number}`
    : "Oh My WORDS! Contexto";
  const line = won
    ? `I found the word in ${guesses} guess${guesses === 1 ? "" : "es"}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`
    : `I gave up after ${guesses} guess${guesses === 1 ? "" : "es"}.`;
  const count = (c) => ranks.filter((r) => colorFor(r) === c).length;
  const row = (emoji, n) => `${emoji} ${n}`;
  return `${head}\n${line}\n${row("🟩", count("green"))}\n${row("🟨", count("yellow"))}\n${row("🟥", count("red"))}`;
}
