// Stackdown: six 5-letter words hidden in one fixed stack of 30 tiles.
// A puzzle is a pure function of the puzzle id. Letters come from our own
// clued answer list. The layout never changes; only the words do.
import { randInt, shuffle, seededRandom } from "../../core/rng.js";

export const STAR_WORDS = [null, "One star", "Not bad", "Nice", "Great", "Perfect"];

/** 0 hints is five stars. Each hint costs one, and the floor is one star. */
export function starsFor(hints) {
  const n = Number.isFinite(hints) ? Math.max(0, hints) : 0;
  return Math.max(5 - n, 1);
}

export function shareText({ puzzle, stars }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Stackdown ${puzzle.number}`
    : "Oh My WORDS! Stackdown";
  return `${head} ${stars}/5\n${"⭐".repeat(stars)}${"☆".repeat(5 - stars)}`;
}

// Half-step coordinates. A tile on the next layer covers this one when both
// axes are within 1 (the tiles actually overlap, not merely sit beside each other).
const COORDS = [
  [2, 0, 0], [6, 0, 0], [0, 2, 0], [8, 2, 0], [0, 4, 0], [8, 4, 0], [0, 6, 0], [8, 6, 0], [2, 8, 0], [6, 8, 0],
  [3, 1, 1], [5, 1, 1], [1, 3, 1], [7, 3, 1], [1, 5, 1], [7, 5, 1], [3, 7, 1], [5, 7, 1],
  [2, 2, 2], [4, 2, 2], [6, 2, 2], [2, 4, 2], [6, 4, 2], [2, 6, 2], [4, 6, 2], [6, 6, 2],
  [3, 3, 3], [5, 3, 3], [3, 5, 3], [5, 5, 3],
];

export const TILES = COORDS.map(([x, y, z]) => ({ id: `${x}.${y}.${z}`, x, y, z }));

const COVERS = new Map();
for (const t of TILES) {
  COVERS.set(t.id, TILES.filter((u) =>
    u.z === t.z + 1 && Math.abs(u.x - t.x) <= 1 && Math.abs(u.y - t.y) <= 1
  ).map((u) => u.id));
}

/** Ids still on the board that nothing above them is covering. */
export function exposedIds(present) {
  const out = [];
  for (const t of TILES) {
    if (!present.has(t.id)) continue;
    if (COVERS.get(t.id).every((c) => !present.has(c))) out.push(t.id);
  }
  return out;
}

function randomGroups(rng) {
  const present = new Set(TILES.map((t) => t.id));
  const order = [];
  while (present.size) {
    const exp = exposedIds(present);
    const id = exp[randInt(rng, exp.length)];
    present.delete(id);
    order.push(id);
  }
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(order.slice(i * 5, i * 5 + 5));
  return groups;
}

function pickWords(rng, pool) {
  const order = shuffle(pool, rng);
  const chosen = [];
  const used = new Set();
  const take = (entry) => {
    chosen.push(entry);
    for (const ch of entry.word) used.add(ch);
  };
  for (const entry of order) {
    if ([...entry.word].some((ch) => used.has(ch))) continue;
    take(entry);
    if (chosen.length === 6) return chosen;
  }
  for (const maxOverlap of [2, 5]) {
    for (const entry of order) {
      if (chosen.includes(entry)) continue;
      const overlap = new Set([...entry.word].filter((ch) => used.has(ch))).size;
      if (overlap > maxOverlap) continue;
      take(entry);
      if (chosen.length === 6) return chosen;
    }
  }
  return null;
}

function assignment(groups, entries) {
  const letter = {};
  const wordOf = {};
  const words = groups.map((ids, i) => {
    ids.forEach((id, k) => {
      letter[id] = entries[i].word[k];
      wordOf[id] = i;
    });
    return { word: entries[i].word, clue: entries[i].clue, ids: ids.slice() };
  });
  const tiles = TILES.map((t) => ({ ...t, letter: letter[t.id], word: wordOf[t.id] }));
  return { words, tiles };
}

/** True when each word has exactly one set of tiles that spells it. */
export function singleClear(built) {
  const letter = {};
  for (const t of built.tiles) letter[t.id] = t.letter;
  for (let wi = 0; wi < built.words.length; wi++) {
    const target = built.words[wi].word;
    const present = new Set(built.tiles.filter((t) => t.word >= wi).map((t) => t.id));
    const found = new Set();
    let nodes = 0;
    let tooBig = false;
    const walk = (k, chosen) => {
      if (tooBig) return;
      if (++nodes > 4000) { tooBig = true; return; }
      if (k === 5) {
        found.add([...chosen].sort().join(","));
        return;
      }
      const need = target[k];
      for (const id of [...present]) {
        if (letter[id] !== need) continue;
        if (COVERS.get(id).some((c) => present.has(c))) continue;
        present.delete(id);
        chosen.push(id);
        walk(k + 1, chosen);
        chosen.pop();
        present.add(id);
      }
    };
    walk(0, []);
    const want = [...built.words[wi].ids].sort().join(",");
    if (tooBig || found.size !== 1 || !found.has(want)) return false;
  }
  return true;
}

/**
 * Six clued words placed on the stack. `pool` is `{ word, clue }` entries.
 * The intended pick order is `words[i].ids`.
 */
export function puzzleFor(puzzle, pool) {
  const seen = new Set();
  const entries = [];
  for (const item of pool) {
    const word = String(item.word || "").toLowerCase();
    const clue = String(item.clue || "").trim();
    if (!/^[a-z]{5}$/.test(word) || !clue || seen.has(word)) continue;
    seen.add(word);
    entries.push({ word, clue });
  }
  if (entries.length < 6) throw new Error("Stackdown needs at least six clued words");
  const rng = seededRandom("stackdown", puzzle.id);
  let last = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const chosen = pickWords(rng, entries);
    if (!chosen) continue;
    const built = assignment(randomGroups(rng), chosen);
    last = built;
    if (singleClear(built)) return built;
  }
  if (last) return last;
  throw new Error("Could not build a Stackdown puzzle");
}
