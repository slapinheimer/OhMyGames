// The Midi — 9×9 daily crossword.
import { startCrossword } from "./crossword/game.js";

startCrossword({
  gameId: "midi", title: "The Midi", size: 9, cellMax: 76,
  buckets: [[120, "< 2 min"], [300, "2–5 min"], [600, "5–10 min"], [1200, "10–20 min"], [Infinity, "20+ min"]],
});
