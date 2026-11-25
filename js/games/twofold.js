// Oh My NUMBERS! — Twofold: slide the board, merge matching tiles, reach 2048.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton, iconButton } from "../core/ui.js";
import {
  ARROWS, N, SIZE, TARGET, TILE_BANDS,
  bestMove, canMove, shareText, slide, spawn, spawnRng, startBoard, tileBand, topTile,
} from "./twofold/logic.js";

const GAME = "twofold";
const puzzle = currentPuzzle();
defineSettings(GAME, [HINTS_SETTING]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// status: "playing" until 2048 ("won") or no moves ("lost"). After a win the player may
// keep going; `over` marks the end of that run.
function freshState() {
  return { v: 1, board: startBoard(GAME, puzzle.id), score: 0, moves: 0, status: "playing", keepGoing: false, over: false, hints: 0 };
}

const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && Array.isArray(saved.board) && saved.board.length === N ? saved : freshState();
const save = () => saveState(GAME, puzzle.id, state);
save();

const BEST_KEY = `best:${GAME}`;
let best = Math.max(get(BEST_KEY, 0), state.score);
let hint = null; // direction shown by the last hint, until the next move
let started = false;

// ---------------------------------------------------------------- layout

const scoreEl = el("div.tf-value");
const bestEl = el("div.tf-value");
const gainEl = el("div.tf-gain", { "aria-hidden": "true" });
const tiles = el("div.tf-tiles");
const overlay = el("div.tf-overlay", { hidden: true });
const board = el("div.tf-board", { role: "application", "aria-label": "Twofold board. Swipe or use the arrow keys." },
  el("div.tf-cells", { "aria-hidden": "true" }, Array.from({ length: N }, () => el("div.tf-cell"))),
  tiles,
  overlay);
const tip = el("p.tf-tip");
const live = el("div.visually-hidden", { "aria-live": "polite" });

main.append(el("div.tf-wrap",
  el("div.tf-top",
    el("div.tf-goal", el("strong", "Goal: 2048"), el("span", puzzle.isDaily ? "Same tiles for everyone today" : "Practice game")),
    el("div.tf-box", el("div.tf-label", "Score"), scoreEl, gainEl),
    el("div.tf-box", el("div.tf-label", "Best"), bestEl)),
  board,
  tip,
  live));

// ---------------------------------------------------------------- tiles

let nextId = 1;
let model = []; // [{ id, v, cell, node }] for the tiles on the board

function tileNode(t, cls) {
  const digits = String(t.v).length;
  const node = el(`div.tf-tile${cls ? `.${cls}` : ""}`, { dataset: { v: t.v > 2048 ? "big" : String(t.v) } },
    el(`div.tf-face.d${Math.min(digits, 5)}`, String(t.v)));
  place(node, t.cell);
  return node;
}

function place(node, cell) {
  node.style.setProperty("--r", String(Math.floor(cell / SIZE)));
  node.style.setProperty("--c", String(cell % SIZE));
}

function rebuild() {
  model = [];
  tiles.replaceChildren();
  state.board.forEach((v, cell) => {
    if (!v) return;
    const t = { id: nextId++, v, cell };
    t.node = tileNode(t);
    model.push(t);
    tiles.append(t.node);
  });
}

/** Move the tiles to match a slide, merging pairs and popping in the new tile. */
function animate(res, spawned) {
  const byCell = new Map(model.map((t) => [t.cell, t]));
  const merged = new Set(res.merged);
  const kept = [];
  for (const m of res.moves) {
    const t = byCell.get(m.from);
    t.cell = m.to;
    place(t.node, m.to);
    if (merged.has(m.to)) {
      // Both halves slide in, then give way to the merged tile.
      const node = t.node;
      setTimeout(() => node.remove(), 110);
    } else {
      kept.push(t);
    }
  }
  for (const cell of res.merged) {
    const t = { id: nextId++, v: res.board[cell], cell };
    t.node = tileNode(t, "is-merged");
    kept.push(t);
    tiles.append(t.node);
  }
  if (spawned) {
    const t = { id: nextId++, v: spawned.value, cell: spawned.cell };
    t.node = tileNode(t, "is-new");
    kept.push(t);
    tiles.append(t.node);
  }
  model = kept;
}

// ---------------------------------------------------------------- play

const playable = () => state.status === "playing" || (state.status === "won" && state.keepGoing && !state.over);

function move(dir) {
  if (!started || !playable()) return;
  const res = slide(state.board, dir);
  if (!res.moved) {
    board.classList.remove("is-stuck");
    void board.offsetWidth;
    board.classList.add("is-stuck");
    return;
  }
  state.moves++;
  const dropped = spawn(res.board, spawnRng(GAME, puzzle.id, state.moves));
  state.board = dropped ? dropped.board : res.board;
  state.score += res.gained;
  hint = null;
  animate(res, dropped);
  if (res.gained) showGain(res.gained);
  if (state.score > best) {
    best = state.score;
    set(BEST_KEY, best);
  }

  const top = topTile(state.board);
  const stuck = !canMove(state.board);
  if (state.status === "playing" && top >= TARGET) {
    state.status = "won";
    recordResult(GAME, puzzle, { won: true, bucket: tileBand(top) });
    if (stuck) state.over = true;
    setTimeout(() => showOverlay(), 260);
  } else if (stuck) {
    if (state.status === "playing") {
      state.status = "lost";
      recordResult(GAME, puzzle, { won: false, bucket: tileBand(top) });
    } else {
      state.over = true;
    }
    setTimeout(() => showOverlay(), 260);
  }
  save();
  paint();
}

function showGain(n) {
  gainEl.textContent = `+${n}`;
  gainEl.classList.remove("is-on");
  void gainEl.offsetWidth;
  gainEl.classList.add("is-on");
}

function useHint() {
  if (!started) return;
  if (!playable()) { toast("The game is over"); return; }
  const dir = bestMove(state.board);
  if (!dir) return;
  if (hint !== dir) state.hints++;
  hint = dir;
  save();
  paint();
  toast(`Try sliding ${dir} ${ARROWS[dir]}`);
}

function keepGoing() {
  state.keepGoing = true;
  save();
  overlay.hidden = true;
  paint();
}

/** Close the card to look at the board. Closing the 2048 card means keep going. */
function closeOverlay() {
  if (overlay.hidden) return;
  if (state.status === "won" && !state.over) return keepGoing();
  state.closed = true;
  save();
  overlay.hidden = true;
  paint();
}
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });

/** Win or game-over card on the board. Results live in the stats modal. */
function showOverlay() {
  const won = state.status === "won";
  if (won && state.keepGoing && !state.over) { overlay.hidden = true; return; }
  const title = won ? (state.over ? "No more moves" : "You made 2048!") : "No more moves";
  const sub = won && !state.over ? "Keep going for a higher score?" : `Score ${state.score.toLocaleString()}`;
  overlay.replaceChildren(el("div.tf-card",
    el("div.tf-card-close", iconButton("close", won && !state.over ? "Close and keep going" : "Close", closeOverlay)),
    el("h2", title),
    el("p", sub),
    el("div.tf-actions",
      won && !state.over ? el("button.btn", { type: "button", onclick: keepGoing }, "Keep going") : null,
      el("button.btn.secondary", { type: "button", onclick: () => openStats() }, "See results"))));
  overlay.hidden = false;
}

// ---------------------------------------------------------------- paint

function paint() {
  scoreEl.textContent = state.score.toLocaleString();
  bestEl.textContent = best.toLocaleString();
  const done = !playable();
  if (hint) tip.replaceChildren("Hint: slide ", el("strong.tf-arrow", `${hint} ${ARROWS[hint]}`));
  else if (done) {
    tip.replaceChildren(
      state.status === "won" ? `You reached ${topTile(state.board).toLocaleString()}. ` : "No more moves. ",
      el("button.tf-link", { type: "button", onclick: () => openStats() }, "See results"));
  }
  else tip.textContent = state.moves ? `Top tile ${topTile(state.board).toLocaleString()}` : "Swipe, or use the arrow keys, to slide every tile.";
  board.dataset.hint = hint || "";
  live.textContent = `Score ${state.score}. Top tile ${topTile(state.board)}.`;
}

// ---------------------------------------------------------------- input

const KEYS = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down",
};

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector(".splash") || document.querySelector(".drawer.open")) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape" && !overlay.hidden) {
    e.preventDefault();
    closeOverlay();
    return;
  }
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  move(dir);
});

let swipe = null;
board.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".tf-card")) return;
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  if (board.setPointerCapture) board.setPointerCapture(e.pointerId);
});
board.addEventListener("pointerup", (e) => {
  if (!swipe || swipe.id !== e.pointerId) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
board.addEventListener("pointercancel", () => { swipe = null; });

// ---------------------------------------------------------------- stats & help

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const top = topTile(state.board);
  showStats({
    title: done ? (state.status === "won" ? "You made 2048!" : "Game over") : "Statistics",
    message: done ? `Score ${state.score.toLocaleString()} · Top tile ${top.toLocaleString()}` : null,
    tiles: [
      { label: "Played", value: stats.played },
      { label: "Win %", value: winPct },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Best Score", value: best.toLocaleString() },
    ],
    distribution: {
      title: "Top Tile",
      rows: TILE_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && tileBand(top) === b })),
    },
    shareText: done ? shareText({ puzzle, score: state.score, top, hints: state.hints, board: state.board }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function exampleRow(before, after, label) {
  const row = (vals) => el("div.tf-ex-row", vals.map((v) => el("div.tf-ex-cell", v
    ? el("div.tf-tile.tf-ex-tile", { dataset: { v: String(v) } }, el("div.tf-face", String(v)))
    : null)));
  return el("div.tf-ex", row(before), el("span.tf-ex-arrow", label), row(after));
}

function showHelp() {
  showModal({
    title: "How To Play",
    className: "tf-help",
    content: [
      el("p.subtitle", "Merge matching tiles to make 2048."),
      el("ul",
        el("li", "Swipe, or press the arrow keys (or W A S D), to slide every tile as far as it goes."),
        el("li", "Two tiles with the same number merge into one with their sum. Each merge adds to your score."),
        el("li", "After every move a new 2 or 4 appears."),
        el("li", "Make a 2048 tile to win, then keep going for a higher score. The game ends when nothing can move.")),
      el("h3", "Example"),
      exampleRow([2, 2, 4, 0], [4, 4, 0, 0], "←"),
      exampleRow([4, 4, 4, 4], [8, 8, 0, 0], "←"),
      el("p", "A tile merges once per move, so 2 2 4 becomes 4 4, not 8."),
      el("h3", "Daily puzzle"),
      el("p", "Everyone gets the same tiles today. Make the same moves and you'll see the same board. Pick other days from 📅, or tap 🔀 for a practice game."),
      el("p", "Stuck? Tap 💡 to see a suggested move. Turn hints off in Settings."),
    ],
  });
}

// ---------------------------------------------------------------- start

rebuild();
paint();

const finished = state.status !== "playing";
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.moves ? "Continue" : "Play",
  tagline: state.moves ? `Score ${state.score.toLocaleString()} · Top tile ${topTile(state.board).toLocaleString()}` : undefined,
});
started = true;
if (finished) {
  if (!state.closed) showOverlay();
  if (!playable()) openStats();
} else if (!get(`seen:${GAME}`)) {
  set(`seen:${GAME}`, true);
  showHelp();
}
