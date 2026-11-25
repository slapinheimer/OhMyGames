// Flipper: turn two cards. A pair that matches stays up. A miss stays up for
// HOLD_MS, then both turn down. The deck is a pure function of the daily seed.
import { seededRandom, shuffle } from "../../core/rng.js";

/** cols × rows. Cell count is always even. */
export const GRIDS = [
  { id: "4x4", cols: 4, rows: 4, label: "4×4" },
  { id: "4x6", cols: 4, rows: 6, label: "4×6" },
  { id: "6x6", cols: 6, rows: 6, label: "6×6" },
];
export const DEFAULT_GRID = "4x4";

export const LEVELS = [
  { id: "easy", name: "Easy" },
  { id: "medium", name: "Medium" },
  { id: "hard", name: "Hard" },
];
export const DEFAULT_LEVEL = "medium";

/** A miss stays face up this long before both cards turn down. */
export const HOLD_MS = 4000;

export const TIME_BANDS = ["<1m", "1–2m", "2–4m", "4–8m", "8m+"];
export function timeBand(secs) {
  if (secs < 60) return TIME_BANDS[0];
  if (secs < 120) return TIME_BANDS[1];
  if (secs < 240) return TIME_BANDS[2];
  if (secs < 480) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

export const gridById = (id) => GRIDS.find((g) => g.id === id) || GRIDS[0];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
export const boardKey = (gridId, level) => `${gridId}-${level}`;
export const statsId = (gridId, level) => `flipper-${gridId}-${level}`;

const round = (n) => Math.round(n * 10) / 10;

function svg(bg, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>${inner}</svg>`;
}

function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${round(cx + Math.cos(a) * rad)},${round(cy + Math.sin(a) * rad)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

function rays(cx, cy, r0, r1, n, fill) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n - Math.PI / 2;
    s += `<line x1="${round(cx + Math.cos(a) * r0)}" y1="${round(cy + Math.sin(a) * r0)}" x2="${round(cx + Math.cos(a) * r1)}" y2="${round(cy + Math.sin(a) * r1)}" stroke="${fill}" stroke-width="3.2" stroke-linecap="round"/>`;
  }
  return s;
}

function easyCatalog() {
  const items = [
    ["e-sun", "Sun", "#fff3c4", `${rays(32, 32, 12, 26, 8, "#e0a100")}<circle cx="32" cy="32" r="10" fill="#f0b400"/>`],
    ["e-drop", "Drop", "#e3f2ff", `<path d="M32 10 C32 10 16 30 16 40 a16 16 0 0 0 32 0 C48 30 32 10 32 10z" fill="#2f7de1"/>`],
    ["e-leaf", "Leaf", "#e5f6e4", `<path d="M14 44 C18 18 46 12 52 14 C48 42 22 50 14 44z" fill="#2f9e44"/><path d="M18 42 L44 20" fill="none" stroke="#145c28" stroke-width="2"/>`],
    ["e-bolt", "Bolt", "#fff6d8", `<polygon points="36,8 16,36 30,36 26,56 50,26 34,26" fill="#e0a100"/>`],
    ["e-heart", "Heart", "#ffe4ea", `<path d="M32 52 L12 30 C6 22 12 12 22 14 C26 16 30 22 32 26 C34 22 38 16 42 14 C52 12 58 22 52 30z" fill="#e23d6b"/>`],
    ["e-moon", "Moon", "#e4e8ff", `<path d="M40 12 a18 18 0 1 0 0 40 a14 14 0 1 1 0-40z" fill="#5b4fd6"/>`],
    ["e-star", "Star", "#fff1d6", star(32, 34, 22, "#e08600")],
    ["e-house", "House", "#fde8dc", `<polygon points="32,10 10,32 18,32 18,52 46,52 46,32 54,32" fill="#d4653a"/>`],
    ["e-fish", "Fish", "#e1f6f8", `<ellipse cx="30" cy="34" rx="16" ry="10" fill="#1aa0b0"/><polygon points="46,34 58,22 58,46" fill="#1aa0b0"/><circle cx="22" cy="32" r="2" fill="#08343a"/>`],
    ["e-key", "Key", "#f4e8ff", `<circle cx="24" cy="26" r="10" fill="none" stroke="#7a3ad4" stroke-width="4"/><path d="M32 32 L50 50 M42 44 L50 44 M44 50 L50 50" fill="none" stroke="#7a3ad4" stroke-width="4" stroke-linecap="round"/>`],
    ["e-bell", "Bell", "#fff0e0", `<path d="M32 10 a4 4 0 0 1 4 4 C46 16 50 28 50 36 H14 C14 28 18 16 28 14 a4 4 0 0 1 4-4z M24 36 h16 a8 8 0 0 1-16 0z" fill="#e07a14"/>`],
    ["e-gem", "Gem", "#e8f7ff", `<polygon points="32,8 52,24 32,56 12,24" fill="#2f9ec4"/><polygon points="32,8 42,24 32,28 22,24" fill="#8fd4ea"/>`],
    ["e-cloud", "Cloud", "#eef3f8", `<circle cx="26" cy="36" r="10" fill="#8aa0b8"/><circle cx="38" cy="34" r="12" fill="#8aa0b8"/><circle cx="46" cy="40" r="8" fill="#8aa0b8"/><rect x="18" y="36" width="32" height="12" fill="#8aa0b8"/>`],
    ["e-bloom", "Bloom", "#fde8f4", `<circle cx="32" cy="18" r="8" fill="#e05a9a"/><circle cx="46" cy="30" r="8" fill="#e05a9a"/><circle cx="40" cy="46" r="8" fill="#e05a9a"/><circle cx="24" cy="46" r="8" fill="#e05a9a"/><circle cx="18" cy="30" r="8" fill="#e05a9a"/><circle cx="32" cy="32" r="6" fill="#f2c14b"/>`],
    ["e-tree", "Tree", "#e7f6e6", `<polygon points="32,8 14,36 50,36" fill="#2f8a3a"/><polygon points="32,22 12,48 52,48" fill="#227a32"/><rect x="28" y="48" width="8" height="10" fill="#7a4b2a"/>`],
    ["e-cup", "Cup", "#fff4e8", `<path d="M18 16 h24 l-3 26 a10 10 0 0 1-18 0z" fill="#e08a3c"/><path d="M42 20 h8 a8 8 0 0 1 0 16 h-6" fill="none" stroke="#e08a3c" stroke-width="4"/>`],
    ["e-flag", "Flag", "#e9f8ef", `<rect x="16" y="12" width="4" height="42" fill="#1f7a4a"/><polygon points="20,14 48,22 20,32" fill="#e23d3d"/>`],
    ["e-boat", "Boat", "#e5f3ff", `<path d="M12 38 L32 16 L32 38z" fill="#f2f6f8"/><path d="M8 40 H56 L48 52 H16z" fill="#2a6fbf"/><rect x="30" y="14" width="3" height="26" fill="#1a3c66"/>`],
  ];
  return items.map(([id, name, bg, inner]) => ({
    id, name, level: "easy", family: id, kin: id, markup: svg(bg, inner),
  }));
}

function mediumCatalog() {
  const colors = [["Red", "#d64545"], ["Blue", "#2f6fed"], ["Green", "#1f9d57"]];
  const shapes = [
    ["ring", "ring", (c) => `<circle cx="32" cy="32" r="16" fill="none" stroke="${c}" stroke-width="8"/>`],
    ["plus", "plus", (c) => `<rect x="26" y="12" width="12" height="40" rx="2" fill="${c}"/><rect x="12" y="26" width="40" height="12" rx="2" fill="${c}"/>`],
    ["diamond", "diamond", (c) => `<polygon points="32,8 54,32 32,56 10,32" fill="${c}"/>`],
    ["triangle", "triangle", (c) => `<polygon points="32,10 54,52 10,52" fill="${c}"/>`],
    ["bars", "bars", (c) => [16, 28, 40].map((y) => `<rect x="14" y="${y}" width="36" height="8" rx="2" fill="${c}"/>`).join("")],
    ["cluster", "dots", (c) => [[22, 22], [42, 22], [22, 42], [42, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${c}"/>`).join("")],
  ];
  const out = [];
  for (const [shape, label, draw] of shapes) {
    for (const [colorName, color] of colors) {
      out.push({
        id: `m-${shape}-${colorName.toLowerCase()}`,
        name: `${colorName} ${label}`,
        level: "medium",
        family: shape,
        kin: shape,
        markup: svg("#f4f1ea", draw(color)),
      });
    }
  }
  return out;
}

function hardCatalog() {
  const ink = "#243044";
  const bg = "#f3f1ec";
  const out = [];

  const pipAt = [[16, 16], [32, 16], [48, 16], [16, 32], [32, 32], [48, 32], [16, 48], [32, 48], [48, 48]];
  const pipNames = ["top left", "center", "bottom right"];
  [0, 4, 8].forEach((hollow, k) => {
    const dots = pipAt.map(([x, y], i) => (
      i === hollow
        ? `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${ink}" stroke-width="2.4"/>`
        : `<circle cx="${x}" cy="${y}" r="4.2" fill="${ink}"/>`
    )).join("");
    out.push({
      id: `h-pips-${k}`, name: `Dots, hollow ${pipNames[k]}`, level: "hard", family: "pips",
      kin: "pips", markup: svg(bg, dots),
    });
  });

  const barNames = ["top bar short", "second bar short", "bottom bar short"];
  [0, 1, 3].forEach((short, k) => {
    const bars = [0, 1, 2, 3].map((i) => {
      const w = i === short ? 20 : 36;
      const x = 14 + (36 - w) / 2;
      return `<rect x="${x}" y="${12 + i * 12}" width="${w}" height="7" rx="2" fill="${ink}"/>`;
    }).join("");
    out.push({
      id: `h-bars-${k}`, name: `Stripes, ${barNames[k]}`, level: "hard", family: "bars",
      kin: "bars", markup: svg(bg, bars),
    });
  });

  const bites = [
    ["top", `<circle cx="32" cy="14" r="8" fill="${bg}"/>`],
    ["right", `<circle cx="50" cy="32" r="8" fill="${bg}"/>`],
    ["bottom", `<circle cx="32" cy="50" r="8" fill="${bg}"/>`],
  ];
  bites.forEach(([edge, bite], k) => {
    out.push({
      id: `h-notch-${k}`, name: `Square, bite on the ${edge}`, level: "hard", family: "notch",
      kin: "notch",
      markup: svg(bg, `<rect x="14" y="14" width="36" height="36" rx="4" fill="${ink}"/>${bite}`),
    });
  });

  [[-90, "twelve"], [-50, "one"], [-15, "two"]].forEach(([deg, hour], k) => {
    const a = (deg * Math.PI) / 180;
    const x2 = round(32 + Math.cos(a) * 16);
    const y2 = round(32 + Math.sin(a) * 16);
    out.push({
      id: `h-clock-${k}`, name: `Clock hand near ${hour}`, level: "hard", family: "clock",
      kin: "clock",
      markup: svg(bg, `<circle cx="32" cy="32" r="18" fill="none" stroke="${ink}" stroke-width="3"/><line x1="32" y1="32" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`),
    });
  });

  [[8, "narrow"], [16, "medium"], [24, "wide"]].forEach(([gap, word], k) => {
    const x2 = 14 + 12 + gap;
    out.push({
      id: `h-gap-${k}`, name: `Two bars, ${word} gap`, level: "hard", family: "gap",
      kin: "gap",
      markup: svg(bg, `<rect x="14" y="16" width="12" height="32" rx="2" fill="${ink}"/><rect x="${x2}" y="16" width="12" height="32" rx="2" fill="${ink}"/>`),
    });
  });

  const corners = [["10", "10", "top left"], ["46", "10", "top right"], ["46", "46", "bottom right"]];
  corners.forEach(([x, y, place], k) => {
    out.push({
      id: `h-corner-${k}`, name: `Circle, square at ${place}`, level: "hard", family: "corner",
      kin: "corner",
      markup: svg(bg, `<circle cx="30" cy="34" r="16" fill="${ink}"/><rect x="${x}" y="${y}" width="9" height="9" fill="${ink}"/>`),
    });
  });

  return out;
}

const CATALOG = [...easyCatalog(), ...mediumCatalog(), ...hardCatalog()];
const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export const catalog = (level) => CATALOG.filter((p) => p.level === level);
export const patternById = (id) => BY_ID.get(id) || null;
export const faceMarkup = (id) => (BY_ID.get(id) ? BY_ID.get(id).markup : "");

function pickIds(rng, patterns, need) {
  const byFam = new Map();
  for (const p of patterns) {
    if (!byFam.has(p.family)) byFam.set(p.family, []);
    byFam.get(p.family).push(p.id);
  }
  const chosen = [];
  for (const family of shuffle([...byFam.keys()], rng)) {
    for (const id of shuffle(byFam.get(family), rng)) {
      if (chosen.length >= need) return chosen;
      chosen.push(id);
    }
  }
  return chosen;
}

/** Today's deck: each pattern id appears exactly twice. */
export function puzzleFor(puzzle, gridId = DEFAULT_GRID, level = DEFAULT_LEVEL) {
  const grid = gridById(gridId);
  const lvl = levelById(level).id;
  const need = (grid.cols * grid.rows) / 2;
  const patterns = catalog(lvl);
  if (patterns.length < need) throw new Error(`Not enough Flipper patterns for ${grid.label} ${lvl}`);
  const rng = seededRandom("flipper", `${puzzle.id}:${grid.id}:${lvl}`);
  const chosen = pickIds(rng, patterns, need);
  const deck = shuffle([...chosen, ...chosen], rng);
  return { gridId: grid.id, cols: grid.cols, rows: grid.rows, level: lvl, deck };
}

export function freshPlay(deck) {
  return {
    deckKey: deck.join("|"),
    deck,
    face: [],
    matched: deck.map(() => false),
    pinned: [],
    holdUntil: 0,
    moves: 0,
    hints: 0,
    time: 0,
    status: "playing",
  };
}

/** Drop a finished miss once `now` has reached holdUntil. Pinned cards stay up. */
export function settle(play, now) {
  if (!play.holdUntil || now < play.holdUntil) return play;
  return {
    ...play,
    face: play.face.filter((i) => play.pinned.includes(i)),
    holdUntil: 0,
  };
}

export function canOpen(play, index, now) {
  if (!play || play.status !== "playing") return false;
  if (index < 0 || index >= play.deck.length) return false;
  if (play.matched[index] || play.face.includes(index)) return false;
  if (play.holdUntil && now < play.holdUntil) return false;
  if (play.face.length >= 2) return false;
  return true;
}

/**
 * Turn a card. The second card of a pair counts as one move.
 * A match locks both. A miss sets holdUntil to now + HOLD_MS.
 * Returns the same object when the tap does nothing.
 */
export function openCard(play, index, now) {
  const base = settle(play, now);
  if (!canOpen(base, index, now)) return base;
  const face = base.face.concat(index);
  if (face.length < 2) return { ...base, face };
  const [a, b] = face;
  const moves = base.moves + 1;
  if (base.deck[a] === base.deck[b]) {
    const matched = base.matched.slice();
    matched[a] = matched[b] = true;
    const status = matched.every(Boolean) ? "won" : "playing";
    return { ...base, face: [], matched, moves, holdUntil: 0, status };
  }
  return { ...base, face, moves, holdUntil: now + HOLD_MS };
}

/**
 * No card up: pin one face up. One card up: turn its match and lock the pair.
 * During a miss hold, do nothing. Returns { play, action }.
 */
export function takeHint(play, now) {
  const base = settle(play, now);
  if (base.status !== "playing") return { play: base, action: "done" };
  if (base.holdUntil && now < base.holdUntil) return { play: base, action: "wait" };
  const open = base.deck.map((_, i) => i).filter((i) => !base.matched[i] && !base.face.includes(i));
  if (!open.length) return { play: base, action: "done" };
  if (base.face.length === 1) {
    const a = base.face[0];
    const b = open.find((i) => base.deck[i] === base.deck[a]);
    if (b == null) return { play: base, action: "done" };
    return { play: openCard({ ...base, hints: base.hints + 1 }, b, now), action: "pair" };
  }
  const i = open[0];
  return {
    play: { ...base, face: base.face.concat(i), pinned: base.pinned.concat(i), hints: base.hints + 1 },
    action: "peek",
  };
}

export function pairsLeft(play) {
  return play.matched.filter((m) => !m).length / 2;
}

export function shareText({ puzzle, cols, rows, level, moves, time, hints = 0, formatTime }) {
  const tip = hints ? ` 💡${hints}` : "";
  const label = puzzle.number ? `#${puzzle.number}` : "(practice)";
  const name = levelById(level).name;
  const moveWord = moves === 1 ? "move" : "moves";
  return `Oh My PATTERNS! Flipper ${label}${tip}\n${cols}×${rows} ${name} · ${moves} ${moveWord} · ${formatTime(time)}`;
}
