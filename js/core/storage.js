// localStorage wrapper (namespaced, never throws) plus per-game state & stats.
import { addDays } from "./rng.js";

const NS = "omw:";
const memory = new Map(); // fallback when storage is unavailable

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

export function set(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {}
}

export function remove(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(NS + key);
  } catch {}
}

// ---------------------------------------------------------------- game state

/** Saved in-progress / finished state for one puzzle. */
export const loadState = (game, puzzleId) => get(`state:${game}:${puzzleId}`);
export const saveState = (game, puzzleId, state) => set(`state:${game}:${puzzleId}`, state);
export const clearState = (game, puzzleId) => remove(`state:${game}:${puzzleId}`);

/** Hub / play-menu label: "" | "In progress" | "Done". */
export function progressLabel(game, puzzleId) {
  const state = loadState(game, puzzleId);
  if (!state) return "";
  if (state.status === "won" || state.status === "lost" || state.done) return "Done";
  return "In progress";
}

// ---------------------------------------------------------------- stats

const emptyStats = () => ({
  played: 0, won: 0, currentStreak: 0, maxStreak: 0,
  dist: {}, // bucket -> count (e.g. guesses "1".."6", mistakes "0".."4", "X" for loss)
  times: [], // solve times in seconds (most recent last, capped)
  lastDailyId: null, lastWonDailyId: null, recorded: {},
});

export function getStats(game) {
  return { ...emptyStats(), ...get(`stats:${game}`, {}) };
}

/**
 * Record a finished puzzle once. `puzzle` comes from currentPuzzle().
 * result: { won: bool, bucket?: string, time?: seconds, extra?: object }
 * Only daily puzzles move streaks; replays of the same puzzle are ignored.
 */
export function recordResult(game, puzzle, result) {
  const s = getStats(game);
  if (s.recorded[puzzle.id]) return s;
  s.recorded[puzzle.id] = result.won ? 1 : 0;
  s.played++;
  if (result.won) s.won++;
  if (result.bucket != null) s.dist[result.bucket] = (s.dist[result.bucket] || 0) + 1;
  if (result.time != null) s.times = [...s.times, Math.round(result.time)].slice(-200);
  if (puzzle.isDaily && puzzle.isToday) {
    if (result.won) {
      const continues = s.lastWonDailyId === addDays(puzzle.id, -1);
      s.currentStreak = continues ? s.currentStreak + 1 : 1;
      s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
      s.lastWonDailyId = puzzle.id;
    } else {
      s.currentStreak = 0;
    }
    s.lastDailyId = puzzle.id;
  }
  if (result.extra) Object.assign(s, result.extra);
  set(`stats:${game}`, s);
  return s;
}

/** Streak shown in UI: drops to 0 if a daily was missed. */
export function liveStreak(stats, todayId) {
  if (!stats.lastWonDailyId) return 0;
  if (stats.lastWonDailyId === todayId || stats.lastWonDailyId === addDays(todayId, -1)) return stats.currentStreak;
  return 0;
}
