// Contexto — find the secret word by how close each guess is in meaning. Today's puzzle, any past day, or a new one any time.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING, hintsOn } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, ICONS } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import {
  BUCKETS, GREEN, YELLOW,
  barFor, bucketFor, colorFor, hintWord, loadModel, lookup, rankingFor, secretFor, shareText,
} from "./contexto/logic.js";

const GAME = "contexto";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  {
    key: "order", label: "Order Guesses", type: "select", default: "closest",
    options: [["closest", "Closest first"], ["recent", "Most recent first"]],
  },
  HINTS_SETTING,
]);

function startFresh() {
  location.href = `${location.pathname}?random=1`;
}

function askNewGame() {
  if (state.status === "playing" && state.entries.length) {
    showModal({
      title: "New game?",
      content: [
        el("p", "This puzzle stays saved. A new practice puzzle starts, and your daily streak stays as it is. You can start another whenever you want."),
        el("div.cx-again",
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

const loading = el("p.cx-loading", "Loading the word map…");
main.append(loading);
let model;
try {
  const [meta, buffer] = await Promise.all([
    loadJSON("data/contexto/words.json"),
    fetch("data/contexto/vectors.bin").then((r) => {
      if (!r.ok) throw new Error("Failed to load data/contexto/vectors.bin");
      return r.arrayBuffer();
    }),
  ]);
  model = loadModel(meta, buffer);
  model.secrets = meta.secrets;
} catch (err) {
  loading.textContent = "Sorry — the Contexto word map could not be loaded.";
  throw err;
}
loading.remove();
const secret = secretFor(puzzle, model, model.secrets);
const ranking = rankingFor(model, secret);
const total = model.words.length;
const word = (i) => model.words[i];
const rankOf = (i) => ranking.rank[i];

// ---------------------------------------------------------------- state
// entries: { w: word, hint?: true } in the order played. Hints show in the list but aren't guesses.

function freshState() {
  return { v: 1, secret: word(secret), entries: [], status: "playing" };
}

const saved = loadState(GAME, puzzle.id);
let state = saved && saved.v === 1 && saved.secret === word(secret) && Array.isArray(saved.entries)
  ? {
    ...freshState(),
    entries: saved.entries.filter((e) => e && model.index.has(e.w)),
    status: ["playing", "won", "lost"].includes(saved.status) ? saved.status : "playing",
  }
  : freshState();

const save = () => saveState(GAME, puzzle.id, state);
const guesses = () => state.entries.filter((e) => !e.hint).length;
const hints = () => state.entries.filter((e) => e.hint).length;
const played = () => state.entries.map((e) => model.index.get(e.w));
const bestRank = () => Math.min(Infinity, ...played().map(rankOf));

// ---------------------------------------------------------------- DOM

const infoEl = el("div.cx-info");
const input = el("input.cx-input", {
  type: "text", placeholder: "type a word", autocomplete: "off", autocapitalize: "none",
  autocorrect: "off", spellcheck: "false", "aria-label": "Your guess", enterkeyhint: "go",
});
const form = el("form.cx-form", input);
form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
const lastEl = el("div.cx-last", { "aria-live": "polite" });
const listEl = el("ol.cx-list", { "aria-label": "Your guesses" });
const hintBtn = el("button.btn.small.secondary", { type: "button", onclick: () => useHint() }, "Hint");
const giveUpBtn = el("button.btn.small.secondary", { type: "button", onclick: () => askGiveUp() }, "Give up");
const closestBtn = el("button.btn.small.secondary", { type: "button", onclick: () => showClosest() }, "Closest words");
const doneEl = el("div.cx-done", { "aria-live": "polite" });
const tools = el("div.cx-tools", hintBtn, giveUpBtn, closestBtn);

const gameEl = el("div.cx-game", infoEl, doneEl, form, lastEl, tools, listEl);
main.append(gameEl);

let lastWord = null;

function row(i, { last = false, hint = false } = {}) {
  const r = rankOf(i);
  return el(`li.cx-row.is-${colorFor(r)}${last ? ".is-last" : ""}`, {
    style: { "--bar": `${(barFor(r, total) * 100).toFixed(1)}%` },
    "aria-label": `${word(i)}, rank ${r}${hint ? ", hint" : ""}`,
  }, el("span.cx-word", word(i), hint ? el("span.cx-tag", "hint") : null), el("span.cx-rank", String(r)));
}

function paint() {
  const over = state.status !== "playing";
  infoEl.replaceChildren(
    el("span", puzzle.isDaily && puzzle.number ? `Game: #${puzzle.number}` : "Practice"),
    el("span", `Guesses: ${guesses()}`),
    el("span", `Hints: ${hints()}`),
  );
  form.hidden = over;
  hintBtn.hidden = over || !hintsOn(GAME);
  giveUpBtn.hidden = over;
  closestBtn.hidden = !over;

  const entries = state.entries.map((e) => ({ ...e, i: model.index.get(e.w) }));
  const last = lastWord != null ? entries.find((e) => e.w === lastWord) : null;
  lastEl.replaceChildren(...(last && !over ? [row(last.i, { last: true, hint: last.hint })] : []));
  const sorted = getSetting(GAME, "order") === "recent"
    ? [...entries].reverse()
    : [...entries].sort((a, b) => rankOf(a.i) - rankOf(b.i));
  listEl.replaceChildren(...sorted.map((e) => row(e.i, { last: e.w === lastWord, hint: e.hint })));

  doneEl.replaceChildren(...(over ? [
    el("p.cx-done-title", state.status === "won" ? "Congrats!" : "The word was"),
    el("p.cx-secret", word(secret)),
    el("p.cx-done-line", state.status === "won"
      ? `You got it in ${guesses()} guess${guesses() === 1 ? "" : "es"}${hints() ? ` and ${hints()} hint${hints() === 1 ? "" : "s"}` : ""}.`
      : `You made ${guesses()} guess${guesses() === 1 ? "" : "es"}.`),
    el("div.cx-again",
      el("button.btn.small.secondary", { type: "button", onclick: () => openStats() }, "Results"),
      el("button.btn.small", { type: "button", onclick: startFresh }, "Play again")),
  ] : []));
}

// ---------------------------------------------------------------- moves

function add(i, hint) {
  state.entries.push(hint ? { w: word(i), hint: true } : { w: word(i) });
  lastWord = word(i);
  if (i === secret) state.status = "won";
  save();
  paint();
  if (state.status === "won") finish();
}

function submit() {
  if (state.status !== "playing" || isModalOpen()) return;
  const raw = input.value.trim();
  if (!raw) return;
  input.value = "";
  const i = lookup(model, raw);
  if (i < 0) { toast("I don't know this word"); return; }
  if (state.entries.some((e) => e.w === word(i))) {
    lastWord = word(i);
    paint();
    toast(word(i) === raw.toLowerCase() ? "Already guessed" : `Already guessed: ${word(i)}`);
    return;
  }
  add(i, false);
}

function useHint() {
  if (state.status !== "playing") return;
  const i = hintWord(ranking, played(), Number.isFinite(bestRank()) ? bestRank() : 0);
  if (i < 0) { toast("No more hints"); return; }
  add(i, true);
  toast(`Hint: ${word(i)}`);
}

function askGiveUp() {
  if (state.status !== "playing") return;
  const close = showModal({
    title: "Give up?",
    content: [
      el("p", "The secret word will be shown and this puzzle counts as a loss. Your streak resets if it's today's puzzle."),
      el("div.cx-again",
        el("button.btn", { type: "button", onclick: () => {
          close();
          state.status = "lost";
          save();
          paint();
          finish();
        } }, "Show the word")),
    ],
  });
}

function finish() {
  recordResult(GAME, puzzle, { won: state.status === "won", bucket: bucketFor(state.status === "won", guesses()) });
  toast(state.status === "won" ? "You found it!" : word(secret), 2000);
  setTimeout(() => { if (!document.querySelector(".splash") && !isModalOpen()) openStats(); }, 900);
}

// Typing anywhere goes into the guess box.
document.addEventListener("keydown", (e) => {
  if (state.status !== "playing" || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector(".splash") || document.querySelector(".drawer.open")) return;
  if (e.target === input || (e.target.closest && e.target.closest("input, textarea, select"))) return;
  if (/^[a-z]$/i.test(e.key)) {
    input.focus();
    input.value += e.key.toLowerCase();
    e.preventDefault();
  }
});

onSettingsChange(() => paint());

// ---------------------------------------------------------------- modals

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Find the secret word.",
    content: [
      el("ul.help-list",
        el("li", "You have unlimited guesses."),
        el("li", `Words are sorted by how close they are to the secret word in meaning, out of ${total.toLocaleString()} words. The secret word is number 1.`),
        el("li", "Closeness comes from how words are used together in a huge body of text, so it's about context. Words can be close in meaning or just often found together."),
        el("li", "Plurals and simple verb forms count as their base word."),
        el("li", "Stuck? A hint adds a word about halfway between your best guess and the secret. Hints don't count as guesses, and can be turned off in Settings.")),
      el("div.help-examples",
        el("p", el("strong", "Colors")),
        el("ol.cx-list.cx-legend",
          legendRow("green", `Very close: rank ${GREEN} or better`, 120),
          legendRow("yellow", `Getting warm: up to ${YELLOW}`, 900),
          legendRow("red", "Far away", 9000))),
      el("p", "Play today's puzzle, any past day from the menu, or start a new puzzle whenever you want."),
    ],
  });
}

function legendRow(color, text, r) {
  return el(`li.cx-row.is-${color}`, { style: { "--bar": `${(barFor(r, total) * 100).toFixed(1)}%` } },
    el("span.cx-word", text), el("span.cx-rank", String(r)));
}

function showClosest() {
  showModal({
    title: "Closest Words",
    subtitle: `The 100 words nearest to "${word(secret)}"`,
    className: "cx-closest",
    content: el("ol.cx-list", ranking.order.slice(0, 100).map((i) => row(i))),
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const mine = done ? bucketFor(state.status === "won", guesses()) : null;
  const ranks = state.entries.filter((e) => !e.hint).map((e) => rankOf(model.index.get(e.w)));
  const text = done ? shareText({ puzzle, won: state.status === "won", guesses: guesses(), hints: hints(), ranks }) : null;
  showStats({
    title: state.status === "won" ? "You found it!" : state.status === "lost" ? "Better luck next time" : undefined,
    top: done ? el("div.cx-summary",
      el("div.cx-summary-word", word(secret)),
      el("div.cx-summary-line", `${guesses()} guess${guesses() === 1 ? "" : "es"} · ${hints()} hint${hints() === 1 ? "" : "s"}`)) : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Win %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: {
      title: "Guess Distribution",
      rows: BUCKETS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: mine === b })),
    },
    nextLabel: puzzle.isToday && done ? "Next Contexto" : null,
    shareText: text,
    extra: done ? el("div.cx-again",
      el("button.btn.secondary", { type: "button", onclick: () => showClosest() }, "Closest words")) : null,
  });
}

// ---------------------------------------------------------------- start

paint();

const finished = state.status !== "playing";
let leaving = false;
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.entries.length ? "Continue" : "Play",
  tagline: finished ? "Check your result, or start another round."
    : state.entries.length ? `${guesses()} guess${guesses() === 1 ? "" : "es"} so far. Best rank ${bestRank()}.` : undefined,
  secondary: [{ label: "New puzzle", onClick: () => { leaving = true; startFresh(); } }],
});
if (!leaving && finished) openStats();
else if (!leaving && !get("seen:contexto")) { set("seen:contexto", true); showHelp(); }
