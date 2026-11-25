// Strands — find theme words that tile a 6x8 letter board, plus the spangram.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING, hintsOn, watchHints } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, share, isModalOpen, newGameButton } from "../core/ui.js";
import { loadDictionary, loadJSON } from "../core/words.js";
import { generatePuzzle, isAdjacent, COLS, ROWS, N } from "./strands/generator.js";

const GAME = "strands";
const HINT_COST = 3; // non-theme words per hint

const puzzle = currentPuzzle();
defineSettings(GAME, [HINTS_SETTING]);
const { main } = mountShell({ gameId: GAME, puzzle, onHelp: showHelp, onStats: () => openStats(), extraButtons: [newGameButton()] });

let dict = null;
const dictReady = loadDictionary().then((d) => (dict = d)).catch(() => (dict = new Set()));

let P; // generated puzzle
try {
  const themes = await loadJSON("data/strands/themes.json");
  P = generatePuzzle(themes, puzzle);
} catch (err) {
  main.append(el("p.st-error", "Sorry — today's Strands puzzle could not be loaded."));
  throw err;
}
const WORDS = P.words; // [0] is the spangram
const SPAN = WORDS.findIndex((w) => w.spangram);
const cellWord = new Array(N).fill(-1);
WORDS.forEach((w, i) => w.path.forEach((c) => (cellWord[c] = i)));
const themeWordSet = new Set(WORDS.map((w) => w.word));

const fresh = () => ({
  v: 1, spangram: WORDS[SPAN].word, status: "playing",
  found: [], events: [], nonTheme: [], hintsSpent: 0, hint: null,
});
let state = loadState(GAME, puzzle.id);
if (!state || state.spangram !== WORDS[SPAN].word) state = fresh();
const save = () => saveState(GAME, puzzle.id, state);

// ---------------------------------------------------------------- DOM

const clueEl = el("div.st-clue", P.clue);
const card = el("div.st-card", el("div.st-card-head", "Today's Theme"), el("div.st-card-body", clueEl));
const progressEl = el("p.st-progress");
const hintBtn = el("button.st-hint", { type: "button", onclick: useHint }, el("span", "Hint"));
const resultsBtn = el("button.btn.small.st-results", { type: "button", onclick: () => openStats() }, "View Results");
const wordEl = el("div.st-word", { "aria-live": "polite" });
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "st-lines");
svg.setAttribute("viewBox", `0 0 ${COLS} ${ROWS}`);
svg.setAttribute("aria-hidden", "true");
const cells = P.letters.map((ch, i) =>
  el("div.st-cell", { dataset: { i } }, el("span.st-letter", ch)));
const board = el("div.st-board", { role: "grid", "aria-label": "Letter board" }, svg, cells);

const panel = el("section.st-panel", card, progressEl, el("div.st-actions", hintBtn, resultsBtn));
const play = el("section.st-play", wordEl, el("div.st-boardwrap", board));
main.append(el("div.strands", panel, play));

// ---------------------------------------------------------------- selection

let sel = [];          // selected cell indices
let mode = null;       // "drag" | "tap"
let pointerId = null;
let downCell = -1, dragMoved = false, submitOnUp = false;
let flashTimer = 0;

const lockedCell = (i) => state.found.includes(cellWord[i]) || state.status !== "playing";
const selWord = () => sel.map((i) => P.letters[i]).join("");

function cellAt(e, strict) {
  const r = board.getBoundingClientRect();
  const cw = r.width / COLS, ch = r.height / ROWS;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const c = Math.floor(x / cw), row = Math.floor(y / ch);
  if (c < 0 || c >= COLS || row < 0 || row >= ROWS) return -1;
  if (strict) {
    const dx = x - (c + 0.5) * cw, dy = y - (row + 0.5) * ch;
    if (Math.hypot(dx, dy) > 0.42 * cw) return -1;
  }
  return row * COLS + c;
}

board.addEventListener("pointerdown", (e) => {
  if (state.status !== "playing" || (e.button && e.button !== 0)) return;
  const i = cellAt(e, false);
  if (i < 0 || lockedCell(i)) { clearSel(); return; }
  e.preventDefault();
  pointerId = e.pointerId;
  try { board.setPointerCapture(e.pointerId); } catch {}
  downCell = i;
  dragMoved = false;
  submitOnUp = false;
  const last = sel[sel.length - 1];
  if (mode === "tap" && sel.length && i === last) {
    submitOnUp = true;
  } else if (mode === "tap" && sel.includes(i)) {
    sel = sel.slice(0, sel.indexOf(i) + 1); // back up to an earlier letter
  } else if (mode === "tap" && sel.length && isAdjacent(last, i)) {
    sel.push(i);
  } else {
    sel = [i];
  }
  mode = "tap";
  clearFlash();
  render();
});

board.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointerId || !sel.length) return;
  const i = cellAt(e, true);
  if (i < 0) return;
  const last = sel[sel.length - 1];
  if (i === last) return;
  if (sel.length > 1 && i === sel[sel.length - 2]) { // drag backwards to undo
    sel.pop();
    dragMoved = true;
    submitOnUp = false;
    render();
    return;
  }
  if (sel.includes(i) || lockedCell(i) || !isAdjacent(last, i)) return;
  sel.push(i);
  dragMoved = true;
  submitOnUp = false;
  render();
});

function endPointer(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  if (e.type === "pointercancel") return;
  if (dragMoved) { submit(); return; }
  if (submitOnUp) submit();
}
board.addEventListener("pointerup", endPointer);
board.addEventListener("pointercancel", endPointer);
board.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (isModalOpen() || e.metaKey || e.ctrlKey || e.altKey || state.status !== "playing") return;
  if (e.key === "Enter" && sel.length) { e.preventDefault(); submit(); }
  else if (e.key === "Backspace" && sel.length) { e.preventDefault(); sel.pop(); render(); }
  else if (e.key === "Escape" && sel.length) clearSel();
});

function clearSel() {
  sel = [];
  mode = null;
  render();
}

// ---------------------------------------------------------------- guesses

async function submit() {
  const path = sel.slice();
  const word = selWord();
  sel = [];
  mode = null;
  if (!word) return render();
  if (word.length < 4) { toast("Too short"); flash(word, "bad"); return render(); }

  const wi = WORDS.findIndex((w, k) => !state.found.includes(k) &&
    w.path.length === path.length && w.path.every((c, j) => c === path[j]));
  if (wi >= 0) return foundTheme(wi);

  if (state.found.some((k) => WORDS[k].word === word) || state.nonTheme.includes(word)) {
    toast("Already found");
    flash(word, "bad");
    return render();
  }
  if (!dict) await dictReady;
  if (dict.has(word.toLowerCase()) || themeWordSet.has(word)) {
    const before = available();
    state.nonTheme.push(word);
    save();
    flash(word, "ok");
    if (available() > before) {
      hintBtn.classList.add("st-earned");
      setTimeout(() => hintBtn.classList.remove("st-earned"), 900);
    }
    return render();
  }
  toast("Not in word list");
  flash(word, "bad");
  render();
}

function foundTheme(wi) {
  const w = WORDS[wi];
  state.found.push(wi);
  state.events.push(w.spangram ? "s" : "t");
  if (state.hint && state.hint.idx === wi) state.hint = null;
  if (w.spangram) toast("SPANGRAM!");
  flash(w.word, w.spangram ? "span" : "theme");
  w.path.forEach((c, k) => {
    const node = cells[c];
    node.style.animationDelay = `${k * 45}ms`;
    node.classList.remove("st-pop");
    void node.offsetWidth;
    node.classList.add("st-pop");
  });
  if (state.found.length === WORDS.length) {
    state.status = "won";
    save();
    render();
    finish();
    return;
  }
  save();
  render();
}

// ---------------------------------------------------------------- hints

const available = () => Math.floor(state.nonTheme.length / HINT_COST) - state.hintsSpent;

function useHint() {
  if (state.status !== "playing") return;
  if (available() <= 0) {
    const left = HINT_COST - (state.nonTheme.length % HINT_COST);
    toast(`Find ${left} more non-theme word${left === 1 ? "" : "s"} to earn a hint`, 2000);
    return;
  }
  const h = state.hint;
  if (h && !state.found.includes(h.idx)) {
    if (h.level >= 2) { toast("Find the hinted word first"); return; }
    h.level = 2; // second hint on the same word reveals the letter order
  } else {
    const order = WORDS.map((_, i) => i).filter((i) => i !== SPAN).concat(SPAN);
    const idx = order.find((i) => !state.found.includes(i));
    state.hint = { idx, level: 1 };
  }
  state.hintsSpent++;
  state.events.push("h");
  save();
  clearSel();
}

// ---------------------------------------------------------------- render

const pts = (path) => path.map((c) => `${(c % COLS) + 0.5},${Math.floor(c / COLS) + 0.5}`).join(" ");

function render() {
  const foundSet = new Set(state.found);
  const hint = state.hint && !foundSet.has(state.hint.idx) ? state.hint : null;
  const hintCells = hint ? WORDS[hint.idx].path : [];
  const selSet = new Set(sel);
  cells.forEach((node, i) => {
    const wi = cellWord[i];
    const isFound = foundSet.has(wi);
    node.classList.toggle("st-found", isFound && !WORDS[wi].spangram);
    node.classList.toggle("st-span", isFound && WORDS[wi].spangram);
    node.classList.toggle("st-sel", selSet.has(i));
    node.classList.toggle("st-last", sel.length > 0 && sel[sel.length - 1] === i);
    node.classList.toggle("st-hinted", !isFound && hintCells.includes(i));
    node.classList.toggle("st-hint-first", !!hint && hint.level >= 2 && hintCells[0] === i);
  });

  let lines = "";
  for (const wi of state.found) {
    const w = WORDS[wi];
    lines += `<polyline class="${w.spangram ? "ln-span" : "ln-found"}" points="${pts(w.path)}"/>`;
  }
  if (hint && hint.level >= 2) lines += `<polyline class="ln-hint" points="${pts(hintCells)}"/>`;
  if (sel.length > 1) lines += `<polyline class="ln-sel" points="${pts(sel)}"/>`;
  svg.innerHTML = lines;

  if (sel.length) { wordEl.textContent = selWord(); wordEl.className = "st-word st-building"; }
  else if (!flashTimer) { wordEl.textContent = ""; wordEl.className = "st-word"; }

  const themeCount = WORDS.length;
  const n = state.found.length;
  progressEl.replaceChildren(
    state.status === "won"
      ? el("span", "You found all ", el("b", String(themeCount)), " theme words!")
      : el("span", el("b", String(n)), " of ", el("b", String(themeCount)), " theme words found."));

  const avail = available();
  const progress = avail > 0 ? 1 : (state.nonTheme.length % HINT_COST) / HINT_COST;
  hintBtn.style.setProperty("--fill", `${Math.round(progress * 100)}%`);
  hintBtn.classList.toggle("st-ready", avail > 0);
  hintBtn.setAttribute("aria-label", avail > 0 ? `Hint (${avail} available)` : `Hint (${state.nonTheme.length % HINT_COST} of ${HINT_COST} words toward next hint)`);
  hintBtn.firstChild.textContent = avail > 1 ? `Hint ×${avail}` : "Hint";
  hintBtn.hidden = state.status !== "playing" || !hintsOn(GAME);
  resultsBtn.hidden = state.status === "playing";
  board.classList.toggle("st-done", state.status !== "playing");
}

function flash(word, kind) {
  clearTimeout(flashTimer);
  wordEl.textContent = word;
  wordEl.className = `st-word st-flash st-${kind}`;
  flashTimer = setTimeout(() => {
    flashTimer = 0;
    if (!sel.length) { wordEl.textContent = ""; wordEl.className = "st-word"; }
  }, 1300);
}
function clearFlash() {
  clearTimeout(flashTimer);
  flashTimer = 0;
}

// ---------------------------------------------------------------- finish / stats / share

function hintsBucket(n) { return n >= 4 ? "4+" : String(n); }

function finish() {
  recordResult(GAME, puzzle, { won: true, bucket: hintsBucket(state.hintsSpent) });
  setTimeout(() => toast(state.hintsSpent === 0 ? "Perfect!" : "Splendid!", 2000), 500);
  setTimeout(() => openStats(), 2100);
}

function emojiGrid() {
  const map = { t: "🔵", s: "🟡", h: "💡" };
  const em = state.events.map((e) => map[e]);
  const rows = [];
  for (let i = 0; i < em.length; i += 4) rows.push(em.slice(i, i + 4).join(""));
  return rows.join("\n");
}

function shareText() {
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  return `Oh My WORDS! Strands ${label}\n“${P.clue}”\n${emojiGrid()}`;
}

function openStats() {
  const s = getStats(GAME);
  const won = state.status === "won";
  const perfect = s.dist["0"] || 0;
  const mine = won ? hintsBucket(state.hintsSpent) : null;
  const title = won ? (state.hintsSpent === 0 ? "Perfect!" : "Splendid!") : "Statistics";
  const extra = won
    ? el("div.st-share-preview",
        el("div.st-share-clue", `“${P.clue}”`),
        el("pre.st-share-grid", emojiGrid()),
        el("p.st-share-note", state.hintsSpent === 0
          ? "You solved it without any hints."
          : `You used ${state.hintsSpent} hint${state.hintsSpent === 1 ? "" : "s"}.`))
    : null;
  showStats({
    title,
    message: won ? `You found all ${WORDS.length} theme words.` : null,
    tiles: [
      { label: "Games Played", value: String(s.played) },
      { label: "Perfect Puzzles", value: String(perfect) },
      { label: "Current Streak", value: String(liveStreak(s, todayKey())) },
      { label: "Max Streak", value: String(s.maxStreak) },
    ],
    distribution: {
      title: "Hints Used",
      rows: ["0", "1", "2", "3", "4+"].map((b) => ({ label: b, count: String(s.dist[b] || 0), highlight: b === mine })),
    },
    extra,
    shareText: won ? shareText() : null,
  });
}

// ---------------------------------------------------------------- help

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Find theme words to fill the board.",
    className: "st-help",
    content: [
      el("ul.help-list",
        el("li", "Theme words stay highlighted in ", el("span.st-chip.st-chip-theme", "blue"), " when found."),
        el("li", "Drag or tap letters to create words. If tapping, tap the last letter again to submit."),
        el("li", "Theme words fill the board entirely. No theme words overlap."),
      ),
      el("h3", "Find the “spangram”"),
      el("ul.help-list",
        el("li", "The spangram describes the puzzle’s theme and touches two opposite sides of the board. It may be two words."),
        el("li", "When found, the spangram highlights in ", el("span.st-chip.st-chip-span", "yellow"), "."),
        el("li", "The spangram can be found at any time."),
      ),
      el("h3", "Need a hint?"),
      el("ul.help-list",
        el("li", "Find non-theme words (4+ letters) to get hints."),
        el("li", `For every ${HINT_COST} non-theme words you find, you earn a hint.`),
        el("li", "Hints outline the letters of a theme word. If there is already an active hint on the board, a hint will show that word’s letter order. Hints can be turned off in Settings."),
      ),
    ],
  });
}

// ---------------------------------------------------------------- start

render();
watchHints(GAME, () => render());
const hasProgress = state.found.length || state.nonTheme.length || state.hintsSpent;
const choice = await splash({
  gameId: GAME, puzzle,
  playLabel: state.status === "won" ? "See Stats" : hasProgress ? "Continue" : "Play",
});
if (state.status === "won" && choice === "play") openStats();
else if (!get("seen:strands")) { set("seen:strands", true); showHelp(); }
