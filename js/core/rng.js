// Seeded randomness and puzzle-date helpers. Every daily puzzle is a pure
// function of (gameId, dateKey), so everyone on this server gets the same one.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG for a game + puzzle id (e.g. "2026-10-21"). */
export function seededRandom(gameId, puzzleId) {
  return mulberry32(hashString(`${gameId}:${puzzleId}`));
}

export const randInt = (rng, n) => Math.floor(rng() * n);
export const pick = (rng, arr) => arr[randInt(rng, arr.length)];

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- dates

const pad = (n) => String(n).padStart(2, "0");

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

export const todayKey = () => dateKey(new Date());

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Launch day of Oh My WORDS! — puzzle #1. */
export const EPOCH = "2026-01-01";

export function puzzleNumber(key) {
  const ms = parseDateKey(key) - parseDateKey(EPOCH);
  return Math.round(ms / 86400000) + 1;
}

export function formatLongDate(key) {
  return parseDateKey(key).toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

/**
 * Which puzzle the page should show. `?date=YYYY-MM-DD` plays an archive day,
 * `?random=1` (or `?seed=xyz`) plays a fresh non-daily puzzle.
 * Returns { id, date, isDaily, isToday, number }.
 */
export function currentPuzzle() {
  const q = new URLSearchParams(location.search);
  const today = todayKey();
  if (q.has("seed") || q.has("random")) {
    const seed = q.get("seed") || String(Math.floor(Math.random() * 1e9));
    if (!q.get("seed")) {
      // Reloads keep the same puzzle. Keep mode= so Wordle+1 practice stays Wordle+1.
      const mode = q.get("mode");
      history.replaceState(null, "", mode ? `?seed=${seed}&mode=${encodeURIComponent(mode)}` : `?seed=${seed}`);
    }
    return { id: `seed-${seed}`, date: today, isDaily: false, isToday: false, number: null, seed };
  }
  const key = q.get("date");
  if (key && parseDateKey(key) && key <= today) {
    return { id: key, date: key, isDaily: true, isToday: key === today, number: puzzleNumber(key) };
  }
  return { id: today, date: today, isDaily: true, isToday: true, number: puzzleNumber(today) };
}

export function msUntilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}
