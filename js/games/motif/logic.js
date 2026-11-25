// Motif: every tile is a stack of up to four layers (field, frame, emblem, trim).
// Pick a tile, then another: layers they share in the same slot vanish from both.
// Keep picking tiles that share a layer with the last one to grow a chain.
// Every layer appears an even number of times, so a board can always be cleared.
import { randInt, seededRandom, shuffle } from "../../core/rng.js";

export const COLS = 5;
export const ROWS = 6;
export const N = COLS * ROWS;
export const SLOTS = ["field", "frame", "emblem", "trim"];
export const VARIANTS = 6;
/** How many tiles carry each slot's layer (all even). */
const CARRY = [28, 24, 22, 18];

/** Longest-chain buckets for the stats distribution. */
export const CHAIN_BANDS = ["1–9", "10–14", "15–19", "20–29", "30–39", "40+"];
export function chainBand(n) {
  if (n < 10) return CHAIN_BANDS[0];
  if (n < 15) return CHAIN_BANDS[1];
  if (n < 20) return CHAIN_BANDS[2];
  if (n < 30) return CHAIN_BANDS[3];
  if (n < 40) return CHAIN_BANDS[4];
  return CHAIN_BANDS[5];
}

/** tiles[i] = [field, frame, emblem, trim], each a variant 0–5 or null. */
export function makeBoard(rng) {
  for (;;) {
    const tiles = Array.from({ length: N }, () => [null, null, null, null]);
    CARRY.forEach((m, s) => {
      const holders = shuffle(Array.from({ length: N }, (_, i) => i), rng).slice(0, m);
      const values = [];
      for (let k = 0; k < m / 2; k++) {
        const v = randInt(rng, VARIANTS);
        values.push(v, v);
      }
      shuffle(values, rng).forEach((v, k) => { tiles[holders[k]][s] = v; });
    });
    if (tiles.every((t) => t.some((v) => v != null))) return tiles;
  }
}

export const boardFor = (puzzle) => makeBoard(seededRandom("motif", puzzle.id));

export const isEmpty = (tile) => tile.every((v) => v == null);
export const layersLeft = (tiles) => tiles.reduce((n, t) => n + t.filter((v) => v != null).length, 0);

/** Slots where tiles a and b carry the same layer. */
export const shared = (a, b) => SLOTS.map((_, s) => s).filter((s) => a[s] != null && a[s] === b[s]);

/** Remove the layers tiles i and j share. Returns { tiles, slots } (tiles is a new array). */
export function clearPair(tiles, i, j) {
  const slots = shared(tiles[i], tiles[j]);
  const next = tiles.map((t) => t.slice());
  for (const s of slots) next[i][s] = next[j][s] = null;
  return { tiles: next, slots };
}

/** Tiles that would match tile i. */
export function partners(tiles, i) {
  const out = [];
  for (let j = 0; j < tiles.length; j++) if (j !== i && shared(tiles[i], tiles[j]).length) out.push(j);
  return out;
}

/**
 * Longest chain found from tile `from` (already picked), searching at most `budget` positions.
 * Returns { length, path } where path lists the tiles to pick next.
 */
export function bestChain(tiles, from, budget = 3000) {
  let nodes = 0;
  let best = { length: 0, path: [] };
  const path = [];
  const walk = (board, at) => {
    if (++nodes > budget) return;
    if (path.length > best.length) best = { length: path.length, path: path.slice() };
    // Prefer partners that keep layers, so the chain can go on.
    const opts = partners(board, at).map((j) => {
      const { tiles: next } = clearPair(board, at, j);
      return { j, next, keep: isEmpty(next[j]) ? -1 : partners(next, j).length };
    }).sort((a, b) => b.keep - a.keep);
    for (const { j, next, keep } of opts) {
      path.push(j);
      if (keep < 0) {
        if (path.length > best.length) best = { length: path.length, path: path.slice() };
      } else walk(next, j);
      path.pop();
      if (nodes > budget) return;
    }
  };
  walk(tiles, from);
  return best;
}

/** Hint: { start, next } — the tile to pick (when nothing is picked) and its best partner. */
export function hint(tiles, sel) {
  if (sel != null && !isEmpty(tiles[sel])) {
    const { path } = bestChain(tiles, sel);
    return path.length ? { start: sel, next: path[0] } : null;
  }
  let pick = null;
  for (let i = 0; i < tiles.length; i++) {
    if (isEmpty(tiles[i])) continue;
    const r = bestChain(tiles, i, 400);
    if (r.path.length && (!pick || r.length > pick.length)) pick = { start: i, next: r.path[0], length: r.length };
  }
  return pick && { start: pick.start, next: pick.next };
}

export function shareText({ puzzle, best, misses, hints = 0 }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  const bar = "🟪".repeat(Math.min(12, Math.ceil(best / 4))) || "⬜";
  return [
    `Oh My PATTERNS! Motif ${label}${tip}`,
    `Longest chain ${best} · ${misses === 0 ? "no misses" : `${misses} ${misses === 1 ? "miss" : "misses"}`}`,
    bar,
  ].join("\n");
}
