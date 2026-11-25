// Oh My NUMBERS! — Ballpark. Five absurd comparisons, one guess each.
// Today's five are shared. Shuffle starts a practice round and leaves the streak alone.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, hintsOn, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import {
  bandById, clampGuess, explainLines, formatCount, freshState, makePuzzle, repair,
  resultBucket, scoreGuess, shareText, sliderStart,
} from "./ballpark/logic.js";

const GAME = "ballpark";
const puzzle = currentPuzzle();

defineSettings(GAME, [
  HINTS_SETTING,
  {
    key: "highContrast", label: "High Contrast Mode", type: "toggle", default: false,
    desc: "Contrast and colorblindness improvements",
  },
]);

const built = makePuzzle(puzzle.id);
const stateKey = puzzle.id;
let state = repair(loadState(GAME, stateKey), built);
const save = () => saveState(GAME, stateKey, state);
save();

const hintBtn = hintButton(GAME, () => offerHint());
const { main } = mountShell({
  gameId: GAME,
  puzzle,
  onHelp: () => showHelp(),
  onStats: () => openStats(),
  extraButtons: [hintBtn, newGameButton()],
});

const root = el("div.bp");
const live = el("div.visually-hidden", { "aria-live": "polite" });
main.append(root, live);

let started = false;
let draft = null;

function question() {
  return built.questions[state.index];
}

function playing() {
  return started && state.status === "playing" && !isModalOpen() && !document.querySelector(".splash");
}

function currentValue() {
  const q = question();
  if (draft && draft.index === state.index) return clampGuess(q, draft.value);
  return sliderStart(q);
}

function render() {
  const q = question();
  const total = built.questions.length;
  const hud = el("div.bp-hud",
    el("div", `Question ${state.index + 1} of ${total}`),
    el("div.bp-score", `${state.score} pts`),
  );
  const ask = el("h2.bp-ask", q.text);
  const pair = el("div.bp-pair",
    el("div.bp-card", el("div.bp-k", "Count"), el("div.bp-name", q.unitName)),
    el("div.bp-eq", "≈"),
    el("div.bp-card", el("div.bp-k", "Matches"), el("div.bp-name", q.targetName)),
  );
  const parts = [hud, ask, pair];
  if (state.hinted.includes(state.index)) parts.push(el("p.bp-fact", q.targetFact));

  if (state.phase === "guess") {
    const value = currentValue();
    const read = el("div.bp-value", { id: "bp-read" }, formatCount(value));
    const range = el("p.bp-range", `Between ${formatCount(q.min)} and ${formatCount(q.max)}`);
    const slider = el("input.bp-slider", {
      type: "range",
      min: String(q.min),
      max: String(q.max),
      step: String(q.step),
      value: String(value),
      "aria-label": "Your guess",
      "aria-valuetext": formatCount(value),
    });
    slider.addEventListener("input", () => {
      const next = clampGuess(q, slider.value);
      draft = { index: state.index, value: next };
      read.textContent = formatCount(next);
      slider.setAttribute("aria-valuetext", formatCount(next));
    });
    const guess = el("button.btn", { type: "button", onclick: () => commit(currentValue()) }, "Make guess");
    parts.push(range, read, slider, guess);
    if (hintsOn(GAME) && !state.hinted.includes(state.index)) {
      parts.push(el("button.bp-link", { type: "button", onclick: () => offerHint() }, "Need a hint?"));
    }
  } else {
    const guess = state.guesses[state.index];
    const band = bandById(state.bands[state.index]);
    const earned = state.points[state.index] || 0;
    parts.push(
      el("p.bp-you", `You guessed ${formatCount(guess)}`),
      el("p.bp-band", { "data-band": band.id }, `You're ${band.label}!`),
      el("p.bp-answer", `The answer is ${formatCount(q.answer)}`),
      el("p.bp-earned", earned ? `+${earned}` : "No points"),
    );
    if (state.halved[state.index]) parts.push(el("p.bp-note", "The hint cut this score in half."));
    parts.push(el("button.bp-link", { type: "button", onclick: () => showMath() }, "Show the math"));
    const last = state.index >= total - 1;
    parts.push(el("button.btn", {
      type: "button",
      onclick: () => (last ? finishRound() : nextQuestion()),
    }, last ? "See results" : "Next"));
  }
  root.replaceChildren(...parts);
}

function commit(value) {
  if (!playing() || state.phase !== "guess") return;
  const q = question();
  const guess = clampGuess(q, value);
  const hinted = state.hinted.includes(state.index);
  const scored = scoreGuess(q, guess, { hinted, hintsUsed: state.hinted.length });
  state.guesses.push(guess);
  state.bands.push(scored.band.id);
  state.points.push(scored.points);
  state.halved.push(scored.halved);
  state.score += scored.points;
  state.phase = "reveal";
  draft = null;
  save();
  live.textContent = `You're ${scored.band.label}. The answer is ${formatCount(q.answer)}. ${scored.points} points.`;
  render();
}

function nextQuestion() {
  if (state.status !== "playing" || state.phase !== "reveal") return;
  if (state.index >= built.questions.length - 1) return;
  state.index += 1;
  state.phase = "guess";
  draft = null;
  save();
  render();
}

function finishRound() {
  if (state.status === "done") {
    openStats();
    return;
  }
  state.status = "done";
  save();
  recordResult(GAME, puzzle, { won: true, bucket: resultBucket(state.score) });
  openStats();
}

function offerHint() {
  if (!playing() || state.phase !== "guess") return;
  if (!hintsOn(GAME) || state.hinted.includes(state.index)) return;
  const q = question();
  const free = state.hinted.length === 0;
  const close = showModal({
    title: "Hint",
    content: [
      el("p", free
        ? "The first hint is free. Later hints cut that question's score in half."
        : "This hint cuts the question's score in half."),
      el("p", `A fact about ${q.targetName}:`),
      el("p.bp-fact", q.targetFact),
      el("button.btn", {
        type: "button",
        onclick: () => {
          close();
          if (!state.hinted.includes(state.index)) state.hinted.push(state.index);
          save();
          live.textContent = q.targetFact;
          render();
        },
      }, "Use hint"),
    ],
  });
}

function showMath() {
  const q = question();
  const guess = state.guesses[state.index];
  const scored = scoreGuess(q, guess, {
    hinted: state.hinted.includes(state.index),
    hintsUsed: state.hinted.filter((index) => index <= state.index).length,
  });
  showModal({
    title: "The math",
    content: explainLines(q, guess, scored).map((line) => el("p", line)),
  });
}

function showHelp() {
  showModal({
    title: "How To Play",
    subtitle: "Guess the absurd comparison.",
    content: [
      el("ul.help-list",
        el("li", "Five questions ask how many of a small thing match a big one, by length or by weight. Each one pairs two new things, and nothing in the round is used twice."),
        el("li", "The slider covers one range, such as 100 to 1,000. You get one guess."),
        el("li", "Land inside 30% of the top of that range to score. Closer is worth more: on fire, hot, warm, then lukewarm. Ice cold scores nothing."),
        el("li", "The questions are worth 100, 150, 200, 250, and 300. A perfect round is 1,000."),
        el("li", "The lightbulb reveals a fact about the big thing in imperial units, with the metric measure beside it. The first hint is free. Later hints cut that question in half.")),
      el("p", "Today's five are the same for everyone. The shuffle starts another set whenever you want. Practice does not change your daily streak."),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status === "done";
  const bucket = done ? resultBucket(state.score) : null;
  const rows = [
    { label: "0", key: "0" },
    { label: "300", key: "300" },
    { label: "600", key: "600" },
    { label: "900", key: "900" },
    { label: "1k", key: "1000" },
  ].map((row) => ({ label: row.label, count: stats.dist[row.key] || 0, highlight: bucket === row.key }));
  const marks = done
    ? state.bands.map((id) => bandById(id).mark).join(" ")
    : "";
  showStats({
    title: done ? `${state.score} points` : undefined,
    message: done ? marks : "",
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Best", value: String(bestScore()) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: { title: "Score", rows },
    nextLabel: puzzle.isToday && done ? "Next Ballpark" : null,
    shareText: done ? shareText({ puzzle, state }) : null,
  });
}

function bestScore() {
  let saved = Number(get("ballpark:best")) || 0;
  if (state.status === "done" && puzzle.isDaily && state.score > saved) {
    saved = state.score;
    set("ballpark:best", saved);
  }
  return saved;
}

render();
if (state.status === "done") {
  recordResult(GAME, puzzle, { won: true, bucket: resultBucket(state.score) });
}

document.addEventListener("keydown", (e) => {
  if (!playing()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Enter") {
    e.preventDefault();
    if (state.phase === "guess") commit(currentValue());
    else if (state.index >= built.questions.length - 1) finishRound();
    else nextQuestion();
    return;
  }
  if (state.phase !== "guess") return;
  const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const q = question();
  const next = clampGuess(q, currentValue() + step * q.step);
  draft = { index: state.index, value: next };
  render();
});

onSettingsChange(({ scope, key }) => {
  if (scope === GAME && (key === "hints" || key === "highContrast")) render();
});

const finished = state.status === "done";
await splash({
  gameId: GAME,
  puzzle,
  playLabel: finished ? "See results" : state.guesses.length ? "Continue" : "Play",
  tagline: "Guess how many of a small thing match a big one.",
  byline: "Five questions",
});
started = true;
if (finished) openStats();
else if (!get("seen:ballpark")) {
  set("seen:ballpark", true);
  showHelp();
}
