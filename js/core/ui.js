// Shared UI: app shell/header, nav drawer, modals, toasts, settings, stats,
// splash screen and sharing. Games build everything else inside `main`.
import { APP_NAME, COLLECTIONS, GAMES, collectionOf, gameById, gamesIn, playHref, hubHref, progressId } from "./games.js";
import { GLOBAL_SCHEMA, getSchema, getSetting, setSetting, isDark, applyTheme, watchHints } from "./settings.js";
import { msUntilMidnight, formatLongDate, todayKey, puzzleNumber, parseDateKey, addDays, EPOCH } from "./rng.js";
import { progressLabel } from "./storage.js";

// ---------------------------------------------------------------- DOM helper

/**
 * el("div.card#id", { onclick, style: {...}, dataset: {...}, attr: value }, ...children)
 * Children may be nodes, strings, arrays, or null/false (skipped).
 */
export function el(spec, props = {}, ...children) {
  const [, tag = "div", rest = ""] = /^([a-z0-9-]*)(.*)$/i.exec(spec);
  const node = document.createElement(tag || "div");
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") node.classList.add(part.slice(1));
    else node.id = part.slice(1);
  }
  if (props instanceof Node || typeof props === "string" || typeof props === "number" || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, val); // custom properties need setProperty
        else node.style[prop] = val;
      }
    }
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "html") node.innerHTML = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return node;
}

// ---------------------------------------------------------------- icons

export const ICONS = {
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>',
  stats: '<svg viewBox="0 0 24 24"><path d="M16 11V3H8v6H2v12h20V11h-6zm-6-6h4v14h-4V5zm-6 6h4v8H4v-8zm16 8h-4v-6h4v6z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>',
  backspace: '<svg viewBox="0 0 24 24"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  lightbulb: '<svg viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM7 12h5v5H7z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
};

export function iconButton(name, label, onClick) {
  return el("button.icon-btn", { type: "button", "aria-label": label, title: label, onclick: onClick, html: ICONS[name] });
}

/** Header 💡 button that shows and hides with the game's Hints setting. */
export function hintButton(gameId, onClick, label = "Hint") {
  const btn = iconButton("lightbulb", label, onClick);
  watchHints(gameId, (on) => { btn.hidden = !on; });
  return btn;
}

/** Header 🔀 button that starts a practice puzzle. The current puzzle stays saved. */
export function newGameButton() {
  return iconButton("shuffle", "New game", () => { const game = gameById(shell.gameId); if (game) startPractice(game); });
}

// ---------------------------------------------------------------- shell

/**
 * Builds the page chrome and returns { main, header, setTitleExtra }.
 * opts: { gameId, onHelp, onStats, onSettings (defaults to showSettings),
 *         extraButtons: [Node] (placed before help), puzzle (from currentPuzzle),
 *         practice: () => void (starts a practice puzzle; defaults to ?random=1) }
 */
let openDrawer = null;

/** Opens the game menu (drawer) from anywhere, e.g. the splash screen. */
export function openMenu() {
  if (!openDrawer) {
    const drawer = buildDrawer(document.documentElement.getAttribute("data-game"), null);
    document.body.append(drawer.backdrop, drawer.panel);
    openDrawer = drawer.open;
  }
  openDrawer();
}

export function mountShell(opts) {
  const game = gameById(opts.gameId);
  const col = collectionOf(game);
  document.documentElement.setAttribute("data-game", opts.gameId);
  document.documentElement.setAttribute("data-collection", col.id);
  document.title = `${game.name} — ${col.name}`;
  applyTheme();

  const drawer = buildDrawer(opts.gameId, opts.puzzle);
  openDrawer = drawer.open;
  shell = { gameId: opts.gameId, puzzle: opts.puzzle || null, practice: opts.practice || null };
  const p = opts.puzzle;
  const home = hubHref(p && p.isDaily ? { date: p.date } : p ? { practice: true } : {}, col.id);
  const right = el("div.right",
    opts.extraButtons || [],
    opts.onHelp && iconButton("help", "Help", opts.onHelp),
    opts.onStats && iconButton("stats", "Statistics", opts.onStats),
    iconButton("settings", "Settings", opts.onSettings || (() => showSettings(opts.gameId))),
  );
  const header = el("header.app-header",
    el("div.left",
      iconButton("menu", "Menu", drawer.open),
      iconButton("calendar", "Play more", () => showPlayMore()),
      el("h1.app-title", game.name, el("a.brand", { href: home, title: `All ${col.short.toLowerCase()} games` }, col.name)),
    ),
    right,
  );
  const main = el("main.app-main#main");
  const app = el("div.app", header, main);
  const root = document.getElementById("app") || document.body;
  root.replaceChildren(app, drawer.backdrop, drawer.panel);

  if (p && !p.isToday) {
    const text = p.isDaily ? `Archive puzzle: ${formatLongDate(p.date)}` : "Practice puzzle (not today's daily)";
    app.insertBefore(el("div.archive-banner", text, " · ", el("a", { href: game.page }, "Play today's")), main);
  }
  return { main, header, right };
}

function buildDrawer(currentId, puzzle) {
  const backdrop = el("div.drawer-backdrop");
  const close = () => { panel.classList.remove("open"); backdrop.classList.remove("open"); };
  let choice = { date: todayKey(), practice: false };
  let shown = collectionOf(currentId).id;
  const allLink = el("a.drawer-home");
  const gameLinks = GAMES.map((g) => {
    const status = el("span.drawer-status");
    const a = el(`a${g.id === currentId ? ".current" : ""}`, {
      href: g.page,
      "aria-current": g.id === currentId ? "page" : null,
    }, el("img", { src: g.icon, alt: "" }), el("span.drawer-name", g.name), status);
    return { g, a, status };
  });
  // Collection tabs (Words | Numbers | Patterns): switch the list in place, without leaving the game.
  const tabs = COLLECTIONS.map((c) => el("button.drawer-tab", {
    type: "button", role: "tab", dataset: { collection: c.id }, onclick: () => { shown = c.id; paint(); },
  }, c.short));
  const paint = () => {
    const col = COLLECTIONS.find((c) => c.id === shown);
    allLink.href = hubHref(choice, shown);
    allLink.textContent = `All ${col.name}`;
    tabs.forEach((t) => {
      const on = t.dataset.collection === shown;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    for (const { g, a, status } of gameLinks) {
      a.hidden = g.collection !== shown;
      a.href = playHref(g, choice);
      status.textContent = choice.practice ? "" : progressLabel(progressId(g.id), choice.date);
    }
  };
  const chooser = playChooser({
    date: puzzle && puzzle.isDaily ? puzzle.date : todayKey(),
    practice: !!(puzzle && !puzzle.isDaily),
  }, (next) => { choice = next; paint(); });
  const panel = el("nav.drawer", { "aria-label": "Games" },
    el("div.drawer-head", el("a.drawer-app", { href: "index.html", title: "Home" }, APP_NAME), iconButton("close", "Close menu", close)),
    el("div.drawer-tabs", { role: "tablist", "aria-label": "Collections" }, tabs),
    allLink,
    el("div.section-label", "Play any day"),
    chooser,
    el("div.section-label", "Games"),
    gameLinks.map((x) => x.a),
  );
  paint();
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !panel.classList.contains("open") || isModalOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);
  return {
    backdrop, panel,
    open: () => { panel.classList.add("open"); backdrop.classList.add("open"); },
  };
}

/**
 * Date / Today / Practice controls used by the hub and the in-game menu.
 * Calls onChange({ date, practice }) immediately and whenever the choice changes.
 */
export function playChooser(initial = {}, onChange = () => {}) {
  const today = () => todayKey();
  let practice = !!initial.practice;
  let date = validPlayDate(initial.date) ? initial.date : today();

  const dateInput = el("input", {
    type: "date", min: EPOCH, max: today(), value: date, "aria-label": "Puzzle date",
  });
  const todayBtn = el("button.btn.small.secondary", { type: "button" }, "Today");
  const practiceBtn = el("button.btn.small.secondary", { type: "button" }, "Practice");
  const hint = el("p.play-chooser-hint");
  const choice = () => ({ date, practice });

  const paint = () => {
    dateInput.value = date;
    dateInput.disabled = practice;
    dateInput.max = today();
    const todayOn = !practice && date === today();
    todayBtn.classList.toggle("on", todayOn);
    practiceBtn.classList.toggle("on", practice);
    todayBtn.setAttribute("aria-pressed", String(todayOn));
    practiceBtn.setAttribute("aria-pressed", String(practice));
    hint.textContent = practice
      ? "A new puzzle each time. It does not count toward your streak."
      : date === today()
        ? `Today · ${formatLongDate(date)}`
        : `Archive · ${formatLongDate(date)} · No. ${puzzleNumber(date)}`;
  };
  const emit = () => { paint(); onChange(choice()); };

  dateInput.addEventListener("change", () => {
    const v = dateInput.value;
    if (!validPlayDate(v)) { dateInput.value = date; return; }
    date = v;
    practice = false;
    emit();
  });
  todayBtn.addEventListener("click", () => {
    date = today();
    practice = false;
    emit();
  });
  practiceBtn.addEventListener("click", () => {
    practice = !practice;
    emit();
  });

  const node = el("div.play-chooser", el("div.play-chooser-row", dateInput, todayBtn, practiceBtn), hint);
  emit();
  return node;
}

function validPlayDate(key) {
  return !!(key && parseDateKey(key) && key >= EPOCH && key <= todayKey());
}

// ---------------------------------------------------------------- modal

let openModals = [];

/**
 * showModal({ title, subtitle, content: Node|Node[]|string(html), className, onClose })
 * Returns a close() function. Esc and backdrop click close it.
 */
export function showModal({ title, subtitle, content, className = "", onClose } = {}) {
  const box = el(`div.modal${className ? "." + className.split(" ").join(".") : ""}`, { role: "dialog", "aria-modal": "true" });
  const overlay = el("div.modal-overlay", box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 150);
    document.removeEventListener("keydown", onKey, true);
    openModals = openModals.filter((m) => m !== close);
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === "Escape" && openModals[openModals.length - 1] === close) { e.stopPropagation(); close(); }
  };
  box.append(el("button.icon-btn.modal-close", { type: "button", "aria-label": "Close", html: ICONS.close, onclick: close }));
  if (title) box.append(el("h2", title));
  if (subtitle) box.append(el("p.subtitle", subtitle));
  if (typeof content === "string") box.append(el("div", { html: content }));
  else if (content) box.append(...[].concat(content));
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  openModals.push(close);
  return close;
}

export const isModalOpen = () => openModals.length > 0;

// ---------------------------------------------------------------- toast

let toastBox;
export function toast(message, ms = 1500) {
  if (!toastBox) {
    toastBox = el("div.toast-container", { "aria-live": "polite" });
    document.body.append(toastBox);
  }
  const t = el("div.toast", message);
  toastBox.prepend(t);
  if (ms !== Infinity) {
    setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 300); }, ms);
  }
  return () => t.remove();
}

// ---------------------------------------------------------------- settings

function settingRow(scope, def, rerender) {
  const info = el("div", el("div.label", def.label), def.desc && el("div.desc", def.desc));
  let control;
  const locked = def.lockedWhen ? def.lockedWhen() : false;
  if (def.type === "theme") {
    const on = isDark();
    control = el("button.switch", {
      type: "button", role: "switch", "aria-checked": String(on), "aria-label": def.label,
      onclick: () => { setSetting("global", "theme", isDark() ? "light" : "dark"); rerender(); },
    });
  } else if (def.type === "select") {
    const cur = getSetting(scope, def.key);
    control = el("select", {
      "aria-label": def.label, disabled: locked,
      onchange: (e) => { setSetting(scope, def.key, e.target.value); rerender(); },
    }, def.options.map(([v, label]) => el("option", { value: v, selected: v === cur }, label)));
  } else {
    const on = !!getSetting(scope, def.key);
    control = el("button.switch", {
      type: "button", role: "switch", "aria-checked": String(on), "aria-label": def.label, disabled: locked,
      onclick: () => {
        if (def.lockedWhen && def.lockedWhen()) { def.lockedMessage && toast(def.lockedMessage); return; }
        setSetting(scope, def.key, !getSetting(scope, def.key));
        rerender();
      },
    });
    if (locked && def.lockedMessage) info.append(el("div.desc", def.lockedMessage));
  }
  return el("div.setting", info, control);
}

export function showSettings(gameId) {
  const body = el("div");
  const render = () => {
    const schema = getSchema(gameId);
    const sections = new Map();
    for (const def of schema) {
      const name = def.section || "";
      if (!sections.has(name)) sections.set(name, []);
      sections.get(name).push(def);
    }
    const nodes = [];
    const globalRows = () => GLOBAL_SCHEMA.map((d) => settingRow("global", d, render));
    for (const [name, defs] of sections) {
      if (name) nodes.push(el("div.settings-section-title", name));
      defs.forEach((d) => nodes.push(settingRow(gameId, d, render)));
      if (name === "Display") nodes.push(...globalRows());
    }
    if (!sections.has("Display")) {
      nodes.push(el("div.settings-section-title", "Display"));
      nodes.push(...globalRows());
    }
    nodes.push(el("p.desc", { style: { fontSize: "12px", color: "var(--text-muted)", marginTop: "16px" } },
      `${collectionOf(gameId).name} · Settings are saved in this browser.`));
    body.replaceChildren(...nodes);
  };
  render();
  return showModal({ title: "Settings", content: body });
}

// ---------------------------------------------------------------- play more
// From inside any game: another day of this game, a practice puzzle, or another game.

let shell = { gameId: null, puzzle: null, practice: null }; // set by mountShell

const statusOn = (g, date) => progressLabel(progressId(g.id), date); // "" | "In progress" | "Done"
const doneOn = (g, date) => statusOn(g, date) === "Done";
const shortDate = (key) => parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** The day the open page belongs to (today for a practice puzzle). */
const shellDate = () => (shell.puzzle && shell.puzzle.isDaily ? shell.puzzle.date : todayKey());

/** Most recent day, from today back to launch, this game isn't finished on (skipping the open one). */
function openDayFor(game) {
  const skip = shell.puzzle && shell.puzzle.isDaily ? shell.puzzle.date : null;
  for (let d = todayKey(); d >= EPOCH; d = addDays(d, -1)) {
    if (d !== skip && !doneOn(game, d)) return d;
  }
  return null;
}

/** The next game in this collection's hub order that isn't finished on `date`. */
function nextGameFor(game, date) {
  const list = gamesIn(game.collection);
  const i = list.indexOf(game);
  return [...list.slice(i + 1), ...list.slice(0, i)].find((g) => !doneOn(g, date)) || null;
}

function startPractice(game) {
  if (shell.practice) shell.practice();
  else location.href = playHref(game, { practice: true });
}

/** One row of the likeliest next moves. */
function quickActions(game) {
  const date = shellDate();
  const day = openDayFor(game);
  const next = nextGameFor(game, date);
  return el("div.pm-quick",
    day && el("a.btn.small", { href: playHref(game, { date: day }) },
      day === todayKey() ? `Today's ${game.name}` : `${game.name} · ${shortDate(day)}`),
    next && el("a.btn.small.secondary", { href: playHref(next, { date }) }, `Next: ${next.name}`),
    el("button.btn.small.secondary", { type: "button", onclick: () => startPractice(game) }, "Practice puzzle"),
  );
}

/** The Play more picker: days of this game, a practice puzzle, and the other games. */
export function showPlayMore() {
  const game = gameById(shell.gameId);
  if (!game) return null;
  const today = todayKey();
  const date = shellDate();
  const current = shell.puzzle && shell.puzzle.isDaily ? shell.puzzle.date : null;

  const days = [];
  for (let k = 0; k < 14; k++) {
    const d = addDays(today, -k);
    if (d < EPOCH) break;
    days.push(d);
  }
  const dayChip = (d) => {
    const st = statusOn(game, d);
    const day = parseDateKey(d);
    return el(`a.pm-day${st === "Done" ? ".is-done" : st ? ".is-started" : ""}${d === current ? ".is-current" : ""}`, {
      href: playHref(game, { date: d }),
      "aria-label": `${formatLongDate(d)}: ${st || "not played"}`,
      "aria-current": d === current ? "page" : null,
    },
    el("span.pm-dow", d === today ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" })),
    el("span.pm-num", String(day.getDate())),
    el("span.pm-mark", { "aria-hidden": "true" }, st === "Done" ? "✓" : st ? "•" : ""));
  };
  const dateInput = el("input", {
    type: "date", min: EPOCH, max: today, value: current || today, "aria-label": `Pick a day of ${game.name}`,
  });
  dateInput.addEventListener("change", () => {
    if (validPlayDate(dateInput.value)) location.href = playHref(game, { date: dateInput.value });
  });

  const col = collectionOf(game);
  const others = gamesIn(col.id).filter((g) => g !== game).map((g) => {
    const st = statusOn(g, date);
    return el(`a.pm-game${st === "Done" ? ".is-done" : ""}`, { href: playHref(g, { date }) },
      el("img", { src: g.icon, alt: "" }),
      el("span.pm-game-name", g.name),
      el("span.pm-game-status", st || "New"));
  });

  return showModal({
    title: "Play more",
    className: "play-more-modal",
    content: [
      el("h3", game.name),
      quickActions(game),
      el("div.pm-days", { role: "list", "aria-label": "Recent days" }, days.map(dayChip)),
      el("label.pm-pick", el("span", "Any day"), dateInput),
      others.length ? el("h3", `Other games · ${date === today ? "Today" : shortDate(date)}`) : null,
      others.length ? el("div.pm-games", others) : null,
      el("div.pm-links",
        el("a.btn.secondary.pm-all", { href: hubHref({ date }, col.id) }, `All ${col.name}`),
        COLLECTIONS.filter((c) => c.id !== col.id).map((c) =>
          el("a.btn.secondary.pm-all", { href: hubHref({ date }, c.id) }, `Switch to ${c.name}`))),
    ],
  });
}

// ---------------------------------------------------------------- stats

/** Live "HH:MM:SS until midnight" element. */
export function countdown(label = "Next puzzle") {
  const time = el("div.time");
  const node = el("div.countdown", el("div.label", label), time);
  const tick = () => {
    if (!node.isConnected && node.dataset.started) return clearInterval(id);
    node.dataset.started = "1";
    const s = Math.floor(msUntilMidnight() / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    time.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const id = setInterval(tick, 1000);
  tick();
  return node;
}

export const formatTime = (secs) => {
  secs = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * showStats({ title, message, top: Node (above the stats), tiles: [{label, value}],
 *             distribution: { title, rows: [{label, count, highlight}] }, shareText, nextLabel,
 *             extra: Node, className })
 */
export function showStats(o) {
  const content = [];
  if (o.message) content.push(el("p.subtitle", o.message));
  if (o.top) content.push(o.top);
  content.push(el("h3", "Statistics"));
  content.push(el("div.stats-tiles", o.tiles.map((t) => el("div.stat-tile", el("div.value", t.value), el("div.label", t.label)))));
  if (o.distribution && o.distribution.rows.length) {
    const max = Math.max(1, ...o.distribution.rows.map((r) => r.count));
    content.push(el("h3", o.distribution.title || "Distribution"));
    content.push(el("div.dist", o.distribution.rows.map((r) =>
      el("div.dist-row",
        el(`div.dist-label${String(r.label).length > 2 ? ".wide" : ""}`, r.label),
        el("div", { style: { flex: "1" } },
          el(`div.dist-bar${r.highlight ? ".hl" : ""}`, { style: { width: `${Math.max(7, (r.count / max) * 100)}%` } }, r.count))))));
  }
  if (o.extra) content.push(o.extra);
  const game = gameById(shell.gameId);
  if (game) {
    content.push(el("h3", "Play more"), quickActions(game),
      el("button.btn.small.secondary.pm-open", { type: "button", onclick: () => showPlayMore() }, "More days & games"));
  }
  const footer = el("div.stats-footer");
  if (o.nextLabel !== null) footer.append(countdown(o.nextLabel || "Next puzzle"));
  if (o.shareText) {
    footer.append(el("button.btn.share", { type: "button", onclick: () => share(o.shareText), html: `Share ${ICONS.share}` }));
  }
  if (footer.children.length) content.push(footer);
  return showModal({ title: o.title, content, className: ["stats-modal", o.className].filter(Boolean).join(" ") });
}

// ---------------------------------------------------------------- share

export async function share(text) {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile && navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied results to clipboard");
  } catch {
    // http:// on a LAN address has no clipboard API; fall back to execCommand
    const ta = el("textarea", { style: { position: "fixed", opacity: "0" } }, text);
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    toast(ok ? "Copied results to clipboard" : "Unable to copy results");
  }
}

// ---------------------------------------------------------------- splash

/**
 * NYT-style start screen. Resolves when the player taps Play.
 * opts: { gameId, puzzle, playLabel ("Play" | "Continue" | "See Stats"), secondary: [{label, onClick}],
 *         byline, tagline, beforeActions: Node placed between the tagline and the buttons }
 */
export function splash(opts) {
  const game = gameById(opts.gameId);
  return new Promise((resolve) => {
    const p = opts.puzzle;
    const dateText = p.isDaily ? formatLongDate(p.date) : "Practice puzzle";
    const archiveInput = el("input", { type: "date", max: todayKey(), value: p.isDaily ? p.date : todayKey(), "aria-label": "Puzzle date" });
    const col = collectionOf(game);
    const home = hubHref(p.isDaily ? { date: p.date } : { practice: true }, col.id);
    const node = el("div.splash", { style: { "--splash-bg": game.accent } },
      el("div.splash-nav",
        el("button.icon-btn", { type: "button", "aria-label": "Menu", title: "Games", html: ICONS.menu, onclick: openMenu }),
        el("a.brand-line", { href: home }, col.name),
        el("a.icon-btn", { href: home, "aria-label": `All ${col.name}`, title: `All ${col.name}`, html: ICONS.home }),
      ),
      el("img.splash-icon", { src: game.icon, alt: "" }),
      el("h1", game.name),
      el("p.tagline", opts.tagline || game.tagline),
      opts.beforeActions || null,
      el("div.actions",
        el("button.btn", { type: "button", onclick: () => { node.remove(); resolve("play"); } }, opts.playLabel || "Play"),
        (opts.secondary || []).map((s) =>
          el("button.btn.secondary", { type: "button", onclick: () => { node.remove(); s.onClick(); resolve(s.value || "secondary"); } }, s.label)),
      ),
      el("div.meta",
        el("div.date", dateText),
        p.number ? el("div", `No. ${p.number}`) : null,
        opts.byline ? el("div", opts.byline) : null,
      ),
      el("div.archive",
        "Archive:", archiveInput,
        el("button.btn.small.secondary", { type: "button", onclick: () => {
          if (!archiveInput.value) return;
          const q = new URLSearchParams(location.search);
          q.delete("seed");
          q.delete("random");
          q.set("date", archiveInput.value);
          location.search = `?${q}`;
        } }, "Go"),
        el("button.btn.small.secondary", { type: "button", onclick: () => {
          const mode = new URLSearchParams(location.search).get("mode");
          location.search = mode ? `?random=1&mode=${encodeURIComponent(mode)}` : "?random=1";
        } }, "Random"),
      ),
    );
    document.body.append(node);
  });
}

export { puzzleNumber };
