// Crossword pregeneration / testing / template search under JavaScriptCore.
// Run from the repo root (tools/gen_crosswords.sh wraps this):
//
//   JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
//   $JSC -m tools/gen_crosswords.mjs -- daily <game> <YYYY-MM-DD> <days>   # write puzzle files
//   $JSC -m tools/gen_crosswords.mjs -- test  <game> <YYYY-MM-DD> <days>   # generate + validate, no writes
//   $JSC -m tools/gen_crosswords.mjs -- templates <size> <minBlack> <maxBlack> <maxRun> <minWords> <maxWords> <max3> <seed> <seconds>
//
// Output files: data/crossword/puzzles/<game>/<date>.json (directory must exist).
// Uses exactly the same generator + config as the browser, so results match.
import { generatePuzzle, buildIndex, checkTemplate, parseTemplate, findSlots, fillTemplate } from "../js/games/crossword/generator.js";
import { GEN, puzzleUrl } from "../js/games/crossword/config.js";
import { seededRandom, mulberry32, addDays } from "../js/core/rng.js";

const args = typeof arguments !== "undefined" ? [...arguments] : [];
const mode = args[0];
const raw = JSON.parse(readFile("data/crossword/words.json"));
const TEMPLATES = JSON.parse(readFile("data/crossword/templates.json"));
const ALL_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function validate(p, gameId) {
  const errs = [];
  const seen = new Set();
  const dict = new Map();
  for (const len of Object.keys(raw)) for (const [w] of raw[len]) dict.set(w.toUpperCase().replace(/[^A-Z]/g, ""), 1);
  const rows = p.grid.map((r) => [...r].map((ch) => (ch === "#" ? "#" : ".")).join(""));
  const probs = checkTemplate(rows);
  if (probs.length) errs.push("template: " + probs.join(", "));
  const { slots } = findSlots(parseTemplate(rows));
  const listed = p.clues.across.length + p.clues.down.length;
  if (listed !== slots.length) errs.push(`clue count ${listed} != slots ${slots.length}`);
  for (const dir of ["across", "down"]) {
    for (const c of p.clues[dir]) {
      let word = "";
      for (let i = 0; i < c.len; i++) word += p.grid[c.row + (dir === "down" ? i : 0)][c.col + (dir === "across" ? i : 0)];
      if (word !== c.answer) errs.push(`${c.num}${dir[0]} grid ${word} != ${c.answer}`);
      if (!dict.has(word)) errs.push(`${word} not in word list`);
      if (seen.has(word)) errs.push(`duplicate ${word}`);
      seen.add(word);
      if (!c.clue || c.clue.toUpperCase().replace(/[^A-Z]/g, "").includes(word)) errs.push(`bad clue for ${word}: ${c.clue}`);
    }
  }
  if (p.gameId !== gameId) errs.push("gameId mismatch");
  return errs;
}

function runDaily(write) {
  const game = args[1], start = args[2], days = +args[3] || 1;
  const cfg = GEN[game];
  if (!cfg || !TEMPLATES[game]) throw new Error("unknown game " + game);
  const lengths = new Set();
  for (const t of TEMPLATES[game]) for (const s of findSlots(parseTemplate(t)).slots) lengths.add(s.len);
  const index = buildIndex(raw, [...lengths], cfg.minScore || 0);
  let ok = 0, worst = 0, total = 0, attempts = 0, scoreSum = 0, words = 0;
  for (let d = 0; d < days; d++) {
    const id = addDays(start, d);
    const t0 = preciseTime();
    const p = generatePuzzle({ gameId: game, puzzleId: id, templates: TEMPLATES[game], ...cfg }, raw, seededRandom(game, id), index);
    const ms = (preciseTime() - t0) * 1000;
    total += ms;
    worst = Math.max(worst, ms);
    if (!p) { print(`FAIL ${game} ${id} ${ms.toFixed(0)}ms`); continue; }
    const errs = validate(p, game);
    if (errs.length) { print(`INVALID ${game} ${id}: ${errs.slice(0, 5).join("; ")}`); continue; }
    ok++;
    attempts += p.attempts;
    for (const dir of ["across", "down"]) for (const c of p.clues[dir]) {
      const x = index.get(c.len);
      scoreSum += x.scores[x.words.indexOf(c.answer)];
      words++;
    }
    if (write) writeFile(puzzleUrl(game, id), JSON.stringify(p));
    if (args.includes("--verbose")) print(`${id} ${ms.toFixed(0)}ms attempts=${p.attempts} template=${p.template}`);
  }
  print(JSON.stringify({ game, start, days, ok, avgMs: +(total / days).toFixed(1), worstMs: +worst.toFixed(0),
    avgAttempts: +(attempts / Math.max(ok, 1)).toFixed(2), avgWordScore: +(scoreSum / Math.max(words, 1)).toFixed(1) }));
}

// Simulated annealing over symmetric black patterns; keeps templates that fill reliably.
function runTemplates() {
  const [N, minB, maxB, maxRun, minW, maxW, max3, seed, seconds] = args.slice(1).map(Number);
  const index = buildIndex(raw, ALL_LENGTHS);
  const rng = mulberry32(seed || 1);
  function cost(g, target) {
    let c = 0, n3 = 0, nb = 0;
    const line = (get) => {
      let run = 0;
      for (let i = 0; i <= N; i++) {
        if (i < N && !get(i)) run++;
        else { if (run > 0 && run < 3) c += 10; if (run === 3) n3++; if (run > maxRun) c += 3 * (run - maxRun); run = 0; }
      }
    };
    for (let r = 0; r < N; r++) line((i) => g[r][i]);
    for (let k = 0; k < N; k++) line((i) => g[i][k]);
    for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) if (g[r][k]) nb++;
    c += Math.abs(nb - target) * 2;
    if (n3 > max3) c += n3 - max3;
    for (let r = 0; r < N - 1; r++) for (let k = 0; k < N - 1; k++) if (g[r][k] && g[r + 1][k] && g[r][k + 1] && g[r + 1][k + 1]) c += 4;
    return c;
  }
  function anneal() {
    const target = minB + 2 * Math.floor(rng() * ((maxB - minB) / 2 + 1));
    const g = Array.from({ length: N }, () => Array(N).fill(false));
    for (let i = 0; i < target / 2; i++) { const r = Math.floor(rng() * N), k = Math.floor(rng() * N); g[r][k] = g[N - 1 - r][N - 1 - k] = true; }
    let cur = cost(g, target), T = 3;
    for (let it = 0; it < 20000 && cur > 0; it++) {
      const r = Math.floor(rng() * N), k = Math.floor(rng() * N);
      const v = !g[r][k];
      g[r][k] = g[N - 1 - r][N - 1 - k] = v;
      const nc = cost(g, target);
      if (nc <= cur || rng() < Math.exp((cur - nc) / T)) cur = nc;
      else g[r][k] = g[N - 1 - r][N - 1 - k] = !v;
      T = Math.max(0.05, T * 0.9995);
    }
    if (cur) return null;
    const rows = g.map((row) => row.map((b) => (b ? "#" : ".")).join(""));
    if (checkTemplate(rows).length) return null;
    const n = findSlots(g).slots.length;
    return n >= minW && n <= maxW ? rows : null;
  }
  const end = preciseTime() + (seconds || 60);
  const seen = new Set();
  while (preciseTime() < end) {
    const t = anneal();
    if (!t || seen.has(t.join(""))) continue;
    seen.add(t.join(""));
    let ok = 0;
    const trials = 8;
    for (let d = 0; d < trials; d++) {
      if (fillTemplate(parseTemplate(t), index, seededRandom("tpl", t.join("") + d), { nodeLimit: 2000, beam: 12 })) ok++;
      else if (d >= 2 && ok === 0) break;
    }
    if (ok >= 3) print(JSON.stringify({ ok, trials, t }));
  }
}

if (mode === "daily") runDaily(true);
else if (mode === "test") runDaily(false);
else if (mode === "templates") runTemplates();
else print("usage: daily|test <game> <YYYY-MM-DD> <days>  |  templates <size> <minB> <maxB> <maxRun> <minW> <maxW> <max3> <seed> <seconds>");
