// Wordle — faithful to the NYT game, plus Wordle+1 (6 letters, 7 tries).
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, isDark, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, newGameButton, ICONS } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import {
  VARIANTS, MODE_STORAGE_KEY, modeFromName,
  scoreGuess, hardModeError, keyStates, answerFor, shareText, nextHint, maxHints,
} from "./wordle/logic.js";

const SETTINGS = "wordle";
const FLIP_STAGGER = 300; // ms between tiles

// Read mode before currentPuzzle() rewrites a practice URL.
const requestedMode = modeFromName(new URLSearchParams(location.search).get("mode"));
const puzzle = currentPuzzle();

function initialMode() {
  if (requestedMode) return requestedMode;
  return modeFromName(new URLSearchParams(location.search).get("mode"))
    || (get(MODE_STORAGE_KEY) === "plus" ? "plus" : "wordle");
}

let mode = initialMode();
let state = { guesses: [], status: "playing", hard: false };
let answer = "";
let validSet = new Set();
let current = "";
let busy = false;
const states = {};
const drafts = { wordle: "", plus: "" };
const packs = {};

const variant = () => VARIANTS[mode];
const midGame = () => state.status === "playing" && state.guesses.length > 0;
const rows = () => state.guesses.map((g) => ({ guess: g, result: scoreGuess(g, answer) }));
const save = () => saveState(variant().id, puzzle.id, state);

defineSettings(SETTINGS, [
  {
    key: "hardMode", label: "Hard Mode", type: "toggle", default: false,
    desc: "Any revealed hints must be used in subsequent guesses",
    // Turning it OFF mid-round is allowed (as on NYT); turning it ON is not.
    lockedWhen: () => midGame() && !getSetting(SETTINGS, "hardMode"),
    lockedMessage: "Hard mode can only be enabled at the start of a round",
  },
  {
    key: "highContrast", label: "High Contrast Mode", type: "toggle", default: false,
    desc: "Contrast and colorblindness improvements",
  },
  {
    key: "onscreenOnly", label: "Onscreen Keyboard Input Only", type: "toggle", default: false,
    desc: "Ignore key input except from the onscreen keyboard. Most helpful for users using speech recognition or other assistive devices",
  },
  HINTS_SETTING,
]);

const hintBtn = hintButton(SETTINGS, () => useHint());
const { main } = mountShell({
  gameId: SETTINGS, puzzle, onHelp: showHelp, onStats: openStats, extraButtons: [hintBtn, newGameButton()],
  practice: () => { location.href = practiceHref(); },
});

onSettingsChange(({ scope, key, value }) => {
  if (scope === SETTINGS && key === "hardMode" && !value && midGame()) {
    state.hard = false;
    save();
  }
});

// ---------------------------------------------------------------- data

async function loadPack(key) {
  const v = VARIANTS[key];
  const [answers, valid] = await Promise.all([loadJSON(v.answers), loadJSON(v.valid)]);
  const set = new Set(valid);
  answers.forEach((w) => set.add(w));
  return { validSet: set, answer: answerFor(puzzle, answers, { gameId: v.id, salt: v.salt }) };
}

const [wordlePack, plusPack] = await Promise.all([loadPack("wordle"), loadPack("plus")]);
packs.wordle = wordlePack;
packs.plus = plusPack;

function stateFor(key) {
  if (states[key]) return states[key];
  const v = VARIANTS[key];
  let saved = loadState(v.id, puzzle.id);
  const guessesOk = saved && Array.isArray(saved.guesses)
    && saved.guesses.every((g) => typeof g === "string" && g.length === v.wordLen);
  if (!guessesOk) saved = { guesses: [], status: "playing", hard: false };
  // hints: answer positions revealed by the 💡 button, in the order used.
  saved.hints = Array.isArray(saved.hints)
    ? [...new Set(saved.hints.filter((i) => Number.isInteger(i) && i >= 0 && i < v.wordLen))] : [];
  if (saved.status !== "won" && saved.status !== "lost") {
    const solved = saved.guesses.length > 0 && saved.guesses[saved.guesses.length - 1] === packs[key].answer;
    if (solved) saved.status = "won";
    else if (saved.guesses.length >= v.maxGuesses) saved.status = "lost";
    else saved.status = "playing";
  }
  states[key] = saved;
  return saved;
}

function activate(key) {
  mode = key;
  state = stateFor(key);
  answer = packs[key].answer;
  validSet = packs[key].validSet;
  current = (drafts[key] || "").slice(0, VARIANTS[key].wordLen);
}

activate(mode);

// ---------------------------------------------------------------- DOM

let tiles = [];
let rowEls = [];
const switchers = [];

const board = el("div.wd-board", { role: "group", "aria-label": "Game board" });
const boardWrap = el("div.wd-board-wrap", board);

const keyEls = {};
const KB = ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"];
const keyboard = el("div.wd-keyboard", { role: "group", "aria-label": "Keyboard" },
  KB.map((line, i) => el("div.wd-kb-row",
    i === 1 && el("div.wd-spacer"),
    [...line].map((ch) => {
      let k;
      if (ch === "+") k = el("button.wd-key.wide", { type: "button", dataset: { key: "enter" } }, "enter");
      else if (ch === "-") k = el("button.wd-key.wide", { type: "button", dataset: { key: "backspace" }, "aria-label": "backspace", html: ICONS.backspace });
      else { k = el("button.wd-key", { type: "button", dataset: { key: ch } }, ch); keyEls[ch] = k; }
      return k;
    }),
    i === 1 && el("div.wd-spacer"),
  )),
);
keyboard.addEventListener("click", (e) => {
  const k = e.target.closest(".wd-key");
  if (!k) return;
  k.blur();
  handleKey(k.dataset.key);
});

function makeSwitcher() {
  const buttons = {};
  const note = el("p.wd-mode-note");
  const switcher = el("div.wd-mode-switch", { role: "tablist", "aria-label": "Wordle or Wordle+1" });
  for (const [key, v] of Object.entries(VARIANTS)) {
    const b = el("button", {
      type: "button", role: "tab", id: `wd-mode-${key}-${switchers.length}`,
      onclick: () => setMode(key),
    }, v.label);
    buttons[key] = b;
    switcher.append(b);
  }
  switcher.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const order = Object.keys(VARIANTS);
    const i = order.indexOf(mode);
    const step = e.key === "ArrowRight" ? 1 : -1;
    setMode(order[(i + step + order.length) % order.length]);
  });
  const node = el("div.wd-modes", switcher, note);
  node.paint = () => {
    for (const [key, b] of Object.entries(buttons)) {
      const on = key === mode;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      b.disabled = busy;
    }
    const v = variant();
    note.textContent = `${v.wordLen} letters · ${v.maxGuesses} tries`;
  };
  switchers.push(node);
  return node;
}

const hintStrip = el("div.wd-hints", { "aria-live": "polite" });

main.append(el("div.wd-game", makeSwitcher(), hintStrip, boardWrap, keyboard));

function buildBoard() {
  const v = variant();
  tiles = [];
  rowEls = [];
  board.replaceChildren();
  board.style.setProperty("--rows", String(v.maxGuesses));
  board.style.setProperty("--cols", String(v.wordLen));
  board.setAttribute("aria-label", `${v.label} board`);
  for (let r = 0; r < v.maxGuesses; r++) {
    const row = el("div.wd-row", { role: "group", "aria-label": `Row ${r + 1}` });
    const rowTiles = [];
    for (let c = 0; c < v.wordLen; c++) {
      const t = el("div.wd-tile", { dataset: { state: "empty" }, "aria-label": "empty" });
      rowTiles.push(t);
      row.append(t);
    }
    tiles.push(rowTiles);
    rowEls.push(row);
    board.append(row);
  }
  fit();
}

// Size tiles from the space actually available (no scrolling, 320px → desktop).
const fit = () => {
  const gap = 5;
  const v = variant();
  const w = boardWrap.clientWidth - 20;
  const h = boardWrap.clientHeight - 20;
  const size = Math.max(20, Math.floor(Math.min(
    (h - gap * (v.maxGuesses - 1)) / v.maxGuesses,
    (w - gap * (v.wordLen - 1)) / v.wordLen,
    62,
  )));
  board.style.setProperty("--tile", `${size}px`);
};
new ResizeObserver(fit).observe(boardWrap);

// ---------------------------------------------------------------- rendering

function paintRow(r, guess, result) {
  const len = variant().wordLen;
  for (let c = 0; c < len; c++) {
    const t = tiles[r][c];
    const ch = guess[c] || "";
    t.textContent = ch;
    const st = result ? result[c] : ch ? "tbd" : "empty";
    t.dataset.state = st;
    t.setAttribute("aria-label", ch ? `${ch} ${result ? result[c] : ""}`.trim() : "empty");
  }
}

function paintHints() {
  const len = variant().wordLen;
  hintStrip.hidden = !state.hints.length;
  hintStrip.setAttribute("aria-label", `Hint letters: ${[...answer].map((ch, i) => (state.hints.includes(i) ? ch : "blank")).join(", ")}`);
  hintStrip.replaceChildren(el("span.wd-hints-label", "Hint"), ...Array.from({ length: len }, (_, i) =>
    el("div.wd-tile.small", { dataset: { state: state.hints.includes(i) ? "correct" : "empty" } },
      state.hints.includes(i) ? answer[i] : "")));
}

function paintKeys() {
  const ks = keyStates(rows());
  for (const i of state.hints) ks[answer[i]] = "correct";
  for (const [ch, k] of Object.entries(keyEls)) {
    if (ks[ch]) k.dataset.state = ks[ch];
    else delete k.dataset.state;
  }
}

function paintAll() {
  const rs = rows();
  const max = variant().maxGuesses;
  for (let r = 0; r < max; r++) {
    if (r < rs.length) paintRow(r, rs[r].guess, rs[r].result);
    else if (r === rs.length && state.status === "playing") paintRow(r, current);
    else paintRow(r, "");
  }
  paintKeys();
  paintHints();
}

function splashCopy() {
  const v = variant();
  const n = state.guesses.length;
  const finished = state.status !== "playing";
  return {
    playLabel: finished ? "See Stats" : n ? "Continue" : "Play",
    tagline: finished
      ? "Great job on today's puzzle! Check out your progress."
      : n ? `You've made ${n} of ${v.maxGuesses} guesses. Keep it up!` : v.tagline,
  };
}

function syncChrome() {
  const v = variant();
  document.title = `${v.label} — Oh My WORDS!`;
  const h1 = document.querySelector(".app-title");
  if (h1) {
    const text = [...h1.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (text) text.textContent = v.label;
  }
  for (const s of switchers) if (s.isConnected && s.paint) s.paint();
  if (!document.querySelector(".splash")) return;
  const copy = splashCopy();
  const splashH = document.querySelector(".splash h1");
  const splashTag = document.querySelector(".splash .tagline");
  const splashBtn = document.querySelector(".splash .actions > button");
  if (splashH) splashH.textContent = v.label;
  if (splashTag) splashTag.textContent = copy.tagline;
  if (splashBtn) splashBtn.textContent = copy.playLabel;
}

function writeMode(key) {
  set(MODE_STORAGE_KEY, key);
  const q = new URLSearchParams(location.search);
  if (key === "plus") q.set("mode", "plus");
  else q.delete("mode");
  const s = q.toString();
  const next = s ? `${location.pathname}?${s}` : location.pathname;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
}

function setMode(next) {
  if (next === mode || busy || !VARIANTS[next]) return;
  const holder = document.activeElement && document.activeElement.closest
    && document.activeElement.closest(".wd-mode-switch");
  drafts[mode] = current;
  activate(next);
  writeMode(next);
  buildBoard();
  paintAll();
  syncChrome();
  const btn = holder && holder.querySelector('[aria-selected="true"]');
  if (btn) btn.focus();
  maybeIntro();
}

function setBusy(value) {
  busy = value;
  for (const s of switchers) if (s.isConnected && s.paint) s.paint();
}

const animate = (node, name) => new Promise((resolve) => {
  let settled = false;
  let timer;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    node.removeEventListener("animationend", finish);
    delete node.dataset.animation;
    resolve();
  };
  node.dataset.animation = name;
  node.addEventListener("animationend", finish);
  // If the animation never starts (reduced motion, a hidden tab), don't stick the board.
  const backup = name === "bounce" ? 1200 : name === "shake" ? 800 : 400;
  timer = setTimeout(finish, backup);
});

function reveal(r, result) {
  const len = variant().wordLen;
  return new Promise((resolve) => {
    for (let c = 0; c < len; c++) {
      const t = tiles[r][c];
      setTimeout(async () => {
        await animate(t, "flip-in");
        t.dataset.state = result[c];
        t.setAttribute("aria-label", `${t.textContent} ${result[c]}`);
        await animate(t, "flip-out");
        if (c === len - 1) resolve();
      }, c * FLIP_STAGGER);
    }
  });
}

function bounce(r) {
  tiles[r].forEach((t, c) => setTimeout(() => animate(t, "bounce"), c * 100));
}

function shake() {
  animate(rowEls[state.guesses.length], "shake");
}

// ---------------------------------------------------------------- hints

function useHint() {
  if (busy || state.status !== "playing") { toast(state.status === "playing" ? "One moment" : "The round is over"); return; }
  if (state.hints.length >= maxHints(variant().wordLen)) { toast("No more hints"); return; }
  const i = nextHint(answer, rows(), state.hints);
  if (i < 0) { toast("You already know every letter's spot"); return; }
  state.hints.push(i);
  save();
  paintHints();
  paintKeys();
  toast(`Letter ${i + 1} is ${answer[i].toUpperCase()}`, 2000);
}

// ---------------------------------------------------------------- input

function handleKey(key) {
  if (busy || state.status !== "playing") return;
  const r = state.guesses.length;
  const len = variant().wordLen;
  if (key === "enter") return submit();
  if (key === "backspace") {
    if (!current) return;
    current = current.slice(0, -1);
    drafts[mode] = current;
    paintRow(r, current);
    return;
  }
  if (/^[a-z]$/.test(key) && current.length < len) {
    current += key;
    drafts[mode] = current;
    paintRow(r, current);
    animate(tiles[r][current.length - 1], "pop");
  }
}

async function submit() {
  const len = variant().wordLen;
  const max = variant().maxGuesses;
  if (current.length < len) { shake(); toast("Not enough letters"); return; }
  if (!validSet.has(current)) { shake(); toast("Not in word list"); return; }
  const hard = state.guesses.length ? state.hard : !!getSetting(SETTINGS, "hardMode");
  if (hard) {
    const err = hardModeError(current, rows());
    if (err) { shake(); toast(err); return; }
  }
  if (!state.guesses.length) state.hard = hard;
  const guess = current;
  const r = state.guesses.length;
  state.guesses.push(guess);
  current = "";
  drafts[mode] = "";
  const won = guess === answer;
  if (won) state.status = "won";
  else if (state.guesses.length >= max) state.status = "lost";
  save();
  if (state.status !== "playing") {
    recordResult(variant().id, puzzle, { won, bucket: won ? String(state.guesses.length) : "X" });
  }

  setBusy(true);
  await reveal(r, scoreGuess(guess, answer));
  paintKeys();
  setBusy(false);

  if (won) {
    toast(variant().winWords[r] || "Phew", 2000);
    bounce(r);
    const finishedMode = mode;
    setTimeout(() => { if (mode === finishedMode) openStats(); }, 2000);
  } else if (state.status === "lost") {
    toast(answer.toUpperCase(), 8000);
    const finishedMode = mode;
    setTimeout(() => { if (mode === finishedMode) openStats(); }, 2000);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
  if (document.querySelector(".splash")) return;
  if (e.target && e.target.closest && e.target.closest(".wd-mode-switch")) return;
  if (getSetting(SETTINGS, "onscreenOnly")) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Enter") { e.preventDefault(); handleKey("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); handleKey("backspace"); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
});

// ---------------------------------------------------------------- modals

const EXAMPLES = {
  wordle: [
    ["weary", 0, "correct", "W", " is in the word and in the correct spot."],
    ["pills", 1, "present", "I", " is in the word but in the wrong spot."],
    ["vague", 3, "absent", "U", " is not in the word in any spot."],
  ],
  plus: [
    ["winter", 0, "correct", "W", " is in the word and in the correct spot."],
    ["bridge", 1, "present", "I", " is in the word but in the wrong spot."],
    ["around", 3, "absent", "U", " is not in the word in any spot."],
  ],
};

function exampleRow(word, idx, st) {
  return el("div.wd-example-row", [...word].map((ch, i) =>
    el("div.wd-tile.small", { dataset: { state: i === idx ? st : "tbd" } }, ch)));
}

function practiceHref() {
  return mode === "plus" ? "?random=1&mode=plus" : "?random=1";
}

function showHelp() {
  const v = variant();
  showModal({
    title: "How To Play",
    subtitle: `Guess the ${v.label} in ${v.maxGuesses} tries.`,
    className: "wd-help",
    content: [
      el("ul.help-list",
        el("li", `Each guess must be a valid ${v.wordLen}-letter word.`),
        el("li", "The color of the tiles will change to show how close your guess was to the word."),
        el("li", "Stuck? The 💡 button reveals one letter in its spot. Hints can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "Examples")),
        ...EXAMPLES[mode].map(([word, idx, st, letter, text]) =>
          el("div.example", exampleRow(word, idx, st),
            el("p", el("strong", letter), text)))),
      el("p.wd-help-foot",
        `${v.label} uses ${v.wordLen} letters and ${v.maxGuesses} tries. Wordle and Wordle+1 keep separate scores. A new puzzle is released daily at midnight. Want more? Try `,
        el("a", { href: practiceHref() }, "a practice puzzle"), "."),
    ],
  });
}

function openStats() {
  const v = variant();
  const stats = getStats(v.id);
  const done = state.status !== "playing";
  const n = state.guesses.length;
  const dist = Array.from({ length: v.maxGuesses }, (_, i) => ({
    label: String(i + 1),
    count: stats.dist[String(i + 1)] || 0,
    highlight: state.status === "won" && n === i + 1,
  }));
  showStats({
    title: state.status === "won" ? "Congratulations!" : state.status === "lost" ? "Thanks for playing!" : undefined,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Guess Distribution", rows: dist },
    nextLabel: done ? `Next ${v.label}` : null,
    shareText: done ? shareText({
      puzzle, rows: rows(), won: state.status === "won", hard: !!state.hard,
      dark: isDark(), highContrast: !!getSetting(SETTINGS, "highContrast"),
      maxGuesses: v.maxGuesses, name: v.label, hints: state.hints.length,
    }) : null,
  });
}

function maybeIntro() {
  if (document.querySelector(".splash")) return;
  if (state.status !== "playing" || state.guesses.length || current) return;
  const key = `seen:${variant().id}`;
  if (get(key)) return;
  set(key, true);
  showHelp();
}

// ---------------------------------------------------------------- start

buildBoard();
paintAll();
writeMode(mode);
syncChrome();

const copy = splashCopy();
const splashPromise = splash({
  gameId: SETTINGS,
  puzzle,
  playLabel: copy.playLabel,
  tagline: copy.tagline,
  beforeActions: makeSwitcher(),
});
syncChrome();
await splashPromise;

if (state.status !== "playing") openStats();
else maybeIntro();
