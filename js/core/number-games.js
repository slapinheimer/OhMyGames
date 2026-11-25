// Registry of Oh My NUMBERS! games, in hub order. One entry per game:
// { id, name, page, icon, accent, tagline }. See ARCHITECTURE.md, "Adding a number game".
export const NUMBER_GAMES = [
  {
    id: "twofold", name: "Twofold", page: "twofold.html", icon: "img/twofold.svg",
    accent: "var(--accent-twofold)", tagline: "Slide the board and merge matching tiles. Reach 2048.",
  },
  {
    id: "tally", name: "Tally", page: "tally.html", icon: "img/tally.svg",
    accent: "var(--accent-tally)", tagline: "Cross out numbers until every row and column hits its target. 4×4 to 9×9.",
  },
  {
    id: "sudoku", name: "Sudoku", page: "sudoku.html", icon: "img/sudoku.svg",
    accent: "var(--accent-sudoku)", tagline: "Fill each row, column, and box with 1–9. Three mistakes ends it.",
  },
  {
    id: "ballpark", name: "Ballpark", page: "ballpark.html", icon: "img/ballpark.svg",
    accent: "var(--accent-ballpark)", tagline: "Guess how many of a small thing match a big one. Five questions, closer scores more.",
  },
  {
    id: "sums", name: "Cross Sums", page: "sums.html", icon: "img/sums.svg",
    accent: "var(--accent-sums)", tagline: "Fill the grid so every run adds up to its clue, no repeats. 3×3 to 10×10.",
  },
];
