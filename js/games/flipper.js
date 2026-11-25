// Oh My PATTERNS! — Flipper: turn two cards and remember the picture.
// A match stays up. A miss stays up for 4 seconds, then both turn down.
// Each grid and difficulty keeps its own daily deck, progress and stats.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, formatTime } from "../core/ui.js";
import {
  DEFAULT_GRID, DEFAULT_LEVEL, GRIDS, HOLD_MS, LEVELS, TIME_BANDS, boardKey, faceMarkup,
  freshPlay, gridById, levelById, openCard, pairsLeft, patternById, puzzleFor, settle, shareText,
  statsId, takeHint, timeBand,
} from "./flipper/logic.js";

const GAME = "flipper";
const GRID_KEY = "flipper:grid";
const LEVEL_KEY = "flipper:level";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  HINTS_SETTING,
  { key: "timer", label: "Show timer", type: "toggle", default: true, desc: "The clock still runs when hidden." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && saved.boards ? saved : { v: 1, gridId: null, level: null, boards: {}, status: "playing" };
const validGrid = (id) => GRIDS.some((g) => g.id === id);
const validLevel = (id) => LEVELS.some((l) => l.id === id);
let gridId = validGrid(state.gridId) ? state.gridId : validGrid(get(GRID_KEY)) ? get(GRID_KEY) : DEFAULT_GRID;
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
const save = () => saveState(GAME, puzzle.id, state);
let started = false;
let cursor = 0;
let holdTimer = 0;
let g, spec, cards;

const clock = el("div.fp-clock");
const movesLine = el("div.fp-moves");
const gridBtns = GRIDS.map((g) => el("button.fp-size", {
  type: "button", role: "tab", onclick: () => pickGrid(g.id),
}, g.label, el("span.fp-size-mark", { "aria-hidden": "true" })));
const levelBtns = LEVELS.map((l) => el("button.fp-level", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.fp-size-mark", { "aria-hidden": "true" })));
const board = el("div.fp-grid", { role: "grid", "aria-label": "Flipper cards" });
const tip = el("p.fp-tip", { "aria-live": "polite" });

main.append(el("div.fp-wrap",
  el("div.fp-top",
    el("div.fp-sizes", { role: "tablist", "aria-label": "Grid" }, gridBtns),
    el("div.fp-readout", clock, movesLine)),
  el("div.fp-sizes.fp-levels", { role: "tablist", "aria-label": "Difficulty" }, levelBtns),
  board,
  tip));

function keyOf(id = gridId, lvl = level) { return boardKey(id, lvl); }

function syncStatus() {
  const won = GRIDS.some((grid) => LEVELS.some((l) => state.boards[keyOf(grid.id, l.id)]?.status === "won"));
  state.status = won ? "won" : "playing";
}

function build() {
  clearTimeout(holdTimer);
  spec = puzzleFor(puzzle, gridId, level);
  const key = keyOf();
  const prev = state.boards[key];
  const deckKey = spec.deck.join("|");
  if (!prev || prev.deckKey !== deckKey || !Array.isArray(prev.matched) || prev.matched.length !== spec.deck.length) {
    state.boards[key] = freshPlay(spec.deck);
  }
  g = state.boards[key];
  g.deck = spec.deck;
  g.face = Array.isArray(g.face) ? g.face : [];
  g.pinned = Array.isArray(g.pinned) ? g.pinned : [];
  g.hints = g.hints || 0;
  g.moves = g.moves || 0;
  g.time = g.time || 0;
  g.holdUntil = g.holdUntil || 0;
  if (g.status !== "won" && g.status !== "playing") g.status = "playing";
  const settled = settle(g, Date.now());
  if (settled !== g) g = state.boards[key] = settled;
  state.gridId = gridId;
  state.level = level;
  syncStatus();
  cursor = Math.min(cursor, spec.deck.length - 1);
  cards = spec.deck.map((id, i) => {
    const face = el("span.fp-face");
    face.innerHTML = faceMarkup(id);
    const card = el("button.fp-card", {
      type: "button", role: "gridcell", "data-i": String(i), "data-pattern": id,
    }, el("span.fp-inner", el("span.fp-back", { "aria-hidden": "true" }), face));
    return card;
  });
  board.replaceChildren(...cards);
  board.style.setProperty("--cols", String(spec.cols));
  board.dataset.grid = spec.gridId;
  board.dataset.level = spec.level;
  save();
  paint();
  armHold();
}

function pickGrid(id) {
  if (id === gridId) return;
  gridId = id;
  cursor = 0;
  set(GRID_KEY, id);
  build();
}

function pickLevel(id) {
  if (id === level) return;
  level = id;
  cursor = 0;
  set(LEVEL_KEY, id);
  build();
}

function commit(next) {
  const wasWon = g.status === "won";
  g = next;
  state.boards[keyOf()] = g;
  if (!wasWon && g.status === "won") {
    syncStatus();
    recordResult(statsId(gridId, level), puzzle, { won: true, bucket: timeBand(g.time), time: g.time });
    save();
    paint();
    armHold();
    toast(g.hints ? "All pairs found!" : "All pairs found, no hints!", 2000);
    const doneKey = keyOf();
    setTimeout(() => { if (!isModalOpen() && keyOf() === doneKey) openStats(); }, 1400);
    return;
  }
  syncStatus();
  save();
  paint();
  armHold();
}

function flipAt(i) {
  if (!started || g.status !== "playing") return;
  const now = Date.now();
  const next = openCard(g, i, now);
  if (next === g) {
    if (g.holdUntil && now < g.holdUntil) toast("These stay up for a moment");
    return;
  }
  commit(next);
}

board.addEventListener("click", (e) => {
  const card = e.target.closest && e.target.closest(".fp-card");
  if (!card || !board.contains(card)) return;
  cursor = Number(card.dataset.i);
  flipAt(cursor);
});

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("Already finished"); return; }
  const { play, action } = takeHint(g, Date.now());
  if (action === "wait") { toast("These stay up for a moment"); return; }
  if (action === "done" || play === g) return;
  const verb = action === "pair" ? "That's the match" : "Remember this one";
  toast(verb);
  const node = cards[(play.face[play.face.length - 1] ?? play.pinned[play.pinned.length - 1])];
  commit(play);
  if (node) {
    node.classList.remove("is-flash");
    void node.offsetWidth;
    node.classList.add("is-flash");
  }
}

function armHold() {
  clearTimeout(holdTimer);
  if (!g.holdUntil || g.status !== "playing") return;
  const wait = Math.max(0, g.holdUntil - Date.now());
  holdTimer = setTimeout(() => {
    if (!g.holdUntil) return;
    const next = settle(g, Math.max(Date.now(), g.holdUntil));
    if (next !== g) commit(next);
  }, wait);
}

setInterval(() => {
  if (!started || !g || g.status !== "playing" || document.hidden || isModalOpen()) return;
  g.time++;
  if (g.time % 5 === 0) save();
  paintClock();
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && g) {
    const next = settle(g, Date.now());
    if (next !== g) commit(next);
    else armHold();
  } else save();
});

function paintClock() {
  clock.textContent = formatTime(g.time);
  clock.hidden = getSetting(GAME, "timer") === false;
  const n = g.moves;
  movesLine.textContent = `${n} ${n === 1 ? "move" : "moves"}`;
}

function paintTip() {
  const done = g.status === "won";
  const left = pairsLeft(g);
  const holding = g.holdUntil && Date.now() < g.holdUntil;
  if (done) {
    const harder = LEVELS.slice(LEVELS.findIndex((l) => l.id === level) + 1).find((l) => state.boards[keyOf(gridId, l.id)]?.status !== "won");
    tip.textContent = `Cleared in ${formatTime(g.time)}, ${g.moves} moves${g.hints ? `, ${g.hints} ${g.hints === 1 ? "hint" : "hints"}` : ""}.${harder ? ` Try ${harder.name}.` : ""}`;
  } else if (holding) {
    tip.textContent = "Those don't match. They turn back in a moment.";
  } else {
    const up = g.face.length;
    tip.textContent = up === 1
      ? `Find the match. ${left} ${left === 1 ? "pair" : "pairs"} left.`
      : `Turn two cards. ${left} ${left === 1 ? "pair" : "pairs"} left.`;
  }
}

function paint() {
  const done = g.status === "won";
  const now = Date.now();
  const holding = g.holdUntil && now < g.holdUntil;
  board.classList.toggle("is-hold", !!holding);
  board.classList.toggle("is-solved", done);
  cards.forEach((node, i) => {
    const up = g.matched[i] || g.face.includes(i);
    const col = (i % spec.cols) + 1;
    const row = Math.floor(i / spec.cols) + 1;
    node.classList.toggle("is-up", up);
    node.classList.toggle("is-matched", g.matched[i]);
    node.classList.toggle("is-hint", g.pinned.includes(i));
    node.classList.toggle("is-cursor", i === cursor && !done);
    node.disabled = done;
    const pat = patternById(spec.deck[i]);
    const how = g.matched[i] ? `${pat.name}, matched` : up ? pat.name : "face down";
    node.setAttribute("aria-label", `Row ${row}, column ${col}, ${how}`);
  });
  const mark = (btn, entry, on, label) => {
    const st = entry && entry.status === "won" ? "done" : entry && (entry.moves || entry.face.length || entry.matched.some(Boolean)) ? "started" : "";
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.querySelector(".fp-size-mark").textContent = st === "done" ? "✓" : st === "started" ? "•" : "";
    btn.setAttribute("aria-label", `${label}${st === "done" ? ", cleared" : st === "started" ? ", in progress" : ""}`);
  };
  gridBtns.forEach((b, k) => mark(b, state.boards[keyOf(GRIDS[k].id, level)], GRIDS[k].id === gridId, GRIDS[k].label));
  levelBtns.forEach((b, k) => mark(b, state.boards[keyOf(gridId, LEVELS[k].id)], LEVELS[k].id === level, LEVELS[k].name));
  paintClock();
  paintTip();
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

document.addEventListener("keydown", (e) => {
  if (!started || !spec || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  const onControl = e.target.closest && e.target.closest("button, a") && !e.target.closest(".fp-card");
  const col = cursor % spec.cols;
  const row = Math.floor(cursor / spec.cols);
  if (e.key === "ArrowLeft" && col > 0) { e.preventDefault(); cursor--; paint(); return; }
  if (e.key === "ArrowRight" && col < spec.cols - 1) { e.preventDefault(); cursor++; paint(); return; }
  if (e.key === "ArrowUp" && row > 0) { e.preventDefault(); cursor -= spec.cols; paint(); return; }
  if (e.key === "ArrowDown" && row < spec.rows - 1) { e.preventDefault(); cursor += spec.cols; paint(); return; }
  if (onControl || g.status !== "playing") return;
  if (e.key === " " || e.key === "Enter") {
    if (e.target.closest && e.target.closest(".fp-card")) return;
    e.preventDefault();
    flipAt(cursor);
  }
});

function openStats() {
  const stats = getStats(statsId(gridId, level));
  const done = g.status === "won";
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const best = stats.times.length ? Math.min(...stats.times) : null;
  const name = `${spec.cols}×${spec.rows} ${levelById(level).name}`;
  showStats({
    title: done ? "Cleared!" : `${name} Statistics`,
    message: done ? `${name} in ${formatTime(g.time)}, ${g.moves} moves` : "Each grid and difficulty keeps its own stats.",
    tiles: [
      { label: "Cleared", value: stats.won },
      { label: "Win %", value: winPct },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Best Time", value: best == null ? "–" : formatTime(best) },
    ],
    distribution: {
      title: `${name} Solve Time`,
      rows: TIME_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && timeBand(g.time) === b })),
    },
    shareText: done ? shareText({
      puzzle, cols: spec.cols, rows: spec.rows, level, moves: g.moves, time: g.time, hints: g.hints, formatTime,
    }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  const down = el("button.fp-card", { type: "button", tabindex: "-1" }, el("span.fp-inner", el("span.fp-back")));
  const up = el("button.fp-card.is-up", { type: "button", tabindex: "-1" }, el("span.fp-inner",
    el("span.fp-back"),
    el("span.fp-face")));
  up.querySelector(".fp-face").innerHTML = faceMarkup("e-sun");
  showModal({
    title: "How To Play",
    className: "fp-help",
    content: [
      el("p.subtitle", "Turn cards and find the two that show the same picture."),
      el("div.fp-ex", { "aria-hidden": "true" }, down, up),
      el("ul",
        el("li", "Tap a card to flip it. Flip a second card to try a pair."),
        el("li", "A match stays face up."),
        el("li", `Anything else stays open for ${HOLD_MS / 1000} seconds, then both cards turn down. You can't flip another card while those two are still up.`),
        el("li", "The pictures are the game. On Hard, lookalikes differ in only one small place.")),
      el("h3", "Grids and difficulty"),
      el("p", "Pick 4×4 (8 pairs), 4×6 (12 pairs) or 6×6 (18 pairs). Easy pictures are all different. Medium repeats a shape in red, blue and green. Hard uses one design with a small change, such as which dot is hollow. Every grid and difficulty has its own daily deck, timer and stats. ✓ marks one you've cleared today. Flipper remembers what you played last."),
      el("p", "Pick other days from 📅, or tap 🔀 for a practice deck."),
      el("h3", "Keyboard"),
      el("p", "Arrow keys move the cursor. Space or Enter flips that card."),
      el("p", "Stuck? Tap 💡. If a card is already up, the hint turns its match. Otherwise it leaves one card up. Turn hints off in Settings. You can also hide the timer there. The clock still runs."),
    ],
  });
}

build();

const doneBoards = [];
for (const grid of GRIDS) {
  for (const l of LEVELS) {
    const b = state.boards[keyOf(grid.id, l.id)];
    if (b && b.status === "won") doneBoards.push(`${grid.label} ${l.name}`);
  }
}
await splash({
  gameId: GAME,
  puzzle,
  playLabel: g.status === "won" ? "See results" : (g.moves || g.matched.some(Boolean)) ? "Continue" : "Play",
  tagline: doneBoards.length ? `Cleared today: ${doneBoards.slice(0, 3).join(", ")}` : "Match the pictures. A miss stays up for 4 seconds.",
});
started = true;
armHold();
if (g.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
