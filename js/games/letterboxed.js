// Letter Boxed — faithful to the NYT game.
import { currentPuzzle, seededRandom, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, isModalOpen, toast, showStats, splash, hintButton, newGameButton } from "../core/ui.js";
import { loadDictionary, loadCommon } from "../core/words.js";
import {
  candidateWords, boardFor, sideMap, playableWords, computePar, validateWord, usedLetters, shareText, hintWord,
} from "./letterboxed/logic.js";

const GAME = "letterboxed";
const SVG_NS = "http://www.w3.org/2000/svg";
const puzzle = currentPuzzle();

defineSettings(GAME, [HINTS_SETTING]);
const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({ gameId: GAME, puzzle, onHelp: showHelp, onStats: openStats, extraButtons: [hintBtn, newGameButton()] });

const loading = el("div.lb-loading", "Building today's box…");
main.append(loading);

// Show the splash right away (from saved state) while the dictionary loads.
const saved = loadState(GAME, puzzle.id);
const finishedAtStart = !!saved && saved.status !== "playing";
const startedAtStart = !!saved && ((saved.words || []).length > 0 || (saved.current || "").length > 0);
const nWords = saved ? (saved.words || []).length : 0;
const splashDone = splash({
  gameId: GAME,
  puzzle,
  playLabel: finishedAtStart ? "See Stats" : startedAtStart ? "Continue" : "Play",
  tagline: finishedAtStart ? "Great job on today's puzzle! Check out your progress."
    : startedAtStart ? `You've played ${nWords} word${nWords === 1 ? "" : "s"}. Keep it up!` : undefined,
});

// ---------------------------------------------------------------- puzzle

const [dict, common] = await Promise.all([loadDictionary(), loadCommon()]);

const commonList = [];
for (const [w, r] of common) if (r <= 20000 && dict.has(w)) commonList.push(w);
let state = saved;
if (!state || !Array.isArray(state.sides)) {
  const board = boardFor(seededRandom, puzzle.id, candidateWords(common, dict));
  state = {
    sides: board.sides, solution: board.solution,
    par: computePar(playableWords(commonList, board.sides).length),
    words: [], current: "", status: "playing",
  };
}
// hints: how many used. hint: { word, level, after } for the word suggested after `after` words
// (level 1 shows its length and start, 2 the whole word).
if (!Number.isInteger(state.hints) || state.hints < 0) state.hints = 0;
const hintPool = playableWords(commonList, state.sides);
const sm = sideMap(state.sides);
const letters = state.sides.flat();
const save = () => saveState(GAME, puzzle.id, state);
save();

// ---------------------------------------------------------------- geometry

const VB = 320, LO = 60, HI = 260;
const at = [1 / 6, 3 / 6, 5 / 6].map((f) => LO + (HI - LO) * f);
const pos = {}; // letter -> { x, y, tx, ty, hx, hy }
state.sides.forEach((side, s) => side.forEach((c, i) => {
  const t = at[i];
  const P = [
    { x: t, y: LO, tx: t, ty: LO - 30, hx: t, hy: LO - 18 },
    { x: HI, y: t, tx: HI + 30, ty: t, hx: HI + 18, hy: t },
    { x: t, y: HI, tx: t, ty: HI + 30, hx: t, hy: HI + 18 },
    { x: LO, y: t, tx: LO - 30, ty: t, hx: LO - 18, hy: t },
  ][s];
  pos[c] = P;
}));

const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// ---------------------------------------------------------------- DOM

const currentEl = el("div.lb-current", { "aria-live": "polite" });
const wordsEl = el("div.lb-words");
const parEl = el("div.lb-par");
const hintEl = el("div.lb-hint", { "aria-live": "polite" });

const svg = svgEl("svg", { viewBox: `12 12 ${VB - 24} ${VB - 24}`, class: "lb-svg", role: "group", "aria-label": "Letter box" });
svg.append(svgEl("rect", { x: LO, y: LO, width: HI - LO, height: HI - LO, class: "lb-square" }));
const doneLines = svgEl("g", { class: "lb-lines-done" });
const curLines = svgEl("g", { class: "lb-lines-current" });
svg.append(doneLines, curLines);
const letterNodes = {};
for (const c of letters) {
  const p = pos[c];
  const g = svgEl("g", { class: "lb-letter", role: "button", tabindex: "-1", "aria-label": c.toUpperCase() });
  g.append(
    svgEl("circle", { cx: p.hx, cy: p.hy, r: 26, class: "lb-hit" }),
    svgEl("circle", { cx: p.x, cy: p.y, r: 9, class: "lb-dot" }),
  );
  const text = svgEl("text", { x: p.tx, y: p.ty, class: "lb-char", "text-anchor": "middle", "dominant-baseline": "central" });
  text.textContent = c.toUpperCase();
  g.append(text);
  g.addEventListener("pointerdown", (e) => { e.preventDefault(); addLetter(c); });
  letterNodes[c] = g;
  svg.append(g);
}

const btn = (label, onClick) => el("button.lb-btn", { type: "button", onclick: (e) => { e.currentTarget.blur(); onClick(); } }, label);
const buttons = el("div.lb-buttons", btn("Restart", restart), btn("Delete", del), btn("Enter", enter));
const giveUpBtn = el("button.lb-link", { type: "button", onclick: confirmGiveUp }, "See solution");
const solutionEl = el("div.lb-solution");

loading.remove();
main.append(el("div.lb-game",
  el("div.lb-top", currentEl, wordsEl, parEl, hintEl),
  el("div.lb-box-wrap", svg),
  buttons,
  el("div.lb-foot", giveUpBtn, solutionEl),
));

// ---------------------------------------------------------------- render

function polyline(word, cls) {
  const pts = [...word].map((c) => `${pos[c].x},${pos[c].y}`).join(" ");
  return svgEl("polyline", { points: pts, class: cls });
}

function render() {
  const cur = state.current;
  currentEl.replaceChildren(...[...cur.toUpperCase()].map((c) => el("span", c)));
  currentEl.classList.toggle("empty", !cur);
  wordsEl.textContent = state.words.map((w) => w.toUpperCase()).join(" – ");
  parEl.textContent = `Try to solve in ${state.par} words`;
  const hint = liveHint();
  hintEl.hidden = !hint;
  hintEl.textContent = !hint ? ""
    : hint.level >= 2 ? `Hint: ${hint.word.toUpperCase()}`
    : `Hint: a ${hint.word.length}-letter word starting ${hint.word.slice(0, 2).toUpperCase()}`;

  doneLines.replaceChildren(...state.words.map((w) => polyline(w, "lb-line done")));
  curLines.replaceChildren(...(cur.length > 1 ? [polyline(cur, "lb-line current")] : []));

  const used = usedLetters(state.words);
  const inCur = new Set(cur);
  const last = cur[cur.length - 1];
  for (const c of letters) {
    const g = letterNodes[c];
    g.classList.toggle("used", used.has(c));
    g.classList.toggle("in-current", inCur.has(c));
    g.classList.toggle("last", c === last);
    g.classList.toggle("blocked", state.status === "playing" && !!last && c !== last && sm[c] === sm[last]);
  }
  const playing = state.status === "playing";
  buttons.querySelectorAll("button").forEach((b) => (b.disabled = !playing));
  giveUpBtn.hidden = !playing;
  solutionEl.replaceChildren(...(playing ? [] : [
    el("span.lb-solution-label", "Our solution: "), state.solution.map((w) => w.toUpperCase()).join(" – "),
  ]));
  document.querySelector(".lb-game").classList.toggle("finished", !playing);
}

function shakeWord() {
  currentEl.classList.remove("shake");
  void currentEl.offsetWidth;
  currentEl.classList.add("shake");
}

// ---------------------------------------------------------------- hints

/** The current suggestion, if it still applies to the words played. */
function liveHint() {
  const h = state.hint;
  return state.status === "playing" && h && h.after === state.words.length ? h : null;
}

function useHint() {
  if (state.status !== "playing") { toast("The game is over"); return; }
  const h = liveHint();
  if (h && h.level >= 2) { toast("Play that word, or Delete to try another way"); return; }
  if (h) {
    state.hint = { ...h, level: 2 };
  } else {
    const word = hintWord(state.words, hintPool);
    if (!word) { toast("No hint here. Try Delete to go back a word"); return; }
    state.hint = { word, level: 1, after: state.words.length };
  }
  state.hints += 1;
  save();
  render();
}

// ---------------------------------------------------------------- moves

function addLetter(c) {
  if (state.status !== "playing" || !(c in sm)) return;
  const last = state.current[state.current.length - 1];
  if (last && sm[last] === sm[c]) {
    if (c !== last) { toast("Letters can't be from the same side"); shakeWord(); }
    return;
  }
  state.current += c;
  save();
  render();
}

function del() {
  if (state.status !== "playing") return;
  if (state.current.length > 1) state.current = state.current.slice(0, -1);
  else if (state.words.length) state.current = state.words.pop(); // un-submit previous word, like NYT
  else state.current = "";
  save();
  render();
}

function restart() {
  if (state.status !== "playing") return;
  state.words = [];
  state.current = "";
  save();
  render();
}

function enter() {
  if (state.status !== "playing") return;
  const w = state.current;
  const err = validateWord(w, sm, dict);
  if (err) { toast(err); shakeWord(); return; }
  state.words.push(w);
  if (usedLetters(state.words).size === 12) {
    state.current = "";
    state.status = "won";
    save();
    recordResult(GAME, puzzle, { won: true, bucket: bucketFor(state.words.length) });
    render();
    celebrate();
    return;
  }
  state.current = w[w.length - 1];
  save();
  render();
}

const bucketFor = (n) => (n >= 7 ? "7+" : String(n));

function confirmGiveUp() {
  if (state.status !== "playing") return;
  const close = showModal({
    title: "See solution?",
    content: [
      el("p", "This will end today's game and reveal our solution. It counts as unsolved in your stats."),
      el("div.lb-confirm",
        el("button.btn.secondary", { type: "button", onclick: () => close() }, "Keep playing"),
        el("button.btn", { type: "button", onclick: () => { close(); giveUp(); } }, "Reveal")),
    ],
  });
}

function giveUp() {
  state.status = "lost";
  state.current = "";
  save();
  recordResult(GAME, puzzle, { won: false });
  render();
  setTimeout(openStats, 600);
}

function celebrate() {
  const n = state.words.length;
  toast(n <= 2 ? "Perfect!" : n < state.par ? "Amazing!" : n === state.par ? "Great job!" : "Solved!", 2000);
  const game = document.querySelector(".lb-game");
  game.classList.add("celebrate");
  letters.forEach((c, i) => setTimeout(() => letterNodes[c].classList.add("pop"), i * 60));
  const colors = ["#fc716b", "#ffffff", "#121212", "#f9df6d", "#6aaa64", "#85c0f9"];
  const confetti = el("div.lb-confetti", { "aria-hidden": "true" });
  for (let i = 0; i < 70; i++) {
    confetti.append(el("i", { style: {
      left: `${(i * 37) % 100}%`, background: colors[i % colors.length],
      animationDelay: `${(i % 10) * 0.06}s`, animationDuration: `${1.4 + (i % 7) * 0.15}s`,
      transform: `rotate(${(i * 47) % 360}deg)`,
    } }));
  }
  document.body.append(confetti);
  setTimeout(() => confetti.remove(), 3200);
  setTimeout(() => { game.classList.remove("celebrate"); openStats(); }, 1800);
}

// ---------------------------------------------------------------- keyboard

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
  if (document.querySelector(".splash")) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Enter") { e.preventDefault(); enter(); }
  else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); del(); }
  else if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key.toLowerCase());
});

// ---------------------------------------------------------------- modals

function showHelp() {
  const playing = state.status === "playing";
  let close;
  close = showModal({
    title: "How To Play",
    subtitle: "Create words using letters around the square.",
    className: "lb-help",
    content: [
      el("ul.help-list",
        el("li", "Connect letters to spell words"),
        el("li", "Words must be at least 3 letters long"),
        el("li", "Letters can be reused"),
        el("li", "Consecutive letters cannot be from the same side"),
        el("li", "The last letter of a word becomes the first letter of the next word ",
          el("span.lb-eg", "e.g. THY > YES > SINCE")),
        el("li", "Use all letters to solve!"),
        el("li", "Stuck? The 💡 button suggests your next word: first its length and start, then the whole word. Hints can be turned off in Settings.")),
      el("p", `Try to solve today's box in ${state.par} words or fewer. Tap letters or type on your keyboard; `,
        el("strong", "Delete"), " past the start of a word brings back your previous word, and ",
        el("strong", "Restart"), " clears everything."),
      playing && el("div.lb-help-giveup",
        el("p", "Stuck? You can end the game and see our solution."),
        el("button.btn.small.secondary", { type: "button", onclick: () => { close(); confirmGiveUp(); } }, "See solution")),
    ],
  });
}

function openStats() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const n = state.words.length;
  const labels = ["1", "2", "3", "4", "5", "6", "7+"];
  const extra = done ? el("div.lb-stats-extra",
    el("p", el("strong", "Our solution: "), state.solution.map((w) => w.toUpperCase()).join(" – ")),
    state.status === "won" && el("p", el("strong", "Your words: "), state.words.map((w) => w.toUpperCase()).join(" – ")),
  ) : null;
  showStats({
    title: state.status === "won" ? "Congratulations!" : state.status === "lost" ? "Better luck tomorrow" : undefined,
    message: state.status === "won"
      ? `You solved it in ${n} word${n === 1 ? "" : "s"}${n < state.par ? " — under par!" : n === state.par ? " — right on par." : "."}`
      : null,
    tiles: [
      { label: "Played", value: String(stats.played) },
      { label: "Solved %", value: String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0) },
      { label: "Current Streak", value: String(liveStreak(stats, todayKey())) },
      { label: "Max Streak", value: String(stats.maxStreak) },
    ],
    distribution: {
      title: "Words Used",
      rows: labels.map((l) => ({ label: l, count: stats.dist[l] || 0, highlight: state.status === "won" && bucketFor(n) === l })),
    },
    extra,
    nextLabel: done ? "Next Letter Boxed" : null,
    shareText: done ? shareText(puzzle, state.words, state.status === "won", state.hints) : null,
  });
}

// ---------------------------------------------------------------- start

render();

await splashDone;

if (state.status !== "playing") openStats();
else if (!get("seen:letterboxed")) { set("seen:letterboxed", true); showHelp(); }
