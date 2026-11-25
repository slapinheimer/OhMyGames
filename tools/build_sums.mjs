// Build the bank of Cross Sums boards (data/sums/boards.json): for every size, boards graded
// Easy, Moderate and Hard, each with exactly one answer. Making big boards can take seconds,
// so they're made here rather than in the browser.
//
// Run with JavaScriptCore (or node), one process at a time, then merge:
//   JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
//   $JSC -m tools/build_sums.mjs -- shard 9 11 1 30 > /tmp/s-9x11.jsonl   # rows, cols, seed, boards per level
//   $JSC -m tools/build_sums.mjs -- merge /tmp/s-*.jsonl > data/sums/boards.json
//
// A board is stored as one string, row by row: "." for a clue or blank square, else the
// answer digit. The clues follow from the answer.
import { seededRandom } from "../js/core/rng.js";
import { LEVELS, countSolutions, ease, grade, makeBoard } from "../js/games/sums/logic.js";

const out = typeof print === "function" ? print : (s) => console.log(s);
const args = globalThis.arguments ? [...globalThis.arguments] : process.argv.slice(2);

const encode = (b) => b.solution.map((v, i) => (b.white[i] ? String(v) : ".")).join("");

function shard(rows, cols, seed, count) {
  const rng = seededRandom("sums-build", `${rows}x${cols}:${seed}`);
  const made = { 1: 0, 2: 0, 3: 0 };
  const seen = new Set();
  for (let t = 0; t < count * 60 && Object.values(made).some((n) => n < count); t++) {
    const b = makeBoard(rng, rows, cols);
    if (!b) continue;
    // Aim at whichever level is furthest behind.
    const want = [1, 2, 3].sort((x, y) => made[x] - made[y])[0];
    if (want < 3 && !ease(b, rng, want, 600)) continue;
    const g = grade(b);
    if (made[g] >= count || countSolutions(b, 2, 2000000) !== 1) continue;
    const s = encode(b);
    if (seen.has(s)) continue;
    seen.add(s);
    made[g]++;
    out(JSON.stringify({ rows, cols, level: LEVELS[g - 1].id, s }));
  }
}

/** Merge shard files into { "9x11": { easy: [...], moderate: [...], hard: [...] }, ... }. */
async function merge(files) {
  const readFile = typeof read === "function" ? (f) => read(f) : ((fs) => (f) => fs.readFileSync(f, "utf8"))(await import("node:fs"));
  const bank = {};
  const seen = new Set();
  for (const file of files) {
    for (const line of String(readFile(file)).split("\n")) {
      if (!line.trim()) continue;
      const { rows, cols, level, s } = JSON.parse(line);
      if (seen.has(s)) continue;
      seen.add(s);
      ((bank[`${rows}x${cols}`] ||= { easy: [], moderate: [], hard: [] })[level]).push(s);
    }
  }
  out(JSON.stringify(bank));
}

if (args[0] === "shard") shard(Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4]));
else if (args[0] === "merge") await merge(args.slice(1));
else out("usage: shard <rows> <cols> <seed> <count> | merge <files…>");
