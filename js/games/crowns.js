// Oh My PATTERNS! — Crowns: one crown in every row, column and colored region, none touching.
// Each day has a board for every size (6×6, 8×8, 10×10) and level (Easy to Expert).
// Each size and level keeps its own progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import {
  DEFAULT_LEVEL, DEFAULT_SIZE, LEVELS, SIZES, TIME_BANDS, blocked, boardFor, boardKey, conflicts, levelById, nextHint,
  shareText, solved, statsId, timeBand,
} from "./crowns/logic.js";

const GAME = "crowns";
const SIZE_KEY = "crowns:size";
const LEVEL_KEY = "crowns:level";
const CACHE_KEY = "crowns:boards";
const puzzle = currentPuzzle();
defineSettings(GAME, [
  HINTS_SETTING,
  { key: "autoX", label: "Auto ✕", type: "toggle", default: false,
    desc: "Shade the squares a crown rules out (its row, column, region and neighbors)." },
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// state.boards["<size>-<level>"]: { marks, hinted, time, status, hints }. marks[i]: "" | "x" | "c".
// state.status is "won" once any board is solved, so the hub shows the day as done.
const freshBoard = (size) => ({ marks: new Array(size * size).fill(""), hinted: [], time: 0, status: "playing", hints: 0 });
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.boards ? saved : { size: null, boards: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
let size = validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE;
const validLevel = (id) => LEVELS.some((l) => l.id === id);
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
const entry = (n = size, l = level) => state.boards[boardKey(n, l)];
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

let B, g, cells;
let undoStack = [];

// Region colors (10 at most). Thick borders between regions keep them readable without color.
const REGION_COLORS = ["#f6c9a8", "#c6e2b5", "#bcd4f2", "#f2e3a1", "#dcc6ee", "#a9dfd8", "#f3b9c8", "#d9d2c3", "#c4c9f5", "#e8d0a9"];

// ---------------------------------------------------------------- layout

const clock = el("div.cr-clock");
const sizeBtns = SIZES.map((n) => el("button.cr-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.cr-size-mark", { "aria-hidden": "true" })));
const levelBtns = LEVELS.map((l) => el("button.cr-level", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.cr-size-mark", { "aria-hidden": "true" })));
const grid = el("div.cr-grid", { role: "grid", "aria-label": "Crowns board" });
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const clearBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askClear() }, "Clear");
const tip = el("p.cr-tip");

main.append(el("div.cr-wrap",
  el("div.cr-top", el("div.cr-sizes", { role: "tablist", "aria-label": "Board size" }, sizeBtns), clock),
  el("div.cr-sizes.cr-levels", { role: "tablist", "aria-label": "Difficulty" }, levelBtns),
  grid,
  el("div.cr-controls", undoBtn, clearBtn),
  tip));

// Hard boards can take a moment to find, so the last few are kept in this browser.
function loadBoard() {
  const id = `${puzzle.id}:${size}:${level}`;
  const cache = get(CACHE_KEY, []);
  const hit = cache.find((b) => b.id === id);
  if (hit && hit.regions.length === size * size) return { size, level, regions: hit.regions, crowns: hit.crowns };
  const board = boardFor(puzzle, size, level);
  set(CACHE_KEY, [{ id, regions: board.regions, crowns: board.crowns }, ...cache].slice(0, 16));
  return board;
}

function build() {
  B = loadBoard();
  const key = boardKey(size, level);
  if (!state.boards[key] || state.boards[key].marks.length !== size * size) state.boards[key] = freshBoard(size);
  g = state.boards[key];
  state.size = size;
  state.level = level;
  undoStack = [];
  const { regions } = B;
  cells = regions.map((reg, i) => {
    const r = Math.floor(i / size);
    const c = i % size;
    const edge = (j) => j < 0 || regions[j] !== reg;
    const cls = [
      r === 0 || edge(i - size) ? ".b-t" : "",
      r === size - 1 || edge(i + size) ? ".b-b" : "",
      c === 0 || edge(i - 1) ? ".b-l" : "",
      c === size - 1 || edge(i + 1) ? ".b-r" : "",
    ].join("");
    return el(`button.cr-cell${cls}`, {
      type: "button", role: "gridcell", dataset: { i: String(i) },
      style: { "--reg": REGION_COLORS[reg] }, onclick: () => tap(i),
    });
  });
  grid.replaceChildren(...cells);
  grid.style.setProperty("--n", String(size));
  save();
  paint();
}

function pickSize(n) {
  if (n === size) return;
  size = n;
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
  grid.classList.add("is-loading");
  tip.textContent = "Building the board…";
  setTimeout(() => { build(); grid.classList.remove("is-loading"); }, 20);
}

// ---------------------------------------------------------------- play

const NEXT = { "": "x", x: "c", c: "" };

function remember() {
  undoStack.push(g.marks.slice());
  if (undoStack.length > 300) undoStack.shift();
}

function tap(i) {
  if (dragged) { dragged = false; return; }
  if (!started || g.status !== "playing") return;
  if (g.hinted.includes(i)) { toast("A hint placed this crown"); return; }
  remember();
  g.marks[i] = NEXT[g.marks[i]];
  afterChange();
}

// Drag across empty squares to mark them all ✕.
let dragging = false;
let dragged = false;
grid.addEventListener("pointerdown", (e) => {
  if (!started || g.status !== "playing" || e.button > 0) return;
  dragging = true;
  dragged = false;
});
grid.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const node = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".cr-cell");
  if (!node || !grid.contains(node)) return;
  const i = Number(node.dataset.i);
  const start = e.target.closest?.(".cr-cell");
  if (!dragged && node === start) return;
  if (!dragged) {
    remember();
    dragged = true;
    if (start && !g.marks[Number(start.dataset.i)]) g.marks[Number(start.dataset.i)] = "x";
  }
  if (!g.marks[i]) {
    g.marks[i] = "x";
    save();
    paint();
  }
});
const endDrag = () => {
  dragging = false;
  // The click that follows a drag is swallowed in tap(); clear the flag if none comes.
  setTimeout(() => { dragged = false; }, 50);
};
grid.addEventListener("pointerup", endDrag);
grid.addEventListener("pointercancel", endDrag);
grid.style.touchAction = "none";

function afterChange() {
  if (solved(B, g.marks)) {
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
  g.marks = undoStack.pop();
  for (const i of g.hinted) g.marks[i] = "c";
  save();
  paint();
}

function askClear() {
  if (g.status !== "playing" || !g.marks.some((m, i) => m && !g.hinted.includes(i))) return;
  showModal({
    title: "Clear the board?",
    content: [
      el("p", "This removes your crowns and ✕ marks. Hints stay, and the clock keeps running."),
      el("div.cr-actions", el("button.btn", { type: "button", onclick: () => {
        remember();
        g.marks = g.marks.map((m, i) => (g.hinted.includes(i) ? m : ""));
        save();
        paint();
        document.querySelector(".modal .modal-close")?.click();
      } }, "Clear")),
    ],
  });
}

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("Already solved"); return; }
  const h = nextHint(B, g.marks);
  if (!h) return;
  remember();
  g.hints++;
  if (h.wrong) {
    g.marks[h.cell] = "x";
    toast("That crown can't go there");
  } else {
    g.marks[h.cell] = "c";
    if (!g.hinted.includes(h.cell)) g.hinted.push(h.cell);
    toast("A crown goes here");
  }
  const node = cells[h.cell];
  node.classList.remove("is-flash");
  void node.offsetWidth;
  node.classList.add("is-flash");
  afterChange();
}

// ---------------------------------------------------------------- clock

setInterval(() => {
  if (!started || g.status !== "playing" || document.hidden || isModalOpen()) return;
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

function paint() {
  const done = g.status !== "playing";
  const bad = conflicts(B, g.marks);
  const auto = getSetting(GAME, "autoX") ? blocked(B, g.marks) : new Set();
  cells.forEach((node, i) => {
    const m = g.marks[i];
    node.textContent = m === "c" ? "👑" : m === "x" ? "✕" : "";
    node.classList.toggle("is-crown", m === "c");
    node.classList.toggle("is-x", m === "x");
    node.classList.toggle("is-auto", !m && auto.has(i));
    node.classList.toggle("is-bad", bad.has(i));
    node.classList.toggle("is-hint", g.hinted.includes(i));
    node.disabled = done;
    const r = Math.floor(i / size) + 1;
    const c = (i % size) + 1;
    node.setAttribute("aria-label", `Row ${r}, column ${c}, region ${B.regions[i] + 1}${m === "c" ? ", crown" : m === "x" ? ", marked empty" : ""}`);
  });
  grid.classList.toggle("is-solved", done);
  // Marks: ✓ solved, • started — sizes at this level, levels at this size.
  const mark = (b, s, on, label) => {
    const st = s && s.status === "won" ? "done" : s && s.marks.some(Boolean) ? "started" : "";
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.querySelector(".cr-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${label}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  };
  sizeBtns.forEach((b, k) => mark(b, entry(SIZES[k], level), SIZES[k] === size, `${SIZES[k]} by ${SIZES[k]}`));
  levelBtns.forEach((b, k) => mark(b, entry(size, LEVELS[k].id), LEVELS[k].id === level, LEVELS[k].name));
  undoBtn.disabled = done || !undoStack.length;
  clearBtn.disabled = done;
  const placed = g.marks.filter((m) => m === "c").length;
  const harder = LEVELS.slice(LEVELS.findIndex((l) => l.id === level) + 1).find((l) => entry(size, l.id)?.status !== "won");
  tip.textContent = done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${harder ? ` Ready for ${harder.name}?` : " Try another size."}`
    : bad.size
      ? "Some crowns clash. Red ones share a row, column or region, or touch."
      : `Tap once for ✕, twice for a crown. ${placed} of ${size} crowns placed.`;
  paintClock();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "z" || e.key === "Backspace") {
    e.preventDefault();
    undo();
  }
});

// ---------------------------------------------------------------- stats & help

function openStats() {
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
  const exRegions = [0, 0, 1, 1, 0, 0, 2, 1, 2, 2, 2, 1, 3, 3, 3, 3];
  const exCrowns = new Set([1, 7, 8, 14]);
  const ex = el("div.cr-grid.cr-ex", { style: { "--n": "4" }, "aria-hidden": "true" },
    exRegions.map((reg, i) => el("div.cr-cell", { style: { "--reg": REGION_COLORS[reg] } }, exCrowns.has(i) ? "👑" : "")));
  showModal({
    title: "How To Play",
    className: "cr-help",
    content: [
      el("p.subtitle", "Place one crown in every row, column and colored region."),
      el("ul",
        el("li", "Each row, each column and each colored region gets exactly one crown."),
        el("li", "Crowns can't touch each other, not even at the corners."),
        el("li", "Tap a square once to mark it ✕ (no crown), twice for a crown, and again to clear it. Drag across squares to mark them all ✕."),
        el("li", "Clashing crowns turn red. Every board has exactly one answer.")),
      el("h3", "Example"),
      ex,
      el("p", "One crown per row, column and color, and no two crowns touch."),
      el("h3", "Sizes and levels"),
      el("p", "Pick 6×6, 8×8 or 10×10, and a level from Easy to Expert. Every size and level has a new board each day with its own progress, timer and stats. ✓ marks boards you've solved today."),
      el("ul",
        el("li", el("b", "Easy: "), "rows, columns and regions run down to one square."),
        el("li", el("b", "Medium: "), "spot squares whose crown would leave a row, column or region with nowhere to go."),
        el("li", el("b", "Hard: "), "find groups, like two regions that fit inside two rows, which clear the rest of those rows."),
        el("li", el("b", "Expert: "), "needs looking ahead: try a crown and follow it until something breaks.")),
      el("p", "Pick other days from 📅, or tap 🔀 for practice boards."),
      el("p", "Stuck? Tap 💡 to place a crown (or remove a wrong one). Turn hints off in Settings, where you can also turn on Auto ✕ or hide the timer."),
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
  playLabel: g.status === "won" ? "See results" : g.marks.some(Boolean) ? "Continue" : "Play",
  tagline: doneBoards.length ? `Solved today: ${doneBoards.join(", ")}` : "Pick a size and a level, Easy to Expert",
});
started = true;
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
