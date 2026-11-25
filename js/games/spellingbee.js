// Spelling Bee — make words from seven letters, always using the center one. Today's puzzle, any past day, or a new one any time.
import { addDays, currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING, hintsOn } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, ICONS } from "../core/ui.js";
import { loadDictionary, loadJSON } from "../core/words.js";
import {
  GENIUS, MIN_LEN, QUEEN, RANKS,
  hintGrid, isPangram, judge, pointsFor, puzzleFor, rankFor, shareText, threshold, wordPool,
} from "./spellingbee/logic.js";

const GAME = "spellingbee";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "sortFound", label: "Sort Found Words", type: "select", default: "alpha",
    options: [["alpha", "Alphabetically"], ["recent", "Most recent first"]],
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.found.length) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.sb-again",
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
const hintsBtn = hintButton(GAME, () => showHints(), "Hints");
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintsBtn, newBtn],
});

const [list, dictionary] = await Promise.all([loadJSON("data/words/bee-words.json"), loadDictionary()]);
const pool = wordPool(list);
const built = puzzleFor(puzzle, pool);
const { letters, center, total } = built;

// ---------------------------------------------------------------- state
// found: answers in the order found. status turns "won" at Genius; play continues to Queen Bee.

function freshState() {
  return { v: 1, letters: letters.join(""), found: [], status: "playing" };
}

const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && saved.letters === letters.join("") && Array.isArray(saved.found)
  ? { ...freshState(), found: [...new Set(saved.found.filter((w) => built.answers.includes(w)))], status: saved.status === "won" ? "won" : "playing" }
  : freshState();

const save = () => saveState(GAME, puzzle.id, state);
const score = () => state.found.reduce((sum, w) => sum + pointsFor(w, letters), 0);
const rank = () => rankFor(score(), total);

/** Best rank reached on each daily puzzle, for the rank distribution. */
function noteBest() {
  if (!puzzle.isDaily) return;
  const best = get("spellingbee:best", {});
  if ((best[puzzle.id] ?? -1) < rank()) {
    best[puzzle.id] = rank();
    set("spellingbee:best", best);
  }
}

// ---------------------------------------------------------------- DOM

const rankName = el("span.sb-rank-name");
const scoreEl = el("span.sb-score");
const dots = RANKS.map((_, i) => el("span.sb-dot", { dataset: { i: String(i) } }));
const fillEl = el("div.sb-fill");
const rankBar = el("button.sb-rankbar", { type: "button", "aria-label": "Rankings", onclick: () => showRanks() },
  rankName, el("div.sb-track", fillEl, dots), scoreEl);

const foundHead = el("span.sb-found-head");
const foundPeek = el("span.sb-found-peek");
const foundList = el("ul.sb-found-list");
const foundBox = el("div.sb-found",
  el("button.sb-found-bar", { type: "button", "aria-expanded": "false", onclick: () => toggleFound() },
    foundHead, foundPeek, el("span.sb-caret", "▾")),
  foundList);

const entryEl = el("div.sb-entry", { "aria-live": "polite" });
const cells = [];
const hive = el("div.sb-hive", { role: "group", "aria-label": "Letters" });
for (let i = 0; i < 7; i++) {
  const cell = el(`button.sb-cell${i === 0 ? ".is-center" : ""}`, {
    type: "button", dataset: { pos: String(i) },
  }, el("span.sb-letter"));
  cell.addEventListener("pointerdown", (e) => { e.preventDefault(); press(i); });
  cell.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    press(i);
  });
  cells.push(cell);
  hive.append(cell);
}
const actions = el("div.sb-actions",
  el("button.btn.secondary.sb-btn", { type: "button", onclick: () => backspace() }, "Delete"),
  el("button.btn.secondary.sb-btn.sb-round", { type: "button", "aria-label": "Shuffle letters", html: ICONS.shuffle, onclick: () => shuffleOuter() }),
  el("button.btn.secondary.sb-btn", { type: "button", onclick: () => submit() }, "Enter"));

const gameEl = el("div.sb-game",
  el("div.sb-status", rankBar, foundBox),
  el("div.sb-play", entryEl, hive, actions));
main.append(gameEl);

let typed = "";
let clearTimer = 0;
let outer = [...built.outer];
let open = false;

// ---------------------------------------------------------------- paint

function paintLetters() {
  const order = [center, ...outer];
  cells.forEach((cell, i) => {
    cell.querySelector(".sb-letter").textContent = order[i].toUpperCase();
    cell.setAttribute("aria-label", `${order[i].toUpperCase()}${i === 0 ? ", center letter" : ""}`);
  });
}

function paintEntry() {
  entryEl.replaceChildren(...[...typed].map((ch) => el(
    `span${ch === center ? ".is-center" : letters.includes(ch) ? "" : ".is-bad"}`, ch.toUpperCase(),
  )), el("span.sb-cursor"));
  entryEl.setAttribute("aria-label", typed ? `Word: ${typed.toUpperCase()}` : "Type or tap letters");
}

function paint() {
  const s = score();
  const r = rank();
  rankName.textContent = RANKS[r].name;
  scoreEl.textContent = String(s);
  fillEl.style.width = `${(r / (RANKS.length - 1)) * 100}%`;
  dots.forEach((d, i) => {
    d.classList.toggle("on", i <= r);
    d.classList.toggle("current", i === r);
    d.style.left = `${(i / (RANKS.length - 1)) * 100}%`;
  });
  rankBar.setAttribute("aria-label", `Rank ${RANKS[r].name}, ${s} points. Show rankings`);

  const n = state.found.length;
  foundHead.textContent = `You have found ${n} word${n === 1 ? "" : "s"}`;
  const words = getSetting(GAME, "sortFound") === "recent" ? [...state.found].reverse() : [...state.found].sort();
  foundPeek.textContent = n ? [...state.found].reverse().slice(0, 8).map(cap).join(" ") : "";
  foundList.replaceChildren(...words.map((w) => el(`li${isPangram(w, letters) ? ".is-pangram" : ""}`, cap(w))));
  foundBox.classList.toggle("open", open);
  foundBox.querySelector(".sb-found-bar").setAttribute("aria-expanded", String(open));
  paintEntry();
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);

// ---------------------------------------------------------------- input

function press(i) {
  if (isModalOpen()) return;
  const ch = i === 0 ? center : outer[i - 1];
  addLetter(ch);
  cells[i].classList.remove("tap");
  void cells[i].offsetWidth;
  cells[i].classList.add("tap");
}

function addLetter(ch) {
  if (clearTimer) {
    // A rejected word is still showing: start the new word fresh.
    clearTimeout(clearTimer);
    clearTimer = 0;
    typed = "";
  }
  if (typed.length >= 19) return;
  typed += ch;
  paintEntry();
}

function backspace() {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = 0; typed = ""; }
  typed = typed.slice(0, -1);
  paintEntry();
}

function shuffleOuter() {
  const a = [...outer];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  outer = a;
  paintLetters();
}

function toggleFound() {
  open = !open;
  paint();
}

function submit() {
  if (isModalOpen() || !typed) return;
  const word = typed;
  const problem = judge(word, built, state.found, dictionary);
  if (problem) {
    toast(problem);
    entryEl.classList.remove("shake");
    void entryEl.offsetWidth;
    entryEl.classList.add("shake");
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearTimer = 0; typed = ""; paintEntry(); }, 600);
    return;
  }
  const before = rank();
  state.found.push(word);
  typed = "";
  const pts = pointsFor(word, letters);
  const pangram = isPangram(word, letters);
  const after = rank();
  if (after >= GENIUS && state.status !== "won") {
    state.status = "won";
    recordResult(GAME, puzzle, { won: true, bucket: "Genius" });
  }
  save();
  noteBest();
  paint();
  if (after > before) {
    toast(after === QUEEN ? "Queen Bee! You found them all" : `${RANKS[after].name}!`, 1800);
    if (after === GENIUS || after === QUEEN) setTimeout(() => { if (!isModalOpen()) openStats(); }, 1200);
  } else {
    toast(pangram ? `Pangram! +${pts}` : `${word.length === MIN_LEN ? "Good!" : word.length < 7 ? "Nice!" : "Awesome!"} +${pts}`);
  }
}

document.addEventListener("keydown", (e) => {
  if (isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector(".splash") || document.querySelector(".drawer.open")) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); addLetter(e.key.toLowerCase()); return; }
  if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
  if (e.key === "Enter") {
    if (e.target.closest && e.target.closest("button")) return;
    e.preventDefault();
    submit();
    return;
  }
  if (e.key === " ") {
    if (e.target.closest && e.target.closest("button")) return;
    e.preventDefault();
    shuffleOuter();
  }
});

onSettingsChange(() => paint());

// ---------------------------------------------------------------- modals

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Create words using letters from the hive.",
    content: [
      el("ul.help-list",
        el("li", `Words must contain at least ${MIN_LEN} letters.`),
        el("li", "Words must include the center letter."),
        el("li", "Letters can be used more than once. Our word list doesn't include obscure words, hyphenated words, or proper nouns."),
        el("li", "Tap letters or type them, then press Enter. Space shuffles the outer letters.")),
      el("div.help-examples",
        el("p", el("strong", "Score points to increase your rating.")),
        el("ul.help-list",
          el("li", "4-letter words are worth 1 point each."),
          el("li", "Longer words earn 1 point per letter."),
          el("li", "Each puzzle includes at least one pangram, which uses every letter. These are worth 7 extra points!"))),
      el("p", "Reach Genius to finish the puzzle for your stats and streak, then keep going for Queen Bee. The 💡 button shows hints (they can be turned off in Settings). Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function showRanks() {
  const r = rank();
  showModal({
    title: "Rankings",
    subtitle: "Ranks are based on a percentage of possible points in a puzzle.",
    content: el("ul.sb-ranks", RANKS.map((rk, i) => el(`li${i === r ? ".current" : ""}`,
      el("span", rk.name), el("span", String(threshold(i, total)))))),
  });
}

function showHints() {
  const found = new Set(state.found);
  const left = built.answers.filter((w) => !found.has(w));
  const { lengths, firsts, grid, twos } = hintGrid(left);
  const pangramsLeft = built.pangrams.filter((w) => !found.has(w)).length;
  const table = left.length ? el("table.sb-grid",
    el("thead", el("tr", el("th", ""), lengths.map((n) => el("th", String(n))), el("th", "Σ"))),
    el("tbody", firsts.map((f, r) => el("tr",
      el("th", f.toUpperCase()),
      grid[r].map((c) => el("td", c ? String(c) : "-")),
      el("td.sum", String(grid[r].reduce((a, b) => a + b, 0))))))) : null;
  showModal({
    title: "Hints",
    subtitle: left.length
      ? `${left.length} word${left.length === 1 ? "" : "s"} left · ${score()} of ${total} points · ${pangramsLeft} pangram${pangramsLeft === 1 ? "" : "s"} to find`
      : "You found every word!",
    className: "sb-hints",
    content: [
      el("p.sb-hint-note", "Words you haven't found yet, by first letter and length:"),
      table,
      left.length ? el("p.sb-hint-note", "Two-letter starts:") : null,
      left.length ? el("div.sb-twos", Object.keys(twos).sort().map((k) => el("span", `${k.toUpperCase()}-${twos[k]}`))) : null,
      puzzle.isDaily ? el("div.sb-again",
        el("button.btn.small.secondary", { type: "button", onclick: () => showYesterday() }, "Yesterday's answers")) : null,
    ],
  });
}

function showYesterday() {
  const day = addDays(puzzle.date, -1);
  const prev = puzzleFor({ id: day, date: day, isDaily: true }, pool);
  const mine = new Set((loadState(GAME, day) || {}).found || []);
  showModal({
    title: "Yesterday's Answers",
    subtitle: `${prev.center.toUpperCase()} ${prev.outer.join("").toUpperCase()} · ${prev.answers.length} words · ${prev.total} points`,
    className: "sb-hints",
    content: el("ul.sb-yesterday", prev.answers.map((w) => el(
      `li${isPangram(w, prev.letters) ? ".is-pangram" : ""}${mine.has(w) ? ".is-mine" : ""}`, cap(w)))),
  });
}

function openStats() {
  const stats = getStats(GAME);
  const best = get("spellingbee:best", {});
  const counts = RANKS.map((_, i) => Object.values(best).filter((b) => b === i).length);
  const r = rank();
  const s = score();
  const pangramsFound = state.found.filter((w) => isPangram(w, letters)).length;
  const text = state.found.length ? shareText({ puzzle, rank: r, score: s, words: state.found.length, pangrams: pangramsFound }) : null;
  showStats({
    title: state.found.length ? RANKS[r].name : undefined,
    top: state.found.length ? el("div.sb-summary",
      el("div.sb-summary-line", `${s} of ${total} points · ${state.found.length} of ${built.answers.length} words · ${pangramsFound} of ${built.pangrams.length} pangram${built.pangrams.length === 1 ? "" : "s"}`),
      r < QUEEN ? el("div.sb-summary-next", `${threshold(r + 1, total) - s} more point${threshold(r + 1, total) - s === 1 ? "" : "s"} to ${RANKS[r + 1].name}`) : null) : null,
    tiles: [
      { label: "Geniuses", value: String(stats.won) },
      { label: "Queen Bees", value: String(counts[QUEEN]) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: {
      title: "Best Rank (daily puzzles)",
      rows: RANKS.map((rk, i) => ({ label: rk.name, count: counts[i], highlight: puzzle.isDaily && i === r && state.found.length > 0 })).reverse(),
    },
    nextLabel: puzzle.isToday && state.status === "won" ? "Next Spelling Bee" : null,
    shareText: text,
    extra: hintsOn(GAME) ? el("div.sb-again",
      el("button.btn.secondary", { type: "button", onclick: () => showHints() }, "Hints")) : null,
  });
}

// ---------------------------------------------------------------- start

paintLetters();
paint();

const started = state.found.length > 0;
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: started ? "Continue" : "Play",
  tagline: started ? `${RANKS[rank()].name} · ${score()} points · ${state.found.length} word${state.found.length === 1 ? "" : "s"}` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && !get("seen:spellingbee")) { set("seen:spellingbee", true); showHelp(); }
