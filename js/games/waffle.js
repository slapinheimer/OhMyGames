// Waffle — swap letters into six words. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, ICONS } from "../core/ui.js";
import { loadWordleAnswers } from "../core/words.js";
import {
  CELLS, SWAPS, STAR_WORDS,
  colors, hintSwap, puzzleFor, readWords, starsFor, shareText,
} from "./waffle/logic.js";

const GAME = "waffle";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "highContrast", label: "High Contrast Mode", type: "toggle", default: false,
    desc: "Contrast and colorblindness improvements",
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.swaps > 0) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.wf-again",
          el("button.btn", { type: "button", onclick: startFresh }, "Play new game")),
      ],
    });
    return;
  }
  startFresh();
}

let state = { v: 1, board: "", swaps: 0, hints: 0, status: "playing" };

const newBtn = el("button.icon-btn", {
  type: "button", "aria-label": "New game", title: "New game", html: ICONS.shuffle, onclick: askNewGame,
});
const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newBtn],
});

const answers = await loadWordleAnswers();
const built = puzzleFor(puzzle, answers);
const solution = built.solution;

function sameBag(a, b) {
  return a.length === b.length && [...a].sort().join("") === [...b].sort().join("");
}

function freshState() {
  return { v: 1, board: built.start, swaps: 0, hints: 0, status: "playing" };
}

const saved = loadState(GAME, puzzle.id);
let repaired = false;
if (!saved || saved.v !== 1 || typeof saved.board !== "string" || !sameBag(saved.board, solution)) {
  state = freshState();
} else {
  const swaps = Number.isInteger(saved.swaps) && saved.swaps >= 0 ? Math.min(saved.swaps, SWAPS) : 0;
  let status = saved.status;
  if (status !== "won" && status !== "lost" && status !== "playing") status = "playing";
  const solved = saved.board === solution;
  if (status === "won" && !solved) status = swaps >= SWAPS ? "lost" : "playing";
  if (status === "playing" && solved) status = "won";
  else if (status === "playing" && swaps >= SWAPS) status = "lost";
  if (swaps !== saved.swaps || status !== saved.status) repaired = true;
  const hints = Number.isInteger(saved.hints) && saved.hints >= 0 ? saved.hints : 0;
  state = { v: 1, board: saved.board, swaps, hints, status };
}
if (repaired && state.swaps > 0) saveState(GAME, puzzle.id, state);

const save = () => saveState(GAME, puzzle.id, state);

// ---------------------------------------------------------------- DOM

const starEls = [0, 1, 2, 3, 4].map(() => el("span.wf-star", { "aria-hidden": "true" }, "★"));
const numEl = el("div.num");
const labelEl = el("div.label");
const starsBox = el("div.wf-stars", starEls);
const countBox = el("div.wf-count", { "aria-live": "polite" }, numEl, labelEl);
const stageEl = el("div.wf-stage");
const gridEl = el("div.wf-grid", { role: "group", "aria-label": "Waffle" });

const tiles = CELLS.map((_, i) => {
  const btn = el("div.wf-tile", { role: "button", tabindex: "0", dataset: { i: String(i) } });
  btn.addEventListener("pointerdown", (e) => onPointerDown(e, i));
  btn.addEventListener("pointermove", onPointerMove);
  btn.addEventListener("pointerup", (e) => onPointerUp(e, true));
  btn.addEventListener("pointercancel", (e) => onPointerUp(e, false));
  btn.addEventListener("click", (e) => onClick(e, i));
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fromPointer = true;
    onTap(i);
    setTimeout(() => { fromPointer = false; }, 50);
  });
  return btn;
});

const tileAt = {};
CELLS.forEach((cell, i) => { tileAt[cell.r * 5 + cell.c] = tiles[i]; });
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) gridEl.append(tileAt[r * 5 + c] || el("div.wf-hole"));
}

stageEl.append(el("div.wf-plate", gridEl));
main.append(el("div.wf-game", el("div.wf-hud", starsBox, countBox), stageEl));

let selected = -1;
let hinted = null; // [i, j] swap suggested by the last hint, until the board changes
let drag = null;
let fromPointer = false;

function setSelected(i) {
  selected = i;
  tiles.forEach((t, k) => t.classList.toggle("is-selected", k === i));
}

function clearOver() {
  tiles.forEach((t) => t.classList.remove("is-over"));
}

function isLocked(i) {
  return tiles[i].classList.contains("is-locked");
}

function tileIndexFromPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  const btn = node && node.closest ? node.closest(".wf-tile") : null;
  if (!btn || btn.classList.contains("example") || btn.classList.contains("is-locked")) return -1;
  const i = tiles.indexOf(btn);
  return i;
}

function fit() {
  const gap = 8;
  const plate = 28;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  if (w < 40 || h < 40) return;
  const side = Math.min(w, h, 420);
  const tile = Math.max(36, Math.floor((side - plate - gap * 4) / 5));
  gridEl.style.setProperty("--tile", `${tile}px`);
}
new ResizeObserver(fit).observe(stageEl);
fit();

function paint() {
  const cols = colors(state.board, solution);
  const locked = state.status !== "playing";
  tiles.forEach((t, i) => {
    const ch = state.board[i];
    const st = cols[i];
    t.textContent = ch;
    t.dataset.state = st;
    const green = st === "correct";
    const hold = green || locked;
    t.classList.toggle("is-locked", hold);
    t.tabIndex = hold ? -1 : 0;
    if (hold) t.setAttribute("aria-disabled", "true");
    else t.removeAttribute("aria-disabled");
    const place = green ? "right spot, locked" : st === "present" ? "right word, wrong spot" : "not in either word";
    t.setAttribute("aria-label", `${ch.toUpperCase()}, ${place}${hinted && hinted.includes(i) ? ", hint" : ""}`);
    t.classList.toggle("is-hint", !!hinted && hinted.includes(i) && !locked);
  });
  const stars = starsFor(state.swaps);
  starEls.forEach((s, i) => {
    s.classList.toggle("on", i < stars);
    s.classList.toggle("off", i >= stars);
  });
  const starLabel = state.status === "playing" ? "available" : "earned";
  starsBox.setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} ${starLabel}`);
  if (state.status === "playing") {
    const left = Math.max(0, SWAPS - state.swaps);
    numEl.textContent = String(left);
    labelEl.textContent = left === 1 ? "swap left" : "swaps left";
  } else {
    numEl.textContent = String(state.swaps);
    labelEl.textContent = state.swaps === 1 ? "swap" : "swaps";
  }
  if (selected >= 0 && (locked || cols[selected] === "correct")) setSelected(-1);
}

function finishIfNeeded() {
  if (state.status === "playing") return;
  const won = state.status === "won";
  const stars = starsFor(state.swaps);
  recordResult(GAME, puzzle, { won, bucket: won ? String(stars) : "X" });
  toast(won ? STAR_WORDS[stars] : "Out of swaps", 2000);
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 700);
}

function swapCells(i, j) {
  if (state.status !== "playing" || i === j || isModalOpen()) return;
  const cols = colors(state.board, solution);
  if (cols[i] === "correct" || cols[j] === "correct") return;
  const arr = [...state.board];
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  state.board = arr.join("");
  state.swaps += 1;
  hinted = null;
  if (state.board === solution) state.status = "won";
  else if (state.swaps >= SWAPS) state.status = "lost";
  save();
  setSelected(-1);
  paint();
  finishIfNeeded();
}

function useHint() {
  if (state.status !== "playing") { toast("The round is over"); return; }
  const pair = hintSwap(state.board, solution);
  if (!pair) return;
  if (!hinted || hinted.join() !== pair.join()) {
    state.hints += 1;
    save();
  }
  hinted = pair;
  setSelected(-1);
  paint();
  const fixes = state.board[pair[0]] === solution[pair[1]] ? "both letters" : "a letter";
  toast(`Swap the marked letters to put ${fixes} in place`, 2400);
}

function onTap(i) {
  if (state.status !== "playing" || isModalOpen() || isLocked(i)) return;
  if (selected < 0) { setSelected(i); return; }
  if (selected === i) { setSelected(-1); return; }
  swapCells(selected, i);
}

function onPointerDown(e, i) {
  if (e.button !== 0 || state.status !== "playing" || isModalOpen() || isLocked(i)) return;
  drag = { index: i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  try { tiles[i].setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
    drag.moved = true;
    setSelected(drag.index);
  }
  if (!drag.moved) return;
  clearOver();
  const j = tileIndexFromPoint(e.clientX, e.clientY);
  if (j >= 0 && j !== drag.index && !isLocked(j)) tiles[j].classList.add("is-over");
}

function onPointerUp(e, commit) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const info = drag;
  drag = null;
  clearOver();
  fromPointer = true;
  setTimeout(() => { fromPointer = false; }, 350);
  if (!info.moved) {
    if (commit) onTap(info.index);
    return;
  }
  const j = tileIndexFromPoint(e.clientX, e.clientY);
  if (commit && j >= 0 && j !== info.index && !isLocked(j)) swapCells(info.index, j);
  else setSelected(-1);
}

function onClick(e, i) {
  if (fromPointer) { fromPointer = false; e.preventDefault(); return; }
  onTap(i);
}

// ---------------------------------------------------------------- modals

function swatch(ch, st) {
  return el("span.wf-tile.example", {
    dataset: { state: st },
    style: { width: "40px", height: "40px", fontSize: "20px" },
  }, ch);
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Swap letters to spell six words.",
    content: [
      el("ul.help-list",
        el("li", "Three words run across and three run down. Every letter you need is already on the board."),
        el("li", "Green is the right letter in the right spot, and it locks. Yellow is in the right word, wrong spot. Gray belongs to neither word that uses that square."),
        el("li", "Swap any two letters that are not green. Tap one, then the other, or drag one onto the other."),
        el("li", "You have 15 swaps. Ten or fewer earns five stars. Each swap after that costs a star. The last swap can still finish the puzzle."),
        el("li", "Stuck? The 💡 button marks a swap that puts a letter in place. You still make the swap, and it still counts. Hints can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "Examples")),
        el("div.example", el("div.wf-example", swatch("C", "correct")),
          el("p", el("strong", "C"), " is in the right spot, so it stays put.")),
        el("div.example", el("div.wf-example", swatch("R", "present")),
          el("p", el("strong", "R"), " is in the right word, in the wrong spot.")),
        el("div.example", el("div.wf-example", swatch("Q", "absent")),
          el("p", el("strong", "Q"), " belongs to neither word on that square."))),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function answerCard() {
  const words = readWords(solution);
  const col = (title, list) => el("div.wf-col",
    el("div.wf-col-title", title),
    list.map((w) => el("div.wf-word", w)),
  );
  return el("div.wf-answers", col("Across", words.across), col("Down", words.down));
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const earned = state.status === "won" ? starsFor(state.swaps) : null;
  const dist = [];
  for (let i = 5; i >= 0; i--) {
    dist.push({ label: String(i), count: stats.dist[String(i)] || 0, highlight: earned === i });
  }
  const text = done ? shareText({ puzzle, won: state.status === "won", stars: earned || 0, hints: state.hints }) : null;
  showStats({
    title: state.status === "won" ? STAR_WORDS[earned] : state.status === "lost" ? "Out of swaps" : undefined,
    top: done ? answerCard() : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Star Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next Waffle" : null,
    shareText: text,
    extra: done ? el("div",
      el("p.wf-share", state.status === "won"
        ? `${"⭐".repeat(earned)}${"☆".repeat(5 - earned)}  ${earned}/5`
        : "X/5"),
      state.hints ? el("p.wf-share-hints", `${state.hints} hint${state.hints === 1 ? "" : "s"} used`) : null,
    ) : null,
  });
}

// ---------------------------------------------------------------- start

paint();
if (repaired && state.status !== "playing") {
  recordResult(GAME, puzzle, {
    won: state.status === "won",
    bucket: state.status === "won" ? String(starsFor(state.swaps)) : "X",
  });
}

const finished = state.status !== "playing";
const swapsLeft = SWAPS - state.swaps;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.swaps ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : state.swaps ? `${swapsLeft} swap${swapsLeft === 1 ? "" : "s"} left.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:waffle")) { set("seen:waffle", true); showHelp(); }
