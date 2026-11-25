// Stackdown — clear a stack of tiles, one five-letter word at a time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING, hintsOn, watchHints } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, ICONS } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import { exposedIds, starsFor, STAR_WORDS, shareText, puzzleFor } from "./stackdown/logic.js";

const GAME = "stackdown";
const puzzle = currentPuzzle();
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

defineSettings(GAME, [HINTS_SETTING]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

let state = { v: 1, word: 0, slots: [], hints: 0, hinted: false, status: "playing" };
let started = false;
let busy = false;

function askNewGame() {
  const progressed = state.word > 0 || state.slots.length > 0 || state.hints > 0;
  if (state.status === "playing" && progressed) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.sd-again",
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
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [newBtn],
});

const rawPool = await loadJSON("data/stackdown/clues.json");
const built = puzzleFor(puzzle, rawPool.map(([word, clue]) => ({ word, clue })));
const tileById = new Map(built.tiles.map((t) => [t.id, t]));

function freshState() {
  return { v: 1, word: 0, slots: [], hints: 0, hinted: false, status: "playing" };
}

function validState(saved) {
  if (!saved || saved.v !== 1) return false;
  const { word, slots, hints, hinted, status } = saved;
  if (!Number.isInteger(word) || word < 0 || word > 6) return false;
  if (status !== "playing" && status !== "won") return false;
  if ((status === "won") !== (word === 6)) return false;
  if (!Number.isInteger(hints) || hints < 0 || hints > 6) return false;
  if (typeof hinted !== "boolean") return false;
  if (word === 6 && hinted) return false;
  if (hinted && (hints < 1 || hints > word + 1)) return false;
  if (!hinted && hints > word) return false;
  if (!Array.isArray(slots) || slots.length > 5) return false;
  if (word === 6 && slots.length) return false;
  const seen = new Set();
  for (const id of slots) {
    const tile = tileById.get(id);
    if (!tile || tile.word !== word || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

const saved = loadState(GAME, puzzle.id);
let repaired = false;
if (!validState(saved)) {
  state = freshState();
} else {
  state = {
    v: 1,
    word: saved.word,
    slots: saved.slots.slice(),
    hints: saved.hints,
    hinted: saved.hinted,
    status: saved.status,
  };
  if (state.slots.length === 5 && state.status === "playing") {
    const spelled = state.slots.map((id) => tileById.get(id).letter).join("");
    if (spelled === built.words[state.word].word) {
      state.word += 1;
      state.hinted = false;
      if (state.word >= 6) state.status = "won";
    }
    state.slots = [];
    repaired = true;
  }
}
if (repaired) saveState(GAME, puzzle.id, state);
if (state.status === "won") {
  recordResult(GAME, puzzle, { won: true, bucket: String(starsFor(state.hints)) });
}

const save = () => saveState(GAME, puzzle.id, state);

// ---------------------------------------------------------------- DOM

const starEls = [0, 1, 2, 3, 4].map(() => el("span.sd-star", { "aria-hidden": "true" }, "★"));
const numEl = el("div.num");
const labelEl = el("div.label");
const starsBox = el("div.sd-stars", starEls);
const countBox = el("div.sd-count", { "aria-live": "polite" }, numEl, labelEl);
const live = el("div.visually-hidden", { "aria-live": "polite" });

const boardEl = el("div.sd-board");
const baizeEl = el("div.sd-baize", boardEl);
const slotEls = [0, 1, 2, 3, 4].map((i) => {
  const btn = el("button.sd-slot", { type: "button" }, el("span.sd-face"));
  btn.addEventListener("click", () => undoFrom(i));
  return btn;
});
const slotsEl = el("div.sd-slots", { role: "group", "aria-label": "Letters chosen for this word" }, slotEls);

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6l6 6-6 6" fill="none" stroke="#11694c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6l6 6-6 6" fill="none" stroke="#11694c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fillEl = el("div.sd-slider-fill");
const labelSlider = el("div.sd-slider-label", "Swipe for a hint");
const hintText = el("div.sd-slider-hint");
const handleEl = el("div.sd-slider-handle", { html: CHEVRON });
const sliderEl = el("div.sd-slider", {
  role: "slider", tabindex: "0",
  "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0",
  "aria-label": "Swipe for a hint",
}, fillEl, labelSlider, hintText, handleEl);

const stageEl = el("div.sd-stage", el("div.sd-table", baizeEl, slotsEl, sliderEl));
const hudEl = el("div.sd-hud", starsBox, countBox);
main.append(el("div.sd-game", hudEl, stageEl), live);

const tileEls = new Map();
for (const tile of built.tiles) {
  const btn = el("button.sd-tile", {
    type: "button",
    style: { "--px": String(tile.x / 2), "--py": String(tile.y / 2), "--z": String(tile.z) },
    dataset: { id: tile.id },
  }, el("span.sd-face", tile.letter.toUpperCase()));
  btn.addEventListener("click", () => pick(tile.id));
  tileEls.set(tile.id, btn);
  boardEl.append(btn);
}

function presentSet() {
  const present = new Set();
  for (const tile of built.tiles) {
    if (tile.word < state.word) continue;
    if (state.slots.includes(tile.id)) continue;
    present.add(tile.id);
  }
  return present;
}

function fit() {
  const availW = stageEl.clientWidth;
  const availH = stageEl.clientHeight;
  if (availW < 40) return;
  const sliderH = sliderEl.hidden ? 0 : 64;
  let board = Math.min(availW, 420);
  const slotsFor = (size) => size / 6.25 + 12;
  if (availH > 160 && board + slotsFor(board) + sliderH > availH) {
    board = (availH - sliderH - 12) / (1 + 1 / 6.25);
  }
  board = Math.max(200, Math.min(420, Math.floor(board)));
  const tile = board / 6.25;
  baizeEl.style.width = `${board}px`;
  baizeEl.style.height = `${board}px`;
  boardEl.style.setProperty("--tile", `${tile}px`);
  boardEl.style.setProperty("--gap", `${board / 32}px`);
  boardEl.style.setProperty("--depth", `${tile / 10}px`);
  slotsEl.style.setProperty("--tile", `${tile}px`);
  slotsEl.style.width = `${board}px`;
  hudEl.style.width = `${board}px`;
  sliderEl.style.width = `${board}px`;
}
new ResizeObserver(fit).observe(stageEl);
window.addEventListener("resize", fit);
fit();

function paintSlider(p, snap) {
  const width = sliderEl.clientWidth || 240;
  const handleW = 48;
  const travel = Math.max(1, width - handleW);
  const clamped = Math.max(0, Math.min(1, p));
  sliderP = clamped;
  const left = clamped * travel;
  const transition = snap ? "" : "none";
  handleEl.style.transition = transition;
  fillEl.style.transition = transition;
  handleEl.style.transform = `translateX(${left}px)`;
  fillEl.style.width = `${handleW + left}px`;
  sliderEl.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
}

let sliderP = 0;
let sliderDrag = null;

function paint() {
  const present = presentSet();
  const exposed = new Set(exposedIds(present));
  const locked = state.status !== "playing" || busy || !started;
  for (const tile of built.tiles) {
    const btn = tileEls.get(tile.id);
    const gone = tile.word < state.word || state.slots.includes(tile.id);
    const covered = !gone && !exposed.has(tile.id);
    btn.classList.toggle("is-gone", gone);
    btn.classList.toggle("is-covered", covered);
    btn.disabled = locked || gone || covered;
    btn.tabIndex = btn.disabled ? -1 : 0;
    btn.setAttribute("aria-hidden", gone ? "true" : "false");
    const place = gone ? "cleared" : covered ? "covered" : "available";
    btn.setAttribute("aria-label", `${tile.letter.toUpperCase()}, ${place}`);
  }
  slotEls.forEach((slot, i) => {
    const id = state.slots[i];
    const face = slot.querySelector(".sd-face");
    slot.classList.toggle("is-filled", !!id);
    if (id) {
      const letter = tileById.get(id).letter.toUpperCase();
      face.textContent = letter;
      slot.disabled = locked;
      slot.tabIndex = locked ? -1 : 0;
      slot.setAttribute("aria-label", `Remove ${letter} and the letters after it`);
    } else {
      face.textContent = "";
      slot.disabled = true;
      slot.tabIndex = -1;
      slot.setAttribute("aria-label", `Empty slot ${i + 1}`);
    }
  });
  const stars = starsFor(state.hints);
  starEls.forEach((star, i) => {
    star.classList.toggle("on", i < stars);
    star.classList.toggle("off", i >= stars);
  });
  const starLabel = state.status === "playing" ? "available" : "earned";
  starsBox.setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} ${starLabel}`);
  if (state.status === "playing") {
    numEl.textContent = String(state.word + 1);
    labelEl.textContent = "of 6";
    countBox.setAttribute("aria-label", `Word ${state.word + 1} of 6`);
  } else {
    numEl.textContent = String(state.hints);
    labelEl.textContent = state.hints === 1 ? "hint" : "hints";
    countBox.setAttribute("aria-label", `${state.hints} hint${state.hints === 1 ? "" : "s"} used`);
  }
  // With hints off the bar goes away, unless this word's clue is already showing.
  const showHint = state.status === "playing" && (hintsOn(GAME) || state.hinted);
  const wasHidden = sliderEl.hidden;
  sliderEl.hidden = !showHint;
  if (wasHidden !== sliderEl.hidden) fit();
  if (!showHint) return;
  const shown = state.hinted;
  sliderEl.classList.toggle("is-shown", shown);
  sliderEl.setAttribute("role", shown ? "status" : "slider");
  if (shown) {
    const clue = built.words[state.word].clue;
    hintText.textContent = clue;
    handleEl.style.transform = "";
    fillEl.style.width = "";
    sliderEl.tabIndex = -1;
    sliderEl.setAttribute("aria-valuenow", "100");
    sliderEl.setAttribute("aria-label", `Hint: ${clue}`);
  } else {
    hintText.textContent = "";
    sliderEl.tabIndex = started && !busy ? 0 : -1;
    sliderEl.setAttribute("aria-label", "Swipe for a hint");
    if (!sliderDrag) paintSlider(0, true);
  }
}

function finish() {
  const stars = starsFor(state.hints);
  recordResult(GAME, puzzle, { won: true, bucket: String(stars) });
  toast(STAR_WORDS[stars], 2000);
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 700);
}

function pick(id) {
  if (!started || busy || state.status !== "playing" || isModalOpen()) return;
  if (state.slots.includes(id)) return;
  if (!exposedIds(presentSet()).includes(id)) return;
  state.slots.push(id);
  save();
  paint();
  if (state.slots.length === 5) judge();
}

function undoFrom(index) {
  if (!started || busy || state.status !== "playing" || isModalOpen()) return;
  if (index < 0 || index >= state.slots.length) return;
  state.slots = state.slots.slice(0, index);
  save();
  paint();
}

function flyBack(ids, from) {
  if (reduced) return;
  ids.forEach((id, i) => {
    const tile = tileEls.get(id);
    const end = tile.getBoundingClientRect();
    const dx = from[i].left - end.left;
    const dy = from[i].top - end.top;
    tile.style.zIndex = "40";
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      tile.style.transform = "";
      const anim = tile.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
      anim.onfinish = () => { tile.style.zIndex = ""; };
    });
  });
}

function judge() {
  busy = true;
  const ids = state.slots.slice();
  const from = ids.map((_, i) => slotEls[i].getBoundingClientRect());
  paint();
  const spelled = ids.map((id) => tileById.get(id).letter).join("");
  const target = built.words[state.word].word;
  const wait = reduced ? 0 : spelled === target ? 280 : 420;
  setTimeout(() => {
    if (spelled === target) {
      slotsEl.classList.remove("is-right");
      state.word += 1;
      state.slots = [];
      state.hinted = false;
      if (state.word >= 6) state.status = "won";
      save();
      busy = false;
      paint();
      if (state.status === "won") finish();
      else live.textContent = `Word ${state.word + 1} of 6.`;
      return;
    }
    slotsEl.classList.remove("is-wrong");
    state.slots = [];
    save();
    busy = false;
    paint();
    flyBack(ids, from);
    live.textContent = "Those letters jump back.";
  }, wait);
  if (spelled === target) slotsEl.classList.add("is-right");
  else slotsEl.classList.add("is-wrong");
}

function revealHint() {
  if (!started || busy || state.hinted || state.status !== "playing" || isModalOpen()) return;
  state.hinted = true;
  state.hints += 1;
  sliderDrag = null;
  save();
  paint();
  live.textContent = `Hint. ${built.words[state.word].clue}`;
}

sliderEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || state.hinted || state.status !== "playing" || busy || !started || isModalOpen()) return;
  const rect = sliderEl.getBoundingClientRect();
  const travel = Math.max(1, rect.width - 48);
  const p = (e.clientX - rect.left - 24) / travel;
  sliderDrag = { id: e.pointerId, startX: e.clientX, origin: Math.max(0, Math.min(1, p)) };
  try { sliderEl.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  paintSlider(sliderDrag.origin, false);
  e.preventDefault();
});
sliderEl.addEventListener("pointermove", (e) => {
  if (!sliderDrag || e.pointerId !== sliderDrag.id) return;
  const travel = Math.max(1, sliderEl.clientWidth - 48);
  paintSlider(sliderDrag.origin + (e.clientX - sliderDrag.startX) / travel, false);
});
function endSliderDrag(e) {
  if (!sliderDrag || e.pointerId !== sliderDrag.id) return;
  const done = sliderP >= 0.82;
  sliderDrag = null;
  if (done) revealHint();
  else paintSlider(0, true);
}
sliderEl.addEventListener("pointerup", endSliderDrag);
sliderEl.addEventListener("pointercancel", endSliderDrag);
sliderEl.addEventListener("keydown", (e) => {
  if (state.hinted || state.status !== "playing" || busy || !started) return;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    const next = Math.min(1, sliderP + 0.2);
    paintSlider(next, true);
    if (next >= 0.82) revealHint();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "Home") {
    e.preventDefault();
    e.stopPropagation();
    paintSlider(e.key === "Home" ? 0 : sliderP - 0.2, true);
  } else if (e.key === "Enter" || e.key === " " || e.key === "End") {
    e.preventDefault();
    e.stopPropagation();
    revealHint();
  }
});

function exposedTiles() {
  const exposed = new Set(exposedIds(presentSet()));
  return built.tiles.filter((t) => exposed.has(t.id));
}

function moveFocus(dx, dy) {
  const exp = exposedTiles().slice().sort((a, b) => a.y - b.y || a.x - b.x);
  if (!exp.length) return;
  const active = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.id : "";
  const cur = exp.find((t) => t.id === active) || exp[0];
  let best = null;
  let bestScore = Infinity;
  for (const tile of exp) {
    if (tile.id === cur.id) continue;
    const mx = tile.x - cur.x;
    const my = tile.y - cur.y;
    if (dx && Math.sign(mx) !== dx) continue;
    if (dy && Math.sign(my) !== dy) continue;
    if (dx && !dy && Math.abs(my) > Math.abs(mx)) continue;
    if (dy && !dx && Math.abs(mx) > Math.abs(my)) continue;
    const score = Math.abs(mx) + Math.abs(my);
    if (score < bestScore) { bestScore = score; best = tile; }
  }
  (tileEls.get(best ? best.id : cur.id)).focus();
}

document.addEventListener("keydown", (e) => {
  if (!started || busy || state.status !== "playing" || isModalOpen()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && e.target.closest && e.target.closest(".sd-slider")) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "Backspace") {
    e.preventDefault();
    undoFrom(state.slots.length - 1);
    return;
  }
  if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(-1, 0); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(1, 0); return; }
  if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(0, -1); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(0, 1); return; }
  if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
  const matches = exposedTiles().filter((t) => t.letter === e.key.toLowerCase())
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!matches.length) return;
  e.preventDefault();
  if (matches.length === 1) { pick(matches[0].id); return; }
  const active = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.id : "";
  const at = matches.findIndex((t) => t.id === active);
  tileEls.get(matches[(at + 1) % matches.length].id).focus();
});

// ---------------------------------------------------------------- modals

function sampleTile(letter, covered) {
  return el(`button.sd-tile.example${covered ? ".is-covered" : ""}`, {
    type: "button", tabindex: "-1", disabled: "",
  }, el("span.sd-face", letter));
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Clear the stack, one word at a time.",
    content: [
      el("ul.help-list",
        el("li", "Thirty tiles spell six words. One five-letter word is waiting at a time."),
        el("li", "A bright tile is free to take. A dim tile waits under the tiles on top of it."),
        el("li", "Tap a bright tile and its letter drops into the row. The five letters have to spell that word in the order you tap them."),
        el("li", "The right word clears those tiles. Any other row of letters jumps back onto the stack."),
        el("li", "Tap a letter in the row to return it, together with each letter to its right."),
        el("li", "Swipe the hint bar for a clue, or press Enter while it is highlighted. The first hint leaves four stars. Each hint after that costs another, down to one star. Hints can be turned off in Settings."),
        el("li", "On a keyboard, type a letter to take the free tile that shows it. When two free tiles show that letter, the key moves between them and Enter takes the highlighted one. Backspace returns the last letter.")),
      el("div.help-examples",
        el("p", el("strong", "Tiles")),
        el("div.sd-demo", sampleTile("A", false), sampleTile("B", true)),
        el("p.sd-caption", "A is free. B is covered.")),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function answerCard() {
  return el("ol.sd-answers", built.words.map((w) =>
    el("li", el("strong", w.word), " ", w.clue)));
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status === "won";
  const earned = done ? starsFor(state.hints) : null;
  const dist = [];
  for (let i = 5; i >= 1; i--) {
    dist.push({ label: String(i), count: stats.dist[String(i)] || 0, highlight: earned === i });
  }
  showStats({
    title: done ? STAR_WORDS[earned] : undefined,
    top: done ? answerCard() : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Star Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next Stackdown" : null,
    shareText: done ? shareText({ puzzle, stars: earned }) : null,
    extra: done ? el("div",
      el("p.sd-share", `${"⭐".repeat(earned)}${"☆".repeat(5 - earned)}  ${earned}/5`),
    ) : null,
  });
}

// ---------------------------------------------------------------- start

paint();
watchHints(GAME, () => paint());

const finished = state.status === "won";
const progressed = state.word > 0 || state.slots.length > 0 || state.hints > 0;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : progressed ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : progressed ? `Word ${state.word + 1} of 6.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
started = !leaving;
paint();
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:stackdown")) { set("seen:stackdown", true); showHelp(); }
