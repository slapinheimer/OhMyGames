// Lettergrams — clear the rack onto a 5×5 board as connected words. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, ICONS } from "../core/ui.js";
import { loadCommon, loadDictionary } from "../core/words.js";
import {
  SIZE, CELLS, RACK, POINTS, BONUS, STAR_WORDS,
  puzzleFor, scoreBoard, shareText, solverWords, starsFor, threshold, wordChecker,
} from "./lettergrams/logic.js";

const GAME = "lettergrams";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "showPoints", label: "Show Letter Points", type: "toggle", default: true,
    desc: "Small point values in the corner of each tile",
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.pos.some((p) => p >= 0)) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.lg-again",
          el("button.btn", { type: "button", onclick: startFresh }, "Play new game")),
      ],
    });
    return;
  }
  startFresh();
}

const newBtn = el("button.icon-btn", {
  type: "button", "aria-label": "New game", title: "New game", html: ICONS.shuffle, onclick: askNewGame,
});
const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newBtn],
});

main.append(el("p.lg-loading", "Setting out the tiles…"));
const [common, dictionary] = await Promise.all([loadCommon(), loadDictionary()]);
const pool = solverWords(common, dictionary);
const built = puzzleFor(puzzle, { words: pool, set: new Set(pool) });
const isWord = wordChecker(dictionary);
const { rack, bonus, target } = built;
main.replaceChildren();

// ---------------------------------------------------------------- state
// pos[t] is the board square of rack tile t, or -1 while it sits in the rack.
// order is the rack's left-to-right order. best is the highest finished score.
// hints is how many words of our top board are shown on the board as faint letters.

function freshState() {
  return { v: 1, pos: Array(RACK).fill(-1), order: [...Array(RACK).keys()], status: "playing", best: 0, bestGrid: null, hints: 0 };
}

function validSaved(s) {
  if (!s || s.v !== 1 || !Array.isArray(s.pos) || s.pos.length !== RACK || !Array.isArray(s.order)) return false;
  const squares = s.pos.filter((p) => p >= 0);
  if (squares.some((p) => !Number.isInteger(p) || p >= CELLS) || new Set(squares).size !== squares.length) return false;
  return s.order.length === RACK && new Set(s.order).size === RACK && s.order.every((t) => Number.isInteger(t) && t >= 0 && t < RACK);
}

const saved = loadState(GAME, puzzle.id);
let state = validSaved(saved) ? {
  ...freshState(),
  pos: saved.pos,
  order: saved.order,
  status: saved.status === "won" ? "won" : "playing",
  best: Number.isInteger(saved.best) ? saved.best : 0,
  bestGrid: Array.isArray(saved.bestGrid) && saved.bestGrid.length === CELLS ? saved.bestGrid : null,
  hints: Number.isInteger(saved.hints) && saved.hints >= 0 ? saved.hints : 0,
} : freshState();
if (state.status === "won" && !state.bestGrid) state.status = "playing";

const save = () => saveState(GAME, puzzle.id, state);

function gridNow() {
  const g = Array(CELLS).fill("");
  state.pos.forEach((p, t) => { if (p >= 0) g[p] = rack[t]; });
  return g;
}

const tileOn = (cell) => state.pos.indexOf(cell);
// Hint words come from our top board, best-scoring first. The last one is never given away.
const hintWords = scoreBoard(built.best, bonus, isWord).words.slice().sort((a, b) => b.points - a.points);
const maxHints = Math.max(1, hintWords.length - 1);

/** Square -> letter for every hint shown so far. */
function hintLetters() {
  const out = new Map();
  for (const w of hintWords.slice(0, state.hints)) w.cells.forEach((i, k) => out.set(i, w.word[k]));
  return out;
}
const rackTiles = () => state.order.filter((t) => state.pos[t] < 0);

// ---------------------------------------------------------------- DOM

const starEls = [0, 1, 2, 3, 4].map(() => el("span.lg-star", { "aria-hidden": "true" }, "★"));
const starsBox = el("div.lg-stars", starEls);
const scoreNum = el("div.num");
const scoreLabel = el("div.label", "points");
const scoreBox = el("div.lg-score", { "aria-live": "polite" }, scoreNum, scoreLabel);
const fillEl = el("div.lg-fill");
const ticks = [2, 3, 4, 5].map((s) => el("div.lg-tick", { dataset: { stars: String(s) } },
  el("span.lg-tick-mark"), el("span.lg-tick-num", String(threshold(s, target)))));
const meter = el("div.lg-meter", { role: "img" }, el("div.lg-track", fillEl), ticks);
ticks.forEach((tk, k) => { tk.style.left = `${(threshold(k + 2, target) / target) * 100}%`; });

const boardEl = el("div.lg-board", { role: "grid", "aria-label": "Lettergrams board" });
const cellEls = [];
for (let i = 0; i < CELLS; i++) {
  const b = bonus[i];
  const cell = el("div.lg-cell", {
    role: "gridcell", dataset: b ? { cell: String(i), bonus: b } : { cell: String(i) },
  }, b ? el("span.lg-bonus", b) : null, el("span.lg-hint-letter", { "aria-hidden": "true" }));
  cell.addEventListener("click", (e) => onCellClick(e, i));
  cellEls.push(cell);
  boardEl.append(cell);
}
const stageEl = el("div.lg-stage", el("div.lg-plate", boardEl));
const statusEl = el("p.lg-status", { "aria-live": "polite" });
const rackEl = el("div.lg-rack", { role: "group", "aria-label": "Rack" });

const tileEls = rack.map((ch, t) => {
  const tile = el("div.lg-tile", {
    role: "button", tabindex: "0", dataset: { t: String(t) },
  }, el("span.lg-letter", ch.toUpperCase()), el("span.lg-pts", String(POINTS[ch])));
  tile.addEventListener("pointerdown", (e) => onPointerDown(e, t));
  tile.addEventListener("pointermove", onPointerMove);
  tile.addEventListener("pointerup", (e) => onPointerUp(e, true));
  tile.addEventListener("pointercancel", (e) => onPointerUp(e, false));
  tile.addEventListener("click", (e) => onTileClick(e, t));
  tile.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    onTileTap(t);
  });
  return tile;
});

const shuffleBtn = el("button.btn.secondary.small", { type: "button", onclick: () => shuffleRack() }, "Shuffle");
const clearBtn = el("button.btn.secondary.small", { type: "button", onclick: () => clearBoard() }, "Clear");
const doneBtn = el("button.btn.small.lg-done", { type: "button", onclick: () => allDone() }, "All done");
const actionsEl = el("div.lg-actions", shuffleBtn, clearBtn, doneBtn);

const gameEl = el("div.lg-game",
  el("div.lg-hud", el("div.lg-hud-top", starsBox, scoreBox), meter),
  stageEl, statusEl, rackEl, actionsEl);
main.append(gameEl);

let selected = -1; // rack tile id picked up by a tap
let cursor = -1; // board square for typed letters
let across = true;
let drag = null;
let fromPointer = false;

function fit() {
  const gap = 5;
  const plate = 20;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  if (w < 40 || h < 40) return;
  const side = Math.min(w, h, 400);
  const tile = Math.max(40, Math.floor((side - plate - gap * (SIZE - 1)) / SIZE));
  gameEl.style.setProperty("--tile", `${tile}px`);
  gameEl.style.setProperty("--rack-tile", `${Math.min(tile, Math.floor((gameEl.clientWidth - 32 - 16 - 5 * 6) / 6))}px`);
}
new ResizeObserver(fit).observe(stageEl);

function applySettings() {
  gameEl.classList.toggle("hide-points", !getSetting(GAME, "showPoints"));
}

// ---------------------------------------------------------------- paint

function paint() {
  applySettings();
  const grid = gridNow();
  const result = scoreBoard(grid, bonus, isWord);
  const bad = new Set([...result.invalid, ...result.disconnected]);
  const hints = hintLetters();

  cellEls.forEach((cell, i) => {
    const t = tileOn(i);
    const ghost = t < 0 && hints.has(i) ? hints.get(i) : "";
    cell.classList.toggle("has-hint", !!ghost);
    cell.querySelector(".lg-hint-letter").textContent = ghost.toUpperCase();
    cell.classList.toggle("is-cursor", i === cursor && t < 0);
    cell.classList.toggle("is-cursor-tile", i === cursor && t >= 0);
    cell.classList.toggle("is-down", !across);
    const b = bonus[i];
    const label = t >= 0
      ? `${rack[t].toUpperCase()}${bad.has(i) ? ", not part of a valid word" : ""}`
      : `${b ? `${BONUS[b].name} square, empty` : "Empty square"}${ghost ? `, hint ${ghost.toUpperCase()}` : ""}`;
    cell.setAttribute("aria-label", `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}: ${label}`);
    if (t >= 0 && tileEls[t].parentNode !== cell) cell.append(tileEls[t]);
  });
  rackTiles().forEach((t) => rackEl.append(tileEls[t]));
  rackEl.querySelectorAll(".lg-slot").forEach((s) => s.remove());
  for (let k = rackTiles().length; k < RACK; k++) rackEl.append(el("div.lg-slot"));

  tileEls.forEach((tile, t) => {
    const p = state.pos[t];
    tile.classList.toggle("on-board", p >= 0);
    tile.classList.toggle("is-bad", p >= 0 && bad.has(p));
    tile.classList.toggle("is-selected", t === selected);
    tile.dataset.bonus = p >= 0 && bonus[p] ? bonus[p] : "";
    tile.setAttribute("aria-label", `${rack[t].toUpperCase()}, ${POINTS[rack[t]]} point${POINTS[rack[t]] === 1 ? "" : "s"}${p >= 0 ? ", on the board" : ", in the rack"}`);
  });

  const shown = result.score;
  scoreNum.textContent = String(shown);
  const stars = starsFor(shown, target, true);
  starEls.forEach((s, i) => {
    s.classList.toggle("on", i < stars);
    s.classList.toggle("off", i >= stars);
  });
  starsBox.classList.toggle("is-pending", !result.complete);
  starsBox.setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} for this score`);
  fillEl.style.width = `${Math.min(100, (shown / target) * 100)}%`;
  ticks.forEach((tk, k) => tk.classList.toggle("on", shown >= threshold(k + 2, target)));
  meter.setAttribute("aria-label", `${shown} points. ${threshold(5, target)} points earns five stars.`);
  scoreLabel.textContent = state.best ? `points · best ${state.best}` : "points";

  doneBtn.disabled = !result.complete;
  clearBtn.disabled = result.placed === 0;
  statusEl.textContent = statusText(result);
  statusEl.classList.toggle("is-ready", result.complete);
  return result;
}

function statusText(result) {
  const left = RACK - result.placed;
  const invalid = result.words.filter((w) => !w.valid).map((w) => w.word.toUpperCase());
  if (result.placed === 0) return "Tap or drag tiles onto the board.";
  if (invalid.length) return `Not a word: ${invalid.slice(0, 3).join(", ")}`;
  if (result.disconnected.size) return "Everything must connect.";
  if (left > 0) return `${left} tile${left === 1 ? "" : "s"} left in the rack.`;
  if (state.status === "won") {
    return result.score > state.best ? "New best! Tap All done to save it." : `Board complete. Your best is ${state.best}.`;
  }
  return "Board complete! Tap All done to lock in your score.";
}

// ---------------------------------------------------------------- hints

function useHint() {
  if (state.hints >= maxHints) { toast("No more hints"); return; }
  const w = hintWords[state.hints];
  state.hints += 1;
  commit();
  const across = w.cells[1] - w.cells[0] === 1;
  toast(`Hint: ${w.word.toUpperCase()} ${across ? "across" : "down"}, worth ${w.points}`, 2400);
}

// ---------------------------------------------------------------- moves

function commit() {
  save();
  paint();
}

function setSelected(t) {
  selected = t;
  tileEls.forEach((tile, k) => tile.classList.toggle("is-selected", k === t));
}

/** Put tile t on square `cell`. A tile already there trades places (or goes to the rack). */
function placeTile(t, cell) {
  const from = state.pos[t];
  if (from === cell) return;
  const other = tileOn(cell);
  if (other >= 0) {
    state.pos[other] = from;
    if (from < 0) {
      // The displaced tile takes the rack spot the placed tile left.
      const a = state.order.indexOf(t);
      const b = state.order.indexOf(other);
      state.order[a] = other;
      state.order[b] = t;
    }
  }
  state.pos[t] = cell;
  commit();
}

function toRack(t, before = -1) {
  if (state.pos[t] < 0 && before < 0) return;
  state.pos[t] = -1;
  state.order.splice(state.order.indexOf(t), 1);
  const k = before >= 0 ? state.order.indexOf(before) : -1;
  if (k >= 0) state.order.splice(k, 0, t);
  else state.order.push(t);
  commit();
}

function shuffleRack() {
  const inRack = rackTiles();
  for (let i = inRack.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [inRack[i], inRack[j]] = [inRack[j], inRack[i]];
  }
  state.order = [...state.order.filter((t) => state.pos[t] >= 0), ...inRack];
  setSelected(-1);
  commit();
}

function clearBoard() {
  if (!state.pos.some((p) => p >= 0)) return;
  state.pos = Array(RACK).fill(-1);
  setSelected(-1);
  commit();
}

function allDone() {
  const result = scoreBoard(gridNow(), bonus, isWord);
  if (!result.complete) return;
  const first = state.status !== "won";
  const better = result.score > state.best;
  if (better) {
    state.best = result.score;
    state.bestGrid = gridNow();
  }
  state.status = "won";
  save();
  paint();
  const stars = starsFor(state.best, target);
  if (first) recordResult(GAME, puzzle, { won: true, bucket: String(stars) });
  toast(first ? STAR_WORDS[stars] : better ? "New best!" : `Your best is still ${state.best}`, 2000);
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 700);
}

// ---------------------------------------------------------------- taps

function onTileTap(t) {
  if (isModalOpen()) return;
  if (state.pos[t] >= 0) {
    // A tile on the board: a picked-up rack tile takes its place, otherwise it goes home.
    if (selected >= 0) {
      const cell = state.pos[t];
      const s = selected;
      setSelected(-1);
      placeTile(s, cell);
    } else {
      toRack(t);
    }
    return;
  }
  setSelected(selected === t ? -1 : t);
}

function onTileClick(e, t) {
  e.stopPropagation();
  if (fromPointer) { fromPointer = false; e.preventDefault(); return; }
  onTileTap(t);
}

function onCellClick(e, i) {
  if (isModalOpen() || tileOn(i) >= 0) return;
  if (selected >= 0) {
    const s = selected;
    setSelected(-1);
    placeTile(s, i);
    return;
  }
  if (cursor === i) across = !across;
  cursor = i;
  paint();
}

// ---------------------------------------------------------------- drag

function onPointerDown(e, t) {
  if (e.button !== 0 || isModalOpen()) return;
  drag = { t, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, ghost: null };
  try { tileEls[t].setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
}

function dropTarget(x, y) {
  const node = document.elementFromPoint(x, y);
  if (!node || !node.closest) return null;
  const cell = node.closest(".lg-cell");
  if (cell) return { cell: Number(cell.dataset.cell) };
  const tile = node.closest(".lg-rack .lg-tile");
  if (tile) return { rack: true, before: Number(tile.dataset.t) };
  if (node.closest(".lg-rack")) return { rack: true, before: -1 };
  return null;
}

function clearOver() {
  cellEls.forEach((c) => c.classList.remove("is-over"));
  rackEl.classList.remove("is-over");
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
    drag.moved = true;
    setSelected(-1);
    const src = tileEls[drag.t];
    const box = src.getBoundingClientRect();
    drag.ghost = src.cloneNode(true);
    drag.ghost.classList.add("lg-ghost");
    drag.ghost.classList.remove("is-bad", "is-selected");
    drag.ghost.style.width = `${box.width}px`;
    drag.ghost.style.height = `${box.height}px`;
    drag.dx = drag.x - box.left;
    drag.dy = drag.y - box.top;
    document.body.append(drag.ghost);
    src.classList.add("is-lifted");
  }
  if (!drag.moved) return;
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) scale(1.08)`;
  clearOver();
  const to = dropTarget(e.clientX, e.clientY);
  if (to && to.cell != null) cellEls[to.cell].classList.add("is-over");
  else if (to && to.rack) rackEl.classList.add("is-over");
}

function onPointerUp(e, ok) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const info = drag;
  drag = null;
  clearOver();
  if (!info.moved) return;
  fromPointer = true;
  setTimeout(() => { fromPointer = false; }, 350);
  info.ghost.remove();
  tileEls[info.t].classList.remove("is-lifted");
  if (!ok) return;
  const to = dropTarget(e.clientX, e.clientY);
  if (!to) return;
  if (to.cell != null) placeTile(info.t, to.cell);
  else if (to.before !== info.t) toRack(info.t, to.before);
}

// ---------------------------------------------------------------- keyboard

function step(cell, dr, dc) {
  const r = Math.floor(cell / SIZE) + dr;
  const c = (cell % SIZE) + dc;
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1;
}

document.addEventListener("keydown", (e) => {
  if (isModalOpen() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".splash")) return;
  if (document.querySelector(".drawer.open")) return;
  const key = e.key;
  const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if (moves[key]) {
    e.preventDefault();
    if (cursor < 0) cursor = 0;
    else {
      const next = step(cursor, ...moves[key]);
      if (next >= 0) cursor = next;
    }
    if (key === "ArrowRight" || key === "ArrowLeft") across = true;
    if (key === "ArrowDown" || key === "ArrowUp") across = false;
    paint();
    return;
  }
  if (key === "Enter") {
    if (e.target.closest && e.target.closest("button, .lg-tile")) return;
    e.preventDefault();
    allDone();
    return;
  }
  if (key === "Escape") { setSelected(-1); cursor = -1; paint(); return; }
  if (key === "Backspace" || key === "Delete") {
    if (cursor < 0) return;
    e.preventDefault();
    let cell = cursor;
    if (tileOn(cell) < 0 && key === "Backspace") {
      const back = across ? step(cell, 0, -1) : step(cell, -1, 0);
      if (back < 0) return;
      cell = back;
      cursor = back;
    }
    const t = tileOn(cell);
    if (t >= 0) toRack(t);
    else paint();
    return;
  }
  if (/^[a-z]$/i.test(key)) {
    const ch = key.toLowerCase();
    if (cursor < 0) cursor = 0;
    const current = tileOn(cursor);
    const t = rackTiles().find((k) => rack[k] === ch) ?? (current >= 0 && rack[current] === ch ? current : -1);
    if (t < 0) { toast(`No ${ch.toUpperCase()} in the rack`); return; }
    e.preventDefault();
    if (t !== current) placeTile(t, cursor);
    const next = across ? step(cursor, 0, 1) : step(cursor, 1, 0);
    if (next >= 0) cursor = next;
    paint();
  }
});

onSettingsChange(applySettings);

// ---------------------------------------------------------------- modals

function swatch(label, b) {
  return el("span.lg-cell.example", { dataset: { bonus: b } }, el("span.lg-bonus", label));
}

function exampleTile(ch, extra = "") {
  return el(`span.lg-tile.example${extra}`, el("span.lg-letter", ch), el("span.lg-pts", String(POINTS[ch.toLowerCase()])));
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Clear the rack onto the board.",
    className: "lg-help",
    content: [
      el("p", "Use all 12 tiles in your rack to build valid words on the board, with every word connected, while scoring as many points as you can."),
      el("ul.help-list",
        el("li", "Words read left to right and top to bottom. Every line of two or more touching tiles must be a word."),
        el("li", "Each letter is worth the points in its corner. A word scores the sum of its letters, and a letter in two words counts for both."),
        el("li", "Tap a rack tile, then a square. Or drag it. Tap a tile on the board to send it back to the rack."),
        el("li", "On a keyboard, click a square (click again to switch across or down), type letters, and use Backspace and the arrow keys."),
        el("li", "When the board is complete, tap All done. Your first finish counts for stats and streaks. You can keep improving your best score afterward."),
        el("li", "Stuck? The 💡 button shows a word from our top board as faint letters on its squares, best word first. Hints can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "Bonus squares")),
        el("div.example.lg-help-row", swatch("DL", "DL"), el("p", "Doubles the points for one letter.")),
        el("div.example.lg-help-row", swatch("TL", "TL"), el("p", "Triples the points for one letter.")),
        el("div.example.lg-help-row", swatch("DW", "DW"), el("p", "Doubles the score of every word through it.")),
        el("div.example.lg-help-row", swatch("TW", "TW"), el("p", "Triples the score of every word through it.")),
        el("div.example.lg-help-row", el("div.lg-help-tiles", exampleTile("U", ".is-bad"), exampleTile("C", ".is-bad")),
          el("p", "A red ring marks a tile in a word that isn't valid, or one that isn't connected."))),
      el("p", "Stars compare your score with our top board for the day: 50% of it for two stars, up to 90% for five. Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function miniBoard(grid) {
  return el("div.lg-mini", grid.map((ch, i) => {
    const data = {};
    if (bonus[i]) data.bonus = bonus[i];
    if (ch) data.filled = "1";
    return el("div.lg-mini-cell", { dataset: data }, ch ? ch.toUpperCase() : "");
  }));
}

function resultCard() {
  const yours = scoreBoard(state.bestGrid, bonus, isWord);
  const top = scoreBoard(built.best, bonus, isWord);
  const words = (r) => el("div.lg-words", r.words.map((w) => el("div.lg-word", el("span", w.word.toUpperCase()), el("span", String(w.points)))));
  const beat = state.best > target;
  return el("div.lg-results",
    el("div.lg-result-col",
      el("div.lg-col-title", `Your best · ${state.best}`),
      miniBoard(state.bestGrid), words(yours)),
    el("div.lg-result-col",
      el("div.lg-col-title", `${beat ? "Our board" : "Top board"} · ${target}`),
      miniBoard(built.best), words(top)),
    beat ? el("p.lg-beat", "You beat our top board!") : null,
  );
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status === "won";
  const earned = done ? starsFor(state.best, target) : null;
  const dist = [];
  for (let i = 5; i >= 1; i--) {
    dist.push({ label: String(i), count: stats.dist[String(i)] || 0, highlight: earned === i });
  }
  const bestWords = done ? scoreBoard(state.bestGrid, bonus, isWord).words.length : 0;
  const text = done ? shareText({ puzzle, score: state.best, stars: earned, words: bestWords, hints: state.hints }) : null;
  const close = showStats({
    title: done ? STAR_WORDS[earned] : undefined,
    top: done ? resultCard() : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Five Stars", value: String(stats.dist["5"] || 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Star Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next Lettergrams" : null,
    shareText: text,
    extra: done ? el("div",
      el("p.lg-share", `${"⭐".repeat(earned)}${"☆".repeat(5 - earned)}  ${earned}/5`),
      el("div.lg-again",
        el("button.btn.secondary", { type: "button", onclick: () => close() }, "Keep improving")),
    ) : null,
  });
}

// ---------------------------------------------------------------- start

fit();
paint();

const finished = state.status === "won";
const onBoard = state.pos.filter((p) => p >= 0).length;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : onBoard ? "Continue" : "Play",
  tagline: finished ? `Your best is ${state.best}. Check your result, or keep improving.`
    : onBoard ? `${RACK - onBoard} tile${RACK - onBoard === 1 ? "" : "s"} left in the rack.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
fit();
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:lettergrams")) { set("seen:lettergrams", true); showHelp(); }
