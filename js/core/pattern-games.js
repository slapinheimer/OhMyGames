// Registry of Oh My PATTERNS! games, in hub order. One entry per game:
// { id, name, page, icon, accent, tagline }. Same steps as ARCHITECTURE.md, "Adding a number game".
export const PATTERN_GAMES = [
  {
    id: "motif", name: "Motif", page: "motif.html", icon: "img/motif.svg",
    accent: "var(--accent-motif)", tagline: "Match layered tiles to clear the board. Keep the chain going.",
  },
  {
    id: "crowns", name: "Crowns", page: "crowns.html", icon: "img/crowns.svg",
    accent: "var(--accent-crowns)", tagline: "One crown per row, column and region, none touching. 6×6 to 10×10.",
  },
  {
    id: "glow", name: "Glow", page: "glow.html", icon: "img/glow.svg",
    accent: "var(--accent-glow)", tagline: "Each press flips a light and its neighbors. Turn them all off on par.",
  },
  {
    id: "shade", name: "Shade", page: "shade.html", icon: "img/shade.svg",
    accent: "var(--accent-shade)", tagline: "Shade the runs in each clue. Finish the grid and a picture appears.",
  },
  {
    id: "conduit", name: "Conduit", page: "conduit.html", icon: "img/conduit.svg",
    accent: "var(--accent-conduit)", tagline: "Draw a pipe between each pair of fittings. Fill every cell. 5×5 to 9×9.",
  },
  {
    id: "trail", name: "Trail", page: "trail.html", icon: "img/trail.svg",
    accent: "var(--accent-trail)", tagline: "Draw one line through every square, passing the numbers in order.",
  },
  {
    id: "reversi", name: "Reversi", page: "reversi.html", icon: "img/reversi.svg",
    accent: "var(--accent-reversi)", tagline: "Trap the computer's discs to turn them yours. Most discs wins.",
  },
  {
    id: "flipper", name: "Flipper", page: "flipper.html", icon: "img/flipper.svg",
    accent: "var(--accent-flipper)", tagline: "Turn two cards. Match the picture. A miss stays up for 4 seconds.",
  },
];
