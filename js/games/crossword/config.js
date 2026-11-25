// Generator settings per game. Shared by the browser (worker) and
// tools/gen_crosswords.mjs so in-browser fallback generation reproduces the
// pregenerated daily files exactly. Changing these (or templates.json /
// words.json) changes future puzzles: regenerate data/crossword/puzzles.
//   nodeLimit    search nodes per fill attempt before restarting
//   beam         candidate words tried per slot
//   maxAttempts  template/restart attempts before giving up
//   scoreWeight  how strongly to prefer high-scoring (common) words
//   minScore     leave out words scoring below this (obscure fill)
export const GEN = {
  mini: { nodeLimit: 2000, beam: 12, maxAttempts: 80, scoreWeight: 8, minScore: 40 },
  midi: { nodeLimit: 2000, beam: 12, maxAttempts: 120, scoreWeight: 8, minScore: 35 },
  crossword: { nodeLimit: 2000, beam: 12, maxAttempts: 240, scoreWeight: 8, minScore: 30 },
};

export const TEMPLATES_URL = "data/crossword/templates.json";
export const WORDS_URL = "data/crossword/words.json";
export const puzzleUrl = (gameId, id) => `data/crossword/puzzles/${gameId}/${id}.json`;
