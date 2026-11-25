// Crossword player shared by The Mini, The Midi and The Crossword.
// startCrossword({ gameId, title, cellMax, buckets }) from a thin entry module.
import { currentPuzzle, todayKey, parseDateKey } from "../../core/rng.js";
import { get, set, loadState, saveState, getStats, recordResult, liveStreak } from "../../core/storage.js";
import { defineSettings, getSetting, onSettingsChange, HINTS_SETTING, hintsOn, watchHints } from "../../core/settings.js";
import {
  el, mountShell, showModal, isModalOpen, toast, showStats, splash, formatTime, ICONS,
} from "../../core/ui.js";
import { buildModel, wordFor, step, nextWordIndex, firstWhere, ACROSS, DOWN, other } from "./model.js";
import { getPuzzle } from "./source.js";

// cell flags
const F_PENCIL = 1, F_WRONG = 2, F_RIGHT = 4, F_REVEALED = 8;

const SETTINGS = [
  { section: "General", key: "showTimer", label: "Show timer", type: "toggle", default: true },
  { section: "General", key: "solveSound", label: "Play sound on solve", type: "toggle", default: true },
  { section: "General", key: "milestones", label: "Show milestones", type: "toggle", default: true,
    desc: "Celebrate when you're halfway there" },
  { ...HINTS_SETTING, section: "General", label: "Hints (Check & Reveal)",
    desc: "Show the Check and Reveal menus. Turn off to solve on your own." },
  { section: "Interactions", key: "space", label: "Spacebar", type: "select", default: "clear",
    options: [["clear", "Clears the current square and advances"], ["toggle", "Toggles between Across and Down"]] },
  { section: "Interactions", key: "backspaceInto", label: "Backspace into previous word", type: "toggle", default: true },
  { section: "Interactions", key: "arrowChange", label: "After changing direction with arrow keys", type: "select", default: "stay",
    options: [["stay", "Stay in the same square"], ["move", "Move in the direction of the arrow"]] },
  { section: "Interactions", key: "skipFilled", label: "Skip over filled squares", type: "toggle", default: true },
  { section: "Interactions", key: "skipPencil", label: "Skip penciled squares", type: "toggle", default: false },
  { section: "Interactions", key: "endOfWord", label: "At the end of a word", type: "select", default: "first",
    options: [["stay", "Stay in the same word"], ["first", "Jump back to first blank in the word"], ["next", "Jump to next clue"]] },
  { section: "Interactions", key: "jumpNext", label: "Jump to next clue after completing a word", type: "toggle", default: true },
  { section: "Display", key: "related", label: "Show related clue highlighting", type: "toggle", default: true,
    desc: "Lightly highlight the crossing clue in the clue lists" },
];

const isTouch = () => matchMedia("(hover: none) and (pointer: coarse)").matches;

export async function startCrossword(cfg) {
  const GAME = cfg.gameId;
  const puzzle = currentPuzzle();
  const S = (key) => getSetting(GAME, key);

  defineSettings(GAME, SETTINGS);

  // ------------------------------------------------------------ shell + skeleton DOM
  // A fresh practice puzzle on demand (any time, not just at midnight).
  // currentPuzzle() turns ?random=1 into a stable ?seed=… so reloads keep it.
  // The next practice seed is picked up front so the puzzle can be built in the
  // background (see prepareNext) and open instantly, skipping the splash.
  // Math.random only picks the seed; the puzzle itself stays deterministic.
  const nextSeed = String(Math.floor(Math.random() * 1e9));
  let nextReady = null;
  const prepareNext = () => {
    if (!nextReady) {
      nextReady = getPuzzle(GAME, { id: `seed-${nextSeed}`, date: puzzle.date, isDaily: false, isToday: false, seed: nextSeed })
        .catch(() => null);
    }
    return nextReady;
  };
  const newPuzzle = () => { location.href = `${location.pathname}?seed=${nextSeed}&play=1`; };
  const params = new URLSearchParams(location.search);
  const skipSplash = params.get("play") === "1";
  if (skipSplash) {
    params.delete("play");
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }
  const newBtn = el("button.icon-btn.xw-new-btn", {
    type: "button", "aria-label": "New puzzle", title: "New puzzle", html: ICONS.shuffle, onclick: newPuzzle,
  });
  const { main } = mountShell({ gameId: GAME, puzzle, onHelp: showHelp, onStats: () => openStats(), extraButtons: [newBtn], practice: () => newPuzzle() });
  main.classList.add("xw-main");

  const timeText = el("span.xw-time", "0:00");
  const pauseBtn = el("button.xw-tool.xw-pause-btn", { type: "button", "aria-label": "Pause", title: "Pause", html: ICONS.pause, onclick: () => setPaused(!paused) });
  const timerBox = el("div.xw-timer", timeText, pauseBtn);
  const rebusBtn = el("button.xw-tool.xw-rebus-btn", { type: "button", onclick: () => toggleRebus() }, "Rebus");
  const pencilBtn = el("button.xw-tool.xw-pencil-btn", { type: "button", "aria-label": "Pencil", title: "Pencil", "aria-pressed": "false", html: ICONS.pencil, onclick: () => togglePencil() });
  const clearMenu = menu("Clear", [
    ["Incomplete", () => clearCells("incomplete")],
    ["Word", () => clearCells("word")],
    ["Puzzle", () => clearCells("puzzle")],
    ["Puzzle & Timer", () => clearCells("all")],
  ]);
  const revealMenu = menu("Reveal", [
    ["Square", () => reveal("square")],
    ["Word", () => reveal("word")],
    ["Puzzle", () => confirmAction("Reveal the entire puzzle?", "Reveal", () => reveal("puzzle"))],
  ]);
  const checkMenu = menu("Check", [
    ["Autocheck", () => toggleAutocheck(), () => state && state.autocheck],
    ["Square", () => check("square")],
    ["Word", () => check("word")],
    ["Puzzle", () => check("puzzle")],
  ]);
  const toolbar = el("div.xw-toolbar",
    timerBox,
    el("div.xw-tools", rebusBtn, clearMenu.node, revealMenu.node, checkMenu.node, pencilBtn));

  const clueLabel = el("span.xw-cluebar-label");
  const clueText = el("span.xw-cluebar-text");
  const clueBar = el("div.xw-cluebar",
    el("button.xw-cluebar-arrow", { type: "button", "aria-label": "Previous clue", onclick: () => jumpWord(-1), html: "&#8249;" }),
    el("div.xw-cluebar-main", { onclick: () => toggleDir(), role: "button", tabindex: "-1" }, clueLabel, clueText),
    el("button.xw-cluebar-arrow", { type: "button", "aria-label": "Next clue", onclick: () => jumpWord(1), html: "&#8250;" }),
  );
  const gridEl = el("div.xw-grid", { role: "grid", "aria-label": "Crossword grid" });
  const pauseOverlay = el("div.xw-overlay.xw-paused",
    el("div.xw-overlay-card",
      el("div.xw-overlay-title", "Your game is paused"),
      el("p", "Ready to play?"),
      el("button.btn", { type: "button", onclick: () => setPaused(false) }, "Resume")));
  const buildingOverlay = el("div.xw-overlay.xw-building",
    el("div.xw-overlay-card",
      el("div.xw-spinner"),
      el("div.xw-overlay-title", puzzle.isToday ? "Building today's puzzle…" : "Building your puzzle…"),
      el("p", "Fitting words into the grid. This only happens once.")));
  const gridWrap = el("div.xw-grid-wrap", gridEl, pauseOverlay, buildingOverlay);
  const boardCol = el("div.xw-board", clueBar, gridWrap);
  const acrossList = el("ol.xw-clues");
  const downList = el("ol.xw-clues");
  const lists = el("div.xw-lists",
    el("section.xw-list", el("h3", "Across"), acrossList),
    el("section.xw-list", el("h3", "Down"), downList));
  const keyboard = buildKeyboard();
  const body = el("div.xw-body", boardCol, lists);
  const root = el(`div.xw.xw-${GAME}`, toolbar, body, keyboard);
  main.append(root);

  // ------------------------------------------------------------ state
  let model = null;
  let state = null;
  let cellEls = [];
  let clueEls = [];
  let paused = false;
  let rebus = null; // buffer string while entering a rebus
  let started = false; // splash dismissed
  let lastTick = 0;

  const save = () => { if (state) saveState(GAME, puzzle.id, state); };

  // Hints off hides Check and Reveal, and stops Autocheck.
  watchHints(GAME, (on) => {
    revealMenu.node.hidden = !on;
    checkMenu.node.hidden = !on;
    if (!on && state && state.autocheck) {
      state.autocheck = false;
      afterChange();
    }
  });

  // Kick off loading before the splash so it's ready when the player taps Play.
  const saved = loadState(GAME, puzzle.id);
  let building = false;
  const puzzlePromise = getPuzzle(GAME, puzzle, () => { building = true; if (started) showBuilding(true); })
    .then((p) => { setupPuzzle(p); return p; })
    .catch((e) => { console.error(e); showError(e); });

  const inProgress = saved && saved.status === "playing" && (saved.time > 0 || (saved.entries || []).some(Boolean));
  if (!skipSplash) {
    await splash({
      gameId: GAME, puzzle,
      playLabel: saved && saved.status === "won" ? "Review" : inProgress ? "Continue" : "Play",
      byline: "By Oh My WORDS! · Edited by WordNet",
    });
  }
  started = true;
  if (!model) showBuilding(building || true);
  await puzzlePromise;
  if (!model) return;
  showBuilding(false);
  layout();
  if (!get(`seen:${GAME}`)) { set(`seen:${GAME}`, true); showHelp(); }
  else if (state.status === "won") { prepareNext(); setTimeout(() => openStats(), 300); }
  startTimer();

  // ------------------------------------------------------------ setup

  function puzzleSig(p) {
    return p.grid.join("|");
  }

  function setupPuzzle(p) {
    model = buildModel(p);
    const sig = puzzleSig(p);
    const n = model.cells.length;
    state = saved && saved.sig === sig && Array.isArray(saved.entries) && saved.entries.length === n ? saved : null;
    if (!state) {
      const firstWord = model.words[0];
      state = {
        v: 1, sig, status: "playing", entries: Array(n).fill(""), flags: Array(n).fill(0),
        time: 0, sel: { idx: firstWord.cells[0], dir: firstWord.dir }, autocheck: false, pencil: false,
        assisted: false, milestone: false, wasFull: false,
      };
    }
    if (!model.cells[state.sel.idx] || model.cells[state.sel.idx].black) state.sel = { idx: model.white[0], dir: ACROSS };
    if (model.cells[state.sel.idx][state.sel.dir] < 0) state.sel.dir = other(state.sel.dir);
    buildGrid();
    buildClues();
    render();
    save();
  }

  function showBuilding(on) {
    buildingOverlay.classList.toggle("show", !!on);
    root.classList.toggle("is-building", !!on);
    if (on && !gridEl.children.length) {
      // placeholder grid so the layout has the right shape while we wait
      const size = cfg.size;
      gridEl.style.setProperty("--cols", size);
      gridEl.style.setProperty("--rows", size);
      gridEl.replaceChildren(...Array.from({ length: size * size }, () => el("div.xw-cell.ghost")));
      layout();
    }
  }

  function showError(e) {
    buildingOverlay.classList.add("show");
    buildingOverlay.querySelector(".xw-overlay-card").replaceChildren(
      el("div.xw-overlay-title", "Couldn't build this puzzle"),
      el("p", String(e && e.message || e)),
      el("button.btn", { type: "button", onclick: () => location.reload() }, "Try again"));
  }

  function buildGrid() {
    gridEl.style.setProperty("--cols", model.cols);
    gridEl.style.setProperty("--rows", model.rows);
    cellEls = model.cells.map((cell) => {
      if (cell.black) return el("div.xw-cell.black", { "aria-hidden": "true" });
      const node = el("div.xw-cell", { role: "gridcell", dataset: { idx: cell.idx } },
        cell.num ? el("span.xw-num", String(cell.num)) : null,
        el("span.xw-ltr"));
      return node;
    });
    gridEl.replaceChildren(...cellEls);
  }

  function buildClues() {
    clueEls = model.words.map((w) => el("li.xw-clue", {
      dataset: { wi: w.wi },
      onclick: () => { selectWord(w.wi); },
    }, el("span.xw-clue-num", String(w.num)), el("span.xw-clue-text", w.clue)));
    acrossList.replaceChildren(...clueEls.filter((_, i) => model.words[i].dir === ACROSS));
    downList.replaceChildren(...clueEls.filter((_, i) => model.words[i].dir === DOWN));
  }

  // ------------------------------------------------------------ layout

  function layout() {
    const touch = isTouch();
    root.classList.toggle("kb", touch);
    const W = main.clientWidth, H = main.clientHeight;
    const cols = model ? model.cols : cfg.size, rows = model ? model.rows : cfg.size;
    const pad = W < 500 ? 8 : 20;
    const tbH = toolbar.offsetHeight;
    const kbH = touch ? keyboard.offsetHeight : 0;
    const showLists = W >= 720 && (!touch || W > H);
    root.classList.toggle("with-lists", showLists);
    const cbH = clueBar.offsetHeight || 48;
    const listW = showLists ? Math.min(560, Math.max(280, W * 0.4)) : 0;
    const availW = W - listW - pad * 2 - (showLists ? 24 : 0);
    const availH = H - tbH - kbH - cbH - pad * 2 - 6;
    let cell = Math.floor(Math.min((availW - 3) / cols, (availH - 3) / rows, cfg.cellMax || 40));
    cell = Math.max(cell, 14);
    root.style.setProperty("--cell", cell + "px");
    root.style.setProperty("--grid-w", cell * cols + 3 + "px");
    if (showLists) lists.style.height = Math.max(240, cell * rows + 3 + cbH) + "px";
    else lists.style.height = "";
    scrollClues();
  }
  addEventListener("resize", () => layout());
  matchMedia("(hover: none) and (pointer: coarse)").addEventListener?.("change", () => layout());

  // ------------------------------------------------------------ render

  function curWord() { return wordFor(model, state.sel.idx, state.sel.dir); }
  function crossWord() {
    const c = model.cells[state.sel.idx];
    const o = other(model.words[curWord()].dir);
    return c[o] >= 0 ? c[o] : -1;
  }
  function locked(idx) { return (state.flags[idx] & (F_RIGHT | F_REVEALED)) !== 0 || state.status === "won"; }
  function filled(idx) { return !!state.entries[idx]; }
  function wordFilled(wi) { return model.words[wi].cells.every(filled); }

  function render() {
    if (!model) return;
    const wi = curWord();
    const word = model.words[wi];
    const inWord = new Set(word.cells);
    const sel = state.sel.idx;
    for (const cell of model.cells) {
      if (cell.black) continue;
      const node = cellEls[cell.idx];
      const f = state.flags[cell.idx];
      let text = state.entries[cell.idx] || "";
      const isSel = cell.idx === sel;
      if (isSel && rebus !== null) text = rebus;
      node.classList.toggle("sel", isSel);
      node.classList.toggle("word", !isSel && inWord.has(cell.idx));
      node.classList.toggle("pencil", !!(f & F_PENCIL) && !(isSel && rebus !== null));
      node.classList.toggle("wrong", !!(f & F_WRONG));
      node.classList.toggle("right", !!(f & F_RIGHT) || !!(f & F_REVEALED));
      node.classList.toggle("revealed", !!(f & F_REVEALED));
      node.classList.toggle("rebus-edit", isSel && rebus !== null);
      const ltr = node.lastChild;
      if (ltr.textContent !== text) ltr.textContent = text;
      ltr.style.fontSize = text.length > 1 ? `calc(var(--cell) * ${Math.max(0.2, 0.62 / (text.length * 0.6)).toFixed(3)})` : "";
    }
    // clues
    const cw = crossWord();
    const related = S("related");
    clueEls.forEach((li, i) => {
      li.classList.toggle("active", i === wi);
      li.classList.toggle("cross", related && i === cw);
      li.classList.toggle("done", wordFilled(i));
    });
    clueLabel.textContent = word.label;
    clueText.textContent = word.clue;
    clueBar.classList.toggle("down", word.dir === DOWN);
    // toolbar
    pencilBtn.classList.toggle("on", !!state.pencil);
    pencilBtn.setAttribute("aria-pressed", String(!!state.pencil));
    rebusBtn.classList.toggle("on", rebus !== null);
    timerBox.classList.toggle("hide-time", !S("showTimer"));
    root.classList.toggle("solved", state.status === "won");
    timeText.textContent = formatTime(state.time);
    keyboard.classList.toggle("rebus-on", rebus !== null);
    scrollClues();
  }

  function scrollClues() {
    if (!model || !root.classList.contains("with-lists")) return;
    const wi = curWord();
    const cw = crossWord();
    for (const i of [wi, cw]) {
      if (i < 0) continue;
      const li = clueEls[i];
      const list = li.parentElement;
      const top = li.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + li.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - list.clientHeight / 3);
      }
    }
  }

  // ------------------------------------------------------------ selection

  function select(idx, dir = state.sel.dir) {
    if (idx == null || model.cells[idx].black) return;
    commitRebus();
    if (model.cells[idx][dir] < 0) dir = other(dir);
    state.sel = { idx, dir };
    render();
    save();
  }

  function toggleDir() {
    if (!model) return;
    commitRebus();
    const c = model.cells[state.sel.idx];
    const o = other(state.sel.dir);
    if (c[o] >= 0) state.sel.dir = o;
    render();
    save();
  }

  function blankForSkip(idx) {
    if (!state.entries[idx]) return true;
    if ((state.flags[idx] & F_PENCIL) && !S("skipPencil")) return true;
    return false;
  }

  /** First blank cell in word (or its first cell). */
  function entryCell(wi) {
    return firstWhere(model, wi, (i) => !state.entries[i]) ?? model.words[wi].cells[0];
  }

  function selectWord(wi) {
    select(entryCell(wi), model.words[wi].dir);
  }

  /** Next/prev clue (Tab, Enter, arrows in the clue bar). Prefers clues with blanks. */
  function jumpWord(delta) {
    if (!model) return;
    commitRebus();
    let wi = curWord();
    const anyBlank = model.white.some((i) => !state.entries[i]);
    for (let k = 0; k < model.words.length; k++) {
      wi = nextWordIndex(model, wi, delta);
      if (!anyBlank || !S("skipFilled") || !wordFilled(wi)) break;
    }
    selectWord(wi);
  }

  function onCellClick(idx) {
    if (paused) return;
    if (idx === state.sel.idx && rebus === null) toggleDir();
    else select(idx);
  }

  gridEl.addEventListener("click", (e) => {
    const node = e.target.closest(".xw-cell");
    if (!node || !node.dataset.idx || !model) return;
    onCellClick(+node.dataset.idx);
  });

  // ------------------------------------------------------------ entry

  function advanceAfterEntry(idx, wasComplete) {
    const wi = wordFor(model, idx, state.sel.dir);
    const cells = model.words[wi].cells;
    const pos = cells.indexOf(idx);
    if (S("jumpNext") && !wasComplete && wordFilled(wi) && model.white.some((i) => !state.entries[i])) {
      jumpWord(1);
      return;
    }
    let next = null;
    for (let i = pos + 1; i < cells.length; i++) {
      if (!S("skipFilled") || blankForSkip(cells[i])) { next = cells[i]; break; }
    }
    if (next == null) {
      const mode = S("endOfWord");
      if (mode === "first") next = firstWhere(model, wi, blankForSkip);
      else if (mode === "next") { jumpWord(1); return; }
      if (next == null) next = S("skipFilled") ? idx : cells[Math.min(pos + 1, cells.length - 1)];
    }
    state.sel.idx = next;
  }

  function setEntry(idx, value) {
    if (locked(idx)) return false;
    state.entries[idx] = value;
    let f = state.flags[idx] & ~(F_WRONG | F_PENCIL | F_RIGHT);
    if (value && state.pencil) f |= F_PENCIL;
    state.flags[idx] = f;
    if (value && state.autocheck) checkCell(idx);
    return true;
  }

  function typeLetter(ch) {
    if (!model || paused || state.status === "won") return;
    const idx = state.sel.idx;
    const wi = curWord();
    const wasComplete = wordFilled(wi);
    setEntry(idx, ch);
    advanceAfterEntry(idx, wasComplete);
    afterChange();
  }

  function backspace() {
    if (!model || paused || state.status === "won") return;
    if (rebus !== null) { rebus = rebus.slice(0, -1); render(); return; }
    const idx = state.sel.idx;
    if (state.entries[idx] && !locked(idx)) {
      setEntry(idx, "");
      afterChange();
      return;
    }
    const wi = curWord();
    const cells = model.words[wi].cells;
    const pos = cells.indexOf(idx);
    let prev = null;
    if (pos > 0) prev = cells[pos - 1];
    else if (S("backspaceInto")) {
      const pw = model.words[nextWordIndex(model, wi, -1)];
      prev = pw.cells[pw.cells.length - 1];
      state.sel.dir = pw.dir;
    }
    if (prev != null) {
      state.sel.idx = prev;
      setEntry(prev, "");
    }
    afterChange();
  }

  function deleteKey() {
    if (!model || paused || state.status === "won") return;
    setEntry(state.sel.idx, "");
    afterChange();
  }

  function spaceKey() {
    if (S("space") === "toggle") { toggleDir(); return; }
    if (!model || paused || state.status === "won") return;
    const idx = state.sel.idx;
    setEntry(idx, "");
    const cells = model.words[curWord()].cells;
    const pos = cells.indexOf(idx);
    if (pos < cells.length - 1) state.sel.idx = cells[pos + 1];
    afterChange();
  }

  function arrow(dr, dc) {
    if (!model || paused) return;
    commitRebus();
    const dir = dr ? DOWN : ACROSS;
    const cell = model.cells[state.sel.idx];
    if (dir !== state.sel.dir && cell[dir] >= 0) {
      state.sel.dir = dir;
      if (S("arrowChange") === "move") {
        const n = step(model, state.sel.idx, dr, dc);
        if (n != null) state.sel.idx = n;
      }
    } else {
      const n = step(model, state.sel.idx, dr, dc);
      if (n != null) {
        state.sel.idx = n;
        if (model.cells[n][state.sel.dir] < 0) state.sel.dir = other(state.sel.dir);
      }
    }
    render();
    save();
  }

  // ------------------------------------------------------------ rebus

  function toggleRebus() {
    if (!model || paused || state.status === "won") return;
    if (rebus !== null) { commitRebus(true); return; }
    if (locked(state.sel.idx)) return;
    rebus = state.entries[state.sel.idx] || "";
    render();
  }

  function commitRebus(advance = false) {
    if (rebus === null) return;
    const idx = state.sel.idx;
    const value = rebus.toUpperCase().slice(0, 10);
    rebus = null;
    const wasComplete = wordFilled(curWord());
    if (value !== (state.entries[idx] || "")) setEntry(idx, value);
    if (advance && value) advanceAfterEntry(idx, wasComplete);
    afterChange();
  }

  // ------------------------------------------------------------ pencil / check / reveal / clear

  function togglePencil() {
    if (!model) return;
    state.pencil = !state.pencil;
    render();
    save();
  }

  function scopeCells(scope) {
    if (scope === "square") return [state.sel.idx];
    if (scope === "word") return model.words[curWord()].cells;
    return model.white;
  }

  function isRight(idx) { return (state.entries[idx] || "").toUpperCase() === model.cells[idx].answer; }

  function checkCell(idx) {
    if (!state.entries[idx] || (state.flags[idx] & F_REVEALED)) return;
    if (isRight(idx)) state.flags[idx] = (state.flags[idx] & ~(F_WRONG | F_PENCIL)) | F_RIGHT;
    else state.flags[idx] |= F_WRONG;
  }

  function check(scope) {
    if (!model || state.status === "won") return;
    commitRebus();
    const cells = scopeCells(scope);
    cells.forEach(checkCell);
    const wrong = cells.filter((i) => state.flags[i] & F_WRONG).length;
    if (!cells.some((i) => state.entries[i])) toast("Nothing to check yet");
    else if (!wrong) toast(scope === "square" ? "Looks good!" : "No mistakes so far");
    afterChange();
  }

  function toggleAutocheck() {
    if (!model || state.status === "won") return;
    state.autocheck = !state.autocheck;
    if (state.autocheck) {
      state.assisted = true;
      model.white.forEach(checkCell);
      toast("Autocheck on");
    } else toast("Autocheck off");
    afterChange();
  }

  function reveal(scope) {
    if (!model || state.status === "won") return;
    commitRebus();
    let any = false;
    for (const idx of scopeCells(scope)) {
      if (isRight(idx) && !(state.flags[idx] & F_PENCIL)) {
        state.flags[idx] = (state.flags[idx] & ~F_WRONG) | F_RIGHT;
        continue;
      }
      state.entries[idx] = model.cells[idx].answer;
      state.flags[idx] = F_REVEALED;
      any = true;
    }
    if (any) state.assisted = true;
    afterChange();
  }

  function clearCells(scope) {
    if (!model || state.status === "won") return;
    commitRebus();
    let cells;
    if (scope === "word") cells = model.words[curWord()].cells;
    else if (scope === "incomplete") {
      const set = new Set();
      model.words.forEach((w, wi) => { if (!wordFilled(wi)) w.cells.forEach((c) => set.add(c)); });
      cells = [...set];
    } else cells = model.white;
    if (scope === "all") {
      confirmAction("Clear the puzzle and reset the timer?", "Clear", () => {
        model.white.forEach((i) => { state.entries[i] = ""; state.flags[i] = 0; });
        state.time = 0;
        state.wasFull = false;
        state.milestone = false;
        selectWord(0);
        afterChange();
      });
      return;
    }
    for (const i of cells) {
      if (locked(i)) continue;
      state.entries[i] = "";
      state.flags[i] = 0;
    }
    afterChange();
  }

  function confirmAction(question, label, fn) {
    const close = showModal({
      title: question,
      className: "xw-confirm",
      content: el("div.xw-confirm-actions",
        el("button.btn.secondary", { type: "button", onclick: () => close() }, "Cancel"),
        el("button.btn", { type: "button", onclick: () => { close(); fn(); } }, label)),
    });
  }

  // ------------------------------------------------------------ completion

  function afterChange() {
    render();
    save();
    if (state.status !== "playing") return;
    const total = model.white.length;
    const nFilled = model.white.filter(filled).length;
    if (S("milestones") && !state.milestone && nFilled >= total / 2 && total >= 40) {
      state.milestone = true;
      toast("Halfway there! Keep going.", 2000);
      save();
    }
    const full = nFilled === total;
    if (!full) { state.wasFull = false; return; }
    if (model.white.every(isRight)) { win(); return; }
    if (!state.wasFull) {
      state.wasFull = true;
      save();
      const close = showModal({
        title: "Almost there!",
        className: "xw-result",
        content: [
          el("p.xw-result-big", "At least one square's amiss. Keep trying!"),
          hintsOn(GAME) ? el("p.xw-result-hint", "Tip: use Check ▸ Puzzle to find the mistakes.") : null,
          el("div.xw-confirm-actions", el("button.btn", { type: "button", onclick: () => close() }, "Keep trying")),
        ],
      });
    }
  }

  function bucketFor(time) {
    const b = cfg.buckets;
    for (const [limit, label] of b) if (time < limit) return label;
    return b[b.length - 1][1];
  }

  function win() {
    state.status = "won";
    state.solvedAt = Date.now();
    rebus = null;
    const time = state.time;
    save();
    render();
    recordResult(GAME, puzzle, { won: true, bucket: bucketFor(time), time }); // Reveal/Autocheck carry no penalty
    prepareNext(); // build the next puzzle while the player celebrates
    if (S("solveSound")) playSolveSound();
    root.classList.add("celebrate");
    setTimeout(() => root.classList.remove("celebrate"), 1600);
    setTimeout(() => {
      const close = showModal({
        title: "Congratulations!",
        className: "xw-result",
        content: [
          el("p.xw-result-big", `You solved ${cfg.title} in ${formatTime(time)}`),
          el("div.xw-confirm-actions",
            el("button.btn", { type: "button", onclick: newPuzzle }, "Play a new puzzle"),
            el("button.btn.secondary", { type: "button", onclick: () => { close(); openStats(); } }, "View Stats")),
        ],
      });
    }, 350);
  }

  function shareText() {
    const d = parseDateKey(puzzle.date);
    const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const label = puzzle.isDaily ? `${cfg.title} ${date}` : `${cfg.title} (practice)`;
    return `Oh My WORDS! ${label} — solved in ${formatTime(state.time)}`;
  }

  function openStats() {
    const s = getStats(GAME);
    const times = s.times || [];
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const best = times.length ? Math.min(...times) : null;
    const mine = state && state.status === "won" ? bucketFor(state.time) : null;
    showStats({
      title: cfg.title,
      className: "xw-stats",
      message: state && state.status === "won" ? `Solved in ${formatTime(state.time)}` : null,
      tiles: [
        { label: "Solved", value: s.won },
        { label: "Average Time", value: avg == null ? "–" : formatTime(avg) },
        { label: "Best Time", value: best == null ? "–" : formatTime(best) },
        { label: "Current Streak", value: liveStreak(s, todayKey()) },
        { label: "Max Streak", value: s.maxStreak },
      ],
      distribution: {
        title: "Solve Times",
        rows: cfg.buckets.map(([, label]) => ({ label, count: s.dist[label] || 0, highlight: label === mine })),
      },
      shareText: state && state.status === "won" ? shareText() : null,
    });
  }

  function playSolveSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        const t = ctx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.6 : 0.25));
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.7);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
  }

  // ------------------------------------------------------------ timer

  function running() {
    return started && model && state.status === "playing" && !paused && !document.hidden;
  }

  function startTimer() {
    lastTick = Date.now();
    setInterval(() => {
      const now = Date.now();
      if (running()) {
        const add = Math.round((now - lastTick) / 1000);
        if (add > 0 && add < 5) {
          state.time += add;
          timeText.textContent = formatTime(state.time);
          if (state.time % 5 === 0) save();
        }
      }
      lastTick = now;
    }, 1000);
    document.addEventListener("visibilitychange", () => { lastTick = Date.now(); save(); });
    addEventListener("pagehide", save);
  }

  function setPaused(on) {
    if (!model || state.status === "won") on = false;
    paused = on;
    commitRebus();
    root.classList.toggle("paused", paused);
    pauseOverlay.classList.toggle("show", paused);
    pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
    lastTick = Date.now();
    save();
  }

  // ------------------------------------------------------------ physical keyboard

  document.addEventListener("keydown", (e) => {
    if (!model || !started || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
    if (paused) return;
    const k = e.key;
    if (rebus !== null) {
      if (/^[a-z0-9]$/i.test(k)) rebus += k.toUpperCase();
      else if (k === "Backspace") rebus = rebus.slice(0, -1);
      else if (k === "Enter" || k === "Escape" || k === "Insert" || k === "Tab") commitRebus(true);
      else return;
      e.preventDefault();
      render();
      return;
    }
    if (/^[a-z]$/i.test(k)) typeLetter(k.toUpperCase());
    else if (/^[0-9]$/.test(k)) typeLetter(k);
    else if (k === "Backspace") backspace();
    else if (k === "Delete") deleteKey();
    else if (k === "ArrowLeft") arrow(0, -1);
    else if (k === "ArrowRight") arrow(0, 1);
    else if (k === "ArrowUp") arrow(-1, 0);
    else if (k === "ArrowDown") arrow(1, 0);
    else if (k === "Tab") jumpWord(e.shiftKey ? -1 : 1);
    else if (k === "Enter") jumpWord(e.shiftKey ? -1 : 1);
    else if (k === " ") spaceKey();
    else if (k === "Escape" || k === "Insert") toggleRebus();
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ on-screen keyboard

  function buildKeyboard() {
    const kb = el("div.xw-keyboard", { "aria-label": "Keyboard" });
    let more = false;
    const key = (label, action, cls = "") =>
      el(`button.xw-key${cls}`, { type: "button", dataset: { action } }, label);
    const draw = () => {
      const rows = more
        ? [["1234567890".split("")], ["@REBUS", "@PENCIL"], ["@ABC", "@BACK"]]
        : [["QWERTYUIOP".split("")], ["ASDFGHJKL".split("")], ["@MORE", "ZXCVBNM".split(""), "@BACK"]];
      kb.replaceChildren(...rows.map((row) => el("div.xw-krow", row.flat().map((k) => {
        if (k === "@BACK") return el("button.xw-key.wide", { type: "button", dataset: { action: "back" }, "aria-label": "Backspace", html: ICONS.backspace });
        if (k === "@MORE") return key("more", "more", ".wide.small");
        if (k === "@ABC") return key("ABC", "more", ".wide.small");
        if (k === "@REBUS") return key("Rebus", "rebus", ".xwide.small.rebus-key");
        if (k === "@PENCIL") return key("Pencil", "pencil", ".xwide.small.pencil-key");
        return key(k, "k:" + k);
      }))));
    };
    draw();
    kb.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".xw-key");
      if (!b) return;
      e.preventDefault();
      if (!model || paused || isModalOpen()) return;
      const a = b.dataset.action;
      b.classList.add("down");
      setTimeout(() => b.classList.remove("down"), 120);
      if (a === "back") backspace();
      else if (a === "more") { more = !more; draw(); requestAnimationFrame(layout); }
      else if (a === "rebus") toggleRebus();
      else if (a === "pencil") togglePencil();
      else if (a.startsWith("k:")) {
        const ch = a.slice(2);
        if (rebus !== null) { rebus += ch; render(); }
        else typeLetter(ch);
      }
    });
    return kb;
  }

  // ------------------------------------------------------------ menus

  function menu(label, items) {
    const list = el("div.xw-menu-list", { role: "menu" });
    const btn = el("button.xw-tool.xw-menu-btn", { type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, label);
    const node = el("div.xw-menu", btn, list);
    const close = () => { node.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
    const draw = () => {
      list.replaceChildren(...items.map(([text, fn, isOn]) =>
        el(`button.xw-menu-item${isOn ? ".toggle" : ""}${isOn && isOn() ? ".on" : ""}`, {
          type: "button", role: "menuitem",
          onclick: (e) => { e.stopPropagation(); close(); fn(); },
        }, text)));
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !node.classList.contains("open");
      document.querySelectorAll(".xw-menu.open").forEach((m) => m.classList.remove("open"));
      if (open && model) { draw(); node.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    });
    document.addEventListener("click", (e) => { if (!node.contains(e.target)) close(); });
    return { node, close };
  }

  // ------------------------------------------------------------ settings + help

  onSettingsChange(({ scope }) => { if (scope === GAME || scope === "global") render(); });

  function showHelp() {
    const touch = isTouch();
    showModal({
      title: "How To Play",
      subtitle: `Fill the grid with words that answer the Across and Down clues.`,
      className: "xw-help",
      content: el("div.help-examples",
        el("h3", "Getting around"),
        el("ul.help-list",
          el("li", "Tap or click a square to select it. Tap it again to switch between Across and Down."),
          el("li", "Tap a clue to jump to it. The highlighted clue bar shows the clue you're working on."),
          touch
            ? el("li", "Use the ‹ › arrows on the clue bar to move between clues; tap the clue itself to switch direction.")
            : el("li", "Arrow keys move around the grid; Tab / Shift+Tab or Enter jump to the next / previous clue."),
          touch ? null : el("li", "Backspace erases and steps back, Delete erases in place, Space clears or switches direction (see Settings)."),
        ),
        el("h3", "Tools"),
        el("ul.help-list",
          el("li", el("b", "Pencil"), " — enter tentative letters, shown in grey."),
          el("li", el("b", "Rebus"), touch ? " — (under “more”) put several letters in one square." : " — press Esc or Insert (or the Rebus button) to put several letters in one square; Enter to finish."),
          el("li", el("b", "Check"), " — mark wrong letters with a red slash; correct ones turn blue. Autocheck checks as you type."),
          el("li", el("b", "Reveal"), " — show the answer for a square, word or the whole puzzle (marked with a blue triangle)."),
          el("li", el("b", "Clear"), " — erase incomplete words, the current word, or everything."),
        ),
        el("p", "Every solve counts toward your streak, even if you used Check, Reveal or Autocheck. Check and Reveal can be turned off in Settings. Your progress and time are saved automatically. Pause any time with the ", el("b", "⏸"), " button."),
        el("p.xw-help-foot", "A new daily puzzle arrives at midnight, but you don't have to wait: tap the shuffle button at the top (or “Play another” after solving) for a fresh puzzle any time. Clues are drawn from WordNet."),
      ),
    });
  }
}
