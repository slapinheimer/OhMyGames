// Oh My WORDS! — Connections: create four groups of four.
import { currentPuzzle, seededRandom, shuffle, todayKey } from "../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import { loadJSON } from "../core/words.js";
import { prepareLibrary, generatePuzzle } from "./connections/generator.js";

const GAME = "connections";
const MAX_MISTAKES = 4;
const MAX_HINTS = 3; // category names; the last group is always left to work out
const EMOJI = ["🟨", "🟩", "🟦", "🟪"];
const WIN_MESSAGES = ["Perfect!", "Great!", "Solid!", "Phew!"];
const LOSS_MESSAGE = "Next Time!";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const puzzle = currentPuzzle();
defineSettings(GAME, [HINTS_SETTING]); // otherwise minimal, like NYT: only the global dark theme
const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({ gameId: GAME, puzzle, onHelp: showHelp, onStats: () => showResults(), extraButtons: [hintBtn, newGameButton()] });

const game = el("div.cx-game", el("p.cx-loading", "Loading puzzle…"));
main.append(game);

let P; // { groups: [{name, level, words}], tiles }
try {
  const lib = prepareLibrary(await loadJSON("data/connections/categories.json"));
  P = generatePuzzle(lib, puzzle, seededRandom(GAME, puzzle.id));
} catch (err) {
  console.error(err);
  game.replaceChildren(el("p.cx-loading", "Sorry — the puzzle could not be loaded."));
  throw err;
}

const groupOf = new Map();
P.groups.forEach((g, i) => g.words.forEach((w) => groupOf.set(w, i)));
const signature = P.groups.map((g) => g.name + ":" + g.words.join(",")).join("|");

// ---------------------------------------------------------------- state

function freshState() {
  return {
    v: 1, sig: signature, status: "playing",
    order: P.tiles.slice(), // unsolved words in board order
    selected: [], // selected words
    solved: [], // group indices, in the order they were placed on the board
    found: 0, // how many of `solved` the player found (the rest were revealed)
    mistakes: 0,
    guesses: [], // arrays of 4 words, in submission order
    hints: [], // group indices whose category name a hint revealed
    recorded: false,
  };
}

let state = loadState(GAME, puzzle.id);
if (!state || state.sig !== signature) state = freshState();
if (!Array.isArray(state.hints)) state.hints = [];
const save = () => saveState(GAME, puzzle.id, state);

let busy = false;
// What the board currently shows (can lag behind `state` during animations).
const view = { solved: state.solved.slice(), order: state.order.slice() };

// ---------------------------------------------------------------- DOM

const board = el("div.cx-board", { role: "group", "aria-label": "Word grid" });
const dots = el("div.cx-dots", { "aria-hidden": "true" });
const mistakesLabel = el("span.visually-hidden");
const mistakesRow = el("div.cx-mistakes", el("span", "Mistakes Remaining:"), dots, mistakesLabel);
const shuffleBtn = el("button.cx-btn", { type: "button", onclick: onShuffle }, "Shuffle");
const deselectBtn = el("button.cx-btn", { type: "button", onclick: onDeselect }, "Deselect All");
const submitBtn = el("button.cx-btn.primary", { type: "button", onclick: onSubmit }, "Submit");
const resultsBtn = el("button.cx-btn.results", { type: "button", onclick: () => showResults() }, "View Results");
const controls = el("div.cx-controls");
const hintLine = el("p.cx-hints", { "aria-live": "polite" });

game.replaceChildren(el("p.cx-prompt", "Create four groups of four!"), hintLine, board, mistakesRow, controls);

for (let i = 0; i < MAX_MISTAKES; i++) dots.append(el("span.cx-dot"));

function tileNode(word) {
  const node = el("button.cx-tile", {
    type: "button", "aria-pressed": String(state.selected.includes(word)), dataset: { word },
    onclick: () => toggle(word, node),
  }, el(`span.cx-word${word.includes(" ") ? ".multi" : ""}`, word));
  return node;
}

function groupNode(index, animate = false) {
  const g = P.groups[index];
  return el(`div.cx-group.lvl-${g.level}${animate ? ".reveal" : ""}`, { role: "status", dataset: { group: index } },
    el("div.cx-cat", g.name),
    el("div.cx-members", g.words.join(", ")));
}

function renderBoard(animateGroup = -1) {
  board.replaceChildren(
    ...view.solved.map((i) => groupNode(i, i === animateGroup)),
    ...view.order.map(tileNode),
  );
  requestAnimationFrame(fitAll);
}

function renderHints() {
  const open = state.status === "playing" ? state.hints.filter((i) => !state.solved.includes(i)) : [];
  hintLine.hidden = !open.length;
  hintLine.replaceChildren(el("span.cx-hints-label", "Hint"),
    ...open.map((i) => el(`span.cx-hint.lvl-${P.groups[i].level}`, P.groups[i].name)));
}

function useHint() {
  if (state.status !== "playing") { toast("The puzzle is over"); return; }
  if (busy) return;
  if (state.hints.length >= MAX_HINTS) { toast("No more hints"); return; }
  const next = P.groups.map((g, i) => ({ i, level: g.level }))
    .filter(({ i }) => !state.solved.includes(i) && !state.hints.includes(i))
    .sort((a, b) => a.level - b.level)[0];
  if (!next || P.groups.length - state.solved.length <= 1) { toast("No more hints"); return; }
  state.hints.push(next.i);
  save();
  renderHints();
  toast(`One group is: ${P.groups[next.i].name}`, 2400);
}

function renderStatus() {
  renderHints();
  const left = MAX_MISTAKES - state.mistakes;
  [...dots.children].forEach((d, i) => d.classList.toggle("used", i >= left));
  mistakesLabel.textContent = `${left} of ${MAX_MISTAKES}`;
  if (state.status === "playing") {
    mistakesRow.style.visibility = "";
    if (!controls.contains(submitBtn)) controls.replaceChildren(shuffleBtn, deselectBtn, submitBtn);
    submitBtn.disabled = state.selected.length !== 4 || busy;
    deselectBtn.disabled = state.selected.length === 0 || busy;
    shuffleBtn.disabled = busy;
  } else if (busy) {
    // finishing animation (last group / loss reveal) still running
    controls.replaceChildren();
  } else {
    mistakesRow.style.visibility = "hidden";
    controls.replaceChildren(resultsBtn);
  }
  board.classList.toggle("busy", busy);
}

/** Shrink tile text until it fits (long words on small phones). */
function fitAll() {
  for (const tile of board.querySelectorAll(".cx-tile")) {
    const word = tile.firstChild;
    word.style.fontSize = "";
    let size = parseFloat(getComputedStyle(word).fontSize);
    const maxH = tile.clientHeight - 4;
    while ((word.scrollWidth > word.clientWidth + 0.5 || word.scrollHeight > maxH) && size > 8) {
      size -= 0.5;
      word.style.fontSize = `${size}px`;
    }
  }
  for (const group of board.querySelectorAll(".cx-group .cx-members")) {
    group.style.fontSize = "";
    group.style.whiteSpace = "nowrap";
    let size = parseFloat(getComputedStyle(group).fontSize);
    while (group.scrollWidth > group.clientWidth + 0.5 && size > 10) {
      size -= 0.5;
      group.style.fontSize = `${size}px`;
    }
    if (group.scrollWidth > group.clientWidth + 0.5) group.style.whiteSpace = "normal";
  }
}
window.addEventListener("resize", () => requestAnimationFrame(fitAll));

const tileFor = (word) => board.querySelector(`.cx-tile[data-word="${CSS.escape(word)}"]`);

// ---------------------------------------------------------------- actions

function toggle(word, node) {
  if (busy || state.status !== "playing") return;
  const i = state.selected.indexOf(word);
  if (i >= 0) state.selected.splice(i, 1);
  else if (state.selected.length < 4) state.selected.push(word);
  else return;
  node.setAttribute("aria-pressed", String(i < 0));
  save();
  renderStatus();
}

function onShuffle() {
  if (busy || state.status !== "playing") return;
  state.order = shuffle(state.order);
  view.order = state.order.slice();
  save();
  renderBoard();
}

function onDeselect() {
  if (busy || state.status !== "playing") return;
  state.selected = [];
  save();
  board.querySelectorAll(".cx-tile").forEach((t) => t.setAttribute("aria-pressed", "false"));
  renderStatus();
}

const guessKey = (words) => words.slice().sort().join("|");

async function onSubmit() {
  if (busy || state.status !== "playing" || state.selected.length !== 4) return;
  const picked = view.order.filter((w) => state.selected.includes(w)); // board order, for the hop
  if (state.guesses.some((g) => guessKey(g) === guessKey(picked))) {
    toast("Already guessed!");
    return;
  }
  busy = true;
  renderStatus();

  // Decide and persist first, then animate.
  const counts = new Map();
  picked.forEach((w) => counts.set(groupOf.get(w), (counts.get(groupOf.get(w)) || 0) + 1));
  const best = Math.max(...counts.values());
  const correct = best === 4;
  const gi = groupOf.get(picked[0]);
  state.guesses.push(picked);
  if (correct) {
    state.solved.push(gi);
    state.found++;
    state.order = state.order.filter((w) => !picked.includes(w));
    state.selected = [];
    if (state.found === 4) state.status = "won";
  } else {
    state.mistakes++;
    if (state.mistakes >= MAX_MISTAKES) {
      state.status = "lost";
      state.selected = [];
      const rest = P.groups.map((_, i) => i).filter((i) => !state.solved.includes(i));
      state.solved.push(...rest);
      state.order = [];
    }
  }
  save();

  await hop(picked);
  if (correct) {
    await placeGroup(gi);
  } else {
    if (best === 3 && state.status === "playing") toast("One away...");
    await shake(picked);
    renderStatus();
    if (state.status === "lost") {
      await sleep(500);
      board.querySelectorAll(".cx-tile").forEach((t) => t.setAttribute("aria-pressed", "false"));
      for (const i of state.solved.slice(state.found)) {
        await placeGroup(i);
        await sleep(450);
      }
    }
  }
  busy = false;
  renderStatus();
  if (state.status !== "playing") finish();
}

async function hop(words) {
  const nodes = words.map(tileFor).filter(Boolean);
  nodes.forEach((n, i) => { n.style.animationDelay = `${i * 100}ms`; n.classList.add("hop"); });
  await sleep(300 + (nodes.length - 1) * 100 + 80);
  nodes.forEach((n) => { n.classList.remove("hop"); n.style.animationDelay = ""; });
}

async function shake(words) {
  const nodes = words.map(tileFor).filter(Boolean);
  nodes.forEach((n) => n.classList.add("shake"));
  await sleep(480);
  nodes.forEach((n) => n.classList.remove("shake"));
}

/**
 * Animate a group's tiles into the first open row (NYT-style swap with the
 * tiles already there), then replace them with the colored group bar.
 */
async function placeGroup(index) {
  const words = P.groups[index].words;
  const order = view.order.slice();
  const targets = order.slice(0, 4);
  const moving = words.filter((w) => !targets.includes(w));
  const displaced = targets.filter((w) => !words.includes(w));
  // swap each displaced top-row word into a vacated slot
  displaced.forEach((w, k) => {
    const from = order.indexOf(moving[k]);
    const to = order.indexOf(w);
    [order[from], order[to]] = [order[to], order[from]];
  });
  const first = new Map(order.map((w) => [w, tileFor(w)?.getBoundingClientRect()]));
  view.order = order;
  renderBoard();
  board.querySelectorAll(".cx-tile").forEach((n) => {
    const w = n.dataset.word;
    n.setAttribute("aria-pressed", String(words.includes(w)));
    const a = first.get(w), b = n.getBoundingClientRect();
    if (!a) return;
    const dx = a.left - b.left, dy = a.top - b.top;
    if (!dx && !dy) return;
    n.style.transition = "none";
    n.style.transform = `translate(${dx}px, ${dy}px)`;
    n.style.zIndex = words.includes(w) ? "2" : "1";
  });
  board.offsetWidth; // flush styles before transitioning back
  board.querySelectorAll(".cx-tile").forEach((n) => {
    if (!n.style.transform) return;
    n.style.transition = "transform 0.4s ease-in-out";
    n.style.transform = "";
  });
  await sleep(moving.length ? 450 : 120);
  view.solved.push(index);
  view.order = order.filter((w) => !words.includes(w));
  renderBoard(index);
  board.querySelectorAll(".cx-tile").forEach((n) =>
    n.setAttribute("aria-pressed", String(state.selected.includes(n.dataset.word))));
  await sleep(350);
}

// ---------------------------------------------------------------- finish & results

function finish() {
  if (!state.recorded) {
    recordResult(GAME, puzzle, { won: state.status === "won", bucket: String(state.mistakes) });
    state.recorded = true;
    save();
  }
  toast(resultMessage(), 2000);
  setTimeout(() => { if (!isModalOpen()) showResults(); }, 1600);
}

const resultMessage = () => (state.status === "won" ? WIN_MESSAGES[state.mistakes] : LOSS_MESSAGE);

function shareText() {
  const tip = state.hints.length ? ` 💡${state.hints.length}` : "";
  const head = `Oh My WORDS! Connections\n${puzzle.number ? `Puzzle #${puzzle.number}` : "Practice Puzzle"}${tip}\n`;
  return head + state.guesses.map((g) => g.map((w) => EMOJI[P.groups[groupOf.get(w)].level]).join("")).join("\n");
}

function showResults() {
  const stats = getStats(GAME);
  const done = state.status !== "playing";
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  let resultNode = null;
  if (done) {
    resultNode = el("div.cx-result",
      el("p.cx-result-sub", state.status === "won" ? "You completed the puzzle!" : "Better luck next time."),
      el("div.cx-grid", { "aria-label": "Your guesses" }, state.guesses.map((g) =>
        el("div.cx-grid-row", g.map((w) => el(`div.cx-grid-cell.lvl-${P.groups[groupOf.get(w)].level}`))))));
  }
  showStats({
    title: done ? resultMessage() : "Statistics",
    tiles: [
      { label: "Completed", value: stats.played },
      { label: "Win %", value: winPct },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Max Streak", value: stats.maxStreak },
    ],
    distribution: {
      title: "Mistake Distribution",
      rows: [0, 1, 2, 3, 4].map((m) => ({
        label: String(m), count: stats.dist[String(m)] || 0, highlight: done && state.mistakes === m,
      })),
    },
    shareText: done ? shareText() : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
    extra: resultNode,
  });
  // Put the guess grid at the top, NYT-style.
  if (resultNode) {
    const modal = resultNode.closest(".modal");
    const firstH3 = modal && modal.querySelector("h3");
    if (firstH3) modal.insertBefore(resultNode, firstH3);
  }
}

// ---------------------------------------------------------------- help

function showHelp() {
  const swatch = (lvl) => el("div.swatch", { style: { background: `var(--cx-${["yellow", "green", "blue", "purple"][lvl]})` } });
  showModal({
    title: "How to Play",
    subtitle: "Find groups of four items that share something in common.",
    className: "cx-help",
    content: [
      el("ul",
        el("li", "Select four items and tap ", el("b", "Submit"), " to check if your guess is correct."),
        el("li", "Find the groups without making 4 mistakes!"),
        el("li", "Stuck? The 💡 button names a group, easiest first, up to three. Hints can be turned off in Settings.")),
      el("h3", "Category Examples"),
      el("div.cx-example", el("b", "Fish: "), "Bass, Flounder, Salmon, Trout"),
      el("div.cx-example", el("b", "Fire ___: "), "Ant, Drill, Island, Opal"),
      el("p", "Categories will always be more specific than “5-LETTER WORDS,” “NAMES” or “VERBS.”"),
      el("p", "Each puzzle has exactly one solution. Watch out for words that seem to belong to multiple categories!"),
      el("p", "Each group is assigned a color, which will be revealed as you solve:"),
      el("div.cx-legend",
        el("div.swatches", [0, 1, 2, 3].map(swatch)),
        el("div.arrow", el("span", "Straightforward"), el("span", "Tricky"))),
    ],
  });
}

// ---------------------------------------------------------------- keyboard

document.addEventListener("keydown", (e) => {
  if (isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); onSubmit(); }
});

// ---------------------------------------------------------------- start

renderBoard();
renderStatus();

const started = state.guesses.length > 0 || state.selected.length > 0;
await splash({
  gameId: GAME, puzzle,
  playLabel: state.status !== "playing" ? "See Results" : started ? "Continue" : "Play",
});
requestAnimationFrame(fitAll);
if (state.status !== "playing") {
  showResults();
} else if (!get("seen:" + GAME)) {
  set("seen:" + GAME, true);
  showHelp();
}
