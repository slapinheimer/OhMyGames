// Oh My PATTERNS! — Motif: clear a board of layered tiles by matching shared layers.
// Pick a tile, then one that shares a layer with it. Keep the chain going as long as you can.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import { CHAIN_BANDS, COLS, boardFor, chainBand, clearPair, hint, isEmpty, layersLeft, shareText } from "./motif/logic.js";
import { textureDefs, tileLabel, tileSVG } from "./motif/art.js";

const GAME = "motif";
const puzzle = currentPuzzle();
defineSettings(GAME, [HINTS_SETTING]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// tiles[i] = [field, frame, emblem, trim] (null = cleared). sel: the picked tile or null.
// combo: matches in the current chain. best: longest chain. misses: picks that matched nothing.
const fresh = () => ({ tiles: boardFor(puzzle), sel: null, combo: 0, best: 0, misses: 0, matches: 0, hints: 0, status: "playing" });
const saved = loadState(GAME, puzzle.id);
let state = saved && Array.isArray(saved.tiles) && saved.tiles.length === boardFor(puzzle).length ? saved : fresh();
const save = () => saveState(GAME, puzzle.id, state);
let started = false;

// ---------------------------------------------------------------- layout

const comboEl = el("div.mf-stat", el("span.mf-num", "0"), el("span.mf-label", "Chain"));
const bestEl = el("div.mf-stat", el("span.mf-num", "0"), el("span.mf-label", "Longest"));
const leftEl = el("div.mf-stat", el("span.mf-num", "0"), el("span.mf-label", "Layers left"));
const board = el("div.mf-board", { role: "grid", "aria-label": "Motif board", style: { "--cols": String(COLS) } });
const tiles = state.tiles.map((_, i) => el("button.mf-tile", { type: "button", role: "gridcell", onclick: () => tap(i) }));
board.append(...tiles);
const tip = el("p.mf-tip");
main.append(el("div.mf-defs", { html: textureDefs() }), el("div.mf-wrap", el("div.mf-stats", comboEl, bestEl, leftEl), board, tip));

// ---------------------------------------------------------------- play

const flash = (i, cls) => {
  const node = tiles[i];
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
};

function tap(i) {
  if (!started || state.status !== "playing" || isEmpty(state.tiles[i])) return;
  board.querySelectorAll(".is-hint").forEach((n) => n.classList.remove("is-hint"));
  const sel = state.sel;
  if (sel == null) {
    state.sel = i;
  } else if (sel === i) {
    // Putting a tile down ends the chain.
    if (state.combo) toast(`Chain of ${state.combo}`);
    state.sel = null;
    state.combo = 0;
  } else {
    const { tiles: next, slots } = clearPair(state.tiles, sel, i);
    if (!slots.length) {
      state.misses++;
      if (state.combo) toast(`No match. Chain of ${state.combo} ends`);
      state.combo = 0;
      state.sel = i;
      flash(i, "is-miss");
    } else {
      state.tiles = next;
      state.matches++;
      state.combo++;
      state.best = Math.max(state.best, state.combo);
      flash(sel, "is-pop");
      flash(i, "is-pop");
      if (isEmpty(next[i])) {
        // Nothing left on the tile to match from: the chain ends here.
        if (state.combo > 1) toast(`Chain of ${state.combo}!`);
        state.sel = null;
        state.combo = 0;
      } else state.sel = i;
    }
  }
  if (!layersLeft(state.tiles)) return finish();
  save();
  paint();
}

function finish() {
  state.status = "won";
  state.sel = null;
  state.combo = 0;
  recordResult(GAME, puzzle, { won: true, bucket: chainBand(state.best), extra: { bestChain: Math.max(getStats(GAME).bestChain || 0, state.best) } });
  save();
  paint();
  toast("Board cleared!", 2000);
  setTimeout(() => { if (!isModalOpen()) openStats(); }, 1400);
}

function useHint() {
  if (!started) return;
  if (state.status !== "playing") { toast("Board already cleared"); return; }
  const h = hint(state.tiles, state.sel);
  if (!h) return;
  state.hints++;
  save();
  board.querySelectorAll(".is-hint").forEach((n) => n.classList.remove("is-hint"));
  if (state.sel == null) {
    tiles[h.start].classList.add("is-hint");
    toast("Start with this tile");
  } else {
    tiles[h.next].classList.add("is-hint");
    toast("This one keeps the chain going");
  }
}

// ---------------------------------------------------------------- paint

function paint() {
  const done = state.status !== "playing";
  state.tiles.forEach((layers, i) => {
    const node = tiles[i];
    const gone = isEmpty(layers);
    const svg = tileSVG(layers);
    if (node.dataset.svg !== svg) {
      node.innerHTML = svg;
      node.dataset.svg = svg;
    }
    node.classList.toggle("is-gone", gone);
    node.classList.toggle("is-sel", state.sel === i);
    node.disabled = gone || done;
    node.setAttribute("aria-label", `${tileLabel(layers)}${state.sel === i ? ", picked" : ""}`);
    node.setAttribute("aria-pressed", state.sel === i ? "true" : "false");
  });
  comboEl.querySelector(".mf-num").textContent = String(state.combo);
  comboEl.classList.toggle("is-hot", state.combo >= 5);
  bestEl.querySelector(".mf-num").textContent = String(state.best);
  leftEl.querySelector(".mf-num").textContent = String(layersLeft(state.tiles));
  board.classList.toggle("is-done", done);
  tip.textContent = done
    ? `Cleared! Longest chain ${state.best}, ${state.misses ? `${state.misses} ${state.misses === 1 ? "miss" : "misses"}` : "no misses"}. Tap 🔀 for another board.`
    : state.sel == null
      ? "Pick a tile, then another with a matching layer."
      : "Now pick a tile that shares a layer with this one.";
}

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape" && state.sel != null && state.status === "playing") {
    e.preventDefault();
    tap(state.sel);
  }
});

// ---------------------------------------------------------------- stats & help

function openStats() {
  const stats = getStats(GAME);
  const done = state.status === "won";
  showStats({
    title: done ? "Board cleared!" : "Statistics",
    message: done ? `Longest chain ${state.best}` : null,
    tiles: [
      { label: "Cleared", value: stats.won },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Max Streak", value: stats.maxStreak },
      { label: "Best Chain", value: stats.bestChain || 0 },
    ],
    distribution: {
      title: "Longest Chain",
      rows: CHAIN_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: done && chainBand(state.best) === b })),
    },
    shareText: done ? shareText({ puzzle, best: state.best, misses: state.misses, hints: state.hints }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  const a = [1, 1, 2, null];
  const b = [3, 1, 2, 4];
  const after = [[1, null, null, null], [3, null, null, 4]];
  const ex = (layers) => el("div.mf-tile.mf-ex", { html: tileSVG(layers) });
  showModal({
    title: "How To Play",
    className: "mf-help",
    content: [
      el("p.subtitle", "Clear the board by matching layers."),
      el("ul",
        el("li", "Every tile is a stack of up to four layers: a field, a frame, an emblem in the middle, and trim around the edge."),
        el("li", "Pick a tile, then another. Any layer they both have in the same place, in the same style, disappears from both."),
        el("li", "Keep going: the second tile stays picked, so your next pick only has to match it. Each match adds to your chain."),
        el("li", "A chain ends when you pick a tile with nothing in common (a miss), when the picked tile runs out of layers, or when you tap it again to put it down."),
        el("li", "Clear every layer to finish. Your score is your longest chain.")),
      el("h3", "Example"),
      el("div.mf-ex-row", ex(a), el("span", "+"), ex(b), el("span", "→"), ex(after[0]), ex(after[1])),
      el("p", "Both tiles have the blue circle frame and the gold star, so those vanish. Their fields don't match, so they stay. The second tile is still picked, with its field and trim left to match."),
      el("p", "Every layer comes in pairs, so the board can always be cleared. Plan the order to keep long chains going."),
      el("p", "Pick other days from 📅, or tap 🔀 for a practice board. Stuck? Tap 💡 for a good next tile. Turn hints off in Settings."),
    ],
  });
}

// ---------------------------------------------------------------- start

paint();
await splash({
  gameId: GAME,
  puzzle,
  playLabel: state.status === "won" ? "See results" : state.matches || state.misses ? "Continue" : "Play",
});
started = true;
if (state.status === "won") openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
