// Tagline — three phrases from seven letters. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING, watchHints } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, showStats, splash, ICONS } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import { LEVELS, STAR_WORDS, countsOf, puzzleFor, shareText, starsFor } from "./tagline/logic.js";

const GAME = "tagline";
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
  const started = state.hints > 0 || state.active > 1 || state.levels.some((level) => (
    level.hinted.length || Object.keys(level.placed).length || level.status === "solved" || level.status === "failed"
  ));
  if (state.status === "playing" && started) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.tg-again", el("button.btn", { type: "button", onclick: startFresh }, "Play new game")),
      ],
    });
    return;
  }
  startFresh();
}

let state = freshState();

const newBtn = el("button.icon-btn", {
  type: "button", "aria-label": "New game", title: "New game", html: ICONS.shuffle, onclick: askNewGame,
});
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [newBtn],
});

const bank = await loadJSON("data/tagline/puzzles.json");
const built = puzzleFor(puzzle, bank);

function freshState() {
  return {
    v: 1,
    active: 1,
    hints: 0,
    failed: false,
    status: "playing",
    levels: [0, 1, 2].map((i) => ({
      status: i === 0 ? "active" : "locked",
      placed: {},
      hinted: [],
    })),
  };
}

function repair(saved) {
  if (!saved || saved.v !== 1 || !Array.isArray(saved.levels) || saved.levels.length !== LEVELS) return freshState();
  const levels = saved.levels.map((level, i) => {
    const placed = {};
    if (level.placed && typeof level.placed === "object") {
      for (const [key, value] of Object.entries(level.placed)) {
        if (/^\d+$/.test(key) && typeof value === "string" && value.length === 1) placed[key] = value.toUpperCase();
      }
    }
    const hinted = Array.isArray(level.hinted) ? level.hinted.filter((n) => Number.isInteger(n) && n >= 0) : [];
    const status = ["locked", "active", "solved", "failed"].includes(level.status)
      ? level.status
      : (i === 0 ? "active" : "locked");
    return { status, placed, hinted };
  });
  const failed = !!saved.failed || levels.some((level) => level.status === "failed");
  let active = Number.isInteger(saved.active) ? saved.active : 1;
  if (active < 1 || active > LEVELS) active = 1;
  let status = saved.status === "won" || saved.status === "lost" ? saved.status : "playing";
  if (levels.every((level) => level.status === "solved")) status = "won";
  if (levels.every((level) => level.status === "solved" || level.status === "failed") && failed) status = "lost";
  return {
    v: 1,
    active,
    hints: Number.isInteger(saved.hints) && saved.hints >= 0 ? saved.hints : 0,
    failed,
    status,
    levels,
  };
}

state = repair(loadState(GAME, puzzle.id));
const save = () => saveState(GAME, puzzle.id, state);

const starEls = [0, 1, 2].map(() => el("span.tg-star", { "aria-hidden": "true" }, "★"));
const starsBox = el("div.tg-stars", starEls);
const numEl = el("div.num");
const labelEl = el("div.label");
const solvedBox = el("div.tg-solved");
const clueEl = el("p.tg-clue");
const noteEl = el("p.tg-note");
const boardEl = el("div.tg-board", { role: "group", "aria-label": "Phrase" });
const poolEl = el("div.tg-pool", { role: "group", "aria-label": "Letters" });
const hintBtn = el("button.btn.secondary", { type: "button" }, "Hint");
const giveBtn = el("button.btn.secondary", { type: "button" }, "Reveal phrase");
hintBtn.addEventListener("click", onHint);
giveBtn.addEventListener("click", askGiveUp);

main.append(el("div.tg-game",
  el("div.tg-hud", starsBox, el("div.tg-meta", numEl, labelEl)),
  solvedBox,
  clueEl,
  noteEl,
  boardEl,
  poolEl,
  el("div.tg-actions", hintBtn, giveBtn),
));

let selected = "";
let note = "";

function levelIndex() {
  return Math.min(LEVELS, Math.max(1, state.active)) - 1;
}

function levelBuilt(i = levelIndex()) {
  return built.levels[i];
}

function shownAt(i, index) {
  const level = state.levels[i];
  const cell = levelBuilt(i).board.words.flat().find((item) => item.kind === "letter" && item.index === index);
  if (!cell) return "";
  if (level.status === "solved" || level.status === "failed") return cell.char;
  if (level.prefill?.includes(index) || levelBuilt(i).prefill.includes(index) || level.hinted.includes(index)) return cell.char;
  return level.placed[String(index)] || "";
}

function lockedAt(i, index) {
  const level = state.levels[i];
  if (level.status === "solved" || level.status === "failed") return true;
  return levelBuilt(i).prefill.includes(index) || level.hinted.includes(index);
}

function remaining(i = levelIndex()) {
  const counts = countsOf(levelBuilt(i).board.letters);
  const used = {};
  for (let n = 0; n < levelBuilt(i).board.length; n++) {
    const ch = shownAt(i, n);
    if (ch) used[ch] = (used[ch] || 0) + 1;
  }
  const left = {};
  for (const ch of built.letters) left[ch] = (counts[ch] || 0) - (used[ch] || 0);
  return left;
}

function nextEmpty(i = levelIndex()) {
  for (let n = 0; n < levelBuilt(i).board.length; n++) {
    if (!shownAt(i, n)) return n;
  }
  return -1;
}

function phraseFilled(i = levelIndex()) {
  for (let n = 0; n < levelBuilt(i).board.length; n++) {
    if (shownAt(i, n) !== levelBuilt(i).board.letters[n]) return false;
  }
  return true;
}

function phraseComplete(i = levelIndex()) {
  return nextEmpty(i) === -1;
}

function playing() {
  return state.status === "playing" && !isModalOpen();
}

function finish() {
  const stars = starsFor(state.hints, state.failed);
  recordResult(GAME, puzzle, {
    won: !state.failed,
    bucket: String(stars),
    extra: null,
  });
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 400);
}

function solveActive() {
  const i = levelIndex();
  state.levels[i].status = "solved";
  if (i < LEVELS - 1) {
    state.active = i + 2;
    state.levels[i + 1].status = "active";
    note = "";
    selected = "";
    save();
    paint();
    return;
  }
  state.status = state.failed ? "lost" : "won";
  save();
  paint();
  finish();
}

function afterEdit() {
  const i = levelIndex();
  if (!phraseComplete(i)) {
    note = "";
    save();
    paint();
    return;
  }
  if (phraseFilled(i)) {
    solveActive();
    return;
  }
  note = "Not that phrase.";
  boardEl.classList.add("is-wrong");
  setTimeout(() => boardEl.classList.remove("is-wrong"), 280);
  save();
  paint();
}

function place(letter, index = nextEmpty()) {
  if (!playing() || state.levels[levelIndex()].status !== "active") return;
  if (index < 0 || shownAt(levelIndex(), index) || lockedAt(levelIndex(), index)) return;
  const left = remaining();
  if ((left[letter] || 0) <= 0) return;
  state.levels[levelIndex()].placed[String(index)] = letter;
  selected = "";
  afterEdit();
}

function removeAt(index) {
  if (!playing() || lockedAt(levelIndex(), index)) return;
  delete state.levels[levelIndex()].placed[String(index)];
  note = "";
  save();
  paint();
}

function onHint() {
  if (!playing() || state.levels[levelIndex()].status !== "active") return;
  const i = levelIndex();
  const letters = levelBuilt(i).board.letters;
  let target = -1;
  for (let n = 0; n < letters.length; n++) {
    if (shownAt(i, n) !== letters[n]) { target = n; break; }
  }
  if (target < 0) return;
  delete state.levels[i].placed[String(target)];
  state.levels[i].hinted.push(target);
  state.hints += 1;
  selected = "";
  note = "";
  if (phraseFilled(i)) solveActive();
  else { save(); paint(); }
}

function giveUp() {
  if (!playing()) return;
  const i = levelIndex();
  state.levels[i].status = "failed";
  state.levels[i].placed = {};
  state.failed = true;
  selected = "";
  note = "";
  if (i < LEVELS - 1) {
    state.active = i + 2;
    state.levels[i + 1].status = "active";
    save();
    paint();
    return;
  }
  state.status = "lost";
  save();
  paint();
  finish();
}

function askGiveUp() {
  if (!playing() || state.levels[levelIndex()].status !== "active") return;
  const last = levelIndex() === LEVELS - 1;
  showModal({
    title: "Reveal this phrase?",
    content: [
      el("p", last
        ? "The answer is filled in. This puzzle earns no stars."
        : "The answer is filled in, and the next phrase opens. This puzzle earns no stars."),
      el("div.tg-again", el("button.btn", { type: "button", onclick: () => { document.querySelector(".modal-close")?.click(); giveUp(); } }, "Reveal phrase")),
    ],
  });
}

function paint() {
  const stars = starsFor(state.hints, state.failed || state.status === "lost");
  const done = state.status !== "playing";
  starEls.forEach((star, i) => {
    star.classList.toggle("on", i < stars);
    star.classList.toggle("off", i >= stars);
  });
  starsBox.setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} ${done ? "earned" : "if you finish now"}`);
  numEl.textContent = String(state.hints);
  labelEl.textContent = state.hints === 1 ? "hint" : "hints";
  const i = levelIndex();
  const level = levelBuilt(i);
  clueEl.textContent = level.clue;
  noteEl.textContent = note;
  const live = state.levels[i];
  hintBtn.disabled = !playing() || live.status !== "active";
  giveBtn.disabled = !playing() || live.status !== "active";

  solvedBox.replaceChildren();
  state.levels.forEach((item, n) => {
    if (item.status !== "solved" && item.status !== "failed") return;
    if (n === i && !done) return;
    solvedBox.append(el(`div.tg-done${item.status === "solved" ? ".is-solved" : ""}`,
      el("span.phrase", built.levels[n].phrase),
      el("span.clue", built.levels[n].clue),
    ));
  });

  boardEl.replaceChildren();
  boardEl.setAttribute("aria-label", `Phrase ${i + 1} of ${LEVELS}`);
  for (const word of level.board.words) {
    const row = el("div.tg-word");
    for (const cell of word) {
      if (cell.kind === "mark") {
        row.append(el("span.tg-mark", cell.char));
        continue;
      }
      const letter = shownAt(i, cell.index);
      const locked = lockedAt(i, cell.index);
      const solved = live.status === "solved";
      const revealed = live.status === "failed";
      const slot = el("button.tg-slot", {
        type: "button",
        "aria-label": letter ? letter : "Empty",
        onclick: () => {
          if (locked || solved || revealed) return;
          if (letter) removeAt(cell.index);
          else if (selected) place(selected, cell.index);
        },
      }, letter);
      if (locked && !solved && !revealed) slot.classList.add("is-locked");
      if (solved) slot.classList.add("is-correct");
      row.append(slot);
    }
    boardEl.append(row);
  }

  const left = remaining(i);
  poolEl.replaceChildren();
  for (const ch of built.letters) {
    const count = Math.max(0, left[ch] || 0);
    const btn = el("button.tg-letter", {
      type: "button",
      "aria-label": count ? `${ch}, ${count} left` : `${ch}, none left`,
      onclick: () => {
        if (!playing() || live.status !== "active" || count <= 0) return;
        if (selected === ch) selected = "";
        else if (nextEmpty() >= 0) { place(ch); return; }
        else selected = ch;
        paint();
      },
    }, ch, el("span.count", String(count)));
    if (selected === ch) btn.classList.add("is-on");
    if (count <= 0) btn.classList.add("is-out");
    poolEl.append(btn);
  }
}

function fit() {
  const width = boardEl.parentElement ? boardEl.parentElement.clientWidth : 360;
  const slot = Math.max(32, Math.min(48, Math.floor((width - 28) / 8)));
  boardEl.style.setProperty("--slot", `${slot}px`);
}
new ResizeObserver(fit).observe(main);
fit();

document.addEventListener("keydown", (e) => {
  if (!playing() || state.levels[levelIndex()].status !== "active") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Backspace") {
    const level = state.levels[levelIndex()];
    const keys = Object.keys(level.placed).map(Number).sort((a, b) => b - a);
    if (!keys.length) return;
    e.preventDefault();
    removeAt(keys[0]);
    return;
  }
  const ch = e.key.toUpperCase();
  if (ch.length === 1 && ch >= "A" && ch <= "Z" && built.letters.includes(ch)) {
    e.preventDefault();
    place(ch);
  }
});

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Three phrases. Seven letters.",
    content: [
      el("ul.help-list",
        el("li", "Each phrase is spelled from the same seven letters. The stack shows how many of each letter the phrase still needs."),
        el("li", "Tap a letter to fill the next blank. Tap a blank you filled to take the letter back. A few letters start in place and stay there."),
        el("li", "Hint reveals one letter. No hints earns three stars. One or two hints earns two. More hints earns one. Hints can be turned off in Settings."),
        el("li", "Reveal phrase skips the answer. The puzzle then earns no stars."),
        el("li", "Finish a phrase and the next one opens. Three phrases complete the puzzle.")),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const earned = done ? starsFor(state.hints, state.failed) : null;
  const dist = [];
  for (let n = 3; n >= 0; n--) {
    dist.push({ label: String(n), count: stats.dist[String(n)] || 0, highlight: earned === n });
  }
  showStats({
    title: done ? STAR_WORDS[earned] : undefined,
    top: done ? el("ol.tg-card", built.levels.map((level) => el("li",
      el("span.phrase", level.phrase),
      el("span.clue", level.clue),
    ))) : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Star Distribution", rows: dist },
    nextLabel: puzzle.isToday && done ? "Next Tagline" : null,
    shareText: done ? shareText({ puzzle, letters: built.letters, stars: earned, hints: state.hints }) : null,
    extra: done ? el("div",
      el("p.tg-share", `${"⭐".repeat(earned)}${"☆".repeat(3 - earned)}  ${earned}/3`),
      el("p.tg-share", `${state.hints} hint${state.hints === 1 ? "" : "s"}`),
    ) : null,
  });
}

paint();
watchHints(GAME, (on) => { hintBtn.hidden = !on; });
if (state.status !== "playing") {
  recordResult(GAME, puzzle, { won: state.status === "won", bucket: String(starsFor(state.hints, state.failed)) });
}

const finished = state.status !== "playing";
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.active > 1 || state.hints > 0 ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round." : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:tagline")) { set("seen:tagline", true); showHelp(); }
