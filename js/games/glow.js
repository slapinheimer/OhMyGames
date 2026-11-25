// Oh My PATTERNS! — Glow: turn every light off. A press steps a light and its neighbors.
// Each day has a board for every size (5×5, 6×6, 7×7) and level (Easy to Expert).
// Each size and level keeps its own progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import {
  DEFAULT_LEVEL, DEFAULT_SIZE, LEVELS, PAR_BANDS, SIZES, allOff, boardFor, boardKey, levelById, nextHint, parBand, press,
  reach, shareText, statsId,
} from "./glow/logic.js";

const GAME = "glow";
const SIZE_KEY = "glow:size";
const LEVEL_KEY = "glow:level";
const puzzle = currentPuzzle();
defineSettings(GAME, [HINTS_SETTING]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// state.boards["<size>-<level>"]: { history: [cell, …], hints, status }. The lights are the start board
// with every press in history applied, so undo just drops the last press.
// state.status is "won" once any board is solved, so the hub shows the day as done.
const freshBoard = () => ({ history: [], hints: 0, status: "playing" });
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.boards ? saved : { size: null, boards: {}, status: "playing" };
const validSize = (n) => SIZES.includes(n);
let size = validSize(state.size) ? state.size : validSize(get(SIZE_KEY)) ? get(SIZE_KEY) : DEFAULT_SIZE;
const validLevel = (id) => LEVELS.some((l) => l.id === id);
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
let rule = levelById(level);
const entry = (n = size, l = level) => state.boards[boardKey(n, l)];
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

let B, g, cells, lights;

// ---------------------------------------------------------------- layout

const sizeBtns = SIZES.map((n) => el("button.gl-size", {
  type: "button", role: "tab", onclick: () => pickSize(n),
}, `${n}×${n}`, el("span.gl-size-mark", { "aria-hidden": "true" })));
const levelBtns = LEVELS.map((l) => el("button.gl-level", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.gl-size-mark", { "aria-hidden": "true" })));
const pressesEl = el("div.gl-stat", el("span.gl-num", "0"), el("span.gl-label", "Presses"));
const parEl = el("div.gl-stat", el("span.gl-num", "0"), el("span.gl-label", "Par"));
const litEl = el("div.gl-stat", el("span.gl-num", "0"), el("span.gl-label", "Lit"));
const grid = el("div.gl-grid", { role: "grid", "aria-label": "Glow board" });
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const restartBtn = el("button.btn.small.secondary", { type: "button", onclick: () => restart() }, "Restart");
const tip = el("p.gl-tip");

main.append(el("div.gl-wrap",
  el("div.gl-sizes", { role: "tablist", "aria-label": "Board size" }, sizeBtns),
  el("div.gl-sizes.gl-levels", { role: "tablist", "aria-label": "Difficulty" }, levelBtns),
  el("div.gl-stats", pressesEl, parEl, litEl),
  grid,
  el("div.gl-controls", undoBtn, restartBtn),
  tip));

const replay = () => g.history.reduce((L, i) => press(size, L, i, rule), B.lights);

function build() {
  rule = levelById(level);
  B = boardFor(puzzle, size, level);
  const key = boardKey(size, level);
  if (!state.boards[key]) state.boards[key] = freshBoard();
  g = state.boards[key];
  state.size = size;
  state.level = level;
  lights = replay();
  cells = B.lights.map((_, i) => el("button.gl-cell", {
    type: "button", role: "gridcell", onclick: () => tap(i),
    onpointerenter: () => preview(i, true), onpointerleave: () => preview(i, false),
  }));
  grid.replaceChildren(...cells);
  grid.style.setProperty("--n", String(size));
  grid.dataset.colors = String(rule.colors);
  save();
  paint();
}

function pickSize(n) {
  if (n === size) return;
  size = n;
  set(SIZE_KEY, n);
  build();
}

function pickLevel(id) {
  if (id === level) return;
  level = id;
  set(LEVEL_KEY, id);
  build();
}

// ---------------------------------------------------------------- play

function preview(i, on) {
  if (!started || g.status !== "playing") return;
  for (const j of reach(size, i, rule.shape)) cells[j].classList.toggle("is-reach", on);
}

function tap(i) {
  if (!started || g.status !== "playing") return;
  grid.querySelectorAll(".is-hint").forEach((n) => n.classList.remove("is-hint"));
  g.history.push(i);
  lights = press(size, lights, i, rule);
  for (const j of reach(size, i, rule.shape)) {
    cells[j].classList.remove("is-flip");
    void cells[j].offsetWidth;
    cells[j].classList.add("is-flip");
  }
  if (allOff(lights)) return finish();
  save();
  paint();
}

function finish() {
  g.status = "won";
  state.status = "won";
  const over = g.history.length - B.par;
  recordResult(statsId(size, level), puzzle, { won: true, bucket: parBand(over) });
  save();
  paint();
  toast(over <= 0 ? "Lights out, on par!" : `Lights out! ${over} over par`, 2000);
  setTimeout(() => { if (!isModalOpen()) openStats(); }, 1400);
}

function undo() {
  if (!g.history.length || g.status !== "playing") return;
  g.history.pop();
  lights = replay();
  save();
  paint();
}

function restart() {
  if (!g.history.length || g.status !== "playing") return;
  g.history = [];
  lights = replay();
  save();
  paint();
}

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("Already solved"); return; }
  const i = nextHint(size, lights, rule);
  if (i < 0) return;
  g.hints++;
  save();
  grid.querySelectorAll(".is-hint").forEach((n) => n.classList.remove("is-hint"));
  cells[i].classList.add("is-hint");
  toast("Press here");
}

// ---------------------------------------------------------------- paint

function paint() {
  const done = g.status !== "playing";
  cells.forEach((node, i) => {
    node.classList.toggle("is-on", lights[i] === 1);
    node.classList.toggle("is-hot", lights[i] === 2);
    node.disabled = done;
    const r = Math.floor(i / size) + 1;
    const c = (i % size) + 1;
    node.setAttribute("aria-label", `Row ${r}, column ${c}, ${lights[i] === 2 ? "red" : lights[i] ? (rule.colors > 2 ? "amber" : "lit") : "dark"}`);
  });
  pressesEl.querySelector(".gl-num").textContent = String(g.history.length);
  parEl.querySelector(".gl-num").textContent = String(B.par);
  litEl.querySelector(".gl-num").textContent = String(lights.filter(Boolean).length);
  pressesEl.classList.toggle("is-over", g.history.length > B.par);
  grid.classList.toggle("is-solved", done);
  // Marks: ✓ solved, • started — sizes at this level, levels at this size.
  const mark = (b, s, on, label) => {
    const st = s && s.status === "won" ? "done" : s && s.history.length ? "started" : "";
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.querySelector(".gl-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${label}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  };
  sizeBtns.forEach((b, k) => mark(b, entry(SIZES[k], level), SIZES[k] === size, `${SIZES[k]} by ${SIZES[k]}`));
  levelBtns.forEach((b, k) => mark(b, entry(size, LEVELS[k].id), LEVELS[k].id === level, LEVELS[k].name));
  undoBtn.disabled = done || !g.history.length;
  restartBtn.disabled = done || !g.history.length;
  const over = g.history.length - B.par;
  const harder = LEVELS.slice(LEVELS.findIndex((l) => l.id === level) + 1).find((l) => entry(size, l.id)?.status !== "won");
  tip.textContent = done
    ? `${over <= 0 ? "On par" : `${over} over par`} in ${g.history.length} presses.${harder ? ` Ready for ${harder.name}?` : " Try another size."}`
    : rule.colors > 2
      ? `Each press steps a light${rule.shape === "box" ? " and all eight neighbors" : " and its neighbors"}: off → amber → red → off.`
      : "Press a light to flip it and its neighbors. Turn them all off.";
}

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
  const over = g.history.length - B.par;
  const name = `${size}×${size} ${rule.name}`;
  showStats({
    title: done ? "Lights out!" : `${name} Statistics`,
    message: done ? `${name}: ${g.history.length} presses, par ${B.par}` : "Each size and level keeps its own stats.",
    tiles: [
      { label: "Solved", value: stats.won },
      { label: "On Par", value: stats.dist[PAR_BANDS[0]] || 0 },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Max Streak", value: stats.maxStreak },
    ],
    distribution: {
      title: `${name} Presses Over Par`,
      rows: PAR_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && parBand(over) === b })),
    },
    shareText: done ? shareText({ puzzle, size, level, presses: g.history.length, par: B.par, hints: g.hints }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  const exBefore = [0, 1, 0, 1, 1, 1, 0, 1, 0];
  const exAfter = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const ex = (L, mark) => el("div.gl-grid.gl-ex", { style: { "--n": "3" }, "aria-hidden": "true" },
    L.map((v, i) => el(`div.gl-cell${v ? ".is-on" : ""}${i === mark ? ".is-hint" : ""}`)));
  showModal({
    title: "How To Play",
    className: "gl-help",
    content: [
      el("p.subtitle", "Turn every light off."),
      el("ul",
        el("li", "Pressing a square flips it and the squares above, below, left and right of it: lit ones go dark, dark ones light up."),
        el("li", "Turn off every light to solve the board."),
        el("li", "Par is the fewest presses that can do it. Try to match it."),
        el("li", "Undo takes back a press, and Restart puts the board back the way it started. Only the presses that are left count.")),
      el("h3", "Example"),
      el("div.gl-ex-row", ex(exBefore, 4), el("span", "→"), ex(exAfter, -1)),
      el("p", "Pressing the middle of this plus turns all five lights off in one press."),
      el("h3", "Sizes and levels"),
      el("p", "Pick 5×5, 6×6 or 7×7, and a level. Every size and level has a new board each day with its own progress and stats. ✓ marks boards you've solved today."),
      el("ul",
        el("li", el("b", "Easy and Medium: "), "lights are on or off. Medium boards need more presses."),
        el("li", el("b", "Hard: "), "lights cycle through three colors: off → amber → red → off. A red light needs one more step, an amber light two."),
        el("li", el("b", "Expert: "), "three colors, and a press also reaches the four diagonal neighbors.")),
      el("p", "Pick other days from 📅, or tap 🔀 for practice boards. Stuck? Tap 💡 to see a press on the shortest way from where you are. Turn hints off in Settings."),
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
  playLabel: g.status === "won" ? "See results" : g.history.length ? "Continue" : "Play",
  tagline: doneBoards.length ? `Solved today: ${doneBoards.join(", ")}` : "Turn every light off. Easy to Expert",
});
started = true;
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
