// Build banks of winding Conduit boards for Medium, Hard and Expert (data/conduit/boards.json).
//
// A board is a set of pipes that fill the grid. Hard boards come from pipes that wind:
// the shortest route between two fittings is usually wrong, so the player has to find
// detours that leave room for every other pipe. The steps:
//   1. Grow a cover by merging neighboring pipe ends, never letting a pipe touch itself
//      (a pipe that touches itself has a shortcut, which usually means a second answer).
//   2. Keep it only if it has exactly one solution.
//   3. Hill-climb: reroute pipes (one pipe takes over part of a neighbor) and merge pipes,
//      keeping a change only if the board winds more and still has exactly one solution.
//
// It's JavaScript (not python like the other tools) so it shares the game's solver. Run it
// with JavaScriptCore or node, one shard per process, then merge the shards:
//   JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
//   $JSC -m tools/build_conduit.mjs -- shard 9 1 40 > /tmp/c9-1.jsonl     # size, seed, boards
//   $JSC -m tools/build_conduit.mjs -- merge /tmp/c*.jsonl > data/conduit/boards.json
import { seededRandom } from "../js/core/rng.js";
import { neighbors, solutionCount, routeStats, levelFromStats } from "../js/games/conduit/logic.js";

const out = typeof print === "function" ? print : (s) => console.log(s);
const args = globalThis.arguments ? [...globalThis.arguments] : process.argv.slice(2);

const isEnd = (p, cell) => p[0] === cell || p[p.length - 1] === cell;
const endsOf = (paths) => paths.map((p) => [p[0], p[p.length - 1]]);
const unique = (n, paths, cap) => solutionCount({ size: n, ends: endsOf(paths) }, 2, cap) === 1;

/** Would joining path a (ending at the join) to path b (starting there) make a path touch itself? */
function touchesSelf(n, a, b) {
  const setB = new Set(b);
  for (let i = 0; i < a.length; i++) {
    for (const nb of neighbors(a[i], n)) {
      if (!setB.has(nb) || (i === a.length - 1 && nb === b[0])) continue;
      return true;
    }
  }
  return false;
}

function mergeCover(n, rng, target) {
  const total = n * n;
  const owner = new Int32Array(total);
  const paths = new Map();
  for (let i = 0; i < total; i++) { owner[i] = i; paths.set(i, [i]); }
  const join = (id, p, j) => {
    let q = paths.get(owner[j]);
    if (q[0] !== j) q = q.slice().reverse();
    if (touchesSelf(n, p, q)) return false;
    const oid = owner[j];
    paths.delete(oid);
    paths.set(id, p.concat(q));
    for (const c of q) owner[c] = id;
    return true;
  };
  let stall = 0;
  while (paths.size > target && stall < total * 200) {
    // Favor short paths so lengths even out and no stubs are left behind.
    const ids = [...paths.keys()];
    let id = ids[(rng() * ids.length) | 0];
    for (let k = 0; k < 2; k++) {
      const other = ids[(rng() * ids.length) | 0];
      if (paths.get(other).length < paths.get(id).length) id = other;
    }
    let p = paths.get(id);
    if (rng() < 0.5) p = p.slice().reverse();
    const opts = neighbors(p[p.length - 1], n).filter((j) => owner[j] !== id && isEnd(paths.get(owner[j]), j));
    if (!opts.length || !join(id, p, opts[(rng() * opts.length) | 0])) stall++;
    else stall = 0;
  }
  // Fold leftover stubs into a neighbor.
  for (let pass = 0; pass < 3; pass++) {
    for (const [id, p0] of [...paths]) {
      if (!paths.has(id) || p0.length >= 3) continue;
      for (const p of [p0, p0.slice().reverse()]) {
        const opts = neighbors(p[p.length - 1], n).filter((j) => owner[j] !== id && isEnd(paths.get(owner[j]), j));
        if (opts.some((j) => join(id, p, j))) break;
      }
    }
  }
  const list = [...paths.values()];
  return list.some((p) => p.length < 3) ? null : list;
}

/** How much the board winds (higher is harder). */
function score(n, paths) {
  const { detour, shortest } = routeStats(n, paths);
  return detour - 0.35 * shortest - 0.04 * paths.length;
}

/** Reroute or merge one pipe. Returns new paths or null. */
function mutate(n, paths, rng) {
  const P = paths.map((p) => p.slice());
  const owner = new Int32Array(n * n);
  P.forEach((p, k) => p.forEach((c) => { owner[c] = k; }));
  const a = (rng() * P.length) | 0;
  const A = rng() < 0.5 ? P[a].slice().reverse() : P[a];
  const opts = neighbors(A[A.length - 1], n).filter((j) => owner[j] !== a);
  if (!opts.length) return null;
  const j = opts[(rng() * opts.length) | 0];
  const b = owner[j];
  const B = P[b];
  const at = B.indexOf(j);
  const rest = P.filter((_, k) => k !== a && k !== b);
  if (at === 0 || at === B.length - 1) {
    rest.push(A.concat(at === 0 ? B : B.slice().reverse()));
    return rest;
  }
  // A takes j and one side of B; the other side of B stays a pipe of its own.
  const forward = rng() < 0.5;
  const take = forward ? B.slice(at) : B.slice(0, at + 1).reverse();
  const keep = forward ? B.slice(0, at) : B.slice(at + 1);
  if (keep.length < 3) return null;
  rest.push(A.concat(take), keep);
  return rest;
}

const COLORS = { 5: [3, 5], 7: [5, 8], 9: [7, 11] };
const STEPS = { 5: 600, 7: 800, 9: 1500 };

function shard(n, seed, count) {
  const rng = seededRandom("conduit-build", `${n}:${seed}`);
  for (let made = 0; made < count;) {
    const [lo, hi] = COLORS[n];
    let cur = mergeCover(n, rng, lo + ((rng() * (hi - lo + 1)) | 0));
    if (!cur || cur.length > 16 || !unique(n, cur, 60000)) continue;
    let best = score(n, cur);
    for (let t = 0; t < STEPS[n]; t++) {
      const next = mutate(n, cur, rng);
      if (!next || next.length > 16 || next.some((p) => p.length < 3)) continue;
      const s = score(n, next);
      if (s <= best || !unique(n, next, 40000)) continue;
      cur = next;
      best = s;
    }
    // Final proof with a much bigger budget: -1 (ran out) is not good enough.
    if (!unique(n, cur, 2000000)) continue;
    out(JSON.stringify({ size: n, paths: cur }));
    made++;
  }
}

/** Merge shard files into { "5": { medium: [...], hard: [...], expert: [...] }, ... }. */
async function merge(files) {
  // jsc has read(); node has fs.
  const readFile = typeof read === "function" ? (f) => read(f) : ((fs) => (f) => fs.readFileSync(f, "utf8"))(await import("node:fs"));
  const bank = {};
  const seen = new Set();
  for (const file of files) {
    for (const line of String(readFile(file)).split("\n")) {
      if (!line.trim()) continue;
      const { size, paths } = JSON.parse(line);
      const key = `${size}:${endsOf(paths).map(([a, b]) => Math.min(a, b) * 100 + Math.max(a, b)).sort((x, y) => x - y).join(".")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const level = levelFromStats(size, routeStats(size, paths));
      if (!level) continue;
      ((bank[size] ||= { medium: [], hard: [], expert: [] })[level]).push(paths);
    }
  }
  out(JSON.stringify(bank));
}

if (args[0] === "shard") shard(Number(args[1]), Number(args[2]), Number(args[3]));
else if (args[0] === "merge") await merge(args.slice(1));
else out("usage: shard <size> <seed> <count> | merge <files…>");
