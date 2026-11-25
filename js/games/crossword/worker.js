// Module worker: builds a puzzle off the main thread.
// message in : { gameId, puzzleId, templates, wordsUrl, gen }
// message out: { ok, puzzle?, error?, ms }
import { generatePuzzle } from "./generator.js";
import { seededRandom } from "../../core/rng.js";

self.onmessage = async (e) => {
  const { gameId, puzzleId, templates, wordsUrl, gen } = e.data;
  const t0 = performance.now();
  try {
    const res = await fetch(wordsUrl);
    if (!res.ok) throw new Error(`words ${res.status}`);
    const raw = await res.json();
    const puzzle = generatePuzzle({ gameId, puzzleId, templates, ...gen }, raw, seededRandom(gameId, puzzleId));
    self.postMessage({ ok: !!puzzle, puzzle, ms: performance.now() - t0, error: puzzle ? null : "fill failed" });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
