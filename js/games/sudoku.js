// Oh My NUMBERS! — Sudoku. Fill each row, column, and box with 1–9.
// Today's puzzle is Medium and shared. New game starts any difficulty, any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import {
  LEVELS, MISTAKE_LIMIT, applyDigit, applyErase, applyHint, applyUndo, clockText,
  freshState, hintIndex, levelById, lockedAt, makePuzzle, peersOf, repair, resultBucket, shareText,
} from "./sudoku/logic.js";

const GAME = "sudoku";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  HINTS_SETTING,
  {
    key: "mistakeLimit", label: "Mistake limit", type: "toggle", default: true,
    desc: "Three mistakes ends the puzzle.",
  },
  {
    key: "highContrast", label: "High Contrast Mode", type: "toggle", default: false,
    desc: "Contrast and colorblindness improvements",
  },
]);

function modeLevel() {
  if (puzzle.isDaily) return "medium";
  const mode = new URLSearchParams(location.search).get("mode");
  return LEVELS.some((level) => level.id === mode) ? mode : "medium";
}

const level = levelById(modeLevel());
const built = makePuzzle(puzzle.id, level.id);
const stateKey = puzzle.isDaily ? puzzle.id : `${puzzle.id}:${level.id}`;

function startLevel(id) {
  location.href = `${location.pathname}?random=1&mode=${id}`;
}

function practice() {
  showModal({
    title: "New puzzle",
    content: [
      el("p", "Pick a difficulty. A new practice puzzle starts, and this one stays saved. Practice does not change your daily streak."),
      el("div.sd-levels", LEVELS.map((item) =>
        el("button.btn.secondary", { type: "button", onclick: () => startLevel(item.id) }, item.name))),
    ],
  });
}

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(),
  extraButtons: [hintBtn, newGameButton()], practice,
});

let state = repair(loadState(GAME, stateKey), built);
const save = () => saveState(GAME, stateKey, state);
save();

const timeEl = el("div.sd-time");
const missEl = el("div.sd-miss");
const levelEl = el("div.sd-level", level.name);
const boardEl = el("div.sd-board", { role: "grid", "aria-label": "Sudoku" });
const frameEl = el("div.sd-frame", boardEl);
const noteBtn = el("button.btn.small.secondary", { type: "button" }, "Notes");
const undoBtn = el("button.btn.small.secondary", { type: "button" }, "Undo");
const eraseBtn = el("button.btn.small.secondary", { type: "button" }, "Erase");
const padEl = el("div.sd-pad", { role: "group", "aria-label": "Numbers" });
const live = el("div.visually-hidden", { "aria-live": "polite" });

noteBtn.addEventListener("click", () => {
  if (!playing()) return;
  state.notesMode = !state.notesMode;
  save();
  paint();
});
undoBtn.addEventListener("click", () => act(applyUndo(state)));
eraseBtn.addEventListener("click", () => act(applyErase(state, state.selected)));

main.append(el("div.sd-game",
  el("div.sd-hud", levelEl, timeEl, missEl),
  frameEl,
  el("div.sd-tools", undoBtn, eraseBtn, noteBtn),
  padEl,
  live,
));

let started = false;
let lastFrame = 0;
let shownSecond = -1;

function limitOn() {
  return getSetting(GAME, "mistakeLimit") !== false;
}

function playing() {
  return started && state.status === "playing" && !isModalOpen();
}

function hasProgress(s) {
  if (s.mistakes || s.hints || s.undo.length || s.notes.some(Boolean)) return true;
  return s.values.some((v, i) => v && !s.givens[i]);
}

function usedCounts() {
  const used = Array(10).fill(0);
  for (const value of state.values) if (value) used[value]++;
  return used;
}

function paint() {
  const limit = limitOn();
  const second = Math.floor(state.elapsed / 1000);
  if (second !== shownSecond || !timeEl.textContent) {
    shownSecond = second;
    timeEl.textContent = clockText(state.elapsed);
  }
  missEl.textContent = limit ? `${state.mistakes}/${MISTAKE_LIMIT}` : String(state.mistakes);
  missEl.title = "Mistakes";
  missEl.setAttribute("aria-label", limit
    ? `${state.mistakes} of ${MISTAKE_LIMIT} mistakes`
    : `${state.mistakes} mistakes`);
  missEl.classList.toggle("is-hot", state.mistakes > 0);
  const active = state.status === "playing";
  noteBtn.classList.toggle("on", state.notesMode);
  noteBtn.setAttribute("aria-pressed", String(state.notesMode));
  noteBtn.disabled = !active;
  undoBtn.disabled = !active || !state.undo.length;
  const selected = state.selected;
  const locked = selected >= 0 && lockedAt(state, selected);
  eraseBtn.disabled = !active || locked || (!state.values[selected] && !state.notes[selected]);
  const selectedValue = selected >= 0 ? state.values[selected] : 0;
  const peers = selected >= 0 ? new Set(peersOf(selected)) : new Set();
  const used = usedCounts();

  boardEl.replaceChildren();
  for (let index = 0; index < 81; index++) {
    boardEl.append(cellButton(index, selected, selectedValue, peers));
  }

  padEl.replaceChildren();
  for (let digit = 1; digit <= 9; digit++) {
    const left = 9 - used[digit];
    const key = el("button.sd-key", {
      type: "button",
      "aria-label": left > 0 ? `${digit}, ${left} left` : `${digit}, complete`,
      onclick: () => onDigit(digit),
    }, String(digit));
    if (left <= 0) key.classList.add("is-out");
    if (state.notesMode) key.classList.add("is-note");
    padEl.append(key);
  }
}

function cellButton(index, selected, selectedValue, peers) {
  const value = state.values[index];
  const given = state.givens[index] !== 0;
  const hinted = state.hinted.includes(index);
  const wrong = value !== 0 && value !== state.solution[index];
  const notes = !value ? state.notes[index] : 0;
  const row = Math.floor(index / 9) + 1;
  const col = (index % 9) + 1;
  const kind = given ? "given" : hinted ? "hinted" : value ? "entered" : "empty";
  const button = el("button.sd-cell", {
    type: "button",
    role: "gridcell",
    "aria-selected": String(index === selected),
    "aria-label": `Row ${row}, column ${col}, ${kind}${value ? ` ${value}` : ""}`,
    onclick: () => select(index),
  });
  if (index === selected) button.classList.add("is-selected");
  else if (selectedValue && value === selectedValue) button.classList.add("is-same");
  else if (peers.has(index)) button.classList.add("is-peer");
  if (given) button.classList.add("is-given");
  if (hinted) button.classList.add("is-hint");
  if (wrong) button.classList.add("is-error");
  if (value) button.textContent = String(value);
  else if (notes) {
    const marks = [];
    for (let digit = 1; digit <= 9; digit++) {
      const on = notes & (1 << digit);
      marks.push(el("span", { class: on ? (selectedValue === digit ? "is-hot" : "") : "is-off" }, on ? String(digit) : ""));
    }
    button.append(el("span.sd-notes", marks));
  }
  return button;
}

function select(index) {
  if (!playing()) return;
  state.selected = index;
  save();
  paint();
}

function onDigit(digit) {
  if (!playing()) return;
  act(applyDigit(state, state.selected, digit, state.notesMode, limitOn()));
}

function useHint() {
  if (!playing()) return;
  if (hintIndex(state) < 0) return;
  act(applyHint(state));
}

function act(result) {
  if (result === "noop") return;
  save();
  paint();
  if (result === "mistake") live.textContent = `Mistake ${state.mistakes}`;
  if (result === "win") live.textContent = "Solved";
  if (result === "lose") live.textContent = "Game over";
  if (result === "win" || result === "lose") finish();
}

function finish() {
  recordResult(GAME, puzzle, {
    won: state.status === "won",
    bucket: resultBucket(state),
    time: Math.round(state.elapsed / 1000),
  });
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 350);
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Each row, column, and box holds 1 to 9.",
    content: [
      el("ul.help-list",
        el("li", "Select a cell, then tap a number. Numbers already in the grid stay where they are."),
        el("li", "Notes jot the candidates in an empty cell. Erase clears a cell you filled. Undo steps back, and a mistake steps back with it."),
        el("li", "A wrong number turns red. Three mistakes ends the puzzle. Settings can turn that limit off."),
        el("li", "The lightbulb fills one cell with the right number. Settings can hide hints.")),
      el("p", "Today's puzzle is Medium, and it is the same for everyone. New game starts Easy, Medium, Hard, Expert, Master, or Extreme whenever you want. Those rounds do not change your daily streak."),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const bucket = done ? resultBucket(state) : null;
  const rows = [
    { label: "0", key: "0" },
    { label: "1", key: "1" },
    { label: "2", key: "2" },
    { label: "3+", key: "3" },
    { label: "X", key: "X" },
  ].map((row) => ({ label: row.label, count: stats.dist[row.key] || 0, highlight: bucket === row.key }));
  showStats({
    title: done ? (state.status === "won" ? "Solved" : "Game over") : undefined,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Mistakes", rows },
    nextLabel: puzzle.isToday && done ? "Next Sudoku" : null,
    shareText: done ? shareText({ puzzle, level, state }) : null,
    extra: done ? el("div",
      el("p.sd-result", `${level.name} · ${state.status === "won" ? clockText(state.elapsed) : "Not solved"}`),
      el("p.sd-result", `${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}`),
    ) : null,
  });
}

paint();
if (state.status !== "playing") {
  recordResult(GAME, puzzle, {
    won: state.status === "won",
    bucket: resultBucket(state),
    time: Math.round(state.elapsed / 1000),
  });
}

document.addEventListener("keydown", (e) => {
  if (!playing()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= "1" && e.key <= "9") { e.preventDefault(); onDigit(Number(e.key)); return; }
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
    e.preventDefault();
    act(applyErase(state, state.selected));
    return;
  }
  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    state.notesMode = !state.notesMode;
    save();
    paint();
    return;
  }
  if (e.key === "z" || e.key === "Z" || e.key === "u" || e.key === "U") {
    e.preventDefault();
    act(applyUndo(state));
    return;
  }
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
  if (!step) return;
  e.preventDefault();
  const row = Math.floor(state.selected / 9);
  const col = state.selected % 9;
  if (e.key === "ArrowLeft" && col === 0) return;
  if (e.key === "ArrowRight" && col === 8) return;
  const next = state.selected + step;
  if (next < 0 || next > 80) return;
  state.selected = next;
  save();
  paint();
});

document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
onSettingsChange(() => paint());

function frame(now) {
  const run = started && state.status === "playing" && !document.hidden && !isModalOpen() && !document.querySelector(".splash");
  if (run && lastFrame) state.elapsed += now - lastFrame;
  lastFrame = now;
  if (run) {
    const second = Math.floor(state.elapsed / 1000);
    if (second !== shownSecond) {
      shownSecond = second;
      timeEl.textContent = clockText(state.elapsed);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => { if (started && state.status === "playing") save(); }, 5000);

const finished = state.status !== "playing";
const picker = el("div.sd-pick",
  el("p.sd-pick-label", "New puzzle"),
  el("div.sd-pick-row", LEVELS.map((item) =>
    el("button.btn.small.secondary", { type: "button", onclick: () => startLevel(item.id) }, item.name))),
);
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : hasProgress(state) ? "Continue" : "Play",
  byline: level.name,
  beforeActions: picker,
});
started = true;
lastFrame = 0;
if (finished) openStats();
else if (!get("seen:sudoku")) { set("seen:sudoku", true); showHelp(); }
