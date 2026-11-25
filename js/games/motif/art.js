// Motif tile art: one SVG per tile, viewBox 0 0 100 100. Each slot has six variants that
// differ in shape or texture as well as color, so they read without relying on color.

const FIELDS = ["#f4c7c3", "#c8e6c0", "#c3d6f5", "#f5e2b0", "#dccaf0", "#bfe5e3"];
const FRAME_COLORS = ["#c0392b", "#1f5fa8", "#2f7d32", "#7b3fa0", "#b7791f", "#127c7c"];
const EMBLEM_COLORS = ["#e05a47", "#2f6fd1", "#e0a100", "#3a9d5d", "#8e44ad", "#1aa3a3"];
const TRIM_COLORS = ["#e67e22", "#5c6bc0", "#d81b60", "#26a69a", "#8d6e63", "#7cb342"];

/** Textures laid over each field color (drawn once in a shared <defs>, see textureDefs). */
export function textureDefs() {
  const ink = "rgba(0,0,0,0.16)";
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <pattern id="mf-t1" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="${ink}"/></pattern>
    <pattern id="mf-t2" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="2.4" fill="${ink}"/></pattern>
    <pattern id="mf-t3" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${ink}"/><rect x="8" y="8" width="8" height="8" fill="${ink}"/></pattern>
    <pattern id="mf-t4" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 7 L4 3 L8 7 L12 3 L16 7" fill="none" stroke="${ink}" stroke-width="2"/></pattern>
    <pattern id="mf-t5" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0H10M0 0V10" stroke="${ink}" stroke-width="2"/></pattern>
  </defs></svg>`;
}

const field = (v) => `<rect x="4" y="4" width="92" height="92" rx="13" fill="${FIELDS[v]}"/>`
  + (v ? `<rect x="4" y="4" width="92" height="92" rx="13" fill="url(#mf-t${v})"/>` : "");

function frame(v) {
  const c = FRAME_COLORS[v];
  const st = (w = 5) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
  switch (v) {
    case 0: return `<rect x="17" y="17" width="66" height="66" rx="9" ${st()}/>`;
    case 1: return `<circle cx="50" cy="50" r="34" ${st()}/>`;
    case 2: return `<path d="M50 13 L87 50 L50 87 L13 50Z" ${st()}/>`;
    case 3: return `<path d="M50 15 L80 32.5 V67.5 L50 85 L20 67.5 V32.5Z" ${st()}/>`;
    case 4: return `<path d="M17 35V17H35M65 17H83V35M83 65V83H65M35 83H17V65" ${st(6)} stroke-linecap="round"/>`;
    default: return `<rect x="16" y="16" width="68" height="68" rx="6" ${st(3)}/><rect x="23" y="23" width="54" height="54" rx="4" ${st(3)}/>`;
  }
}

function emblem(v) {
  const p = `fill="${EMBLEM_COLORS[v]}" stroke="#121212" stroke-width="2" stroke-linejoin="round"`;
  switch (v) {
    case 0: return `<circle cx="50" cy="50" r="12" ${p}/>`;
    case 1: return `<path d="M50 36 L64 61 H36Z" ${p}/>`;
    case 2: return `<path d="M50 34 L55 45 L66 50 L55 55 L50 66 L45 55 L34 50 L45 45Z" ${p}/>`;
    case 3: return `<path d="M45 36H55V45H64V55H55V64H45V55H36V45H45Z" ${p}/>`;
    case 4: return `<path d="M50 35 C60 45 63 52 63 56 A13 13 0 0 1 37 56 C37 52 40 45 50 35Z" ${p}/>`;
    default: return `<path d="M56 36 A14 14 0 1 0 56 64 A11 11 0 1 1 56 36Z" ${p}/>`;
  }
}

function trim(v) {
  const c = TRIM_COLORS[v];
  const corners = (f) => [[11, 11, 1, 1], [89, 11, -1, 1], [89, 89, -1, -1], [11, 89, 1, -1]].map(f).join("");
  switch (v) {
    case 0: return corners(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/>`);
    case 1: return corners(([x, y, dx, dy]) => `<path d="M${x - 3 * dx} ${y - 3 * dy}h${12 * dx}L${x - 3 * dx} ${y + 9 * dy}Z" fill="${c}"/>`);
    case 2: return `<rect x="30" y="7" width="40" height="5" rx="2.5" fill="${c}"/><rect x="30" y="88" width="40" height="5" rx="2.5" fill="${c}"/>`;
    case 3: return `<rect x="7" y="30" width="5" height="40" rx="2.5" fill="${c}"/><rect x="88" y="30" width="5" height="40" rx="2.5" fill="${c}"/>`;
    case 4: return [[50, 9], [91, 50], [50, 91], [9, 50]].map(([x, y]) => `<path d="M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z" fill="${c}"/>`).join("");
    default: return corners(([x, y, dx, dy]) => `<path d="M${x - 3 * dx} ${y + 11 * dy}A14 14 0 0 1 ${x + 11 * dx} ${y - 3 * dy}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`);
  }
}

const DRAW = [field, frame, emblem, trim];

/** SVG markup for a tile's layers ([field, frame, emblem, trim], null = cleared). */
export function tileSVG(layers) {
  const parts = layers.map((v, s) => (v == null ? "" : `<g class="mf-layer" data-slot="${s}">${DRAW[s](v)}</g>`)).join("");
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${parts}</svg>`;
}

const NAMES = [
  ["plain", "striped", "dotted", "checked", "zigzag", "gridded"].map((t, v) => `${["rose", "mint", "sky", "sand", "lilac", "sea"][v]} ${t} field`),
  ["square frame", "circle frame", "diamond frame", "hexagon frame", "corner brackets", "double frame"],
  ["dot", "triangle", "star", "cross", "drop", "moon"],
  ["corner dots", "corner flags", "top and bottom bars", "side bars", "edge diamonds", "corner arcs"],
];

/** Screen-reader description of a tile. */
export function tileLabel(layers) {
  const parts = layers.map((v, s) => (v == null ? null : NAMES[s][v])).filter(Boolean);
  return parts.length ? parts.join(", ") : "cleared";
}
