// One Word Search — one hidden 5-letter word at a time, ten grids. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, showStats, splash, toast, hintButton, ICONS } from "../core/ui.js";
import { loadWordleAnswers, loadWordleValid } from "../core/words.js";
import {
  SIZE, WORD_COUNT, STAR_WORDS,
  clockText, puzzleFor, starsFor, shareText,
} from "./oneword/logic.js";

const GAME = "oneword";
const HINT_MS = 10_000; // each hint adds ten seconds to the finishing time
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "highContrast", label: "High Contrast Mode", type: "toggle", default: false,
    desc: "Contrast and colorblindness improvements",
  },
  {
    key: "showClock", label: "Show the Clock", type: "toggle", default: false,
    desc: "The clock still runs either way. It starts when you find the first word.",
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.found > 0) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.ow-again",
          el("button.btn", { type: "button", onclick: startFresh }, "Play new game")),
      ],
    });
    return;
  }
  startFresh();
}

// hint: { round, level } for the current round (1 names the word, 2 also marks its first letter).
// hints counts every hint used; each adds HINT_MS to the finishing time.
let state = { v: 1, found: 0, elapsed: 0, splits: [], hints: 0, hint: null, status: "playing" };

const newBtn = el("button.icon-btn", {
  type: "button", "aria-label": "New game", title: "New game", html: ICONS.shuffle, onclick: askNewGame,
});
const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newBtn],
});

const [answers, valid] = await Promise.all([loadWordleAnswers(), loadWordleValid()]);
const built = puzzleFor(puzzle, answers, valid);

function freshState() {
  return { v: 1, found: 0, elapsed: 0, splits: [], hints: 0, hint: null, status: "playing" };
}

const saved = loadState(GAME, puzzle.id);
let repaired = false;
if (!saved || saved.v !== 1 || !Number.isInteger(saved.found) || saved.found < 0 || saved.found > WORD_COUNT) {
  state = freshState();
} else {
  const found = saved.found;
  const splits = Array.isArray(saved.splits) ? saved.splits.filter((n) => Number.isFinite(n) && n >= 0) : [];
  let elapsed = Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0;
  let status = saved.status === "won" ? "won" : "playing";
  if (splits.length !== found) {
    state = freshState();
    repaired = true;
  } else {
    if (found >= WORD_COUNT) status = "won";
    if (splits.length && elapsed < splits[splits.length - 1]) elapsed = splits[splits.length - 1];
    if (status !== saved.status || elapsed !== saved.elapsed) repaired = true;
    const hints = Number.isInteger(saved.hints) && saved.hints >= 0 ? saved.hints : 0;
    const h = saved.hint;
    const hint = h && h.round === found && (h.level === 1 || h.level === 2) ? { round: found, level: h.level } : null;
    state = { v: 1, found, elapsed, splits, hints, hint, status };
  }
}
if (repaired && state.found > 0) saveState(GAME, puzzle.id, state);

const save = () => saveState(GAME, puzzle.id, state);
/** Finishing time: the clock plus the hint penalty. */
const total = () => state.elapsed + state.hints * HINT_MS;

// ---------------------------------------------------------------- DOM

const starEls = [0, 1, 2, 3, 4].map(() => el("span.ow-star", { "aria-hidden": "true" }, "★"));
const numEl = el("div.num");
const labelEl = el("div.label");
const clockEl = el("div.ow-clock");
const starsBox = el("div.ow-stars", starEls);
const countBox = el("div.ow-count", { "aria-live": "polite" }, numEl, labelEl, clockEl);
const stageEl = el("div.ow-stage");
const gridEl = el("div.ow-grid", { role: "group", "aria-label": "Letter grid" });
const dots = Array.from({ length: WORD_COUNT }, () => el("span.ow-dot"));
const dotBox = el("div.ow-dots", dots);
const hintLine = el("p.ow-hint", { "aria-live": "polite" });

const cells = [];
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const cell = el("div.ow-cell", { role: "button", tabindex: "0", dataset: { r: String(r), c: String(c) } });
    cells.push(cell);
    gridEl.append(cell);
  }
}

stageEl.append(gridEl);
main.append(el("div.ow-game", el("div.ow-hud", starsBox, countBox), stageEl, dotBox, hintLine));

gridEl.addEventListener("pointerdown", onPointerDown);
gridEl.addEventListener("pointermove", onPointerMove);
gridEl.addEventListener("pointerup", (e) => onPointerUp(e, true));
gridEl.addEventListener("pointercancel", (e) => onPointerUp(e, false));

let anchor = null;
let drag = null;
let busy = false;
let ticking = false;
let lastTick = 0;
let shownSecond = -1;
let praise = "";

function cellAt(r, c) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
  return cells[r * SIZE + c];
}

function cellFromPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest(".ow-cell") : null;
  if (!cell || !gridEl.contains(cell)) return null;
  return [+cell.dataset.r, +cell.dataset.c];
}

function lineFrom(sr, sc, tr, tc) {
  const dr = tr - sr;
  const dc = tc - sc;
  if (dr === 0 && dc === 0) return [[sr, sc]];
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  let srgn;
  let scgn;
  if (adc === 0 || (adr > adc && adr > adc * 1.6)) {
    srgn = Math.sign(dr);
    scgn = 0;
  } else if (adr === 0 || (adc > adr && adc > adr * 1.6)) {
    srgn = 0;
    scgn = Math.sign(dc);
  } else {
    srgn = Math.sign(dr);
    scgn = Math.sign(dc);
  }
  const steps = srgn !== 0 && scgn !== 0 ? Math.min(adr, adc) : Math.max(adr, adc);
  const out = [];
  for (let i = 0; i <= steps && i < SIZE; i++) {
    const r = sr + i * srgn;
    const c = sc + i * scgn;
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) break;
    out.push([r, c]);
  }
  return out;
}

function clearMarks() {
  cells.forEach((cell) => cell.classList.remove("is-selected"));
}

function mark(line) {
  clearMarks();
  for (const [r, c] of line) cellAt(r, c).classList.add("is-selected");
}

function wordOn(line) {
  return line.map(([r, c]) => cells[r * SIZE + c].textContent).join("").toLowerCase();
}

function currentRound() {
  return built.rounds[Math.min(state.found, WORD_COUNT - 1)];
}

function paintGrid() {
  const round = currentRound();
  const solved = state.status === "won" ? new Set(round.path) : null;
  const hint = state.status === "playing" && state.hint && state.hint.round === state.found ? state.hint : null;
  cells.forEach((cell, i) => {
    const ch = round.letters[i];
    const first = !!hint && hint.level >= 2 && round.path[0] === i;
    cell.textContent = ch;
    cell.classList.remove("is-selected", "is-found", "is-miss");
    cell.classList.toggle("is-hint", first);
    if (solved && solved.has(i)) cell.classList.add("is-found");
    cell.setAttribute("aria-label", `${ch.toUpperCase()}${first ? ", first letter of the hidden word" : ""}`);
  });
  hintLine.hidden = !hint;
  hintLine.textContent = hint ? `Find: ${round.word.toUpperCase()}${hint.level >= 2 ? " · first letter marked" : ""}` : "";
}

function useHint() {
  if (state.status !== "playing") { toast("The round is over"); return; }
  if (busy || isModalOpen()) return;
  const level = state.hint && state.hint.round === state.found ? state.hint.level : 0;
  if (level >= 2) { toast("No more hints for this word"); return; }
  state.hint = { round: state.found, level: level + 1 };
  state.hints += 1;
  save();
  paintGrid();
  paintHud();
  toast(level === 0 ? `Hint: the word is ${currentRound().word.toUpperCase()} (+10 seconds)` : "Hint: first letter marked (+10 seconds)", 2200);
}

function paintHud() {
  const done = state.status !== "playing";
  const stars = starsFor(total());
  starEls.forEach((s, i) => {
    s.classList.toggle("on", i < stars);
    s.classList.toggle("off", i >= stars);
  });
  starsBox.setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} ${done ? "earned" : "available"}`);
  const left = WORD_COUNT - state.found;
  if (done) {
    numEl.textContent = clockText(total());
    labelEl.textContent = "time";
  } else {
    numEl.textContent = String(left);
    labelEl.textContent = praise || (left === 1 ? "word left" : "words left");
  }
  const show = getSetting(GAME, "showClock") && !done;
  clockEl.hidden = !show;
  clockEl.textContent = show ? clockText(total()) : "";
  dots.forEach((dot, i) => dot.classList.toggle("on", i < state.found));
  dotBox.setAttribute("aria-label", `${state.found} of ${WORD_COUNT} words found`);
}

function fit() {
  const gap = 6;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  if (w < 40 || h < 40) return;
  const side = Math.min(w, h, 420);
  const tile = Math.max(40, Math.floor((side - gap * 4) / SIZE));
  gridEl.style.setProperty("--tile", `${tile}px`);
}
new ResizeObserver(fit).observe(stageEl);
fit();
onSettingsChange(() => paintHud());

function finish() {
  const stars = starsFor(total());
  recordResult(GAME, puzzle, { won: true, bucket: String(stars), time: total() / 1000 });
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 400);
}

function accept(line) {
  if (busy || state.status !== "playing" || isModalOpen()) return false;
  if (wordOn(line) !== currentRound().word) return false;
  busy = true;
  clearMarks();
  anchor = null;
  for (const [r, c] of line) cellAt(r, c).classList.add("is-found");
  if (state.found === 0) state.elapsed = 0;
  state.splits.push(state.elapsed);
  state.found += 1;
  state.hint = null;
  hintLine.hidden = true;
  praise = built.rounds[state.found - 1].word.toUpperCase();
  if (state.found >= WORD_COUNT) {
    state.status = "won";
    praise = "";
    save();
    paintHud();
    busy = false;
    finish();
    return true;
  }
  save();
  paintHud();
  setTimeout(() => {
    praise = "";
    paintGrid();
    paintHud();
    busy = false;
  }, 420);
  return true;
}

function miss(line) {
  for (const [r, c] of line) cellAt(r, c).classList.add("is-miss");
  setTimeout(() => cells.forEach((cell) => cell.classList.remove("is-miss")), 200);
}

function onPointerDown(e) {
  if (e.button !== 0 || busy || state.status !== "playing" || isModalOpen()) return;
  const hit = cellFromPoint(e.clientX, e.clientY);
  if (!hit) return;
  drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, start: hit };
  try { gridEl.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
  if (!drag.moved) return;
  const hit = cellFromPoint(e.clientX, e.clientY);
  if (!hit) return;
  mark(lineFrom(drag.start[0], drag.start[1], hit[0], hit[1]));
}

function onPointerUp(e, commit) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const info = drag;
  drag = null;
  clearMarks();
  if (!commit) return;
  if (info.moved) {
    anchor = null;
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    const line = lineFrom(info.start[0], info.start[1], hit[0], hit[1]);
    if (line.length === SIZE && accept(line)) return;
    if (line.length > 1) miss(line);
    anchor = null;
    return;
  }
  if (!anchor) {
    anchor = info.start;
    mark([info.start]);
    return;
  }
  if (anchor[0] === info.start[0] && anchor[1] === info.start[1]) {
    anchor = null;
    return;
  }
  const line = lineFrom(anchor[0], anchor[1], info.start[0], info.start[1]);
  anchor = null;
  if (line.length === SIZE && accept(line)) return;
  if (line.length > 1) miss(line);
}

function loop(now) {
  if (!ticking) return;
  if (state.status === "playing" && state.found > 0 && !document.hidden && !isModalOpen() && !busy) {
    state.elapsed += now - lastTick;
    const sec = Math.floor(state.elapsed / 1000);
    if (sec !== shownSecond) {
      shownSecond = sec;
      paintHud();
      save();
    }
  }
  lastTick = now;
  requestAnimationFrame(loop);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.found > 0 && state.status === "playing") save();
});

// ---------------------------------------------------------------- modals

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Find one word. Then find another.",
    content: [
      el("ul.help-list",
        el("li", "One 5-letter word is hidden in the grid. It can run across, down, or diagonally, and it can read in reverse."),
        el("li", "Swipe from its first letter through its last. Or tap the first letter, then the last."),
        el("li", "Find it and a new grid appears. Ten words finish the puzzle."),
        el("li", "The clock starts when you find the first word. One minute or less earns five stars. Each minute after that costs a star."),
        el("li", "Stuck? The 💡 button names the hidden word, and a second tap marks its first letter. Each hint adds 10 seconds to your time. Hints can be turned off in Settings.")),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function timeCard() {
  return el("ol.ow-card", built.rounds.map((round, i) => {
    const delta = i === 0 ? 0 : state.splits[i] - state.splits[i - 1];
    return el("li", el("span.ow-word", round.word), el("span.ow-split", clockText(delta)));
  }));
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const earned = done ? starsFor(total()) : null;
  const dist = [];
  for (let i = 5; i >= 1; i--) {
    dist.push({ label: String(i), count: stats.dist[String(i)] || 0, highlight: earned === i });
  }
  const text = done ? shareText({ puzzle, stars: earned, ms: total(), hints: state.hints }) : null;
  showStats({
    title: done ? STAR_WORDS[earned] : undefined,
    top: done ? timeCard() : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Star Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next One Word Search" : null,
    shareText: text,
    extra: done ? el("div",
      el("p.ow-share", `${"⭐".repeat(earned)}${"☆".repeat(5 - earned)}  ${earned}/5`),
      el("p.ow-share-time", clockText(total()), state.hints ? ` · ${state.hints} hint${state.hints === 1 ? "" : "s"} (+${state.hints * 10}s)` : ""),
    ) : null,
  });
}

// ---------------------------------------------------------------- start

paintGrid();
paintHud();
if (repaired && state.status === "won") {
  recordResult(GAME, puzzle, {
    won: true,
    bucket: String(starsFor(total())),
    time: total() / 1000,
  });
}

const finished = state.status !== "playing";
const left = WORD_COUNT - state.found;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.found ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : state.found ? `${left} word${left === 1 ? "" : "s"} left.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:oneword")) { set("seen:oneword", true); showHelp(); }

lastTick = performance.now();
ticking = true;
requestAnimationFrame(loop);
