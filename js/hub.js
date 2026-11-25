// Collection hub (words.html, numbers.html): pick a day, then a game.
// The page names its collection with <html data-collection="…">.
import { APP_NAME, COLLECTIONS, collectionById, gamesIn, playHref, hubHref, progressId } from "./core/games.js";
import { el, playChooser, ICONS } from "./core/ui.js";
import { todayKey, parseDateKey, EPOCH } from "./core/rng.js";
import { progressLabel } from "./core/storage.js";
import { isDark, setSetting, applyTheme } from "./core/settings.js";

const col = collectionById(document.documentElement.dataset.collection);
const games = gamesIn(col.id);
document.title = `${col.name} — ${APP_NAME}`;

function initialChoice() {
  const q = new URLSearchParams(location.search);
  const today = todayKey();
  if (q.has("random") || q.has("seed")) return { practice: true, date: today };
  const key = q.get("date");
  if (key && parseDateKey(key) && key >= EPOCH && key <= today) return { practice: false, date: key };
  return { practice: false, date: today };
}

const switchLinks = COLLECTIONS.map((c) => el(`a.hub-tab${c.id === col.id ? ".is-on" : ""}`, {
  href: c.hub, "aria-current": c.id === col.id ? "page" : null,
}, c.short));

const themeBtn = el("button.icon-btn", {
  type: "button", "aria-label": "Toggle dark theme", title: "Toggle dark theme", html: ICONS.moon,
  onclick: () => { setSetting("global", "theme", isDark() ? "light" : "dark"); applyTheme(); },
});

const grid = el("main.hub-grid#grid");
const when = el("div.hub-when");
document.body.replaceChildren(
  el("header.hub-header",
    el("a.hub-logo", { href: "index.html", title: "Home" }, "Oh My ", el("em", "GAMES!")),
    el("nav.hub-switch", { "aria-label": "Collections" }, switchLinks),
    themeBtn),
  el("section.hub-hero",
    el("h2", col.name),
    el("p", "Play any game, any day."),
    when),
  grid,
  el("footer.hub-footer",
    games.length < 4 ? el("p", `More ${col.short.toLowerCase()} games are on the way.`) : null,
    el("p", "New puzzles at midnight. Pick any day, or a practice puzzle. Progress stays in this browser.")),
);

function render(choice) {
  const params = new URLSearchParams();
  if (choice.practice) params.set("random", "1");
  else if (choice.date !== todayKey()) params.set("date", choice.date);
  const next = params.toString() ? `${location.pathname}?${params}` : location.pathname;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
  // Switching collection keeps the chosen day.
  switchLinks.forEach((a, i) => { a.href = hubHref(choice, COLLECTIONS[i].id); });

  grid.replaceChildren(...games.map((g) => {
    const progress = choice.practice ? "" : progressLabel(progressId(g.id), choice.date);
    const label = progress === "Done" ? "See results" : progress ? "Continue" : "Play";
    return el("a.card", { href: playHref(g, choice), style: { "--card-accent": g.accent } },
      el("div.card-top", el("img", { src: g.icon, alt: "" }), progress && el("span.card-status", progress)),
      el("div.card-body", el("h3", g.name), el("p", g.tagline), el("span.btn", label)));
  }));
}

when.append(playChooser(initialChoice(), render));
