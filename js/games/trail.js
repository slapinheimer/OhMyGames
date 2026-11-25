// Oh My PATTERNS! — Trail: draw one line through every square, passing the numbered stops in order.
// Each day has a board for every size (6×6, 7×7, 8×8) and level (Easy to Expert).
// Each size and level keeps its own progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import {
  DEFAULT_LEVEL, DEFAULT_SIZE, LEVELS, SIZES, TIME_BANDS, boardFor, boardKey, climbBoard, climbRule, levelById, neighbors, nextHint,
  reachedStops, shareText, solved, statsId, stepError, timeBand, wallKey,
} from "./trail/logic.js";

const GAME = "trail";
const SIZE_KEY = "trail:size";
const LEVEL_KEY = "trail:level";
const CACHE_KEY = "trail:boards";
const CLIMB_KEY = "trail:climb";
const puzzle = currentPuzzle();
defineSettings(GAME, [
  HINTS_SETTING,
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// state.boards["<size>-<level>"]: { line (cells in order), time, status, hints }.
// state.status is "won" once any board is solved, so the hub shows the day as done.
const freshBoard = () => ({ line: [], time: 0, status: "playing", hints: 0 });
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.boards ? saved : { size: null, boards: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
const daySize = () => (validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE);
let size = daySize();
// Climb sits next to the levels in the picker but isn't tied to a day: each board solved moves
// it a stage harder. It's kept in one record: { seed, stage, best, board }.
const CLIMB_PICK = { id: "climb", name: "Climb" };
const PICKS = [...LEVELS, CLIMB_PICK];
const validLevel = (id) => PICKS.some((l) => l.id === id);
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
const isClimb = () => level === "climb";
const newClimb = (best = 0) => ({ seed: Math.random().toString(36).slice(2, 10), stage: 1, best, board: freshBoard() });
let climb = get(CLIMB_KEY, null);
if (!climb || !climb.board || !Number.isInteger(climb.stage)) climb = newClimb();
const entry = (n = size, l = level) => state.boards[boardKey(n, l)];
const save = () => {
  saveState(GAME, puzzle.id, state);
  set(CLIMB_KEY, climb);
};
let started = false;

let B, g, walls, cells, badges;
let undoStack = [];

// ---------------------------------------------------------------- layout

const clock = el("div.tr-clock");
const sizeBtns = SIZES.map((n) => el("button.tr-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.tr-mark", { "aria-hidden": "true" })));
const levelBtns = PICKS.map((l) => el("button.tr-level", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.tr-mark", { "aria-hidden": "true" })));

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "tr-lines");
svg.setAttribute("aria-hidden", "true");
const cellLayer = el("div.tr-layer.tr-cells");
const topLayer = el("div.tr-layer.tr-top", { "aria-hidden": "true" });
const board = el("div.tr-board", { role: "grid", "aria-label": "Trail board" }, cellLayer, svg, topLayer);
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const clearBtn = el("button.btn.small.secondary", { type: "button", onclick: () => clearLine() }, "Clear");
const nextBtn = el("button.btn.small", { type: "button", onclick: () => nextStage() }, "Next board");
const restartBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askRestart() }, "Start over");
const tip = el("p.tr-tip");
const sizeRow = el("div.tr-sizes", { role: "tablist", "aria-label": "Board size" }, sizeBtns);
const stageEl = el("div.tr-stage");

main.append(el("div.tr-wrap",
  el("div.tr-top-row", sizeRow, stageEl, clock),
  el("div.tr-sizes.tr-levels", { role: "tablist", "aria-label": "Difficulty" }, levelBtns),
  board,
  el("div.tr-controls", undoBtn, clearBtn, restartBtn, nextBtn),
  tip));

// 8×8 boards can take a moment to find, so the last few are kept in this browser.
function loadBoard() {
  const id = isClimb() ? `climb:${climb.seed}:${climb.stage}` : `${puzzle.id}:${size}:${level}`;
  const cache = get(CACHE_KEY, []);
  const hit = cache.find((b) => b.id === id);
  if (hit && hit.path.length === size * size) return { size, level, path: hit.path, stops: hit.stops, walls: hit.walls };
  const b = isClimb() ? climbBoard(climb.seed, climb.stage) : boardFor(puzzle, size, level);
  set(CACHE_KEY, [{ id, path: b.path, stops: b.stops, walls: b.walls }, ...cache].slice(0, 16));
  return b;
}

function build() {
  if (isClimb()) {
    size = climbRule(climb.stage).size;
    if (!Array.isArray(climb.board.line)) climb.board = freshBoard();
  } else size = daySize();
  B = loadBoard();
  walls = new Set(B.walls);
  if (isClimb()) g = climb.board;
  else {
    const key = boardKey(size, level);
    if (!state.boards[key] || !Array.isArray(state.boards[key].line)) state.boards[key] = freshBoard();
    g = state.boards[key];
    state.size = size;
  }
  state.level = level;
  undoStack = [];
  const n = size * size;
  cells = Array.from({ length: n }, (_, i) => el("div.tr-cell", { role: "gridcell", dataset: { i: String(i) } }));
  badges = Array.from({ length: n }, (_, i) => {
    const s = B.stops.indexOf(i);
    const cls = [
      i % size < size - 1 && walls.has(wallKey(i, i + 1)) ? ".w-r" : "",
      i + size < n && walls.has(wallKey(i, i + size)) ? ".w-b" : "",
    ].join("");
    return el(`div.tr-spot${cls}`, s >= 0 ? el("span.tr-stop", String(s + 1)) : null);
  });
  cellLayer.replaceChildren(...cells);
  topLayer.replaceChildren(...badges);
  board.style.setProperty("--n", String(size));
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  save();
  paint();
}

function pickSize(n) {
  if (n === size || isClimb()) return;
  state.size = n;
  set(SIZE_KEY, n);
  rebuild();
}

function pickLevel(id) {
  if (id === level) return;
  level = id;
  set(LEVEL_KEY, id);
  rebuild();
}

// Let the picker repaint before a slow board is built.
function rebuild() {
  board.classList.add("is-loading");
  tip.textContent = "Building the board…";
  setTimeout(() => { build(); board.classList.remove("is-loading"); }, 20);
}

// ---------------------------------------------------------------- drawing

const playing = () => started && g.status === "playing";

function remember() {
  undoStack.push(g.line.slice());
  if (undoStack.length > 300) undoStack.shift();
}

const say = { wall: "A wall is in the way", order: "Take the numbers in order", used: "The line can't cross itself" };

/** Extend the line toward cell j: one square, or along a straight row or column. */
function reach(j, quiet) {
  const line = g.line;
  for (let guard = 0; guard < size * 2; guard++) {
    const head = line[line.length - 1];
    if (head === j) return;
    let next = j;
    if (!neighbors(size, head).includes(j)) {
      const hr = Math.floor(head / size), hc = head % size, jr = Math.floor(j / size), jc = j % size;
      if (hr === jr) next = head + Math.sign(jc - hc);
      else if (hc === jc) next = head + size * Math.sign(jr - hr);
      else return;
    }
    const err = stepError(B, walls, line, next);
    if (err) {
      if (!quiet && say[err]) toast(say[err]);
      return;
    }
    line.push(next);
  }
}

/** Point at cell j: start, cut back, step back, or extend. */
function touch(j, fresh) {
  const line = g.line;
  if (!line.length || (fresh && j === B.stops[0])) {
    if (j !== B.stops[0]) { if (fresh) toast("Start on 1"); return; }
    g.line = [j];
    return;
  }
  const at = line.indexOf(j);
  if (at >= 0) { g.line = line.slice(0, at + 1); return; }
  reach(j, !fresh);
}

let drawing = false;
let lastCell = -1;
const cellAt = (e) => {
  const node = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".tr-cell");
  return node && cellLayer.contains(node) ? Number(node.dataset.i) : -1;
};
board.addEventListener("pointerdown", (e) => {
  if (!playing() || e.button > 0) return;
  const j = cellAt(e);
  if (j < 0) return;
  e.preventDefault();
  board.setPointerCapture?.(e.pointerId);
  drawing = true;
  lastCell = j;
  remember();
  touch(j, true);
  afterChange();
});
board.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const j = cellAt(e);
  if (j < 0 || j === lastCell) return;
  lastCell = j;
  const line = g.line;
  if (!line.length) return;
  if (line.length > 1 && j === line[line.length - 2]) line.pop();
  else touch(j, false);
  afterChange();
});
const endDraw = () => {
  if (!drawing) return;
  drawing = false;
  // Drop the undo step if nothing changed.
  const last = undoStack[undoStack.length - 1];
  if (last && last.length === g.line.length && last.every((c, k) => c === g.line[k])) undoStack.pop();
  paint();
};
board.addEventListener("pointerup", endDraw);
board.addEventListener("pointercancel", endDraw);
board.style.touchAction = "none";

function afterChange() {
  if (solved(B, g.line) && isClimb()) {
    drawing = false;
    g.status = "won";
    climb.best = Math.max(climb.best, climb.stage);
    save();
    paint();
    toast(`Board ${climb.stage} done!`, 1600);
    return;
  }
  if (solved(B, g.line)) {
    drawing = false;
    g.status = "won";
    state.status = "won";
    recordResult(statsId(size, level), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
    save();
    paint();
    toast(g.hints ? "Solved!" : "Solved, no hints!", 2000);
    setTimeout(() => { if (!isModalOpen()) openStats(); }, 1400);
    return;
  }
  save();
  paint();
}

function undo() {
  if (!undoStack.length || g.status !== "playing") return;
  g.line = undoStack.pop();
  save();
  paint();
}

function clearLine() {
  if (g.status !== "playing" || !g.line.length) return;
  remember();
  g.line = [];
  save();
  paint();
}

function nextStage() {
  if (!isClimb() || g.status !== "won") return;
  climb.stage++;
  climb.board = freshBoard();
  save();
  rebuild();
}

function askRestart() {
  if (!isClimb() || (climb.stage === 1 && !g.line.length)) return;
  showModal({
    title: "Start the climb over?",
    content: [
      el("p", `You're on board ${climb.stage}. Starting over goes back to an easy 6×6 with new boards. Your best (board ${climb.best || 0}) is kept.`),
      el("div.tr-actions", el("button.btn", { type: "button", onclick: () => {
        climb = newClimb(climb.best);
        save();
        document.querySelector(".modal .modal-close")?.click();
        rebuild();
      } }, "Start over")),
    ],
  });
}

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("Already solved"); return; }
  remember();
  const before = g.line.length;
  g.line = nextHint(B, g.line);
  g.hints++;
  toast(g.line.length < before ? "Cut back to where the line went wrong, then a few steps on" : "A few more steps");
  afterChange();
}

// ---------------------------------------------------------------- clock

setInterval(() => {
  if (!playing() || document.hidden || isModalOpen()) return;
  g.time++;
  if (g.time % 5 === 0) save();
  paintClock();
}, 1000);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

function paintClock() {
  clock.textContent = formatTime(g.time);
  clock.hidden = getSetting(GAME, "timer") === false;
}

// ---------------------------------------------------------------- paint

const pt = (i) => `${(i % size) + 0.5},${Math.floor(i / size) + 0.5}`;

function paint() {
  const done = g.status !== "playing";
  const line = g.line;
  const on = new Set(line);
  const head = line[line.length - 1];
  const parts = [];
  if (line.length > 1) parts.push(`<polyline points="${line.map(pt).join(" ")}"/>`);
  if (line.length) parts.push(`<circle class="tr-head" cx="${(head % size) + 0.5}" cy="${Math.floor(head / size) + 0.5}" r="0.24"/>`);
  svg.innerHTML = parts.join("");
  const passed = reachedStops(B, line);
  cells.forEach((node, i) => {
    node.classList.toggle("is-on", on.has(i));
    const s = B.stops.indexOf(i);
    const r = Math.floor(i / size) + 1;
    const c = (i % size) + 1;
    node.setAttribute("aria-label", `Row ${r}, column ${c}${s >= 0 ? `, stop ${s + 1}` : ""}${on.has(i) ? ", on the line" : ""}`);
  });
  badges.forEach((node, i) => {
    const s = B.stops.indexOf(i);
    node.classList.toggle("is-passed", s >= 0 && s < passed);
  });
  board.classList.toggle("is-solved", done);
  // Marks: ✓ solved, • started — sizes at this level, levels at this size.
  const mark = (b, s, active, label) => {
    const st = s && s.status === "won" ? "done" : s && s.line.length ? "started" : "";
    b.classList.toggle("is-on", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
    b.querySelector(".tr-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${label}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  };
  const climbing = isClimb();
  sizeBtns.forEach((b, k) => mark(b, entry(SIZES[k], level), SIZES[k] === size, `${SIZES[k]} by ${SIZES[k]}`));
  levelBtns.forEach((b, k) => {
    if (PICKS[k] === CLIMB_PICK) {
      b.classList.toggle("is-on", climbing);
      b.setAttribute("aria-selected", climbing ? "true" : "false");
      b.querySelector(".tr-mark").textContent = "";
      b.setAttribute("aria-label", "Climb, gets harder with every board");
    } else mark(b, entry(climbing ? daySize() : size, PICKS[k].id), PICKS[k].id === level, PICKS[k].name);
  });
  sizeRow.hidden = climbing;
  stageEl.hidden = !climbing;
  stageEl.textContent = `Board ${climb.stage} · ${size}×${size}${climb.best ? ` · Best ${climb.best}` : ""}`;
  restartBtn.hidden = !climbing;
  nextBtn.hidden = !(climbing && done);
  undoBtn.disabled = done || !undoStack.length;
  clearBtn.disabled = done || !line.length;
  const total = size * size;
  const harder = LEVELS.slice(LEVELS.findIndex((l) => l.id === level) + 1).find((l) => entry(size, l.id)?.status !== "won");
  tip.textContent = done && climbing
    ? `Board ${climb.stage} done in ${formatTime(g.time)}. The next one is a little harder.`
    : done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${harder ? ` Ready for ${harder.name}?` : " Try another size."}`
    : !line.length
      ? "Start on 1 and drag through every square."
      : line.length === total
        ? `Every square is covered, but the line has to end on ${B.stops.length}.`
        : `${line.length} of ${total} squares. Next stop: ${passed + 1 > B.stops.length ? B.stops.length : passed + 1}.`;
  paintClock();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

// Arrow keys move the end of the line; stepping back onto the line pulls it back.
const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
document.addEventListener("keydown", (e) => {
  if (!playing() || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "z" || e.key === "Backspace") {
    e.preventDefault();
    undo();
    return;
  }
  if (!(e.key in ARROWS)) return;
  e.preventDefault();
  const line = g.line;
  if (!line.length) { remember(); g.line = [B.stops[0]]; afterChange(); return; }
  const head = line[line.length - 1];
  const r = Math.floor(head / size), c = head % size;
  const [dr, dc] = ARROWS[e.key];
  if (r + dr < 0 || r + dr >= size || c + dc < 0 || c + dc >= size) return;
  const j = head + dr * size + dc;
  remember();
  if (line.length > 1 && j === line[line.length - 2]) line.pop();
  else reach(j, false);
  afterChange();
});

// ---------------------------------------------------------------- stats & help

function openStats() {
  if (isClimb()) {
    showModal({
      title: "Climb",
      content: [
        el("p.tr-summary", `Board ${climb.stage} at ${size}×${size}. Best: board ${climb.best || 0}.`),
        el("p", "Each board you solve makes the next one harder: fewer numbers, then a bigger grid, up to 8×8 with no walls. Start over any time; your best is kept."),
      ],
    });
    return;
  }
  const stats = getStats(statsId(size, level));
  const done = g.status === "won";
  const best = stats.times.length ? Math.min(...stats.times) : null;
  const name = `${size}×${size} ${levelById(level).name}`;
  showStats({
    title: done ? "Solved!" : `${name} Statistics`,
    message: done ? `${name} in ${formatTime(g.time)}` : "Each size and level keeps its own stats.",
    tiles: [
      { label: "Solved", value: stats.won },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Max Streak", value: stats.maxStreak },
      { label: "Best Time", value: best == null ? "–" : formatTime(best) },
    ],
    distribution: {
      title: `${name} Solve Time`,
      rows: TIME_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && timeBand(g.time) === b })),
    },
    shareText: done ? shareText({ puzzle, size, level, time: g.time, hints: g.hints, formatTime }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  // A solved 4×4 example.
  const exPath = [0, 1, 2, 3, 7, 6, 5, 4, 8, 12, 13, 9, 10, 14, 15, 11];
  const exStops = { 0: 1, 6: 2, 13: 3, 11: 4 };
  const ex = el("div.tr-ex", { "aria-hidden": "true" });
  ex.innerHTML = `<svg viewBox="0 0 4 4"><rect width="4" height="4" class="tr-ex-bg"/>`
    + `<polyline points="${exPath.map((i) => `${(i % 4) + 0.5},${Math.floor(i / 4) + 0.5}`).join(" ")}"/>`
    + Object.entries(exStops).map(([i, k]) => `<circle cx="${(i % 4) + 0.5}" cy="${Math.floor(i / 4) + 0.5}" r="0.3"/>`
      + `<text x="${(i % 4) + 0.5}" y="${Math.floor(i / 4) + 0.62}">${k}</text>`).join("")
    + `</svg>`;
  showModal({
    title: "How To Play",
    className: "tr-help",
    content: [
      el("p.subtitle", "Draw one line through every square."),
      el("ul",
        el("li", "Start on 1 and drag from square to square, up, down, left or right."),
        el("li", "Pass the numbers in order (1, 2, 3 …) and end on the last one."),
        el("li", "The line can't cross itself or go through a thick wall."),
        el("li", "Drag back along the line to undo steps, or tap any square on the line to cut it back to there. Arrow keys work too.")),
      el("h3", "Example"),
      ex,
      el("p", "Every square is used once, and the numbers come in order."),
      el("h3", "Sizes and levels"),
      el("p", "Pick 6×6, 7×7 or 8×8, and a level from Easy to Expert. Harder levels give fewer numbers; Expert has no walls to lean on. Every size and level has a new board each day with its own progress, timer and stats, and each has exactly one answer."),
      el("h3", "Climb"),
      el("p", "Pick Climb for a run that gets harder as you go. It starts with an easy 6×6, and each board you solve gives fewer numbers, then a bigger grid, up to 8×8 with no walls. Tap Next board to keep going, or Start over for a new run. Your best board is kept."),
      el("p", "Pick other days from 📅, or tap 🔀 for practice boards."),
      el("p", "Stuck? Tap 💡 to fix the line and add a few steps. Turn hints off or hide the timer in Settings."),
    ],
  });
}

// ---------------------------------------------------------------- start

build();

const doneBoards = Object.entries(state.boards).filter(([, b]) => b.status === "won").map(([k]) => {
  const [n, l] = k.split("-");
  return `${n}×${n} ${levelById(l).name}`;
});
await splash({
  gameId: GAME,
  puzzle,
  playLabel: g.status === "won" ? "See results" : g.line.length ? "Continue" : "Play",
  tagline: doneBoards.length ? `Solved today: ${doneBoards.join(", ")}` : "Pick a size and a level, Easy to Expert",
});
started = true;
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
