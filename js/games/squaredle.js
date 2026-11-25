// Squaredle — trace words through a 4×4 grid. Today's puzzle, any past day, or a new one any time.
import { addDays, currentPuzzle, EPOCH, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING, hintsOn } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, ICONS } from "../core/ui.js";
import { loadCommon, loadDictionary } from "../core/words.js";
import {
  BONUS_BANDS, MIN_LEN, N, NEIGHBORS, bonusBand, isAdjacent, nextHint, puzzleFor, shareText, starsFor,
} from "./squaredle/logic.js";

const GAME = "squaredle";
const puzzle = currentPuzzle();

defineSettings(GAME, [HINTS_SETTING]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.found.length) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.sq-again",
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

const [dict, common] = await Promise.all([loadDictionary(), loadCommon()]);
let built;
try {
  built = puzzleFor(puzzle, dict, common);
} catch (err) {
  main.append(el("p.sq-error", "Sorry — this Squaredle puzzle could not be built."));
  throw err;
}

const letters = built.letters;
const answerSet = new Set(built.answers);
const bonusSet = new Set(built.bonus);
// Any dictionary word traced on the grid counts as a bonus, not just the common ones.
const isBonus = (w) => !answerSet.has(w) && (bonusSet.has(w) || dict.has(w));
const total = built.answers.length;

// shown: answer -> how many of its letters hints have revealed in the list.
function freshState() {
  return { v: 1, letters, found: [], status: "playing", bonusAtWin: null, shown: {} };
}

const saved = loadState(GAME, puzzle.id);
let state = freshState();
if (saved && saved.v === 1 && saved.letters === letters && Array.isArray(saved.found)) {
  const seen = new Set();
  state.found = saved.found.filter((w) => {
    if (typeof w !== "string" || seen.has(w) || (!answerSet.has(w) && !isBonus(w))) return false;
    seen.add(w);
    return true;
  });
  if (saved.shown && typeof saved.shown === "object") {
    for (const [w, n] of Object.entries(saved.shown)) {
      if (answerSet.has(w) && Number.isInteger(n) && n > 0) state.shown[w] = Math.min(n, w.length - 1);
    }
  }
  const got = new Set(state.found);
  if (built.answers.every((w) => got.has(w))) {
    state.status = "won";
    state.bonusAtWin = typeof saved.bonusAtWin === "number"
      ? saved.bonusAtWin
      : state.found.filter((w) => isBonus(w)).length;
  }
}
const save = () => saveState(GAME, puzzle.id, state);
if (state.status === "won") recordResult(GAME, puzzle, { won: true, bucket: bonusBand(state.bonusAtWin) });

const answerCount = () => state.found.filter((w) => answerSet.has(w)).length;
const bonusCount = () => state.found.filter((w) => isBonus(w)).length;
const hintCount = () => Object.values(state.shown).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- DOM

const starEls = Array.from({ length: 5 }, () => el("span.sq-star", "★"));
const countEl = el("span.sq-count");
const bonusHud = el("span.sq-bonus-hud");
const hud = el("div.sq-hud", el("div.sq-stars", { "aria-hidden": "true" }, starEls), countEl, bonusHud);
const wordEl = el("div.sq-word", { "aria-live": "polite" });

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "sq-lines");
svg.setAttribute("viewBox", "0 0 4 4");
svg.setAttribute("aria-hidden", "true");
const cells = [...letters].map((ch, i) => el("div.sq-cell", {
  role: "gridcell", "aria-label": ch.toUpperCase(), dataset: { i: String(i) },
}, el("span.sq-letter", ch.toUpperCase())));
const board = el("div.sq-board", { role: "grid", "aria-label": "Letter grid" }, svg, cells);

const listEl = el("div.sq-list");
const yesterdayBtn = puzzle.isDaily && addDays(puzzle.date, -1) >= EPOCH
  ? el("button.btn.small.secondary.sq-yesterday", { type: "button", onclick: () => showYesterday() }, "Yesterday's answers")
  : null;

// Two columns on a wide screen (board left, list right); the list flows below on a narrow one.
const gameEl = el("div.sq-game",
  el("div.sq-play", hud, wordEl, el("div.sq-boardwrap", board)),
  el("div.sq-side", listEl, yesterdayBtn));
main.append(gameEl);

let sel = [];
let mode = null;
let pointerId = null;
let dragMoved = false;
let submitOnUp = false;
let flashTimer = 0;
let startCh = "";
let startCycle = 0;
let shownStars = 0;
let started = false;
// The word hints go to: the one the player tapped, or the one the last hint landed on.
let target = null;

// ---------------------------------------------------------------- paint

const cap = (w) => w[0].toUpperCase() + w.slice(1);

function groupsOf(words) {
  const map = new Map();
  for (const w of words) {
    if (!map.has(w.length)) map.set(w.length, []);
    map.get(w.length).push(w);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/** A letter group: "4 letters" and "found | total" over its words. */
const group = (n, have, all, words) => el("div.sq-group", { role: "group", "aria-label": `${n} letters, ${have} of ${all} found` },
  el("div.sq-group-head", el("span", `${n} letters`), el("span.sq-tally", `${have} | ${all}`)),
  words.length ? el("div.sq-words", words) : null);

function paintList() {
  const got = new Set(state.found);
  const rows = groupsOf(built.answers).map(([n, words]) => group(n, words.filter((w) => got.has(w)).length, words.length,
    words.map((w) => {
      if (got.has(w)) return el("span.sq-slot.is-found", cap(w));
      const shown = state.shown[w] || 0;
      const picked = w === target && hintsOn(GAME);
      return el(`button.sq-slot.is-blank${picked ? ".is-target" : ""}`, {
        type: "button",
        style: { width: `${n * 0.62 + 0.6}em` },
        "aria-label": `${n}-letter word${shown ? `, starts ${w.slice(0, shown).toUpperCase()}` : ""}${picked ? ", hints go here" : ""}`,
        "aria-pressed": picked ? "true" : "false",
        onclick: () => pickTarget(w),
      }, shown ? el("span.sq-hint", w.slice(0, shown)) : null);
    })));
  // Bonus words stay hidden until found. The total is the puzzle's bonus list plus any rarer
  // dictionary words the player has traced, so found never passes it.
  const bonus = state.found.filter((w) => isBonus(w));
  const bonusAll = new Set([...built.bonus, ...bonus]);
  const bonusRows = groupsOf([...bonusAll].sort()).map(([n, words]) => {
    const mine = words.filter((w) => got.has(w));
    return group(n, mine.length, words.length, mine.map((w) => el("span.sq-slot.is-found.is-bonus", cap(w))));
  });
  listEl.replaceChildren(
    el("section.sq-answers", rows),
    el("section.sq-bonus",
      el("div.sq-bonus-head", el("span", "Bonus"), el("span.sq-tally", `${bonus.length} | ${bonusAll.size}`)),
      bonusRows.length ? bonusRows : el("p.sq-bonus-empty", "Less common words you find show up here.")),
  );
}

const linePoints = (path) => path.map((i) => `${(i & 3) + 0.5},${(i >> 2) + 0.5}`).join(" ");

function paintWord() {
  if (flashTimer) return;
  if (!sel.length) {
    wordEl.textContent = "";
    wordEl.className = "sq-word";
    return;
  }
  wordEl.textContent = sel.map((i) => letters[i]).join("").toUpperCase();
  wordEl.className = "sq-word is-building";
}

function paint(opts = {}) {
  const n = answerCount();
  const stars = starsFor(n, total);
  starEls.forEach((node, i) => {
    const on = i < stars;
    node.classList.toggle("on", on);
    if (on && i >= shownStars) {
      node.classList.remove("is-pop");
      void node.offsetWidth;
      node.classList.add("is-pop");
    }
  });
  shownStars = stars;
  countEl.textContent = `${n} / ${total}`;
  const bonus = bonusCount();
  bonusHud.textContent = bonus ? `${bonus} bonus` : "";
  hud.setAttribute("aria-label", `${n} of ${total} answers. ${stars} of 5 stars.${bonus ? ` ${bonus} bonus.` : ""}`);
  const selSet = new Set(sel);
  const last = sel[sel.length - 1];
  cells.forEach((node, i) => {
    node.classList.toggle("is-sel", selSet.has(i));
    node.classList.toggle("is-last", i === last);
    node.setAttribute("aria-selected", selSet.has(i) ? "true" : "false");
  });
  svg.innerHTML = sel.length > 1 ? `<polyline class="ln-sel" points="${linePoints(sel)}"/>` : "";
  if (!opts.keepList) paintList();
  paintWord();
}

function flash(word, kind) {
  clearTimeout(flashTimer);
  wordEl.textContent = word.toUpperCase();
  wordEl.className = `sq-word is-flash is-${kind}`;
  flashTimer = setTimeout(() => {
    flashTimer = 0;
    paintWord();
  }, 900);
}

function pop(path) {
  path.forEach((i, k) => {
    const node = cells[i];
    node.style.animationDelay = `${k * 28}ms`;
    node.classList.remove("is-pop");
    void node.offsetWidth;
    node.classList.add("is-pop");
  });
}

// ---------------------------------------------------------------- selection

function cellAt(e, strict) {
  const r = board.getBoundingClientRect();
  const cw = r.width / 4;
  const ch = r.height / 4;
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const c = Math.floor(x / cw);
  const row = Math.floor(y / ch);
  if (c < 0 || c >= 4 || row < 0 || row >= 4) return -1;
  if (strict) {
    const dx = x - (c + 0.5) * cw;
    const dy = y - (row + 0.5) * ch;
    if (Math.hypot(dx, dy) > 0.42 * cw) return -1;
  }
  return (row << 2) + c;
}

function clearSel() {
  sel = [];
  mode = null;
  startCh = "";
  paint();
}

board.addEventListener("pointerdown", (e) => {
  if (!started || isModalOpen() || (e.button && e.button !== 0)) return;
  const i = cellAt(e, false);
  if (i < 0) { clearSel(); return; }
  e.preventDefault();
  pointerId = e.pointerId;
  try { board.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  dragMoved = false;
  submitOnUp = false;
  const last = sel[sel.length - 1];
  if (mode === "tap" && sel.length && i === last) submitOnUp = true;
  else if (mode === "tap" && sel.includes(i)) sel = sel.slice(0, sel.indexOf(i) + 1);
  else if (mode === "tap" && sel.length && isAdjacent(last, i)) sel.push(i);
  else sel = [i];
  mode = "tap";
  startCh = "";
  clearTimeout(flashTimer);
  flashTimer = 0;
  paint({ keepList: true });
});

board.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointerId || !sel.length) return;
  const i = cellAt(e, true);
  if (i < 0) return;
  const last = sel[sel.length - 1];
  if (i === last) return;
  if (sel.length > 1 && i === sel[sel.length - 2]) {
    sel.pop();
    dragMoved = true;
    submitOnUp = false;
    paint({ keepList: true });
    return;
  }
  if (sel.includes(i) || !isAdjacent(last, i)) return;
  sel.push(i);
  dragMoved = true;
  submitOnUp = false;
  paint({ keepList: true });
});

function endPointer(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  if (e.type === "pointercancel") return;
  if (dragMoved || submitOnUp) submit();
}
board.addEventListener("pointerup", endPointer);
board.addEventListener("pointercancel", endPointer);
board.addEventListener("contextmenu", (e) => e.preventDefault());

function typeLetter(ch) {
  clearTimeout(flashTimer);
  flashTimer = 0;
  if (!sel.length) {
    const starts = [];
    for (let i = 0; i < N; i++) if (letters[i] === ch) starts.push(i);
    if (!starts.length) return;
    if (startCh === ch) startCycle = (startCycle + 1) % starts.length;
    else { startCh = ch; startCycle = 0; }
    sel = [starts[startCycle]];
    mode = "tap";
    paint({ keepList: true });
    return;
  }
  if (sel.length === 1 && letters[sel[0]] === ch) {
    const beside = NEIGHBORS[sel[0]].filter((j) => letters[j] === ch);
    if (!beside.length) {
      const starts = [];
      for (let i = 0; i < N; i++) if (letters[i] === ch) starts.push(i);
      startCh = ch;
      startCycle = (starts.indexOf(sel[0]) + 1) % starts.length;
      sel = [starts[startCycle]];
      paint({ keepList: true });
      return;
    }
  }
  startCh = "";
  const last = sel[sel.length - 1];
  if (sel.length >= 2 && letters[last] === ch) {
    const from = sel[sel.length - 2];
    const opts = NEIGHBORS[from].filter((j) => !sel.slice(0, -1).includes(j) && letters[j] === ch);
    if (opts.length > 1) {
      const cur = opts.indexOf(last);
      if (cur >= 0) {
        sel[sel.length - 1] = opts[(cur + 1) % opts.length];
        mode = "tap";
        paint({ keepList: true });
        return;
      }
    }
  }
  const opts = NEIGHBORS[last].filter((j) => !sel.includes(j) && letters[j] === ch);
  if (!opts.length) return;
  sel.push(opts[0]);
  mode = "tap";
  paint({ keepList: true });
}

function arrowKey(key) {
  if (!sel.length) return;
  const last = sel[sel.length - 1];
  let r = last >> 2;
  let c = last & 3;
  if (key === "ArrowLeft") c--;
  else if (key === "ArrowRight") c++;
  else if (key === "ArrowUp") r--;
  else r++;
  if (r < 0 || r > 3 || c < 0 || c > 3) return;
  const j = (r << 2) + c;
  if (sel.length > 1 && j === sel[sel.length - 2]) sel.pop();
  else if (!sel.includes(j)) sel.push(j);
  else return;
  mode = "tap";
  startCh = "";
  paint({ keepList: true });
}

document.addEventListener("keydown", (e) => {
  if (!started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector(".splash") || document.querySelector(".drawer.open")) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key.toLowerCase()); return; }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    arrowKey(e.key);
    return;
  }
  if (e.key === "Backspace" && sel.length) { e.preventDefault(); sel.pop(); if (!sel.length) mode = null; paint({ keepList: true }); return; }
  if (e.key === "Escape" && sel.length) { e.preventDefault(); clearSel(); return; }
  if (e.key === "Enter" && sel.length) {
    if (e.target.closest && e.target.closest("button")) return;
    e.preventDefault();
    submit();
  }
});

function submit() {
  const path = sel.slice();
  const word = path.map((i) => letters[i]).join("");
  sel = [];
  mode = null;
  startCh = "";
  if (!word) { paint(); return; }
  if (word.length < MIN_LEN) { toast("Too short"); flash(word, "bad"); paint(); return; }
  if (state.found.includes(word)) { toast("Already found"); flash(word, "bad"); paint(); return; }
  if (answerSet.has(word) || isBonus(word)) { accept(word, path, !answerSet.has(word)); return; }
  toast("Not in word list");
  flash(word, "bad");
  paint();
}

function accept(word, path, bonus) {
  state.found.push(word);
  const justWon = !bonus && state.status !== "won" && answerCount() === total;
  if (justWon) {
    state.status = "won";
    state.bonusAtWin = bonusCount();
    recordResult(GAME, puzzle, { won: true, bucket: bonusBand(state.bonusAtWin) });
  }
  save();
  pop(path);
  flash(word, bonus ? "bonus" : "answer");
  paint();
  if (justWon) {
    setTimeout(() => toast("Solved!", 2000), 350);
    setTimeout(() => { if (!isModalOpen()) openStats(); }, 1500);
  } else if (bonus) toast("Bonus!");
}

// ---------------------------------------------------------------- hints

const canHint = (w) => !state.found.includes(w) && (state.shown[w] || 0) < w.length - 1;

/** Tap an open word to send hints there; tap it again to go back to the usual order. */
function pickTarget(w) {
  if (!hintsOn(GAME)) return;
  if (target === w) target = null;
  else if (canHint(w)) target = w;
  else { toast("Hints can't show more of that word"); return; }
  paintList();
}

function useHint() {
  if (state.status === "won") { toast("Every answer is found"); return; }
  const w = target && canHint(target) ? target : nextHint(built.answers, new Set(state.found), state.shown);
  if (!w) { toast("No more hints"); return; }
  state.shown[w] = (state.shown[w] || 0) + 1;
  // Stay on this word for the next hint until it runs out of letters to show.
  target = canHint(w) ? w : null;
  save();
  paintList();
  toast(`Hint: a ${w.length}-letter word starting ${w.slice(0, state.shown[w]).toUpperCase()}`, 2200);
}

// ---------------------------------------------------------------- modals

function showHelp() {
  const demoLetters = ["W", "O", "R", "D"];
  const demo = el("div.sq-demo", { "aria-hidden": "true" });
  const demoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  demoSvg.setAttribute("viewBox", "0 0 4 1");
  demoSvg.setAttribute("class", "sq-lines");
  demoSvg.innerHTML = `<polyline class="ln-sel" points="0.5,0.5 1.5,0.5 2.5,0.5 3.5,0.5"/>`;
  demo.append(demoSvg, ...demoLetters.map((ch) => el("div.sq-cell.is-sel", el("span.sq-letter", ch))));
  showModal({
    title: "How To Play",
    subtitle: "Trace words through the grid.",
    content: [
      el("ul.help-list",
        el("li", `Swipe through letters that touch, including diagonally. Each letter is used once in a word. Words are at least ${MIN_LEN} letters.`),
        el("li", "Release to enter the word, or press Enter. Drag back to remove the last letter. Backspace does the same, and Escape clears the path."),
        el("li", "Every answer is listed by length. A blank fills in when you find that word. The puzzle is solved when every answer is filled."),
        el("li", "Bonus words are less common. They collect under Bonus and are optional. You can keep finding them after the puzzle is solved."),
        el("li", "The stars fill as the answers come in. On a keyboard, type a letter to extend the path. When several neighbors match, type that letter again to switch. Arrow keys step to a neighbor."),
        el("li", "Stuck? The 💡 button shows the first letter of a word you haven't found, shortest first, and the next 💡 adds a letter to the same word. Tap an open word in the list to send hints there instead, or tap it again to go back to shortest first. Hints can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "A word is a continuous path.")),
        demo),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function showYesterday() {
  const day = addDays(puzzle.date, -1);
  const prev = puzzleFor({ id: day, date: day, isDaily: true }, dict, common);
  const mine = new Set((loadState(GAME, day) || {}).found || []);
  const rows = groupsOf(prev.answers).map(([n, words]) => el("div.sq-line",
    el("span.sq-len", String(n)),
    el("div.sq-words", words.map((w) => el(`span.sq-slot.is-found${mine.has(w) ? ".is-mine" : ""}`, cap(w))))));
  showModal({
    title: "Yesterday's Answers",
    subtitle: `${prev.answers.length} answers · ${prev.bonus.length} bonus words`,
    className: "sq-yesterday-modal",
    content: el("div.sq-list", rows),
  });
}

function openStats() {
  const stats = getStats(GAME);
  const n = answerCount();
  const stars = starsFor(n, total);
  const solved = state.status === "won";
  const band = solved ? bonusBand(state.bonusAtWin) : null;
  showStats({
    title: solved ? "Solved" : undefined,
    top: n ? el("div.sq-summary",
      `${n} / ${total}`,
      solved ? ` · ${state.bonusAtWin} bonus` : "") : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: {
      title: "Bonus at the finish",
      rows: BONUS_BANDS.map((id) => ({ label: id, count: stats.dist[id] || 0, highlight: id === band })),
    },
    nextLabel: puzzle.isToday && solved ? "Next Squaredle" : null,
    shareText: n ? shareText({
      puzzle, found: n, total, stars, bonus: solved ? state.bonusAtWin : null, hints: hintCount(),
    }) : null,
    extra: null,
  });
}

// ---------------------------------------------------------------- start

paint();

const finished = state.status === "won";
const progressed = state.found.length > 0;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : progressed ? "Continue" : "Play",
  tagline: finished
    ? `Solved · ${state.bonusAtWin} bonus`
    : progressed ? `${answerCount()} / ${total}` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
started = !leaving;
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:squaredle")) { set("seen:squaredle", true); showHelp(); }
