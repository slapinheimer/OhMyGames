// Global + per-game settings with a declarative schema.
//
// A game registers its options once:
//   defineSettings("wordle", [
//     { key: "hardMode", label: "Hard Mode", desc: "...", type: "toggle", default: false,
//       lockedWhen: () => midGame },                      // optional: disable the control
//     { key: "space", label: "Spacebar", type: "select", default: "clear",
//       options: [["clear", "Clears square & advances"], ["toggle", "Toggles direction"]],
//       section: "Interactions" },                         // optional grouping
//   ]);
// then reads with getSetting("wordle", "hardMode") and listens with onSettingsChange.
import { get, set } from "./storage.js";

const schemas = new Map();
const listeners = new Set();

export const GLOBAL_SCHEMA = [
  { key: "theme", label: "Dark Theme", type: "theme", default: "system" },
];

export function defineSettings(gameId, schema) {
  schemas.set(gameId, schema);
}

export const getSchema = (gameId) => schemas.get(gameId) || [];

function values(scope) {
  return get(`settings:${scope}`, {});
}

export function getSetting(scope, key) {
  const v = values(scope);
  if (key in v) return v[key];
  const schema = scope === "global" ? GLOBAL_SCHEMA : getSchema(scope);
  const def = schema.find((s) => s.key === key);
  return def ? def.default : undefined;
}

export function setSetting(scope, key, value) {
  const v = values(scope);
  v[key] = value;
  set(`settings:${scope}`, v);
  applyTheme();
  listeners.forEach((fn) => fn({ scope, key, value }));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Every game has a "Hints" switch (on by default). A game adds HINTS_SETTING to its schema
// and hides its hint controls whenever hintsOn(game) is false.
export const HINTS_SETTING = {
  key: "hints", label: "Hints", type: "toggle", default: true,
  desc: "Show the hint button. Turn off to play without help.",
};

export const hintsOn = (gameId) => getSetting(gameId, "hints") !== false;

/** Calls fn(on) now and again whenever the game's Hints switch changes. */
export function watchHints(gameId, fn) {
  fn(hintsOn(gameId));
  return onSettingsChange(({ scope, key }) => {
    if (scope === gameId && key === "hints") fn(hintsOn(gameId));
  });
}

export function isDark() {
  const t = getSetting("global", "theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Sync <html> data attributes with settings (theme + the game's highContrast). */
export function applyTheme() {
  const root = document.documentElement;
  const t = getSetting("global", "theme");
  if (t === "dark" || t === "light") root.setAttribute("data-theme", t);
  else root.removeAttribute("data-theme");
  const game = root.getAttribute("data-game");
  if (game && getSetting(game, "highContrast")) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
}
