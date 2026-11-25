// Oh My NUMBERS! — Tally: cross out numbers until every row and column hits its target.
// Each day has a 4×4, 5×5, 7×7 and 9×9 grid. Each size keeps its own progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import {
  DEFAULT_SIZE, SIZES, TIME_BANDS, linesOf, lineSum, nextHint, puzzleFor, shareText, solved, statsId, timeBand,
} from "./tally/logic.js";

const GAME = "tally";
const SIZE_KEY = "tally:size";
const puzzle = currentPuzzle();
defineSettings(GAME, [
  HINTS_SETTING,
  { key: "sums", label: "Show running sums", type: "toggle", default: false,
    desc: "Show what each row and column adds up to now, under its target." },
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// state.grids[size]: { marks, hinted, time, status, hints }. marks[i]: "" | "x" (crossed out) | "o" (kept).
// state.status is "won" once any size is solved, so the hub shows the day as done.
const freshGrid = (size) => ({ marks: new Array(size * size).fill(""), hinted: [], time: 0, status: "playing", hints: 0 });
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 2 && saved.grids ? saved : { v: 2, size: null, grids: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
let size = validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE;
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

// The open grid, rebuilt when the size changes.
let P, g, rows, cols, cells, rowTargets, colTargets;
let undoStack = [];

// ---------------------------------------------------------------- layout

const clock = el("div.ty-clock");
const sizeBtns = SIZES.map((n) => el("button.ty-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.ty-size-mark", { "aria-hidden": "true" })));
const grid = el("div.ty-grid", { role: "grid", "aria-label": "Tally grid" });
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const clearBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askClear() }, "Clear");
const tip = el("p.ty-tip");

main.append(el("div.ty-wrap",
  el("div.ty-top",
    el("div.ty-sizes", { role: "tablist", "aria-label": "Grid size" }, sizeBtns),
    clock),
  grid,
  el("div.ty-controls", undoBtn, clearBtn),
  tip));

const columns = (n) => ({ "--n": String(n), gridTemplateColumns: `repeat(${n + 1}, minmax(0, 1fr))` });

function build() {
  P = puzzleFor(puzzle, size);
  if (!state.grids[size] || state.grids[size].marks.length !== size * size) state.grids[size] = freshGrid(size);
  g = state.grids[size];
  state.size = size;
  ({ rows, cols } = linesOf(size));
  cells = [];
  rowTargets = [];
  colTargets = [];
  undoStack = [];
  const nodes = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const node = el("button.ty-cell", { type: "button", role: "gridcell", onclick: () => tap(i) }, String(P.nums[i]));
      cells.push(node);
      nodes.push(node);
    }
    const t = el("div.ty-target.is-row", el("span.ty-goal", String(P.rowT[r])), el("span.ty-now"));
    rowTargets.push(t);
    nodes.push(t);
  }
  for (let c = 0; c < size; c++) {
    const t = el("div.ty-target.is-col", el("span.ty-goal", String(P.colT[c])), el("span.ty-now"));
    colTargets.push(t);
    nodes.push(t);
  }
  grid.replaceChildren(...nodes);
  Object.assign(grid.style, { gridTemplateColumns: columns(size).gridTemplateColumns });
  grid.style.setProperty("--n", String(size));
  grid.dataset.size = String(size);
  save();
  paint();
}

function pickSize(n) {
  if (n === size) return;
  size = n;
  set(SIZE_KEY, n);
  build();
}

// ---------------------------------------------------------------- play

const crossed = () => g.marks.map((m) => m === "x");
const NEXT = { "": "x", x: "o", o: "" };

function tap(i) {
  if (!started || g.status !== "playing") return;
  if (g.hinted.includes(i)) { toast("A hint set this one"); return; }
  undoStack.push(g.marks.slice());
  if (undoStack.length > 200) undoStack.shift();
  g.marks[i] = NEXT[g.marks[i]];
  afterChange();
}

function afterChange() {
  if (solved(P, crossed())) {
    g.status = "won";
    state.status = "won";
    // Anything left unmarked is a kept number.
    g.marks = g.marks.map((m) => (m === "x" ? "x" : "o"));
    recordResult(statsId(size), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
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
  for (const i of g.hinted) g.marks[i] = P.out[i] ? "x" : "o";
  save();
  paint();
}

function askClear() {
  if (g.status !== "playing" || !g.marks.some((m, i) => m && !g.hinted.includes(i))) return;
  showModal({
    title: "Clear the grid?",
    content: [
      el("p", "This removes your marks. Hints stay, and the clock keeps running."),
      el("div.ty-actions", el("button.btn", { type: "button", onclick: () => {
        undoStack.push(g.marks.slice());
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
  const i = nextHint(P, g.marks);
  if (i < 0) return;
  const want = P.out[i] ? "x" : "o";
  g.marks[i] = want;
  if (!g.hinted.includes(i)) g.hinted.push(i);
  g.hints++;
  toast(want === "x" ? "Cross this one out" : "This one stays");
  cells[i].classList.remove("is-flash");
  void cells[i].offsetWidth;
  cells[i].classList.add("is-flash");
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

function paintTarget(node, line, goal) {
  const sum = lineSum(P.nums, line, crossed());
  node.classList.toggle("is-met", sum === goal);
  node.querySelector(".ty-now").textContent = getSetting(GAME, "sums") ? String(sum) : "";
}

function paint() {
  const done = g.status !== "playing";
  cells.forEach((node, i) => {
    const m = g.marks[i];
    node.classList.toggle("is-x", m === "x");
    node.classList.toggle("is-o", m === "o");
    node.classList.toggle("is-hint", g.hinted.includes(i));
    node.disabled = done;
    node.setAttribute("aria-label", `${P.nums[i]}, ${m === "x" ? "crossed out" : m === "o" ? "kept" : "unmarked"}`);
  });
  rows.forEach((l, r) => paintTarget(rowTargets[r], l, P.rowT[r]));
  cols.forEach((l, c) => paintTarget(colTargets[c], l, P.colT[c]));
  grid.classList.toggle("is-solved", done);
  sizeBtns.forEach((b, k) => {
    const n = SIZES[k];
    const s = state.grids[n];
    const st = s && s.status === "won" ? "done" : s && s.marks.some(Boolean) ? "started" : "";
    b.classList.toggle("is-on", n === size);
    b.setAttribute("aria-selected", n === size ? "true" : "false");
    b.querySelector(".ty-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${n} by ${n}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  });
  undoBtn.disabled = done || !undoStack.length;
  clearBtn.disabled = done;
  const met = [...rowTargets, ...colTargets].filter((t) => t.classList.contains("is-met")).length;
  const left = SIZES.filter((n) => !(state.grids[n] && state.grids[n].status === "won"));
  tip.textContent = done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${left.length ? ` Try the ${left.map((n) => `${n}×${n}`).join(", ")}.` : " All four sizes done!"}`
    : `Tap a number to cross it out, again to keep it. ${met} of ${size * 2} sums match.`;
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
  const stats = getStats(statsId(size));
  const done = g.status === "won";
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const best = stats.times.length ? Math.min(...stats.times) : null;
  showStats({
    title: done ? "Solved!" : `${size}×${size} Statistics`,
    message: done ? `${size}×${size} in ${formatTime(g.time)}` : "Each grid size keeps its own stats.",
    tiles: [
      { label: "Solved", value: stats.won },
      { label: "Win %", value: winPct },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Best Time", value: best == null ? "–" : formatTime(best) },
    ],
    distribution: {
      title: `${size}×${size} Solve Time`,
      rows: TIME_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && timeBand(g.time) === b })),
    },
    shareText: done ? shareText({ puzzle, size, time: g.time, hints: g.hints, formatTime }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  const ex = [[3, 5, 8], [1, 9, 2], [6, 4, 7]];
  const exOut = [[false, true, false], [true, false, false], [false, false, true]];
  const exRow = [11, 11, 10];
  const exCol = [9, 13, 10];
  const exGrid = el("div.ty-grid.ty-ex", { style: columns(3), "aria-hidden": "true" });
  ex.forEach((row, r) => {
    row.forEach((v, c) => exGrid.append(el(`div.ty-cell${exOut[r][c] ? ".is-x" : ".is-o"}`, String(v))));
    exGrid.append(el("div.ty-target.is-row.is-met", el("span.ty-goal", String(exRow[r]))));
  });
  exCol.forEach((v) => exGrid.append(el("div.ty-target.is-col.is-met", el("span.ty-goal", String(v)))));
  showModal({
    title: "How To Play",
    className: "ty-help",
    content: [
      el("p.subtitle", "Cross out numbers until every row and column adds up to its target."),
      el("ul",
        el("li", "The circled number at the end of each row and column is its target."),
        el("li", "Tap a number to cross it out. Tap again to mark it as kept (a ring), and once more to clear it."),
        el("li", "A target turns green when the numbers left in its row or column add up to it."),
        el("li", "Solve it when every target is green. Every grid has exactly one answer.")),
      el("h3", "Example"),
      exGrid,
      el("p", "Row one keeps 3 and 8 (11). Column two keeps 9 and 4 (13)."),
      el("h3", "Grid sizes"),
      el("p", "Pick 4×4, 5×5, 7×7 or 9×9 above the grid. Every day has a new grid in each size, and each size keeps its own progress, timer and stats. ✓ marks a size you've solved today."),
      el("p", "Pick other days from 📅, or tap 🔀 for practice grids."),
      el("p", "Stuck? Tap 💡 to fix or fill one number. Turn hints off in Settings, where you can also show running sums or hide the timer."),
    ],
  });
}

// ---------------------------------------------------------------- start

build();

const doneSizes = SIZES.filter((n) => state.grids[n] && state.grids[n].status === "won");
await splash({
  gameId: GAME,
  puzzle,
  playLabel: g.status === "won" ? "See results" : g.marks.some(Boolean) ? "Continue" : "Play",
  tagline: doneSizes.length
    ? `Solved today: ${doneSizes.map((n) => `${n}×${n}`).join(", ")}`
    : "Pick a grid: 4×4, 5×5, 7×7 or 9×9",
});
started = true;
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
