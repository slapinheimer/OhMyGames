// Oh My PATTERNS! — Shade: fill a grid from row and column clues until a picture appears.
// Each day has a 5×5, a 10×10 and a 15×15. Each size keeps its own progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import {
  DEFAULT_SIZE, SIZES, TIME_BANDS, clueMet, isMistake, nextHint, puzzleFor, shareText, solved, statsId, timeBand,
} from "./shade/logic.js";

const GAME = "shade";
const SIZE_KEY = "shade:size";
const TOOL_KEY = "shade:tool";
const TOOLS = ["cycle", "shade", "cross"];
const puzzle = currentPuzzle();

defineSettings(GAME, [
  HINTS_SETTING,
  { key: "mistakes", label: "Show mistakes", type: "toggle", default: false,
    desc: "Outline a shaded cell that should be empty, or an ✕ on a cell that should be shaded." },
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

const pictures = await loadJSON("data/shade/pictures.json");

// state.grids[size]: { marks, hinted, time, status, hints, key }. marks[i] is "" | "s" | "x".
// state.status is "won" once any size is solved, so the hub shows the day as done.
const pictureKey = (p) => `${p.name}|${p.cells.join("")}`;
const freshGrid = (size, key) => ({
  marks: new Array(size * size).fill(""), hinted: [], time: 0, status: "playing", hints: 0, key,
});
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && saved.grids ? saved : { v: 1, size: null, grids: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
let size = validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE;
let tool = TOOLS.includes(get(TOOL_KEY)) ? get(TOOL_KEY) : "cycle";
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

let P, g, cells, rowClueNodes, colClueNodes;
let cursor = 0;
let undoStack = [];
let dragging = null;
let hintToast = null;

// ---------------------------------------------------------------- layout

const clock = el("div.sh-clock");
const sizeBtns = SIZES.map((n) => el("button.sh-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.sh-size-mark", { "aria-hidden": "true" })));
const modeBtns = [
  ["cycle", "Cycle", "Cycle: shade, then ✕, then clear"],
  ["shade", "Shade", "Shade cells. Tap a shaded cell to clear it"],
  ["cross", "✕", "Mark empty cells. Tap an ✕ to clear it"],
].map(([id, label, aria]) => el("button.sh-mode", {
  type: "button", role: "radio", "aria-label": aria, onclick: () => pickTool(id),
}, label));
const board = el("div.sh-board", { role: "grid", "aria-label": "Shade grid" });
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const clearBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askClear() }, "Clear");
const nameLine = el("p.sh-name", { "aria-live": "polite" });
const tip = el("p.sh-tip");

main.append(el("div.sh-wrap",
  el("div.sh-top",
    el("div.sh-sizes", { role: "tablist", "aria-label": "Grid size" }, sizeBtns),
    clock),
  el("div.sh-modes", { role: "radiogroup", "aria-label": "How a tap marks a cell" }, modeBtns),
  board,
  nameLine,
  el("div.sh-controls", undoBtn, clearBtn),
  tip));

function syncStatus() {
  state.status = SIZES.some((n) => state.grids[n] && state.grids[n].status === "won") ? "won" : "playing";
}

function build() {
  P = puzzleFor(puzzle, size, pictures);
  const prev = state.grids[size];
  const key = pictureKey(P);
  if (!prev || prev.key !== key || !Array.isArray(prev.marks) || prev.marks.length !== size * size) {
    state.grids[size] = freshGrid(size, key);
  }
  g = state.grids[size];
  g.hinted = Array.isArray(g.hinted) ? g.hinted : [];
  g.hints = g.hints || 0;
  g.time = g.time || 0;
  if (g.status !== "won" && g.status !== "playing") g.status = "playing";
  state.size = size;
  syncStatus();
  cells = [];
  rowClueNodes = [];
  colClueNodes = [];
  undoStack = [];
  dragging = null;
  cursor = Math.min(cursor, size * size - 1);
  const head = [el("div.sh-corner", { "aria-hidden": "true" })];
  for (let c = 0; c < size; c++) {
    const node = clueNode(P.colClues[c], "col");
    colClueNodes.push(node);
    head.push(node);
  }
  const body = [];
  for (let r = 0; r < size; r++) {
    const clue = clueNode(P.rowClues[r], "row");
    rowClueNodes.push(clue);
    body.push(clue);
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const node = el("button.sh-cell", {
        type: "button", role: "gridcell", "data-i": String(i),
      }, el("span.sh-mark", { "aria-hidden": "true" }));
      if (r === 0) node.classList.add("is-n");
      if (c === 0) node.classList.add("is-w");
      if (c > 0 && c % 5 === 0) node.classList.add("is-v5");
      if (r > 0 && r % 5 === 0) node.classList.add("is-h5");
      cells.push(node);
      body.push(node);
    }
  }
  board.replaceChildren(
    el("div.sh-colhead", head),
    el("div.sh-body", body));
  board.style.setProperty("--n", String(size));
  board.dataset.size = String(size);
  save();
  paint();
}

function clueNode(clue, axis) {
  const nums = clue.length ? clue : [0];
  const node = el(`div.sh-clue.is-${axis}`, { "aria-hidden": "true" });
  if (clue.length >= 6) node.classList.add("is-long");
  for (const n of nums) node.append(el("span", String(n)));
  return node;
}

function pickSize(n) {
  if (n === size) return;
  size = n;
  cursor = 0;
  set(SIZE_KEY, n);
  build();
}

function pickTool(id) {
  if (!TOOLS.includes(id) || id === tool) return;
  tool = id;
  set(TOOL_KEY, id);
  paint();
}

// ---------------------------------------------------------------- play

function nextMark(cur) {
  if (tool === "shade") return cur === "s" ? "" : "s";
  if (tool === "cross") return cur === "x" ? "" : "x";
  return cur === "" ? "s" : cur === "s" ? "x" : "";
}

function pushUndo() {
  undoStack.push(g.marks.slice());
  if (undoStack.length > 200) undoStack.shift();
}

function applyMark(i, mark) {
  if (!started || g.status !== "playing") return false;
  if (g.hinted.includes(i)) { toast("A hint set this one"); return false; }
  if (g.marks[i] === mark) return false;
  pushUndo();
  g.marks[i] = mark;
  return true;
}

function afterChange() {
  if (solved(P.cells, g.marks)) {
    g.status = "won";
    syncStatus();
    recordResult(statsId(size), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
    save();
    paint();
    toast(g.hints ? "Solved!" : "Solved, no hints!", 2000);
    const doneSize = size;
    setTimeout(() => { if (!isModalOpen() && size === doneSize) openStats(); }, 1400);
    return;
  }
  save();
  paint();
}

function cellAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest(".sh-cell") : null;
  return cell && board.contains(cell) ? cell : null;
}

function onDown(e) {
  if (!started || g.status !== "playing") return;
  if (e.button != null && e.button !== 0) return;
  const cell = e.target.closest && e.target.closest(".sh-cell");
  if (!cell || !board.contains(cell)) return;
  e.preventDefault();
  const i = Number(cell.dataset.i);
  cursor = i;
  if (g.hinted.includes(i)) { toast("A hint set this one"); paint(); return; }
  const mark = nextMark(g.marks[i]);
  pushUndo();
  g.marks[i] = mark;
  dragging = { mark, pointerId: e.pointerId };
  try { board.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  afterChange();
}

function onMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId || g.status !== "playing") return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  const i = Number(cell.dataset.i);
  if (g.hinted.includes(i) || g.marks[i] === dragging.mark) return;
  g.marks[i] = dragging.mark;
  cursor = i;
  afterChange();
}

function onUp(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging = null;
}

board.addEventListener("pointerdown", onDown, { passive: false });
board.addEventListener("pointermove", onMove);
board.addEventListener("pointerup", onUp);
board.addEventListener("pointercancel", onUp);
board.addEventListener("contextmenu", (e) => e.preventDefault());

function undo() {
  if (!undoStack.length || g.status !== "playing") return;
  g.marks = undoStack.pop();
  for (const i of g.hinted) g.marks[i] = P.cells[i] ? "s" : "x";
  save();
  paint();
}

function askClear() {
  if (g.status !== "playing" || !g.marks.some((m, i) => m && !g.hinted.includes(i))) return;
  showModal({
    title: "Clear the grid?",
    content: [
      el("p", "This removes your marks. Hints stay, and the clock keeps running."),
      el("div.sh-actions", el("button.btn", { type: "button", onclick: () => {
        pushUndo();
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
  const hint = nextHint(P.cells, g.marks);
  if (!hint) return;
  pushUndo();
  g.marks[hint.index] = hint.mark;
  if (!g.hinted.includes(hint.index)) g.hinted.push(hint.index);
  g.hints++;
  cursor = hint.index;
  if (hintToast) hintToast();
  hintToast = toast(hint.mark === "s" ? "This cell is shaded" : "This cell is empty");
  const node = cells[hint.index];
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
  const showBad = getSetting(GAME, "mistakes") === true;
  let bad = 0;
  cells.forEach((node, i) => {
    const m = g.marks[i];
    const r = Math.floor(i / size) + 1;
    const c = (i % size) + 1;
    const mistake = showBad && isMistake(P.cells[i], m);
    if (mistake) bad++;
    node.classList.toggle("is-s", m === "s");
    node.classList.toggle("is-x", m === "x");
    node.classList.toggle("is-hint", g.hinted.includes(i));
    node.classList.toggle("is-bad", mistake);
    node.classList.toggle("is-cursor", i === cursor && !done);
    node.disabled = done;
    const how = m === "s" ? "shaded" : m === "x" ? "empty" : "unmarked";
    node.setAttribute("aria-label", `Row ${r}, column ${c}, ${how}`);
  });
  for (let r = 0; r < size; r++) {
    const line = [];
    for (let c = 0; c < size; c++) line.push(g.marks[r * size + c]);
    rowClueNodes[r].classList.toggle("is-met", clueMet(P.rowClues[r], line));
  }
  for (let c = 0; c < size; c++) {
    const line = [];
    for (let r = 0; r < size; r++) line.push(g.marks[r * size + c]);
    colClueNodes[c].classList.toggle("is-met", clueMet(P.colClues[c], line));
  }
  board.classList.toggle("is-solved", done);
  sizeBtns.forEach((b, k) => {
    const n = SIZES[k];
    const s = state.grids[n];
    const st = s && s.status === "won" ? "done" : s && s.marks.some(Boolean) ? "started" : "";
    b.classList.toggle("is-on", n === size);
    b.setAttribute("aria-selected", n === size ? "true" : "false");
    b.querySelector(".sh-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${n} by ${n}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  });
  modeBtns.forEach((b, k) => {
    const on = TOOLS[k] === tool;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
  undoBtn.disabled = done || !undoStack.length;
  clearBtn.disabled = done || !g.marks.some((m, i) => m && !g.hinted.includes(i));
  const met = board.querySelectorAll(".sh-clue.is-met").length;
  const left = SIZES.filter((n) => !(state.grids[n] && state.grids[n].status === "won"));
  nameLine.textContent = done ? P.name : "";
  tip.textContent = done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${left.length ? ` Try the ${left.map((n) => `${n}×${n}`).join(", ")}.` : " All three sizes done!"}`
    : `${met} of ${size * 2} lines match.${bad ? ` ${bad} ${bad === 1 ? "cell disagrees" : "cells disagree"}.` : ""}`;
  paintClock();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  const onControl = e.target.closest && e.target.closest("button, a") && !e.target.closest(".sh-cell");
  const row = Math.floor(cursor / size);
  const col = cursor % size;
  if (e.key === "ArrowLeft" && col > 0) { e.preventDefault(); cursor--; paint(); return; }
  if (e.key === "ArrowRight" && col < size - 1) { e.preventDefault(); cursor++; paint(); return; }
  if (e.key === "ArrowUp" && row > 0) { e.preventDefault(); cursor -= size; paint(); return; }
  if (e.key === "ArrowDown" && row < size - 1) { e.preventDefault(); cursor += size; paint(); return; }
  if (onControl || g.status !== "playing") return;
  if (e.key === "z" || e.key === "Backspace") { e.preventDefault(); undo(); return; }
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (applyMark(cursor, nextMark(g.marks[cursor]))) afterChange();
    return;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "s" || key === "x" || key === "Delete") {
    e.preventDefault();
    const mark = key === "s" ? "s" : key === "x" ? "x" : "";
    if (applyMark(cursor, mark)) afterChange();
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
    message: done ? `${size}×${size} in ${formatTime(g.time)} · ${P.name}` : "Each grid size keeps its own stats.",
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
  const ex = el("div.sh-ex", { "aria-hidden": "true" });
  const clue = el("div.sh-clue.is-row.is-met");
  clue.append(el("span", "2"), el("span", "1"));
  ex.append(clue);
  for (const m of ["s", "s", "", "s", "x"]) {
    ex.append(el(`div.sh-cell${m === "s" ? ".is-s" : ""}${m === "x" ? ".is-x" : ""}`, el("span.sh-mark")));
  }
  showModal({
    title: "How To Play",
    className: "sh-help",
    content: [
      el("p.subtitle", "Shade cells so every row and column matches its clue. A picture appears when you finish."),
      el("ul",
        el("li", "A clue lists the shaded runs in that line, in order. Runs have at least one empty cell between them."),
        el("li", "Tap a cell to shade it, again to mark ✕ (empty), and again to clear it. Drag to paint the same mark across cells."),
        el("li", "Cycle, Shade and ✕ above the grid change what a tap does. Shade and ✕ are easier with a thumb."),
        el("li", "A clue dims and strikes through once the shaded runs in its line match it."),
        el("li", "The picture's name shows when the grid is solved. Every picture has one answer.")),
      el("h3", "Example"),
      ex,
      el("p", "Clue 2 1 is two shaded cells, a gap, then one more. The ✕ is a gap you already know is empty."),
      el("h3", "Sizes"),
      el("p", "Pick 5×5, 10×10 or 15×15. Every day has a new picture in each size, and each size keeps its own progress, timer and stats. ✓ marks a size you've solved today. Shade remembers the size you used last."),
      el("p", "Pick other days from 📅, or tap 🔀 for a practice picture."),
      el("h3", "Keyboard"),
      el("p", "Arrow keys move the cursor. Space or Enter marks the cell. S shades, X marks empty, Delete clears. Z or Backspace undoes."),
      el("p", "Stuck? Tap 💡 to fill one cell the clues decide. Turn hints off in Settings. Show mistakes outlines a shade or ✕ that disagrees with the picture. Wrong marks stay until you change them."),
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
    : "Shade a picture: 5×5, 10×10 or 15×15",
});
started = true;
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
