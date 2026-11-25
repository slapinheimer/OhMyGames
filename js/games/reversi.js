// Oh My PATTERNS! — Reversi: you (dark) against the computer (light). Trap a line of light discs
// to turn them over; the most discs at the end wins. Each day has a game per level (Easy to
// Expert), each with its own stats. Climb is a run where every win brings a stronger computer.
import { currentPuzzle, todayKey } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak, get, set } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, isModalOpen, hintButton, newGameButton } from "../core/ui.js";
import {
  DARK, DEFAULT_LEVEL, LEVELS, LIGHT, MARGIN_BANDS, N, chooseMove, climbRule, count, flips, gameOver, hintMove,
  legalMoves, levelById, marginBand, play, shareText, startBoard, statsId,
} from "./reversi/logic.js";

const GAME = "reversi";
const LEVEL_KEY = "reversi:level";
const CLIMB_KEY = "reversi:climb";
const CLIMB_TOP = 6;
const CPU_DELAY = 550;
const puzzle = currentPuzzle();
defineSettings(GAME, [
  HINTS_SETTING,
  { key: "moves", label: "Show moves", type: "toggle", default: true, desc: "Dot the squares where you can play." },
]);

const hintBtn = hintButton(GAME, () => useHint());
const { main } = mountShell({
  gameId: GAME, puzzle, onHelp: () => showHelp(), onStats: () => openStats(), extraButtons: [hintBtn, newGameButton()],
});

// A game: { board, turn, status ("playing" | "won" | "lost" | "draw"), last, hints, round }.
// state.games[level] holds the day's game at each level; state.status is "won" once any is won.
const freshGame = (round = 0) => ({ board: startBoard(), turn: DARK, status: "playing", last: -1, hints: 0, round });
const saved = loadState(GAME, puzzle.id);
let state = saved && saved.games ? saved : { games: {}, status: "playing" };
const CLIMB_PICK = { id: "climb", name: "Climb" };
const PICKS = [...LEVELS, CLIMB_PICK];
const validLevel = (id) => PICKS.some((l) => l.id === id);
let level = validLevel(state.level) ? state.level : validLevel(get(LEVEL_KEY)) ? get(LEVEL_KEY) : DEFAULT_LEVEL;
const isClimb = () => level === "climb";
// Climb isn't tied to a day: { stage, best, game }. A win moves up a stage; a loss tries again.
let climb = get(CLIMB_KEY, null);
if (!climb || !climb.game || !Number.isInteger(climb.stage)) climb = { stage: 1, best: 0, game: freshGame() };
const save = () => {
  saveState(GAME, puzzle.id, state);
  set(CLIMB_KEY, climb);
};
let started = false;
let g;
let busy = false;
let hinted = -1;
let flipped = new Set();

const rule = () => (isClimb() ? climbRule(climb.stage) : levelById(level));
const seed = () => (isClimb() ? `climb:${climb.stage}:${climb.game.round}` : `${puzzle.id}:${level}:${g.round}`);

// ---------------------------------------------------------------- layout

const levelBtns = PICKS.map((l) => el("button.rvs-level", {
  type: "button", role: "tab", onclick: () => pickLevel(l.id),
}, l.name, el("span.rvs-mark", { "aria-hidden": "true" })));
const darkScore = el("span.rvs-num");
const lightScore = el("span.rvs-num");
const darkSide = el("div.rvs-side", el("span.rvs-disc.is-dark"), el("span.rvs-who", "You"), darkScore);
const lightSide = el("div.rvs-side.is-cpu", lightScore, el("span.rvs-who", "Computer"), el("span.rvs-disc.is-light"));
const cells = Array.from({ length: N * N }, (_, i) => el("button.rvs-cell", {
  type: "button", role: "gridcell", onclick: () => tap(i),
}, el("span.rvs-piece")));
const grid = el("div.rvs-grid", { role: "grid", "aria-label": "Reversi board" }, cells);
const againBtn = el("button.btn.small", { type: "button", onclick: () => again() }, "Play again");
const tip = el("p.rvs-tip", { "aria-live": "polite" });

main.append(el("div.rvs-wrap",
  el("div.rvs-levels", { role: "tablist", "aria-label": "Computer strength" }, levelBtns),
  el("div.rvs-score", darkSide, lightSide),
  grid,
  el("div.rvs-controls", againBtn),
  tip));

function build() {
  if (isClimb()) g = climb.game;
  else {
    if (!state.games[level] || !Array.isArray(state.games[level].board)) state.games[level] = freshGame();
    g = state.games[level];
  }
  state.level = level;
  hinted = -1;
  flipped = new Set();
  save();
  paint();
  if (started) resume();
}

function pickLevel(id) {
  if (id === level || busy) return;
  level = id;
  set(LEVEL_KEY, id);
  build();
}

// ---------------------------------------------------------------- play

function tap(i) {
  if (!started || busy || g.status !== "playing" || g.turn !== DARK) return;
  const turned = flips(g.board, i, DARK);
  if (!turned.length) {
    if (!g.board[i]) toast("That move doesn't turn any discs");
    return;
  }
  move(i, DARK, turned);
  setTimeout(cpuTurn, CPU_DELAY);
}

function move(i, p, turned) {
  g.board = play(g.board, i, p);
  g.last = i;
  g.turn = p === DARK ? LIGHT : DARK;
  hinted = -1;
  flipped = new Set(turned);
  save();
  paint();
}

/** The computer plays (or passes), then hands back to the player, who may also have to pass. */
function cpuTurn() {
  if (g.status !== "playing") return;
  if (gameOver(g.board)) { finish(); return; }
  if (g.turn !== LIGHT) { checkPlayerPass(); return; }
  busy = true;
  paint();
  // Let "Thinking…" paint before a search.
  setTimeout(() => {
    const game = g;
    const m = chooseMove(game.board, LIGHT, rule(), seed());
    busy = false;
    if (game !== g) return;
    if (m < 0) {
      g.turn = DARK;
      toast("The computer has no move and passes");
      save();
    } else move(m, LIGHT, flips(g.board, m, LIGHT));
    checkPlayerPass();
  }, 30);
}

function checkPlayerPass() {
  if (gameOver(g.board)) { finish(); return; }
  if (g.turn === DARK && !legalMoves(g.board, DARK).length) {
    toast("You have no move, so you pass");
    g.turn = LIGHT;
    save();
    setTimeout(cpuTurn, CPU_DELAY + 400);
  }
  paint();
}

function finish() {
  const dark = count(g.board, DARK);
  const light = count(g.board, LIGHT);
  g.status = dark > light ? "won" : dark < light ? "lost" : "draw";
  if (isClimb()) {
    if (g.status === "won") climb.best = Math.max(climb.best, climb.stage);
  } else {
    if (g.status === "won") state.status = "won";
    recordResult(statsId(level), puzzle, { won: g.status === "won", bucket: marginBand(dark - light) });
  }
  save();
  paint();
  toast(g.status === "won" ? `You win ${dark}–${light}!` : g.status === "lost" ? `The computer wins ${light}–${dark}` : `A draw, ${dark}–${light}`, 2200);
  if (!isClimb()) setTimeout(() => { if (!isModalOpen()) openStats(); }, 1600);
}

/** After a game: a rematch at this level, or in Climb the next stage (or a retry). */
function again() {
  if (busy || g.status === "playing") return;
  if (isClimb()) {
    if (g.status === "won" && climb.stage < CLIMB_TOP) climb.stage++;
    climb.game = freshGame(g.status === "won" ? 0 : g.round + 1);
  } else state.games[level] = freshGame(g.round + 1);
  build();
}

/** Pick up where a reload left off: the computer may be due to move. */
function resume() {
  if (g.status !== "playing") return;
  if (g.turn === LIGHT) setTimeout(cpuTurn, CPU_DELAY);
  else checkPlayerPass();
}

function useHint() {
  if (!started) return;
  if (g.status !== "playing") { toast("This game is over"); return; }
  if (busy || g.turn !== DARK) { toast("Wait for your turn"); return; }
  const m = hintMove(g.board, DARK);
  if (m < 0) return;
  g.hints++;
  hinted = m;
  save();
  paint();
  toast("Try the marked square");
}

// ---------------------------------------------------------------- paint

function paint() {
  const playing = g.status === "playing";
  const yourTurn = playing && g.turn === DARK && !busy;
  const moves = new Set(yourTurn && getSetting(GAME, "moves") !== false ? legalMoves(g.board, DARK) : []);
  cells.forEach((node, i) => {
    const v = g.board[i];
    node.classList.toggle("is-dark", v === DARK);
    node.classList.toggle("is-light", v === LIGHT);
    node.classList.toggle("is-move", moves.has(i));
    node.classList.toggle("is-last", i === g.last);
    node.classList.toggle("is-hint", i === hinted);
    const flip = flipped.has(i);
    if (flip) {
      node.classList.remove("is-flip");
      void node.offsetWidth;
    }
    node.classList.toggle("is-flip", flip);
    const r = (i >> 3) + 1;
    const c = (i & 7) + 1;
    node.setAttribute("aria-label", `Row ${r}, column ${c}, ${v === DARK ? "dark" : v === LIGHT ? "light" : moves.has(i) ? "you can play here" : "empty"}`);
  });
  flipped = new Set();
  const dark = count(g.board, DARK);
  const light = count(g.board, LIGHT);
  darkScore.textContent = String(dark);
  lightScore.textContent = String(light);
  darkSide.classList.toggle("is-turn", playing && g.turn === DARK);
  lightSide.classList.toggle("is-turn", playing && g.turn === LIGHT);
  grid.classList.toggle("is-over", !playing);
  levelBtns.forEach((b, k) => {
    const id = PICKS[k].id;
    const on = id === level;
    const s = id === "climb" ? null : state.games[id];
    const st = s && s.status === "won" ? "✓" : s && s.status === "playing" && count(s.board, 0) < 60 ? "•" : "";
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.querySelector(".rvs-mark").textContent = st;
    b.setAttribute("aria-label", id === "climb" ? "Climb, a stronger computer after every win" : `${PICKS[k].name}${st === "✓" ? ", won today" : st ? ", in progress" : ""}`);
  });
  againBtn.hidden = playing;
  againBtn.textContent = !isClimb() ? "Play again" : g.status !== "won" ? "Try again" : climb.stage < CLIMB_TOP ? "Next stage" : "Play again";
  const stage = isClimb() ? `Stage ${climb.stage} of ${CLIMB_TOP}. ` : "";
  tip.textContent = !playing
    ? g.status === "won"
      ? isClimb() && climb.stage < CLIMB_TOP ? `${stage}You win ${dark}–${light}. The next computer is stronger.` : `${stage}You win ${dark}–${light}.`
      : g.status === "lost" ? `${stage}The computer wins ${light}–${dark}.` : `${stage}A draw, ${dark}–${light}.`
    : busy ? `${stage}The computer is thinking…`
      : g.turn === DARK ? `${stage}Your move. Trap light discs between yours to turn them.` : `${stage}The computer's move.`;
}

onSettingsChange(({ scope }) => { if (scope === GAME) paint(); });

// ---------------------------------------------------------------- stats & help

function openStats() {
  if (isClimb()) {
    showModal({
      title: "Climb",
      content: [
        el("p.rvs-summary", `Stage ${climb.stage} of ${CLIMB_TOP}. Best stage beaten: ${climb.best || "none yet"}.`),
        el("p", "Each win brings a stronger computer, from Easy up to Expert. Lose or draw and you play that stage again."),
      ],
    });
    return;
  }
  const stats = getStats(statsId(level));
  const over = g.status !== "playing";
  const dark = count(g.board, DARK);
  const light = count(g.board, LIGHT);
  const name = levelById(level).name;
  showStats({
    title: over ? (g.status === "won" ? "You Win!" : g.status === "lost" ? "Computer Wins" : "Draw") : `${name} Statistics`,
    message: over ? `${dark}–${light} against ${name}` : "Each level keeps its own stats.",
    tiles: [
      { label: "Played", value: stats.played },
      { label: "Win %", value: stats.played ? Math.round((stats.won / stats.played) * 100) : 0 },
      { label: "Current Streak", value: liveStreak(stats, todayKey()) },
      { label: "Max Streak", value: stats.maxStreak },
    ],
    distribution: {
      title: `${name} Results`,
      rows: MARGIN_BANDS.map((b) => ({ label: b, count: stats.dist[b] || 0, highlight: over && marginBand(dark - light) === b })),
    },
    shareText: over ? shareText({ puzzle, level, dark, light, hints: g.hints }) : null,
    nextLabel: puzzle.isToday ? "Next puzzle in" : null,
  });
}

function showHelp() {
  // Dark plays at the dot and traps two light discs, which turn dark.
  const before = [0, 0, 0, 0, 0, 2, 2, 1];
  const after = [0, 0, 0, 0, 1, 1, 1, 1];
  const row = (vals, dot) => el("div.rvs-ex", { "aria-hidden": "true" }, vals.map((v, k) => el(
    `div.rvs-cell${v === 1 ? ".is-dark" : v === 2 ? ".is-light" : ""}${k === dot ? ".is-move" : ""}`, el("span.rvs-piece"))));
  showModal({
    title: "How To Play",
    className: "rvs-help",
    content: [
      el("p.subtitle", "Finish with more discs than the computer."),
      el("ul",
        el("li", "You play dark and go first. Tap a square to place a disc."),
        el("li", "A move must trap at least one straight line of light discs (across, down or diagonal) between the new disc and another dark one. Every trapped disc turns dark."),
        el("li", "The computer does the same with light. If a player has no move, they pass."),
        el("li", "When neither of you can move, whoever has more discs wins.")),
      el("h3", "Example"),
      row(before, 4),
      row(after, -1),
      el("p", "Playing at the dot traps two light discs against the dark one, so they turn over."),
      el("h3", "Levels"),
      el("p", "Easy makes mistakes, Medium looks one move ahead, Hard looks further and plays the ending well, and Expert is tough. Each level has a game each day with its own stats. Tip: corners can never be turned, so they're worth a lot."),
      el("p", el("b", "Climb: "), "a run where each win brings a stronger computer, six stages from Easy to Expert. Lose or draw and you try that stage again."),
      el("p", "Stuck? Tap 💡 for a good move. Turn hints or move dots off in Settings. Pick other days from 📅, or tap 🔀 for practice games."),
    ],
  });
}

// ---------------------------------------------------------------- start

build();

await splash({
  gameId: GAME,
  puzzle,
  playLabel: g.status !== "playing" ? "See results" : count(g.board, 0) < 60 ? "Continue" : "Play",
  tagline: "You against the computer, Easy to Expert",
});
started = true;
if (g.status !== "playing" && !isClimb()) openStats();
else if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
resume();
