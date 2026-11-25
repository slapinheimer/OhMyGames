// Oh My PATTERNS! — Conduit: join each pair of fittings with a pipe that fills the grid.
// Each size and difficulty has its own daily board, progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import {
  DEFAULT_SIZE, SIZES, DEFAULT_DIFFICULTY, DIFFICULTIES, TIME_BANDS, PALETTE, puzzleFor, freshPipes,
  startStroke, dragTo, stepLine, isSolved, applyHint, shareText, statsId, timeBand, setBank,
} from "./conduit/logic.js";
import { loadJSON } from "../core/words.js";

const GAME = "conduit";
const SIZE_KEY = "conduit:size";
const DIFFICULTY_KEY = "conduit:difficulty";
const WAYS = ["n", "e", "s", "w"];
const OPP = { n: "s", s: "n", e: "w", w: "e" };
const puzzle = currentPuzzle();

defineSettings(GAME, [
  HINTS_SETTING,
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
  { key: "contrast", label: "High contrast", type: "toggle", default: false,
    desc: "Thicker pipes. Every fitting still shows its letter." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

const fresh = (puz) => ({ pipes: freshPipes(puz), hinted: [], time: 0, status: "playing", hints: 0 });
const usable = (grid, puz) => grid && Array.isArray(grid.pipes) && grid.pipes.length === puz.colors && grid.pipes.every(Array.isArray);
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 2 && saved.grids ? saved : { v: 2, size: null, difficulty: null, grids: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
const validDifficulty = (id) => DIFFICULTIES.some((level) => level.id === id);
let size = validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE;
let difficulty = validDifficulty(state.difficulty) ? state.difficulty : validDifficulty(get(DIFFICULTY_KEY)) ? get(DIFFICULTY_KEY) : DEFAULT_DIFFICULTY;
const gridKey = (n, level) => `${n}:${level}`;
const levelName = (id) => (DIFFICULTIES.find((level) => level.id === id) || DIFFICULTIES[2]).name;
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

let P;
let g;
let parts = [];
let undoStack = [];
let cursor = 0;
let keys = false;
let gesture = null;

const clock = el("div.cd-clock");
const sizeBtns = SIZES.map((n) => el("button.cd-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.cd-size-mark", { "aria-hidden": "true" })));
const diffBtns = DIFFICULTIES.map((level) => el("button.cd-diff", {
  type: "button", role: "tab", onclick: () => pickDifficulty(level.id),
}, level.name, el("span.cd-size-mark", { "aria-hidden": "true" })));
const board = el("div.cd-board", { role: "grid", tabindex: "0", "aria-label": "Conduit board" });
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const clearBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askClear() }, "Clear");
const tip = el("p.cd-tip");

main.append(el("div.cd-wrap",
  el("div.cd-top",
    el("div.cd-sizes", { role: "tablist", "aria-label": "Grid size" }, sizeBtns),
    clock),
  el("div.cd-diffs", { role: "tablist", "aria-label": "Difficulty" }, diffBtns),
  board,
  el("div.cd-controls", undoBtn, clearBtn),
  tip));

function cellNode() {
  const arms = {};
  const armNodes = WAYS.map((d) => {
    const node = el(`span.cd-arm.cd-${d}`);
    arms[d] = node;
    return node;
  });
  const hub = el("span.cd-hub");
  const fit = el("span.cd-fit");
  const node = el("div.cd-cell", { role: "gridcell" }, armNodes, hub, fit);
  return { node, arms, hub, fit };
}

function paintNode(part, spec) {
  for (const d of WAYS) part.arms[d].classList.toggle("is-on", !!spec.arms[d]);
  part.hub.classList.toggle("is-on", !!spec.hub);
  part.fit.classList.toggle("is-on", !!spec.letter);
  part.fit.textContent = spec.letter || "";
  part.node.style.setProperty("--cd-fill", spec.fill || "transparent");
  part.node.style.setProperty("--cd-ink", spec.ink || "var(--text)");
  part.node.classList.toggle("is-cursor", !!spec.cursor);
  part.node.classList.toggle("is-head", !!spec.head);
  part.node.classList.toggle("is-hint", !!spec.hint);
  part.node.classList.remove("is-flash");
  const label = spec.letter ? `${spec.letter} fitting` : spec.hub ? "pipe" : "empty";
  part.node.setAttribute("aria-label", spec.cursor ? `${label}, selected` : label);
}

function dirBetween(a, b) {
  const d = b - a;
  if (d === 1) return "e";
  if (d === -1) return "w";
  if (d === size) return "s";
  if (d === -size) return "n";
  return null;
}

function clone(pipes) {
  return pipes.map((path) => path.slice());
}

function samePipes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let k = 0; k < a[i].length; k++) if (a[i][k] !== b[i][k]) return false;
  }
  return true;
}

function connects(path, pair) {
  if (!path || path.length < 2) return false;
  const head = path[0];
  const tail = path[path.length - 1];
  return (head === pair[0] && tail === pair[1]) || (head === pair[1] && tail === pair[0]);
}

function build() {
  gesture = null;
  P = puzzleFor(puzzle, size, difficulty);
  const key = gridKey(size, difficulty);
  if (!usable(state.grids[key], P)) state.grids[key] = fresh(P);
  g = state.grids[key];
  state.size = size;
  state.difficulty = difficulty;
  if (Object.values(state.grids).some((grid) => grid && grid.status === "won")) state.status = "won";
  undoStack = [];
  cursor = P.ends[0][0];
  parts = [];
  const nodes = [];
  for (let i = 0; i < size * size; i++) {
    const part = cellNode();
    parts.push(part);
    nodes.push(part.node);
  }
  board.replaceChildren(...nodes);
  board.style.setProperty("--n", String(size));
  save();
  paint();
}

function pickSize(n) {
  if (n === size) return;
  if (gesture) endGesture();
  size = n;
  set(SIZE_KEY, n);
  build();
}

function pickDifficulty(id) {
  if (id === difficulty) return;
  if (gesture) endGesture();
  difficulty = id;
  set(DIFFICULTY_KEY, id);
  build();
}

function cellAt(clientX, clientY) {
  const rect = board.getBoundingClientRect();
  if (rect.width < 2) return null;
  const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
  const cell = (rect.width - gap * (size - 1)) / size;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const step = cell + gap;
  let c = Math.floor(x / step);
  let r = Math.floor(y / step);
  if (c < 0 || r < 0) return null;
  const intoX = x - c * step;
  const intoY = y - r * step;
  if (intoX > cell) c += 1;
  if (intoY > cell) r += 1;
  if (c < 0 || r < 0 || c >= size || r >= size) return null;
  return r * size + c;
}

function neighbor(cell, key) {
  const r = (cell / size) | 0;
  const c = cell - r * size;
  if (key === "ArrowUp" && r > 0) return cell - size;
  if (key === "ArrowDown" && r + 1 < size) return cell + size;
  if (key === "ArrowLeft" && c > 0) return cell - 1;
  if (key === "ArrowRight" && c + 1 < size) return cell + 1;
  return null;
}

function startGesture(cell, pointerId) {
  if (!started || g.status !== "playing" || gesture) return false;
  const stroke = startStroke(g.pipes, cell, P, g.hinted);
  if (!stroke) return false;
  if (stroke.locked) { toast("A hint locked this pipe"); return false; }
  gesture = { color: stroke.color, path: stroke.path.slice(), before: clone(g.pipes), pointerId };
  g.pipes[stroke.color] = gesture.path.slice();
  cursor = gesture.path[gesture.path.length - 1];
  paint();
  return true;
}

function moveGesture(cell) {
  if (!gesture || cell == null || !gesture.path.length) return;
  const head = gesture.path[gesture.path.length - 1];
  if (cell === head) return;
  const steps = stepLine(head, cell, size);
  if (!steps || !steps.length) return;
  for (const step of steps) {
    const res = dragTo(g.pipes, gesture.color, gesture.path, step, P, g.hinted);
    if (res.type !== "set") break;
    gesture.path = res.path;
    g.pipes[gesture.color] = gesture.path.slice();
    for (const cut of res.cuts) g.pipes[cut.color] = cut.path.slice();
    if (!gesture.path.length) break;
  }
  if (gesture.path.length) cursor = gesture.path[gesture.path.length - 1];
  if (isSolved(g.pipes, P)) endGesture();
  else paint();
}

function endGesture() {
  if (!gesture) return;
  const before = gesture.before;
  const changed = !samePipes(before, g.pipes);
  gesture = null;
  if (changed) {
    undoStack.push(before);
    if (undoStack.length > 200) undoStack.shift();
  }
  afterChange();
}

function lockHints() {
  const block = new Set();
  for (const c of g.hinted) {
    g.pipes[c] = P.paths[c].slice();
    for (const cell of g.pipes[c]) block.add(cell);
  }
  for (let k = 0; k < g.pipes.length; k++) {
    if (g.hinted.includes(k)) continue;
    const at = g.pipes[k].findIndex((cell) => block.has(cell));
    if (at >= 0) g.pipes[k] = g.pipes[k].slice(0, at);
    const pair = P.ends[k];
    if (g.pipes[k].length && g.pipes[k][0] !== pair[0] && g.pipes[k][0] !== pair[1]) g.pipes[k] = [];
  }
}

function undo() {
  if (!started || g.status !== "playing") return;
  if (gesture) {
    g.pipes = gesture.before;
    gesture = null;
    lockHints();
    save();
    paint();
    return;
  }
  if (!undoStack.length) return;
  g.pipes = undoStack.pop();
  lockHints();
  save();
  paint();
}

function askClear() {
  if (g.status !== "playing") return;
  if (gesture) endGesture();
  if (!g.pipes.some((path, c) => path.length && !g.hinted.includes(c))) return;
  showModal({
    title: "Clear the board?",
    content: [
      el("p", "This removes your pipes. Hinted pipes stay, and the clock keeps running."),
      el("div.cd-actions", el("button.btn", { type: "button", onclick: () => {
        undoStack.push(clone(g.pipes));
        g.pipes = g.pipes.map((path, c) => (g.hinted.includes(c) ? P.paths[c].slice() : []));
        save();
        paint();
        document.querySelector(".modal .modal-close")?.click();
      } }, "Clear")),
    ],
  });
}

function useHint() {
  if (!started) return;
  if (gesture) endGesture();
  if (g.status !== "playing") { toast("Already solved"); return; }
  const hint = applyHint(g.pipes, P, g.hinted);
  if (!hint) { toast("Nothing left to reveal"); return; }
  undoStack.push(clone(g.pipes));
  g.pipes = hint.pipes.map((path) => path.slice());
  if (!g.hinted.includes(hint.color)) g.hinted.push(hint.color);
  g.hints++;
  toast(`Pipe ${PALETTE[hint.color].letter} is in`);
  afterChange();
  for (const cell of P.paths[hint.color]) parts[cell].node.classList.add("is-flash");
}

function afterChange() {
  if (g.status === "playing" && isSolved(g.pipes, P)) {
    g.status = "won";
    state.status = "won";
    recordResult(statsId(size, difficulty), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
    save();
    paint();
    toast(g.hints ? "Solved!" : "Solved, no hints!", 2000);
    setTimeout(() => { if (!isModalOpen()) openStats(); }, 1400);
    return;
  }
  save();
  paint();
}

board.addEventListener("pointerdown", (e) => {
  if (!started || g.status !== "playing" || e.button > 0) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell == null) return;
  if (gesture) endGesture();
  if (!startGesture(cell, e.pointerId)) return;
  try { board.setPointerCapture(e.pointerId); } catch { /* pointer already up */ }
  e.preventDefault();
});
board.addEventListener("pointermove", (e) => {
  if (!gesture || gesture.pointerId !== e.pointerId) return;
  moveGesture(cellAt(e.clientX, e.clientY));
});
board.addEventListener("pointerup", (e) => {
  if (!gesture || gesture.pointerId !== e.pointerId) return;
  endGesture();
});
board.addEventListener("pointercancel", () => {
  if (gesture && gesture.pointerId != null) endGesture();
});
board.addEventListener("contextmenu", (e) => e.preventDefault());

setInterval(() => {
  if (!started || !g || g.status !== "playing" || document.hidden || isModalOpen()) return;
  g.time++;
  if (g.time % 5 === 0) save();
  paintClock();
}, 1000);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

function paintClock() {
  clock.textContent = formatTime(g.time);
  clock.hidden = getSetting(GAME, "timer") === false;
}

function paint() {
  const total = size * size;
  const arms = Array.from({ length: total }, () => ({}));
  const colorAt = new Int16Array(total).fill(-1);
  for (let c = 0; c < P.colors; c++) {
    colorAt[P.ends[c][0]] = c;
    colorAt[P.ends[c][1]] = c;
  }
  g.pipes.forEach((path, c) => {
    for (const cell of path) if (cell >= 0 && cell < total) colorAt[cell] = c;
    for (let i = 0; i < path.length - 1; i++) {
      const d = dirBetween(path[i], path[i + 1]);
      if (!d) continue;
      arms[path[i]][d] = true;
      arms[path[i + 1]][OPP[d]] = true;
    }
  });
  const head = gesture ? gesture.path[gesture.path.length - 1] : -1;
  const hinted = new Set(g.hinted);
  parts.forEach((part, i) => {
    const c = colorAt[i];
    const swatch = c >= 0 ? PALETTE[c] : null;
    const onPipe = c >= 0 && g.pipes[c].includes(i);
    const isEnd = c >= 0 && (i === P.ends[c][0] || i === P.ends[c][1]);
    paintNode(part, {
      arms: arms[i],
      hub: onPipe && !isEnd,
      letter: isEnd ? swatch.letter : "",
      fill: swatch ? swatch.fill : "",
      ink: swatch ? swatch.ink : "",
      cursor: keys && i === cursor && g.status === "playing",
      head: i === head,
      hint: c >= 0 && hinted.has(c) && (onPipe || isEnd),
    });
  });
  board.classList.toggle("is-solved", g.status === "won");
  board.dataset.contrast = getSetting(GAME, "contrast") ? "1" : "0";
  sizeBtns.forEach((btn, k) => {
    const n = SIZES[k];
    const grid = state.grids[gridKey(n, difficulty)];
    const st = grid && grid.status === "won" ? "done" : grid && grid.pipes.some((path) => path.length) ? "started" : "";
    btn.classList.toggle("is-on", n === size);
    btn.setAttribute("aria-selected", n === size ? "true" : "false");
    btn.querySelector(".cd-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    btn.setAttribute("aria-label", `${n} by ${n}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  });
  diffBtns.forEach((btn, k) => {
    const level = DIFFICULTIES[k];
    const grid = state.grids[gridKey(size, level.id)];
    const st = grid && grid.status === "won" ? "done" : grid && grid.pipes.some((path) => path.length) ? "started" : "";
    btn.classList.toggle("is-on", level.id === difficulty);
    btn.setAttribute("aria-selected", level.id === difficulty ? "true" : "false");
    btn.querySelector(".cd-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    btn.setAttribute("aria-label", `${level.name}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  });
  const done = g.status === "won";
  undoBtn.disabled = done || (!undoStack.length && !gesture);
  clearBtn.disabled = done || !g.pipes.some((path, c) => path.length && !g.hinted.includes(c));
  const linked = P.ends.filter((pair, c) => connects(g.pipes[c], pair)).length;
  const filled = g.pipes.reduce((sum, path) => sum + path.length, 0);
  const left = SIZES.filter((n) => !(state.grids[gridKey(n, difficulty)] && state.grids[gridKey(n, difficulty)].status === "won"));
  const name = levelName(difficulty);
  tip.textContent = done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${left.length ? ` Try the ${left.map((n) => `${n}×${n}`).join(" or ")}.` : ` All three ${name} sizes done!`}`
    : `${linked} of ${P.colors} pipes connected. ${filled} of ${total} cells filled.`;
  paintClock();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (gesture && gesture.pointerId != null) return;
  if (g.status !== "playing") return;
  keys = true;
  const letter = e.key.length === 1 ? e.key.toUpperCase() : "";
  const color = letter ? PALETTE.findIndex((swatch) => swatch.letter === letter) : -1;
  if (color >= 0 && color < P.colors && !gesture) {
    const pair = P.ends[color];
    cursor = cursor === pair[0] ? pair[1] : pair[0];
    paint();
    e.preventDefault();
    return;
  }
  if (e.key === "z" || e.key === "Z") { e.preventDefault(); undo(); return; }
  if (e.key === "Backspace") {
    e.preventDefault();
    if (gesture && gesture.path.length >= 2) moveGesture(gesture.path[gesture.path.length - 2]);
    else if (gesture) {
      g.pipes[gesture.color] = [];
      gesture.path = [];
      endGesture();
    } else undo();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (gesture) endGesture();
    else startGesture(cursor, null);
    return;
  }
  if (e.key === "Escape" && gesture) { e.preventDefault(); endGesture(); return; }
  const next = neighbor(cursor, e.key);
  if (next == null) return;
  e.preventDefault();
  if (gesture) moveGesture(next);
  else { cursor = next; paint(); }
});

function openStats() {
  const stats = getStats(statsId(size, difficulty));
  const done = g.status === "won";
  const name = levelName(difficulty);
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const best = stats.times && stats.times.length ? Math.min(...stats.times) : null;
  showStats({
    title: done ? "Solved!" : `${size}×${size} ${name} Statistics`,
    message: done ? `${size}×${size} ${name} in ${formatTime(g.time)}` : "Each size and difficulty keeps its own stats.",
    tiles: [
      { label: "Solved", value: stats.won },
      { label: "Win %", value: winPct },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Best Time", value: best == null ? "–" : formatTime(best) },
    ],
    distribution: {
      title: `${size}×${size} ${levelName(difficulty)} Solve Time`,
      rows: TIME_BANDS.map((band) => ({ label: band, count: stats.dist[band] || 0, highlight: done && timeBand(g.time) === band })),
    },
    shareText: done ? shareText({ puzzle, size, difficulty, time: g.time, hints: g.hints, formatTime }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  showModal({
    title: "How To Play",
    className: "cd-help",
    content: [
      el("p.subtitle", "Draw a pipe between each pair of fittings. Fill every cell."),
      exampleBoard(),
      el("ul",
        el("li", "Drag from a letter to the matching letter. Pipes run up, down, left and right, and they turn at right angles."),
        el("li", "Pipes can't cross or branch. Dragging across another pipe cuts that pipe back. Dragging back along yours shortens it."),
        el("li", "Start on a pipe's end or its middle to continue it or trim it there."),
        el("li", "The board is solved when every pair is joined and every cell is full. Each board has one answer."),
        el("li", "Every fitting shows a letter, so a pair is readable without its color.")),
      el("h3", "Sizes and difficulty"),
      el("p", "Pick 5×5, 7×7 or 9×9, and a level. Each one has its own daily board, timer and stats. ✓ marks a board you've solved today."),
      el("ul",
        el("li", el("b", "Easy: "), "short pipes, mostly straight."),
        el("li", el("b", "Medium: "), "some pipes have to take the long way round."),
        el("li", el("b", "Hard: "), "the shortest route between two fittings is usually wrong. Pipes wind around each other."),
        el("li", el("b", "Expert: "), "long, tangled routes. Plan where every pipe goes before you draw.")),
      el("p", "Pick other days from 📅, or tap 🔀 for a practice board."),
      el("p", "Stuck? Tap 💡 to lay one whole correct pipe. Turn hints off in Settings, where you can also hide the timer or thicken the pipes."),
      el("p", "Undo and Clear sit under the board. With the keyboard, arrows move the cursor, Enter starts or finishes a pipe, arrows extend it, Backspace shortens it, and a letter jumps to that pair."),
    ],
  });
}

function exampleBoard() {
  const n = 3;
  const paths = [[0, 1, 4], [2, 5, 8], [3, 6, 7]];
  const ends = [[0, 4], [2, 8], [3, 7]];
  const node = el("div.cd-board.cd-ex", { "aria-hidden": "true" });
  node.style.setProperty("--n", "3");
  const bits = [];
  for (let i = 0; i < n * n; i++) bits.push(cellNode());
  node.append(...bits.map((part) => part.node));
  const arms = Array.from({ length: 9 }, () => ({}));
  const colorAt = new Int16Array(9).fill(-1);
  paths.forEach((path, c) => {
    colorAt[ends[c][0]] = c;
    colorAt[ends[c][1]] = c;
    for (const cell of path) colorAt[cell] = c;
    for (let i = 0; i < path.length - 1; i++) {
      const d = path[i + 1] - path[i];
      const way = d === 1 ? "e" : d === -1 ? "w" : d === n ? "s" : "n";
      const back = OPP[way];
      arms[path[i]][way] = true;
      arms[path[i + 1]][back] = true;
    }
  });
  bits.forEach((part, i) => {
    const c = colorAt[i];
    const swatch = PALETTE[c];
    const isEnd = i === ends[c][0] || i === ends[c][1];
    paintNode(part, {
      arms: arms[i],
      hub: !isEnd,
      letter: isEnd ? swatch.letter : "",
      fill: swatch.fill,
      ink: swatch.ink,
    });
  });
  return node;
}

setBank(await loadJSON("data/conduit/boards.json").catch(() => null));
build();

const solved = [];
for (const n of SIZES) {
  for (const level of DIFFICULTIES) {
    const grid = state.grids[gridKey(n, level.id)];
    if (grid && grid.status === "won") solved.push(`${n}×${n} ${level.name}`);
  }
}
await splash({
  gameId: GAME,
  puzzle,
  playLabel: g.status === "won" ? "See results" : (g.pipes.some((path) => path.length) ? "Continue" : "Play"),
  tagline: solved.length
    ? `Solved today: ${solved.join(", ")}`
    : "Join the fittings. Easy to Expert.",
});
started = true;
paint();
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
