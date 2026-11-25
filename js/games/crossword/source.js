// Where a crossword comes from, fastest first:
//   1. this browser's cache (finished puzzles, keyed by puzzle id)
//   2. a pregenerated daily file  data/crossword/puzzles/<game>/<date>.json
//   3. in-browser generation in a module Web Worker (archive days outside the
//      pregenerated range, ?seed= practice puzzles); main-thread fallback if
//      module workers are unavailable.
// All three produce the same puzzle for the same (game, id).
import { get, set } from "../../core/storage.js";
import { loadJSON } from "../../core/words.js";
import { seededRandom } from "../../core/rng.js";
import { GEN, TEMPLATES_URL, WORDS_URL, puzzleUrl } from "./config.js";

const CACHE_MAX = 6;

function validPuzzle(p, gameId) {
  return p && Array.isArray(p.grid) && p.grid.length && p.clues &&
    Array.isArray(p.clues.across) && Array.isArray(p.clues.down) &&
    (!p.gameId || p.gameId === gameId);
}

function readCache(gameId, id) {
  const c = get(`xwcache:${gameId}`, null);
  return c && c.items && validPuzzle(c.items[id], gameId) ? c.items[id] : null;
}

function writeCache(gameId, id, puzzle) {
  const c = get(`xwcache:${gameId}`, null) || { order: [], items: {} };
  c.order = c.order.filter((k) => k !== id && c.items[k]);
  c.order.push(id);
  c.items[id] = puzzle;
  while (c.order.length > CACHE_MAX) delete c.items[c.order.shift()];
  set(`xwcache:${gameId}`, c);
}

const abs = (path) => new URL(path, document.baseURI).href;

function generateInWorker(msg) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    } catch (e) {
      reject(e);
      return;
    }
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data && e.data.ok) resolve(e.data.puzzle);
      else reject(new Error((e.data && e.data.error) || "generation failed"));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "worker error"));
    };
    worker.postMessage(msg);
  });
}

async function generateOnMainThread(msg) {
  const { generatePuzzle } = await import("./generator.js");
  const raw = await loadJSON(WORDS_URL);
  await new Promise((r) => setTimeout(r, 30)); // let the "building" UI paint
  const p = generatePuzzle({ gameId: msg.gameId, puzzleId: msg.puzzleId, templates: msg.templates, ...msg.gen }, raw,
    seededRandom(msg.gameId, msg.puzzleId));
  if (!p) throw new Error("generation failed");
  return p;
}

/**
 * Resolves to a puzzle object for (gameId, puzzle). `onBuilding()` is called
 * if we have to generate (so the UI can show "Building today's puzzle…").
 */
export async function getPuzzle(gameId, puzzle, onBuilding) {
  const cached = readCache(gameId, puzzle.id);
  if (cached) return cached;

  if (puzzle.isDaily) {
    try {
      const res = await fetch(puzzleUrl(gameId, puzzle.id));
      if (res.ok) {
        const p = await res.json();
        if (validPuzzle(p, gameId)) {
          writeCache(gameId, puzzle.id, p);
          return p;
        }
      }
    } catch {}
  }

  onBuilding && onBuilding();
  const all = await loadJSON(TEMPLATES_URL);
  const msg = { gameId, puzzleId: puzzle.id, templates: all[gameId], wordsUrl: abs(WORDS_URL), gen: GEN[gameId] };
  let p;
  try {
    p = await generateInWorker(msg);
  } catch (e) {
    console.warn("Crossword worker unavailable, generating on main thread:", e);
    p = await generateOnMainThread(msg);
  }
  writeCache(gameId, puzzle.id, p);
  return p;
}
