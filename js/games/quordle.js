// Quordle classic — four words, nine guesses, any time you want another.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, ICONS } from "../core/ui.js";
import { loadWordleAnswers, loadWordleValid } from "../core/words.js";
import {
  WORD_LEN, BOARDS, MAX_GUESSES, WIN_WORDS,
  answersFor, boardRows, boardSolved, keyboardInfo, shareText, finishingGuess, nextHint,
} from "./quordle/logic.js";

const GAME = "quordle";
const puzzle = currentPuzzle();
const FLIP_STAGGER = 250;
const FLIP_HALF = 220;

let state = loadState(GAME, puzzle.id);
if (!state || !Array.isArray(state.guesses)) state = { guesses: [], status: "playing" };
// hints: [board, position] pairs revealed by the 💡 button.
state.hints = Array.isArray(state.hints)
  ? state.hints.filter((h) => Array.isArray(h) && h.length === 2 && h.every(Number.isInteger)
    && h[0] >= 0 && h[0] < BOARDS && h[1] >= 0 && h[1] < WORD_LEN) : [];

defineSettings(GAME, [
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

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.guesses.length) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. The new one is a practice puzzle, so it does not count toward your streak, and you can start another whenever you want."),
        el("div.qd-again",
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
  gameId: GAME, puzzle, onHelp: showHelp, onStats: () => openStats(), extraButtons: [hintBtn, newBtn],
});

const [answerList, validList] = await Promise.all([loadWordleAnswers(), loadWordleValid()]);
const answers = answersFor(puzzle, answerList);
const validSet = new Set(validList);
answerList.forEach((w) => validSet.add(w));

const save = () => saveState(GAME, puzzle.id, state);
const rowsOf = (i) => boardRows(state.guesses, answers[i]);
const solvedOf = (i) => boardSolved(rowsOf(i), answers[i]);

// ---------------------------------------------------------------- DOM

let current = "";
let busy = false;

const statusEl = el("p.qd-status", { "aria-live": "polite" });
const boardsEl = el("div.qd-boards");
const boards = [];

for (let b = 0; b < BOARDS; b++) {
  const tiles = [];
  const rowEls = [];
  const grid = el("div.qd-grid", { role: "group" });
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = el("div.wd-row", { role: "group", "aria-label": `Guess ${r + 1}` });
    tiles.push([]);
    for (let c = 0; c < WORD_LEN; c++) {
      const t = el("div.wd-tile", { dataset: { state: "empty" }, "aria-label": "empty" });
      tiles[r].push(t);
      row.append(t);
    }
    rowEls.push(row);
    grid.append(row);
  }
  const banner = el("div.qd-banner",
    el("div.label", "Solved"),
    el("div.wd-row.qd-solved-row"),
  );
  const missed = el("div.qd-answer");
  const node = el("section.qd-board", { "aria-label": `Board ${b + 1}` }, grid, banner, missed);
  boards.push({ node, tiles, rowEls, banner, missed });
  boardsEl.append(node);
}

const keyEls = {};
const KB = ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"];
const keyboard = el("div.wd-keyboard", { role: "group", "aria-label": "Keyboard" },
  KB.map((line, i) => el("div.wd-kb-row",
    i === 1 && el("div.wd-spacer"),
    [...line].map((ch) => {
      if (ch === "+") return el("button.wd-key.wide", { type: "button", dataset: { key: "enter" } }, "enter");
      if (ch === "-") return el("button.wd-key.wide", { type: "button", dataset: { key: "backspace" }, "aria-label": "backspace", html: ICONS.backspace });
      const quads = [0, 1, 2, 3].map((i) => el("i", { dataset: { board: String(i) } }));
      const button = el("button.wd-key.qd-key", { type: "button", dataset: { key: ch } },
        el("span.qd-quads", { "aria-hidden": "true" }, quads),
        el("span.qd-letter", ch));
      keyEls[ch] = { button, quads };
      return button;
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

// Letters revealed by hints, one mini row per board in the same 2×2 order.
const hintsEl = el("div.qd-hints", { "aria-live": "polite" });

main.append(el("div.qd-game", statusEl, hintsEl, boardsEl, keyboard));

function fit() {
  const gap = 8;
  const tileGap = 3;
  const pad = 6;
  const w = boardsEl.clientWidth - 16;
  const h = boardsEl.clientHeight - 16;
  if (w < 40 || h < 40) return;
  const innerW = (w - gap) / 2 - pad * 2;
  const innerH = (h - gap) / 2 - pad * 2;
  const byW = (innerW - tileGap * 4) / WORD_LEN;
  const byH = (innerH - tileGap * (MAX_GUESSES - 1)) / MAX_GUESSES;
  const size = Math.round(Math.max(16, Math.min(byW, byH > 16 ? byH : byW, 42)) * 10) / 10;
  boardsEl.style.setProperty("--tile", `${size}px`);
}
new ResizeObserver(fit).observe(boardsEl);
fit();

// ---------------------------------------------------------------- rendering

function paintTiles(tiles, guess, result) {
  for (let c = 0; c < WORD_LEN; c++) {
    const t = tiles[c];
    const ch = guess[c] || "";
    t.textContent = ch;
    const st = result ? result[c] : ch ? "tbd" : "empty";
    t.dataset.state = st;
    t.setAttribute("aria-label", ch ? `${ch} ${result ? result[c] : ""}`.trim() : "empty");
  }
}

function paintBoard(b) {
  const board = boards[b];
  const rows = rowsOf(b);
  const solved = solvedOf(b);
  const reviewing = state.status !== "playing";
  board.node.classList.toggle("is-solved", solved && !reviewing);
  board.node.classList.toggle("is-missed", reviewing && !solved);
  const label = `Board ${b + 1}${solved ? ", solved" : reviewing ? ", unsolved" : ""}`;
  board.node.setAttribute("aria-label", label);
  for (let r = 0; r < MAX_GUESSES; r++) {
    if (r < rows.length) paintTiles(board.tiles[r], rows[r].guess, rows[r].result);
    else if (!solved && state.status === "playing" && r === state.guesses.length) paintTiles(board.tiles[r], current);
    else paintTiles(board.tiles[r], "");
  }
  const solvedRow = board.banner.querySelector(".qd-solved-row");
  solvedRow.replaceChildren(...[...answers[b]].map((ch) =>
    el("div.wd-tile", { dataset: { state: "correct" } }, ch)));
  board.missed.textContent = reviewing && !solved ? `Answer ${answers[b]}` : "";
}

function paintKeys() {
  const { quarters, dead } = keyboardInfo(state.guesses, answers, state.status === "playing");
  for (const [ch, { button, quads }] of Object.entries(keyEls)) {
    const q = quarters[ch];
    quads.forEach((node, i) => {
      if (q && q[i]) node.dataset.state = q[i];
      else delete node.dataset.state;
    });
    if (dead[ch]) button.dataset.state = "absent";
    else delete button.dataset.state;
  }
}

function paintStatus() {
  const left = MAX_GUESSES - state.guesses.length;
  const solved = answers.filter((_, i) => solvedOf(i)).length;
  if (state.status === "won") statusEl.textContent = "All four solved";
  else if (state.status === "lost") statusEl.textContent = `${solved} of 4 solved`;
  else statusEl.textContent = `${left} guess${left === 1 ? "" : "es"} left · ${solved} of 4 solved`;
}

function paintHints() {
  hintsEl.hidden = !state.hints.length;
  hintsEl.replaceChildren(...answers.map((answer, b) => {
    const mine = state.hints.filter(([hb]) => hb === b).map(([, pos]) => pos);
    return el("div.qd-hint-row", {
      "aria-label": mine.length ? `Board ${b + 1} hint: ${[...answer].map((ch, i) => (mine.includes(i) ? ch : "blank")).join(", ")}` : `Board ${b + 1}: no hints`,
    }, [...answer].map((ch, i) => el("span.qd-hint-tile", { dataset: { state: mine.includes(i) ? "correct" : "empty" } },
      mine.includes(i) ? ch : "")));
  }));
}

function paintAll() {
  for (let b = 0; b < BOARDS; b++) paintBoard(b);
  paintKeys();
  paintStatus();
  paintHints();
}

function useHint() {
  if (busy) return;
  if (state.status !== "playing") { toast("The round is over"); return; }
  const hint = nextHint(state.guesses, answers, state.hints);
  if (!hint) { toast("No more hints"); return; }
  const [b, pos] = hint;
  state.hints.push(hint);
  save();
  paintHints();
  toast(`Board ${b + 1}: letter ${pos + 1} is ${answers[b][pos].toUpperCase()}`, 2200);
}

const animate = (node, name) => new Promise((resolve) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { resolve(); return; }
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    node.removeEventListener("animationend", done);
    delete node.dataset.animation;
    resolve();
  };
  node.dataset.animation = name;
  node.addEventListener("animationend", done);
  const timer = setTimeout(done, 500);
});

function revealRow(b, r, result) {
  return new Promise((resolve) => {
    for (let c = 0; c < WORD_LEN; c++) {
      const t = boards[b].tiles[r][c];
      setTimeout(async () => {
        await animate(t, "flip-in");
        t.dataset.state = result[c];
        t.setAttribute("aria-label", `${t.textContent} ${result[c]}`);
        await animate(t, "flip-out");
        if (c === WORD_LEN - 1) resolve();
      }, c * FLIP_STAGGER);
    }
  });
}

function shakeOpen() {
  const r = state.guesses.length;
  for (let b = 0; b < BOARDS; b++) {
    if (!solvedOf(b)) animate(boards[b].rowEls[r], "shake");
  }
}

// ---------------------------------------------------------------- input

function handleKey(key) {
  if (busy || state.status !== "playing") return;
  if (key === "enter") return submit();
  if (key === "backspace") {
    if (!current) return;
    current = current.slice(0, -1);
    for (let b = 0; b < BOARDS; b++) if (!solvedOf(b)) paintTiles(boards[b].tiles[state.guesses.length], current);
    return;
  }
  if (/^[a-z]$/.test(key) && current.length < WORD_LEN) {
    current += key;
    const r = state.guesses.length;
    const c = current.length - 1;
    for (let b = 0; b < BOARDS; b++) {
      if (solvedOf(b)) continue;
      paintTiles(boards[b].tiles[r], current);
      animate(boards[b].tiles[r][c], "pop");
    }
  }
}

async function submit() {
  if (current.length < WORD_LEN) { shakeOpen(); toast("Not enough letters"); return; }
  if (!validSet.has(current)) { shakeOpen(); toast("Not in word list"); return; }
  const guess = current;
  const r = state.guesses.length;
  state.guesses.push(guess);
  current = "";
  const won = answers.every((_, i) => solvedOf(i));
  if (won) state.status = "won";
  else if (state.guesses.length >= MAX_GUESSES) state.status = "lost";
  save();
  if (state.status !== "playing") {
    const finish = finishingGuess(state.guesses, answers);
    recordResult(GAME, puzzle, { won, bucket: won ? String(finish) : "X" });
  }

  busy = true;
  const jobs = [];
  for (let b = 0; b < BOARDS; b++) {
    // A board solved earlier stops before this guess, so its row count is shorter.
    const rows = rowsOf(b);
    if (rows.length === state.guesses.length) jobs.push(revealRow(b, r, rows[r].result));
  }
  await Promise.all(jobs);
  paintAll();
  busy = false;

  if (won) {
    toast(WIN_WORDS[r] || "Solved", 2000);
    setTimeout(openStats, 1600);
  } else if (state.status === "lost") {
    const missed = answers.filter((_, i) => !solvedOf(i)).join(" ").toUpperCase();
    toast(missed, 8000);
    setTimeout(openStats, 1600);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
  if (document.querySelector(".splash")) return;
  if (getSetting(GAME, "onscreenOnly")) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Enter") { e.preventDefault(); handleKey("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); handleKey("backspace"); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
});

// ---------------------------------------------------------------- modals

function exampleRow(word, idx, st) {
  return el("div.wd-example-row", [...word].map((ch, i) =>
    el("div.wd-tile.small", { dataset: { state: i === idx ? st : "tbd" } }, ch)));
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Guess all four words in 9 tries.",
    className: "wd-help",
    content: [
      el("ul.help-list",
        el("li", "Each guess is a valid 5-letter word, and it is scored on every board at once."),
        el("li", "Green is the right letter in the right spot. Yellow is in that word, wrong spot. Gray is not in that word."),
        el("li", "A solved board steps aside. Later guesses are not played on it, and its keyboard quarters clear."),
        el("li", "Each key is split in four, in the same order as the boards. A letter that is gray on every open board goes dark."),
        el("li", "Stuck? The 💡 button reveals one letter on the open board you know least about. Hints can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "Examples")),
        el("div.example", exampleRow("weary", 0, "correct"),
          el("p", el("strong", "W"), " is in that board's word and in the correct spot.")),
        el("div.example", exampleRow("pills", 1, "present"),
          el("p", el("strong", "I"), " is in that word but in the wrong spot.")),
        el("div.example", exampleRow("vague", 3, "absent"),
          el("p", el("strong", "U"), " is not in that word."))),
      el("p.wd-help-foot", "Play today's puzzle, any past day from the menu, or hit New game for another round with no daily limit."),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const finish = finishingGuess(state.guesses, answers);
  const dist = [];
  for (let i = 1; i <= MAX_GUESSES; i++) {
    dist.push({ label: String(i), count: stats.dist[String(i)] || 0, highlight: finish === i });
  }
  const marks = shareText({ puzzle, guesses: state.guesses, answers }).split("\n").slice(1);
  const hints = state.hints.length;
  showStats({
    title: state.status === "won" ? "Congratulations!" : state.status === "lost" ? "Thanks for playing!" : undefined,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Guess Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next Quordle" : null,
    shareText: done ? shareText({ puzzle, guesses: state.guesses, answers, hints }) : null,
    extra: done ? el("div",
      el("div.qd-share", marks[0], el("br"), marks[1]),
      hints ? el("p.qd-share-hints", `${hints} hint${hints === 1 ? "" : "s"} used`) : null,
    ) : null,
  });
}

// ---------------------------------------------------------------- start

paintAll();

const played = state.guesses.length;
const finished = state.status !== "playing";
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : played ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : played ? `${MAX_GUESSES - played} guesses left across the four boards.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (leaving) {
  // navigation in flight
} else if (finished) openStats();
else if (!get("seen:quordle")) { set("seen:quordle", true); showHelp(); }
