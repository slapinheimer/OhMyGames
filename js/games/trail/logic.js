// Trail: draw one line that visits every square, passing the numbered stops in order (1, 2, 3 …)
// and ending on the last one. Walls block the line. Every board has exactly one answer.
//
// A board starts as a random line through every square (made by "backbite" moves on a zigzag),
// with stops at both ends. While a second answer exists, a stop goes where it first leaves the
// real line. Then every stop the answer doesn't need is taken away, and easier levels get
// some back, spread along the line.
import { randInt, seededRandom, shuffle } from "../../core/rng.js";

export const SIZES = [6, 7, 8];
export const DEFAULT_SIZE = 6;
/** walls: how many walls per board side. extra: stops added past the ones the answer needs, per square. */
export const LEVELS = [
  { id: "easy", name: "Easy", walls: 0.5, extra: 0.2 },
  { id: "medium", name: "Medium", walls: 0.5, extra: 0.08 },
  { id: "hard", name: "Hard", walls: 0.5, extra: 0 },
  { id: "expert", name: "Expert", walls: 0, extra: 0 },
];
export const DEFAULT_LEVEL = "medium";
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
export const boardKey = (size, level) => `${size}-${level}`;
export const statsId = (size, level) => `trail-${size}-${level}`;

export const TIME_BANDS = ["<30s", "30s–1m", "1–2m", "2–4m", "4m+"];
export function timeBand(secs) {
  if (secs < 30) return TIME_BANDS[0];
  if (secs < 60) return TIME_BANDS[1];
  if (secs < 120) return TIME_BANDS[2];
  if (secs < 240) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

/** Key for the wall between neighboring squares a and b. */
export const wallKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function neighbors(size, i) {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

/** Squares the line can step to from i: neighbors with no wall between. */
export const open = (size, walls, i) => neighbors(size, i).filter((j) => !walls.has(wallKey(i, j)));

/** A random line through every square. */
function randomPath(rng, size) {
  const n = size * size;
  let path = [];
  for (let r = 0; r < size; r++) {
    for (let k = 0; k < size; k++) path.push(r * size + (r % 2 ? size - 1 - k : k));
  }
  for (let t = 0; t < n * 60; t++) {
    if (rng() < 0.5) path.reverse();
    const head = path[0];
    const opts = neighbors(size, head).filter((j) => j !== path[1]);
    const x = opts[randInt(rng, opts.length)];
    const k = path.indexOf(x);
    path = path.slice(0, k).reverse().concat(path.slice(k));
  }
  return path;
}

/**
 * Count answers up to 2 within `budget` steps. stops: cells in order (first is the start, last is
 * the end). Returns { count, paths } (the answers found), with count -1 when the budget runs out.
 */
export function solve(size, walls, stops, budget = 150000) {
  const n = size * size;
  const adj = Array.from({ length: n }, (_, i) => open(size, walls, i));
  const stopAt = new Int16Array(n).fill(-1);
  stops.forEach((c, k) => { stopAt[c] = k; });
  const end = stops[stops.length - 1];
  const seen = new Uint8Array(n);
  const mark = new Uint32Array(n);
  let stamp = 0;
  const path = [stops[0]];
  seen[stops[0]] = 1;
  const found = [];
  let steps = 0;

  // Every unvisited square must be reachable, and have room to pass through (2 ways in or out,
  // 1 for the end square).
  const viable = (head) => {
    stamp++;
    let reached = 0;
    const stack = [head];
    mark[head] = stamp;
    while (stack.length) {
      const i = stack.pop();
      for (const j of adj[i]) {
        if (seen[j] || mark[j] === stamp) continue;
        mark[j] = stamp;
        reached++;
        stack.push(j);
      }
    }
    if (reached !== n - path.length) return false;
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      let deg = 0;
      for (const j of adj[i]) if (!seen[j] || j === head) deg++;
      if (deg < (i === end ? 1 : 2)) return false;
    }
    return true;
  };

  const walk = (next) => {
    if (found.length >= 2 || steps > budget) return;
    steps++;
    const head = path[path.length - 1];
    if (path.length === n) { found.push(path.slice()); return; }
    if (!viable(head)) return;
    for (const j of adj[head]) {
      if (seen[j]) continue;
      const s = stopAt[j];
      if (s >= 0 && s !== next) continue;
      if (j === end && path.length !== n - 1) continue;
      seen[j] = 1;
      path.push(j);
      walk(s >= 0 ? next + 1 : next);
      path.pop();
      seen[j] = 0;
    }
  };
  walk(1);
  return { count: found.length < 2 && steps > budget ? -1 : found.length, paths: found };
}

/** Indexes along `path` for the stops (sorted, always including both ends). */
function makeUnique(size, walls, path, idx) {
  const set = new Set(idx);
  for (let guard = 0; guard < path.length; guard++) {
    const sorted = [...set].sort((a, b) => a - b);
    const res = solve(size, walls, sorted.map((k) => path[k]));
    if (res.count === 1) return sorted;
    // Add a stop where another answer first parts ways with the real line.
    const other = res.paths.find((p) => p.some((c, k) => c !== path[k]));
    let add = other ? other.findIndex((c, k) => c !== path[k]) : -1;
    if (add < 0 || set.has(add)) {
      // Out of budget: split the longest stretch without a stop.
      let best = 0;
      for (let k = 1; k < sorted.length; k++) if (sorted[k] - sorted[k - 1] > sorted[best + 1] - sorted[best]) best = k - 1;
      add = (sorted[best] + sorted[best + 1]) >> 1;
    }
    set.add(add);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * { size, level, path, stops, walls } for a currentPuzzle() id, size and level. path is the answer;
 * stops are cells in order; walls is an array of wallKey strings.
 */
export function boardFor(puzzle, size = DEFAULT_SIZE, level = DEFAULT_LEVEL) {
  return { ...makeBoard(seededRandom("trail", `${puzzle.id}:${size}:${level}`), size, levelById(level)), level };
}

/**
 * Climb: an endless run where each board is a step harder than the last. Three boards at each
 * size (6×6, 7×7, 8×8), with fewer numbers each time; after that, 8×8 with no walls.
 */
const CLIMB = [
  [6, 0.5, 0.2], [6, 0.5, 0.1], [6, 0.5, 0],
  [7, 0.5, 0.15], [7, 0.5, 0.06], [7, 0.5, 0],
  [8, 0.5, 0.1], [8, 0.5, 0.04], [8, 0.5, 0],
];
export function climbRule(stage) {
  const [size, walls, extra] = CLIMB[stage - 1] || [8, 0, 0];
  return { size, walls, extra };
}

/** The board for a stage of the climb run with this seed. */
export function climbBoard(seed, stage) {
  const rule = climbRule(stage);
  return { ...makeBoard(seededRandom("trail-climb", `${seed}:${stage}`), rule.size, rule), level: "climb" };
}

function makeBoard(rng, size, rule) {
  const n = size * size;
  const path = randomPath(rng, size);
  const onPath = new Set();
  for (let k = 1; k < n; k++) onPath.add(wallKey(path[k - 1], path[k]));
  const free = [];
  for (let i = 0; i < n; i++) for (const j of neighbors(size, i)) if (j > i && !onPath.has(wallKey(i, j))) free.push(wallKey(i, j));
  const walls = new Set(shuffle(free, rng).slice(0, Math.round(rule.walls * size)));

  let idx = makeUnique(size, walls, path, [0, n - 1]);
  for (const k of shuffle(idx.slice(1, -1), rng)) {
    const without = idx.filter((x) => x !== k);
    if (solve(size, walls, without.map((x) => path[x])).count === 1) idx = without;
  }
  // Easier levels get extra stops, spread out along the line.
  const want = idx.length + Math.round(rule.extra * n);
  const set = new Set(idx);
  while (set.size < want) {
    const sorted = [...set].sort((a, b) => a - b);
    let best = 0;
    for (let k = 1; k < sorted.length; k++) if (sorted[k] - sorted[k - 1] > sorted[best + 1] - sorted[best]) best = k - 1;
    if (sorted[best + 1] - sorted[best] < 2) break;
    set.add((sorted[best] + sorted[best + 1]) >> 1);
  }
  idx = [...set].sort((a, b) => a - b);
  return { size, path, stops: idx.map((k) => path[k]), walls: [...walls] };
}

/**
 * Can the line step from its last square to j? Returns "" if so, else a reason:
 * "far" (not next door), "wall", "used" (already on the line) or "order" (a stop out of turn).
 */
export function stepError(board, wallSet, line, j) {
  const { size, stops } = board;
  const head = line[line.length - 1];
  if (!neighbors(size, head).includes(j)) return "far";
  if (wallSet.has(wallKey(head, j))) return "wall";
  if (line.includes(j)) return "used";
  const s = stops.indexOf(j);
  if (s >= 0 && s !== reachedStops(board, line)) return "order";
  return "";
}

/** How many stops the line has passed. */
export function reachedStops(board, line) {
  const set = new Set(line);
  let k = 0;
  while (k < board.stops.length && set.has(board.stops[k])) k++;
  return k;
}

export const solved = (board, line) => line.length === board.size * board.size
  && line[line.length - 1] === board.stops[board.stops.length - 1] && reachedStops(board, line) === board.stops.length;

/**
 * Next hint: the line cut back to where it leaves the answer, then up to `ahead` more squares
 * of the answer (stopping at the next stop). Returns the new line.
 */
export function nextHint(board, line, ahead = 4) {
  const { path, stops } = board;
  let k = 0;
  while (k < line.length && line[k] === path[k]) k++;
  const out = path.slice(0, Math.max(k, 1));
  for (let t = 0; t < ahead && out.length < path.length; t++) {
    const c = path[out.length];
    out.push(c);
    if (stops.includes(c)) break;
  }
  return out;
}

export function shareText({ puzzle, size, level, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My PATTERNS! Trail ${label}${tip}\n〰️ ${size}×${size} ${levelById(level).name} in ${formatTime(time)}`;
}
