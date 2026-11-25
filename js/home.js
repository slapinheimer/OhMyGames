// Home page (index.html): Oh My GAMES! forks into the collections.
import { APP_NAME, COLLECTIONS, gamesIn, progressId } from "./core/games.js";
import { el, ICONS } from "./core/ui.js";
import { todayKey } from "./core/rng.js";
import { progressLabel } from "./core/storage.js";
import { isDark, setSetting, applyTheme } from "./core/settings.js";

const today = todayKey();

const cards = COLLECTIONS.map((c) => {
  const games = gamesIn(c.id);
  const done = games.filter((g) => progressLabel(progressId(g.id), today) === "Done").length;
  const count = `${games.length} ${games.length === 1 ? "game" : "games"}`;
  return el("a.fork-card", { href: c.hub, style: { "--card-accent": c.accent } },
    el("div.fork-top",
      el("div.fork-icons", { "aria-hidden": "true" }, games.slice(0, 6).map((g) => el("img", { src: g.icon, alt: "" })))),
    el("div.fork-body",
      el("h2", c.name),
      el("p", c.tagline),
      el("p.fork-meta", done ? `${count} · ${done} done today` : count),
      el("span.btn", `Play ${c.short.toLowerCase()}`)));
});

document.body.replaceChildren(
  el("header.hub-header",
    el("span.hub-logo", "Oh My ", el("em", "GAMES!")),
    el("button.icon-btn", {
      type: "button", "aria-label": "Toggle dark theme", title: "Toggle dark theme", html: ICONS.moon,
      onclick: () => { setSetting("global", "theme", isDark() ? "light" : "dark"); applyTheme(); },
    })),
  el("section.hub-hero.fork-hero",
    el("h1", APP_NAME),
    el("p", "Daily puzzles, any day. Pick a collection.")),
  el("main.fork-grid", cards),
  el("footer.hub-footer", el("p", "Progress stays in this browser. Switch collections any time from the ☰ menu in a game.")),
);
