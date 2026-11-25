// Revealed — guess the topic of a blacked-out article. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING, hintsOn } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, ICONS } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import {
  BUCKETS, REVEALS_PER_HINT,
  bucketFor, hintOrder, hintsEarned, isCorrect, norm, shareText, tokenize, topicFor, topicSlots,
} from "./revealed/logic.js";

const GAME = "revealed";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "showLengths", label: "Show Word Lengths", type: "toggle", default: true,
    desc: "Letter counts on blacked-out words",
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.log.length) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.rv-again",
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

let entry;
try {
  const data = await loadJSON("data/revealed/topics.json");
  entry = topicFor(puzzle, data.topics);
} catch (err) {
  main.append(el("p.rv-error", "Sorry — today's Revealed puzzle could not be loaded."));
  throw err;
}
const paragraphs = tokenize(entry.text, entry.topic);
const slots = topicSlots(entry.topic);
const letterCount = slots.filter((s) => s.letter).length;
const order = hintOrder(entry.topic, puzzle.id);
const hiddenKeys = new Set(paragraphs.flat().filter((t) => t.hidden && !t.topic).map((t) => t.key));
const topicKeys = new Set(paragraphs.flat().filter((t) => t.topic).map((t) => t.key));

// ---------------------------------------------------------------- state
// revealed: word keys uncovered, in order. log: one letter per move (r reveal, h hint, g wrong guess, w win, x give up).

function freshState() {
  return { v: 1, topic: entry.topic, revealed: [], hints: 0, guesses: [], log: [], status: "playing" };
}

const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && saved.topic === entry.topic && Array.isArray(saved.revealed)
  && Array.isArray(saved.guesses) && Array.isArray(saved.log)
  ? {
    ...freshState(),
    revealed: saved.revealed.filter((k) => hiddenKeys.has(k)),
    hints: Math.max(0, Math.min(Number(saved.hints) || 0, letterCount - 1)),
    guesses: saved.guesses.filter((g) => typeof g === "string"),
    log: saved.log.filter((m) => "rhgwx".includes(m)),
    status: ["playing", "won", "lost"].includes(saved.status) ? saved.status : "playing",
  }
  : freshState();

const save = () => saveState(GAME, puzzle.id, state);
const reveals = () => state.revealed.length;
const maxHints = () => Math.max(0, letterCount - 1);
const hintsAvailable = () => Math.max(0, Math.min(hintsEarned(reveals()), maxHints()) - state.hints);

// ---------------------------------------------------------------- DOM

const revealNum = el("span.rv-num");
const hintNum = el("span.rv-num");
const hintCount = el("div.rv-count", hintNum, el("span.rv-label", "Hints"));
const guessNum = el("span.rv-num");
const hintBtn = el("button.btn.small.rv-hint", { type: "button", onclick: () => useHint() });
const giveUpBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askGiveUp() }, "Give up");
const hud = el("div.rv-hud",
  el("div.rv-counts",
    el("div.rv-count", revealNum, el("span.rv-label", "Reveals")),
    hintCount,
    el("div.rv-count", guessNum, el("span.rv-label", "Guesses"))),
  el("div.rv-hud-actions", hintBtn, giveUpBtn));

const slotEls = slots.map((s) => (s.letter ? el("span.rv-slot") : el("span.rv-gap", s.ch === " " ? "" : s.ch)));
const answerEl = el("div.rv-answer", { "aria-live": "polite" }, slotEls);
const answerMeta = el("div.rv-answer-meta");

const tokenEls = [];
const articleEl = el("article.rv-article", paragraphs.map((para) => el("p", para.map((tok) => {
  if (!tok.word) return tok.text;
  if (!tok.hidden) return el("span.rv-word", tok.text);
  const node = el("span.rv-redact", {
    role: tok.topic ? null : "button",
    tabindex: tok.topic ? null : "0",
    dataset: { len: String(norm(tok.text).length) },
    style: { "--len": String(Math.max(2, tok.text.length)) },
  }, el("span.rv-text", tok.text));
  if (tok.topic) node.classList.add("is-topic");
  node.addEventListener("click", () => onWordTap(tok));
  node.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onWordTap(tok);
  });
  tokenEls.push({ tok, node });
  return node;
}))));

const guessInput = el("input.rv-input", {
  type: "text", placeholder: "Name the topic…", autocomplete: "off", autocapitalize: "words",
  spellcheck: "false", "aria-label": "Your guess", enterkeyhint: "go",
});
const guessForm = el("form.rv-guess", guessInput, el("button.btn.small", { type: "submit" }, "Guess"));
guessForm.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
const wrongEl = el("div.rv-wrong", { "aria-live": "polite" });
const doneEl = el("div.rv-done");

const gameEl = el("div.rv-game",
  hud,
  el("div.rv-topic", el("div.rv-topic-label", "Topic"), answerEl, answerMeta),
  el("div.rv-scroll", articleEl, doneEl),
  el("div.rv-bottom", wrongEl, guessForm));
main.append(gameEl);

// ---------------------------------------------------------------- paint

let fresh = null; // key just revealed, for a brief highlight

function paint() {
  gameEl.classList.toggle("hide-lengths", !getSetting(GAME, "showLengths"));
  const over = state.status !== "playing";
  const open = new Set(state.revealed);
  const hinted = new Set(order.slice(0, state.hints));

  revealNum.textContent = String(reveals());
  hintNum.textContent = String(state.hints);
  guessNum.textContent = String(state.guesses.length);

  const avail = hintsAvailable();
  const toNext = REVEALS_PER_HINT - (reveals() % REVEALS_PER_HINT);
  hintBtn.disabled = over || avail === 0;
  hintBtn.textContent = avail > 0 ? `Use hint (${avail})`
    : state.hints >= maxHints() ? "No more hints" : `Hint in ${toNext} reveal${toNext === 1 ? "" : "s"}`;
  giveUpBtn.hidden = over;
  // Hints off: no button, and no counter unless some were already used.
  hintBtn.hidden = !hintsOn(GAME);
  hintCount.hidden = !hintsOn(GAME) && state.hints === 0;

  slots.forEach((s, i) => {
    if (!s.letter) return;
    const show = over || hinted.has(i);
    slotEls[i].textContent = show ? s.ch.toUpperCase() : "";
    slotEls[i].classList.toggle("is-hint", !over && hinted.has(i));
    slotEls[i].classList.toggle("is-solved", state.status === "won");
    slotEls[i].classList.toggle("is-failed", state.status === "lost");
  });
  answerEl.setAttribute("aria-label", over ? `Topic: ${entry.topic}`
    : `Topic, ${letterCount} letters${state.hints ? `, ${state.hints} shown` : ""}`);
  answerMeta.textContent = over ? entry.category || "" : `${letterCount} letters`;

  for (const { tok, node } of tokenEls) {
    const shown = over || (!tok.topic && open.has(tok.key));
    node.classList.toggle("is-open", shown);
    node.classList.toggle("is-fresh", !over && tok.key === fresh);
    node.classList.toggle("is-topic-open", over && tok.topic);
    if (shown) {
      node.removeAttribute("role");
      node.tabIndex = -1;
      node.setAttribute("aria-label", tok.text);
    } else {
      if (!tok.topic) { node.setAttribute("role", "button"); node.tabIndex = 0; }
      node.setAttribute("aria-label", tok.topic
        ? `Hidden topic word, ${norm(tok.text).length} letters`
        : `Hidden word, ${norm(tok.text).length} letters. Reveal`);
    }
  }

  wrongEl.replaceChildren(...state.guesses.slice(-6).map((g) => el("span.rv-chip", g)));
  guessForm.hidden = over;
  wrongEl.hidden = over || !state.guesses.length;
  doneEl.replaceChildren(...(over ? doneCard() : []));
}

function doneCard() {
  const href = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(entry.topic)}`;
  return [
    el("p.rv-done-title", state.status === "won" ? `Solved: ${entry.topic}` : `The topic was ${entry.topic}`),
    el("div.rv-again",
      el("button.btn.small.secondary", { type: "button", onclick: () => openStats() }, "Results"),
      el("a.btn.small.secondary", { href, target: "_blank", rel: "noopener" }, "Read more"),
      el("button.btn.small", { type: "button", onclick: startFresh }, "Play again")),
  ];
}

// ---------------------------------------------------------------- moves

function onWordTap(tok) {
  if (state.status !== "playing" || isModalOpen()) return;
  if (tok.topic) { toast("That word is part of the topic"); return; }
  if (state.revealed.includes(tok.key)) return;
  state.revealed.push(tok.key);
  state.log.push("r");
  fresh = tok.key;
  save();
  paint();
  if (hintsOn(GAME) && reveals() % REVEALS_PER_HINT === 0 && hintsAvailable() > 0 && hintsEarned(reveals()) <= maxHints()) toast("Hint earned");
}

function useHint() {
  if (state.status !== "playing" || hintsAvailable() === 0) return;
  state.hints += 1;
  state.log.push("h");
  save();
  paint();
}

function submitGuess() {
  if (state.status !== "playing" || isModalOpen()) return;
  const guess = guessInput.value.trim();
  if (!norm(guess)) return;
  if (isCorrect(guess, entry)) {
    state.status = "won";
    state.log.push("w");
    guessInput.value = "";
    guessInput.blur();
    finish();
    return;
  }
  if (state.guesses.some((g) => norm(g) === norm(guess))) { toast("Already guessed"); guessInput.select(); return; }
  if (topicKeys.has(norm(guess)) || [...topicKeys].some((k) => norm(guess) === `${k}s`)) {
    toast("Close! That's part of the topic");
    guessInput.select();
    return;
  }
  state.guesses.push(guess);
  state.log.push("g");
  guessInput.value = "";
  save();
  paint();
  toast("Not it");
  answerEl.classList.remove("shake");
  void answerEl.offsetWidth;
  answerEl.classList.add("shake");
}

function askGiveUp() {
  if (state.status !== "playing") return;
  const close = showModal({
    title: "Give up?",
    content: [
      el("p", "The topic will be shown and this puzzle counts as a loss. Your streak resets if it's today's puzzle."),
      el("div.rv-again",
        el("button.btn", { type: "button", onclick: () => {
          close();
          state.status = "lost";
          state.log.push("x");
          finish();
        } }, "Show the topic")),
    ],
  });
}

function result() {
  return { won: state.status === "won", reveals: reveals(), hints: state.hints, guesses: state.guesses.length };
}

function finish() {
  save();
  fresh = null;
  paint();
  recordResult(GAME, puzzle, { won: state.status === "won", bucket: bucketFor(result()) });
  toast(state.status === "won" ? praise() : entry.topic, 2000);
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 900);
}

function praise() {
  const used = reveals() + state.hints;
  if (used === 0) return "Genius!";
  if (used <= 3) return "Brilliant!";
  if (used <= 6) return "Impressive!";
  if (used <= 10) return "Nicely done";
  return "Got it!";
}

// Typing anywhere goes into the guess box.
document.addEventListener("keydown", (e) => {
  if (state.status !== "playing" || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector(".splash") || document.querySelector(".drawer.open")) return;
  if (e.target === guessInput || (e.target.closest && e.target.closest("input, textarea, select"))) return;
  if (/^[a-z0-9]$/i.test(e.key)) {
    guessInput.focus();
    guessInput.value += e.key;
    e.preventDefault();
  }
});

onSettingsChange(() => paint());

// ---------------------------------------------------------------- modals

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Guess the topic of the article.",
    content: [
      el("ul.help-list",
        el("li", "Most words in a short article are blacked out. The boxes at the top show how many letters the topic has."),
        el("li", "Tap a blacked-out word to reveal it. Every copy of that word in the article appears."),
        el("li", `Every ${REVEALS_PER_HINT} reveals earn a hint, which fills in one letter of the topic. Hints are optional, and can be turned off in Settings.`),
        el("li", "Type your guess at any time. Wrong guesses don't end the game, but they're counted."),
        el("li", "Words that are part of the topic stay hidden until you solve it. Use as few reveals and hints as you can.")),
      el("div.help-examples",
        el("p", el("strong", "Examples")),
        el("div.example.rv-help-row",
          el("span.rv-redact.example", { style: { "--len": "6" } }, el("span.rv-text", "rocket")),
          el("p", "A hidden word. Tap it to reveal it.")),
        el("div.example.rv-help-row",
          el("span.rv-redact.example.is-open.is-fresh", { style: { "--len": "6" } }, el("span.rv-text", "rocket")),
          el("p", "A revealed word.")),
        el("div.example.rv-help-row",
          el("span.rv-redact.example.is-topic", { style: { "--len": "4" } }, el("span.rv-text", "moon")),
          el("p", "Part of the topic. It stays hidden."))),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const mine = done ? bucketFor(result()) : null;
  const text = done ? shareText({ puzzle, ...result(), log: state.log }) : null;
  showStats({
    title: state.status === "won" ? praise() : state.status === "lost" ? "Better luck next time" : undefined,
    top: done ? el("div.rv-summary",
      el("div.rv-summary-topic", entry.topic),
      el("div.rv-summary-line", `${reveals()} reveal${reveals() === 1 ? "" : "s"} · ${state.hints} hint${state.hints === 1 ? "" : "s"} · ${state.guesses.length} wrong guess${state.guesses.length === 1 ? "" : "es"}`)) : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: {
      title: "Reveals + Hints",
      rows: BUCKETS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: mine === b })),
    },
    nextLabel: puzzle.isToday && done ? "Next Revealed" : null,
    shareText: text,
    extra: null,
  });
}

// ---------------------------------------------------------------- start

paint();

const finished = state.status !== "playing";
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.log.length ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : state.log.length ? `${reveals()} reveal${reveals() === 1 ? "" : "s"} so far.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:revealed")) { set("seen:revealed", true); showHelp(); }
