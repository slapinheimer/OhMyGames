// The Crossword — 15×15 daily crossword.
import { startCrossword } from "./crossword/game.js";

startCrossword({
  gameId: "crossword", title: "The Crossword", size: 15, cellMax: 42,
  buckets: [[600, "< 10 min"], [1200, "10–20 min"], [1800, "20–30 min"], [3600, "30–60 min"], [Infinity, "60+ min"]],
});
