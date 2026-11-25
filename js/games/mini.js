// The Mini — 5×5 daily crossword.
import { startCrossword } from "./crossword/game.js";

startCrossword({
  gameId: "mini", title: "The Mini", size: 5, cellMax: 96,
  // [upper bound in seconds, label] for the solve-time distribution
  buckets: [[30, "< 0:30"], [60, "0:30–1:00"], [120, "1–2 min"], [300, "2–5 min"], [Infinity, "5+ min"]],
});
