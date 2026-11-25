// Lettergrams: place all twelve rack tiles on a 5×5 board as connected words, scored with letter points and bonus squares.
// A round (rack, bonus squares, top score) is a pure function of the puzzle id.
import { shuffle, seededRandom } from "../../core/rng.js";

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const RACK = 12;

export const POINTS = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

export const BONUS = {
  DL: { letter: 2, word: 1, name: "Double letter" },
  TL: { letter: 3, word: 1, name: "Triple letter" },
  DW: { letter: 1, word: 2, name: "Double word" },
  TW: { letter: 1, word: 3, name: "Triple word" },
};

/** Share of the top score needed for 1–5 stars. Any finished board earns one. */
export const STAR_FRACTIONS = [0, 0.5, 0.65, 0.8, 0.9];
export const STAR_WORDS = ["", "Board cleared", "Good", "Great", "Superb", "Brilliant"];

/** Every two-letter word in ENABLE. dictionary.txt starts at three letters. */
export const TWO_LETTER = new Set((
  "aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by de do ed ef eh el em en er es et ex fa " +
  "go ha he hi hm ho id if in is it jo ka la li lo ma me mi mm mo mu my na ne no nu od oe of oh om on op " +
  "or os ow ox oy pa pe pi re sh si so ta ti to uh um un up us ut we wo xi xu ya ye yo"
).split(" "));

// The top-score search sticks to familiar words so five stars stays within reach.
const EASY_TWOS = (
  "ah am an as at aw ax ay be by do eh go ha he hi ho if in is it lo ma me my no of oh on or ow ox pa pi " +
  "so to uh um up us we ye yo"
).split(" ");
const RANK_MAX = 20000;
const BLOCK = new Set([
  "anal", "anus", "cock", "coon", "crap", "cunt", "dick", "dyke", "fag", "fags", "fuck", "homo", "jizz",
  "kike", "nazi", "nigga", "paki", "penis", "piss", "porn", "pussy", "rape", "shit", "slut", "spic",
  "tits", "twat", "whore", "wank",
]);

// Letter bag (word-tile distribution, no blanks) that racks are drawn from.
const BAG = {
  a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1, k: 1, l: 4, m: 2,
  n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6, u: 4, v: 2, w: 2, x: 1, y: 2, z: 1,
};
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const BEAM = 150;
const ATTEMPTS = 30;

/** True for a playable word: ENABLE, plus its two-letter words. */
export function wordChecker(dictionary) {
  return (w) => (w.length === 2 ? TWO_LETTER.has(w) : dictionary.has(w));
}

/**
 * Score a board. `grid` is 25 letters or "" (row-major), `bonus` is 25 of "", DL, TL, DW, TW.
 * Every maximal run of two or more letters is a word. Valid words score
 * (sum of letter points × letter bonus) × word bonus. Returns the live score, each word,
 * the squares in invalid words, the squares cut off from the main group, and whether
 * the board is finished (all tiles placed, every word valid, one connected group).
 */
export function scoreBoard(grid, bonus, isWord) {
  const words = [];
  const invalid = new Set();
  let score = 0;
  const scan = (cellAt) => {
    for (let line = 0; line < SIZE; line++) {
      let run = [];
      for (let k = 0; k <= SIZE; k++) {
        const i = k < SIZE ? cellAt(line, k) : -1;
        if (i >= 0 && grid[i]) { run.push(i); continue; }
        if (run.length >= 2) {
          const word = run.map((j) => grid[j]).join("");
          const valid = isWord(word);
          let sum = 0;
          let mult = 1;
          for (const j of run) {
            const b = BONUS[bonus[j]];
            sum += POINTS[grid[j]] * (b ? b.letter : 1);
            if (b) mult *= b.word;
          }
          const points = valid ? sum * mult : 0;
          score += points;
          words.push({ word, cells: run, valid, points });
          if (!valid) run.forEach((j) => invalid.add(j));
        }
        run = [];
      }
    }
  };
  scan((r, c) => r * SIZE + c);
  scan((c, r) => r * SIZE + c);

  const filled = [];
  for (let i = 0; i < CELLS; i++) if (grid[i]) filled.push(i);
  const group = new Int8Array(CELLS).fill(-1);
  const sizes = [];
  for (const start of filled) {
    if (group[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    group[start] = id;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const j of [r > 0 ? i - SIZE : -1, r < SIZE - 1 ? i + SIZE : -1, c > 0 ? i - 1 : -1, c < SIZE - 1 ? i + 1 : -1]) {
        if (j >= 0 && grid[j] && group[j] < 0) { group[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  let main = 0;
  sizes.forEach((s, id) => { if (s > sizes[main]) main = id; });
  const disconnected = new Set();
  if (filled.length > 1) {
    for (const i of filled) if (sizes[group[i]] < 2 || group[i] !== main) disconnected.add(i);
  }
  const complete = filled.length === RACK && invalid.size === 0 && disconnected.size === 0 && words.length > 0;
  return { score, words, invalid, disconnected, placed: filled.length, complete };
}

/** Stars for a finished board (1–5). Unfinished boards earn none. */
export function starsFor(score, target, complete = true) {
  if (!complete || score <= 0) return 0;
  let stars = 1;
  for (let s = 2; s <= 5; s++) if (score >= threshold(s, target)) stars = s;
  return stars;
}

/** Points needed for `stars` stars. */
export function threshold(stars, target) {
  return stars <= 1 ? 1 : Math.ceil(target * STAR_FRACTIONS[stars - 1]);
}

// ---------------------------------------------------------------- puzzle construction

function drawRack(rng) {
  const bag = [];
  for (const [ch, n] of Object.entries(BAG)) for (let i = 0; i < n; i++) bag.push(ch);
  for (;;) {
    const rack = shuffle(bag, rng).slice(0, RACK);
    const vowels = rack.filter((ch) => VOWELS.has(ch)).length;
    const hard = rack.filter((ch) => "jqxz".includes(ch)).length;
    const counts = {};
    rack.forEach((ch) => { counts[ch] = (counts[ch] || 0) + 1; });
    if (vowels < 4 || vowels > 5 || hard > 1) continue;
    if (counts.q && !counts.u) continue;
    if (Object.values(counts).some((n) => n > 3)) continue;
    return rack;
  }
}

/** One each of DL, TL, DW, TW on squares that don't touch. */
function drawBonus(rng) {
  const bonus = Array(CELLS).fill("");
  const types = shuffle(Object.keys(BONUS), rng);
  const order = shuffle([...Array(CELLS).keys()], rng);
  const near = (a, b) => Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) + Math.abs((a % SIZE) - (b % SIZE)) <= 1;
  const chosen = [];
  for (const i of order) {
    if (chosen.length === types.length) break;
    if (chosen.some((j) => near(i, j))) continue;
    chosen.push(i);
  }
  chosen.forEach((i, k) => { bonus[i] = types[k]; });
  return bonus;
}

/** Words the top-score search may use: familiar 2–5 letter words. */
export function solverWords(common, dictionary) {
  const out = [...EASY_TWOS];
  for (const [word, rank] of common) {
    if (word.length < 3 || word.length > SIZE || rank > RANK_MAX) continue;
    if (BLOCK.has(word) || !dictionary.has(word)) continue;
    out.push(word);
  }
  return out;
}

const letterCode = (ch) => ch.charCodeAt(0) - 97;

/** Score of a grid whose runs are all known to be words. */
function quickScore(g, bonus) {
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let line = 0; line < SIZE; line++) {
      let sum = 0;
      let mult = 1;
      let len = 0;
      for (let k = 0; k <= SIZE; k++) {
        const i = k < SIZE ? (pass ? k * SIZE + line : line * SIZE + k) : -1;
        if (i >= 0 && g[i]) {
          const b = BONUS[bonus[i]];
          sum += POINTS[g[i]] * (b ? b.letter : 1);
          if (b) mult *= b.word;
          len++;
          continue;
        }
        if (len >= 2) score += sum * mult;
        sum = 0;
        mult = 1;
        len = 0;
      }
    }
  }
  return score;
}

/** Letters across (dir 1) or down (dir SIZE) through cell i, with `ch` placed there. */
function crossWord(g, i, ch, dir) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const step = dir === 1 ? 1 : SIZE;
  const inLine = (j) => (dir === 1 ? Math.floor(j / SIZE) === r : j % SIZE === c);
  let start = i;
  while (start - step >= 0 && inLine(start - step) && g[start - step]) start -= step;
  let word = "";
  for (let j = start; j < CELLS && inLine(j) && (j === i || g[j]); j += step) word += j === i ? ch : g[j];
  return word;
}

/**
 * Beam search for a high-scoring board that uses the whole rack.
 * States are grouped by tiles placed, and only the best BEAM in each group grow.
 * The search is deterministic: the same rack and bonus squares give the same board.
 */
export function solve(rack, bonus, pool, beam = BEAM) {
  const left0 = new Int8Array(26);
  rack.forEach((ch) => { left0[letterCode(ch)]++; });
  const words = pool.words.filter((w) => {
    const need = new Int8Array(26);
    for (const ch of w) if (++need[letterCode(ch)] > left0[letterCode(ch)]) return false;
    return true;
  });
  const isWord = (w) => w.length < 2 || pool.set.has(w);
  const buckets = Array.from({ length: RACK + 1 }, () => new Map());
  const used = new Int8Array(26);

  const add = (state) => {
    const bucket = buckets[state.placed];
    if (bucket.has(state.key)) return;
    bucket.set(state.key, state);
    if (bucket.size > beam * 4) prune(state.placed);
  };
  const prune = (t) => {
    const kept = [...buckets[t].values()]
      .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .slice(0, beam);
    buckets[t] = new Map(kept.map((s) => [s.key, s]));
  };

  const expand = (state) => {
    const { g, left, placed } = state;
    for (const dir of [1, SIZE]) {
      const cross = dir === 1 ? SIZE : 1;
      for (let line = 0; line < SIZE; line++) {
        const cellAt = (k) => (dir === 1 ? line * SIZE + k : k * SIZE + line);
        let lineHas = false;
        for (let k = 0; k < SIZE; k++) if (g[cellAt(k)]) lineHas = true;
        if (placed > 0 && !lineHas) continue;
        for (const w of words) {
          const L = w.length;
          for (let off = 0; off + L <= SIZE; off++) {
            if (off > 0 && g[cellAt(off - 1)]) continue;
            if (off + L < SIZE && g[cellAt(off + L)]) continue;
            let crosses = false;
            let fresh = 0;
            let ok = true;
            used.fill(0);
            for (let k = 0; k < L; k++) {
              const ch = g[cellAt(k + off)];
              if (ch) {
                if (ch !== w[k]) { ok = false; break; }
                crosses = true;
              } else {
                const code = letterCode(w[k]);
                if (used[code] >= left[code]) { ok = false; break; }
                used[code]++;
                fresh++;
              }
            }
            if (!ok || fresh === 0 || (placed > 0 && !crosses)) continue;
            for (let k = 0; k < L && ok; k++) {
              const i = cellAt(k + off);
              if (!g[i] && !isWord(crossWord(g, i, w[k], cross))) ok = false;
            }
            if (!ok) continue;
            const ng = g.slice();
            const nl = left.slice();
            for (let k = 0; k < L; k++) {
              const i = cellAt(k + off);
              if (!ng[i]) { ng[i] = w[k]; nl[letterCode(w[k])]--; }
            }
            add({ g: ng, left: nl, placed: placed + fresh, score: quickScore(ng, bonus), key: ng.map((ch) => ch || ".").join("") });
          }
        }
      }
    }
  };

  expand({ g: Array(CELLS).fill(""), left: left0, placed: 0, score: 0 });
  for (let t = 1; t < RACK; t++) {
    if (!buckets[t].size) continue;
    prune(t);
    for (const state of buckets[t].values()) expand(state);
  }
  if (!buckets[RACK].size) return null;
  prune(RACK);
  const best = buckets[RACK].values().next().value;
  return { grid: best.g, score: best.score };
}

/** { rack, bonus, target, best } for a currentPuzzle() id. `pool` is { words, set } from solverWords. */
export function puzzleFor(puzzle, pool) {
  const rng = seededRandom("lettergrams", puzzle.id);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rack = drawRack(rng);
    const bonus = drawBonus(rng);
    const found = solve(rack, bonus, pool);
    if (found) return { rack, bonus, target: found.score, best: found.grid };
  }
  throw new Error("Could not build a Lettergrams puzzle");
}

export function shareText({ puzzle, score, stars, words, hints = 0 }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My WORDS! Lettergrams ${puzzle.number}`
    : "Oh My WORDS! Lettergrams";
  return `${head} ${stars}/5\n${"⭐".repeat(stars)}${"☆".repeat(5 - stars)}\n🪄 ${score} points in ${words} word${words === 1 ? "" : "s"}${hints ? ` 💡${hints}` : ""}`;
}
