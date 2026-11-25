// Oh My NUMBERS! — Cross Sums: fill the white squares with 1–9 so each run adds up to its clue,
// with no digit twice in a run. Each day has a board for every size group (Small, Medium, Large;
// the size within the group changes daily) and level (Easy, Moderate, Hard), each with its own
// progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import {
  DEFAULT_GROUP, DEFAULT_LEVEL, GROUPS, LEVELS, TIME_BANDS, boardFor, boardKey, combos, conflicts, groupById, levelById,
  nextHint, setBank, shareText, solved, statsId, timeBand,
} from "./sums/logic.js";

const GAME = "sums";
const GROUP_KEY = "sums:group";
const LEVEL_KEY = "sums:level";
const puzzle = currentPuzzle();
defineSettings(GAME, [
  HINTS_SETTING,
  { key: "combos", label: "Show combinations", type: "toggle", default: true,
    desc: "List the digit sets that fit the selected square's runs." },
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// state.boards["<group>-<level>"]: { id, values, notes (digit masks), time, status, hints, hinted }.
// id is the board itself, so a changed bank starts the board fresh. state.status is "won" once
// any board is solved, so the hub shows the day as done.
const freshBoard = (B) => ({
  id: B.id, values: new Array(B.rows * B.cols).fill(0), notes: new Array(B.rows * B.cols).fill(0),
  time: 0, status: "playing", hints: 0, hinted: [],
});
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.boards ? saved : { boards: {}, status: "playing" };
const validGroup = (id) => GROUPS.some((x) => x.id === id);
let group = validGroup(state.group) ? state.group : validGroup(get(GROUP_KEY)) ? get(GROUP_KEY) : DEFAULT_GROUP;
const validLevel = (id) => LEVELS.some((l) => l.id === id);
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
const entry = (gr = group, l = level) => state.boards[boardKey(gr, l)];
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

let B, g, cells;
let selected = -1;
let notesMode = false;
let undoStack = [];

// ---------------------------------------------------------------- layout

const clock = el("div.ks-clock");
const sizeEl = el("div.ks-size");
const groupBtns = GROUPS.map((x) => el("button.ks-pick", {
  type: "button", role: "tab", onclick: () => pickGroup(x.id),
}, x.name, el("span.ks-mark", { "aria-hidden": "true" })));
const levelBtns = LEVELS.map((l) => el("button.ks-pick", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.ks-mark", { "aria-hidden": "true" })));
const grid = el("div.ks-grid", { role: "grid", "aria-label": "Cross Sums board" });
const combosEl = el("div.ks-combos", { "aria-live": "polite" });
const keys = Array.from({ length: 9 }, (_, k) => el("button.ks-key", { type: "button", onclick: () => enter(k + 1) }, String(k + 1)));
const noteBtn = el("button.ks-key.ks-tool", { type: "button", onclick: () => { notesMode = !notesMode; paint(); } }, "Notes");
const eraseBtn = el("button.ks-key.ks-tool", { type: "button", onclick: () => enter(0) }, "Erase");
const undoBtn = el("button.btn.small.secondary", { type: "button", onclick: () => undo() }, "Undo");
const restartBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askRestart() }, "Restart");
const tip = el("p.ks-tip");

main.append(el("div.ks-wrap",
  el("div.ks-top", el("div.ks-picker", { role: "tablist", "aria-label": "Size" }, groupBtns), clock),
  el("div.ks-top", el("div.ks-picker", { role: "tablist", "aria-label": "Difficulty" }, levelBtns), sizeEl),
  grid,
  combosEl,
  el("div.ks-pad", { role: "group", "aria-label": "Digits" }, keys, noteBtn, eraseBtn),
  el("div.ks-controls", undoBtn, restartBtn),
  tip));

function build() {
  B = boardFor(puzzle, group, level);
  const key = boardKey(group, level);
  if (!state.boards[key] || state.boards[key].id !== B.id) state.boards[key] = freshBoard(B);
  g = state.boards[key];
  state.group = group;
  state.level = level;
  undoStack = [];
  selected = B.white.findIndex(Boolean);
  const clue = new Map(B.runs.map((r) => [`${r.clue}:${r.dir}`, r.sum]));
  cells = B.white.map((w, i) => {
    if (w) {
      return el("button.ks-cell", {
        type: "button", role: "gridcell", onclick: () => { selected = i; paint(); },
      });
    }
    const across = clue.get(`${i}:0`);
    const down = clue.get(`${i}:1`);
    if (across == null && down == null) return el("div.ks-block");
    return el("div.ks-block.is-clue", {
      role: "gridcell",
      "aria-label": [across != null ? `across ${across}` : "", down != null ? `down ${down}` : ""].filter(Boolean).join(", "),
    },
    el("span.ks-across", across != null ? String(across) : ""),
    el("span.ks-down", down != null ? String(down) : ""));
  });
  grid.replaceChildren(...cells);
  grid.style.setProperty("--cols", String(B.cols));
  grid.style.setProperty("--rows", String(B.rows));
  save();
  paint();
}

function pickGroup(id) {
  if (id === group) return;
  group = id;
  set(GROUP_KEY, id);
  build();
}

function pickLevel(id) {
  if (id === level) return;
  level = id;
  set(LEVEL_KEY, id);
  build();
}

// ---------------------------------------------------------------- play

const playing = () => started && g.status === "playing";

function remember() {
  undoStack.push({ values: g.values.slice(), notes: g.notes.slice() });
  if (undoStack.length > 300) undoStack.shift();
}

/** Put digit d (0 erases) in the selected square, or toggle it as a note. */
function enter(d) {
  if (!playing() || selected < 0 || !B.white[selected]) return;
  if (g.hinted.includes(selected)) { toast("A hint filled this square"); return; }
  remember();
  if (d === 0) {
    g.values[selected] = 0;
    g.notes[selected] = 0;
  } else if (notesMode && !g.values[selected]) {
    g.notes[selected] ^= 1 << d;
  } else {
    g.values[selected] = g.values[selected] === d ? 0 : d;
  }
  afterChange();
}

function afterChange() {
  if (solved(B, g.values)) {
    g.status = "won";
    state.status = "won";
    recordResult(statsId(group, level), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
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
  if (!undoStack.length || !playing()) return;
  const prev = undoStack.pop();
  g.values = prev.values;
  g.notes = prev.notes;
  for (const i of g.hinted) g.values[i] = B.solution[i];
  save();
  paint();
}

function askRestart() {
  if (!playing() || !g.values.some((v, i) => v && !g.hinted.includes(i)) && !g.notes.some(Boolean)) return;
  showModal({
    title: "Restart this board?",
    content: [
      el("p", "This clears your digits and notes. Hints stay, and the clock keeps running."),
      el("div.ks-actions", el("button.btn", { type: "button", onclick: () => {
        remember();
        g.values = g.values.map((v, i) => (g.hinted.includes(i) ? v : 0));
        g.notes = g.notes.map(() => 0);
        save();
        paint();
        document.querySelector(".modal .modal-close")?.click();
      } }, "Restart")),
    ],
  });
}

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("Already solved"); return; }
  const h = nextHint(B, g.values, selected);
  if (!h) return;
  remember();
  const wrong = g.values[h.cell] && g.values[h.cell] !== h.digit;
  g.values[h.cell] = h.digit;
  g.notes[h.cell] = 0;
  if (!g.hinted.includes(h.cell)) g.hinted.push(h.cell);
  g.hints++;
  selected = h.cell;
  toast(wrong ? "That square was wrong. Fixed it" : `A ${h.digit} goes here`);
  const node = cells[h.cell];
  node.classList.remove("is-flash");
  void node.offsetWidth;
  node.classList.add("is-flash");
  afterChange();
}

// ---------------------------------------------------------------- keys

document.addEventListener("keydown", (e) => {
  if (!playing() || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); enter(Number(e.key)); return; }
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { e.preventDefault(); enter(0); return; }
  if (e.key === "n" || e.key === "N") { notesMode = !notesMode; paint(); return; }
  if (e.key === "z") { e.preventDefault(); undo(); return; }
  const step = { ArrowUp: -B.cols, ArrowDown: B.cols, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (!step) return;
  e.preventDefault();
  // Jump over clue squares to the next white one in that direction.
  for (let i = selected + step; i >= 0 && i < B.white.length; i += step) {
    if (Math.abs(step) === 1 && Math.floor(i / B.cols) !== Math.floor(selected / B.cols)) break;
    if (B.white[i]) { selected = i; break; }
  }
  paint();
});

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

/** The digit sets that fit a run, given the digits already in it. */
function runCombos(run) {
  const placed = run.cells.map((i) => g.values[i]).filter(Boolean);
  return combos(run.cells.length, run.sum).filter((set) => placed.every((d) => set.includes(d)));
}

function paint() {
  const done = g.status !== "playing";
  const bad = conflicts(B, g.values);
  const sel = B.of[selected] || [-1, -1];
  const inRun = new Set(sel.flatMap((r) => (r >= 0 ? B.runs[r].cells : [])));
  cells.forEach((node, i) => {
    if (!B.white[i]) return;
    const v = g.values[i];
    node.classList.toggle("is-sel", i === selected && !done);
    node.classList.toggle("is-run", inRun.has(i) && i !== selected && !done);
    node.classList.toggle("is-bad", bad.has(i));
    node.classList.toggle("is-hint", g.hinted.includes(i));
    node.disabled = done;
    if (v) node.replaceChildren(el("span.ks-val", String(v)));
    else if (g.notes[i]) {
      node.replaceChildren(el("span.ks-notes", Array.from({ length: 9 }, (_, k) => el("span", g.notes[i] & (1 << (k + 1)) ? String(k + 1) : ""))));
    } else node.replaceChildren();
    const r = Math.floor(i / B.cols) + 1;
    const c = (i % B.cols) + 1;
    node.setAttribute("aria-label", `Row ${r}, column ${c}${v ? `, ${v}` : ", empty"}${bad.has(i) ? ", clashes" : ""}`);
  });
  // A clue half turns green when its run is full and right, red when full and wrong.
  for (const run of B.runs) {
    const tile = cells[run.clue];
    const vals = run.cells.map((i) => g.values[i]);
    const full = vals.every(Boolean);
    const ok = full && vals.reduce((a, b) => a + b, 0) === run.sum && new Set(vals).size === vals.length;
    const side = run.dir ? "dn" : "ac";
    tile.classList.toggle(`${side}-ok`, ok);
    tile.classList.toggle(`${side}-bad`, full && !ok);
  }
  grid.classList.toggle("is-solved", done);
  // Combinations for the selected square's runs.
  const showCombos = getSetting(GAME, "combos") !== false && !done && selected >= 0;
  combosEl.hidden = !showCombos;
  if (showCombos) {
    combosEl.replaceChildren(...[0, 1].filter((dir) => sel[dir] >= 0).map((dir) => {
      const run = B.runs[sel[dir]];
      const sets = runCombos(run);
      return el("div.ks-combo-row",
        el("span.ks-combo-head", `${dir ? "Down" : "Across"} ${run.sum} in ${run.cells.length}`),
        el("span.ks-combo-sets", sets.length ? sets.slice(0, 8).map((s) => s.join("")).join("  ") + (sets.length > 8 ? `  +${sets.length - 8} more` : "") : "No set fits"));
    }));
  }
  const mark = (b, s, on, label) => {
    const st = s && s.status === "won" ? "done" : s && s.values.some(Boolean) ? "started" : "";
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.querySelector(".ks-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    b.setAttribute("aria-label", `${label}${st === "done" ? ", solved" : st === "started" ? ", in progress" : ""}`);
  };
  groupBtns.forEach((b, k) => mark(b, entry(GROUPS[k].id, level), GROUPS[k].id === group, GROUPS[k].name));
  levelBtns.forEach((b, k) => mark(b, entry(group, LEVELS[k].id), LEVELS[k].id === level, LEVELS[k].name));
  sizeEl.textContent = `${B.rows}×${B.cols}`;
  noteBtn.classList.toggle("is-on", notesMode);
  noteBtn.setAttribute("aria-pressed", String(notesMode));
  [...keys, noteBtn, eraseBtn].forEach((k) => { k.disabled = done; });
  undoBtn.disabled = done || !undoStack.length;
  restartBtn.disabled = done;
  const open = B.white.filter((w, i) => w && !g.values[i]).length;
  const harder = LEVELS.slice(LEVELS.findIndex((l) => l.id === level) + 1).find((l) => entry(group, l.id)?.status !== "won");
  tip.textContent = done
    ? `Solved in ${formatTime(g.time)}${g.hints ? ` with ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${harder ? ` Ready for ${harder.name}?` : " Try another size."}`
    : bad.size ? "Red squares repeat a digit in a run, or a full run adds up wrong."
      : open ? `${open} ${open === 1 ? "square" : "squares"} to go.${notesMode ? " Notes are on." : ""}` : "Every square is filled, but something's off.";
  paintClock();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

// ---------------------------------------------------------------- stats & help

function openStats() {
  const stats = getStats(statsId(group, level));
  const done = g.status === "won";
  const best = stats.times.length ? Math.min(...stats.times) : null;
  const name = `${groupById(group).name} ${levelById(level).name}`;
  showStats({
    title: done ? "Solved!" : `${name} Statistics`,
    message: done ? `${B.rows}×${B.cols} ${levelById(level).name} in ${formatTime(g.time)}` : "Each size and level keeps its own stats.",
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
    shareText: done ? shareText({ puzzle, rows: B.rows, cols: B.cols, level, time: g.time, hints: g.hints, formatTime }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  // A solved 3×3: across 4 (1+3) and 9 (2+7), down 3 (1+2) and 10 (3+7).
  const ex = el("div.ks-grid.ks-ex", { style: { "--cols": "3", "--rows": "3" }, "aria-hidden": "true" },
    el("div.ks-block"),
    el("div.ks-block.is-clue", el("span.ks-across"), el("span.ks-down", "3")),
    el("div.ks-block.is-clue", el("span.ks-across"), el("span.ks-down", "10")),
    el("div.ks-block.is-clue", el("span.ks-across", "4"), el("span.ks-down")),
    el("div.ks-cell", el("span.ks-val", "1")), el("div.ks-cell", el("span.ks-val", "3")),
    el("div.ks-block.is-clue", el("span.ks-across", "9"), el("span.ks-down")),
    el("div.ks-cell", el("span.ks-val", "2")), el("div.ks-cell", el("span.ks-val", "7")));
  showModal({
    title: "How To Play",
    className: "ks-help",
    content: [
      el("p.subtitle", "Fill every white square with a digit from 1 to 9."),
      el("ul",
        el("li", "A run is a line of white squares across or down. Its clue sits in the dark square just before it: across clues upper right, down clues lower left."),
        el("li", "Each run must add up to its clue, and no digit can appear twice in a run."),
        el("li", "Tap a square, then a digit. Turn on Notes to pencil in options. Arrow keys, 1–9 and Backspace work too."),
        el("li", "The combinations line lists the digit sets that can make each run through the selected square. When a run is full, its half of the clue tile turns green if it's right and red if it isn't. Red digits repeat in a run.")),
      el("h3", "Example"),
      ex,
      el("p", "Across: 1 + 3 = 4 and 2 + 7 = 9. Down: 1 + 2 = 3 and 3 + 7 = 10."),
      el("h3", "Sizes and levels"),
      el("p", "Small boards are 3×3 to 5×5, Medium 6×6 to 8×8, and Large 9×9, 10×10 or 9×11 (sizes count the clue squares). The size within each group changes daily. Easy boards fall out of each run's own combinations, Moderate needs crossing runs to narrow them down, and Hard needs looking ahead. Every board has exactly one answer, and each size and level keeps its own progress, timer and stats."),
      el("p", "Pick other days from 📅, or tap 🔀 for practice boards. Stuck? 💡 fills a square (or fixes a wrong one). Turn hints, combinations or the timer off in Settings."),
    ],
  });
}

// ---------------------------------------------------------------- start

setBank(await loadJSON("data/sums/boards.json").catch(() => null));
if (!boardFor(puzzle, group, level)) {
  main.append(el("p.ks-tip", "Couldn't load the boards. Check your connection and reload."));
} else {
  build();
  const doneBoards = Object.entries(state.boards).filter(([, b]) => b.status === "won").map(([k]) => {
    const [gr, l] = k.split("-");
    return `${groupById(gr).name} ${levelById(l).name}`;
  });
  await splash({
    gameId: GAME,
    puzzle,
    playLabel: g.status === "won" ? "See results" : g.values.some(Boolean) ? "Continue" : "Play",
    tagline: doneBoards.length ? `Solved today: ${doneBoards.join(", ")}` : "Pick a size and a level, Easy to Hard",
  });
  started = true;
  if (g.status === "won") openStats();
  else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
}
