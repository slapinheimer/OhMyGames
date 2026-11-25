// Crowns difficulty: solve a board the way a person would, using the easiest kind of step
// that makes progress, and report the hardest kind needed.
//   1 — a crown rules out its row, column, region and neighbors; a row, column or region with
//       one square left gets the crown.
//   2 — a region inside one row (or column) clears the rest of that row, and the reverse.
//   3 — a square whose crown would wipe out a whole row, column or region is ✕.
//   4 — groups: when k regions fit inside k rows (or columns), the rest of those rows is clear,
//       and the reverse (k up to 4).
//   5 — trial: a square is ✕ if a crown there leads, by steps 1–4, to a contradiction.
// Returns 1–5, or Infinity when steps 1–5 can't finish it.

const subsets = (n, k, start = 0, acc = [], out = []) => {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i < n; i++) { acc.push(i); subsets(n, k, i + 1, acc, out); acc.pop(); }
  return out;
};

function setup(size, regions) {
  const n = size * size;
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c));
  const cols = Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c));
  const regs = Array.from({ length: size }, () => []);
  regions.forEach((g, i) => regs[g].push(i));
  const peers = Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / size), c = i % size;
    const out = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const rj = Math.floor(j / size), cj = j % size;
      if (rj === r || cj === c || regions[j] === regions[i] || (Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1)) out.push(j);
    }
    return out;
  });
  const rowOf = (i) => Math.floor(i / size);
  const colOf = (i) => i % size;
  const regOf = (i) => regions[i];
  return { size, n, rows, cols, regs, peers, units: [...rows, ...cols, ...regs], rowOf, colOf, regOf };
}

function place(S, st, i) {
  st.crown[i] = 1;
  st.cand[i] = 0;
  for (const p of S.peers[i]) st.cand[p] = 0;
}

const open = (st, unit) => unit.filter((i) => st.cand[i]);
const hasCrown = (st, unit) => unit.some((i) => st.crown[i]);

/** Apply one step of exactly `tier`. Returns true (progress), false (none), or "x" (contradiction). */
function apply(S, st, tier) {
  if (tier === 1) {
    for (const u of S.units) {
      if (hasCrown(st, u)) continue;
      const o = open(st, u);
      if (!o.length) return "x";
      if (o.length === 1) { place(S, st, o[0]); return true; }
    }
    return false;
  }
  if (tier === 2) {
    // A unit whose open squares all sit in one line (or region) of another kind.
    const kinds = [[S.regs, [S.rowOf, S.rows], [S.colOf, S.cols]], [S.rows, [S.regOf, S.regs]], [S.cols, [S.regOf, S.regs]]];
    for (const [from, ...targets] of kinds) {
      for (const u of from) {
        if (hasCrown(st, u)) continue;
        const o = open(st, u);
        for (const [key, lines] of targets) {
          const k = key(o[0]);
          if (!o.every((i) => key(i) === k)) continue;
          let moved = false;
          for (const j of lines[k]) if (st.cand[j] && !u.includes(j)) { st.cand[j] = 0; moved = true; }
          if (moved) return true;
        }
      }
    }
    return false;
  }
  if (tier === 3) {
    // A crown here would leave some unit with nowhere to go.
    for (let i = 0; i < S.n; i++) {
      if (!st.cand[i]) continue;
      const gone = new Set(S.peers[i]);
      for (const u of S.units) {
        if (u.includes(i) || hasCrown(st, u)) continue;
        if (open(st, u).every((j) => gone.has(j))) { st.cand[i] = 0; return true; }
      }
    }
    return false;
  }
  if (tier === 4) {
    const pairs = [[S.regs, S.rowOf, S.rows], [S.regs, S.colOf, S.cols], [S.rows, S.regOf, S.regs], [S.cols, S.regOf, S.regs]];
    for (const [from, key, lines] of pairs) {
      const live = from.filter((u) => !hasCrown(st, u));
      for (let k = 2; k <= Math.min(4, live.length - 1); k++) {
        for (const pick of subsets(live.length, k)) {
          const group = pick.map((p) => live[p]);
          const inGroup = new Set(group.flat());
          const keys = new Set();
          for (const u of group) for (const i of u) if (st.cand[i]) keys.add(key(i));
          if (keys.size !== k) continue;
          let moved = false;
          for (const kk of keys) for (const j of lines[kk]) if (st.cand[j] && !inGroup.has(j)) { st.cand[j] = 0; moved = true; }
          if (moved) return true;
        }
      }
    }
    return false;
  }
  // tier 5: trial and contradiction.
  for (let i = 0; i < S.n; i++) {
    if (!st.cand[i]) continue;
    const trial = { cand: st.cand.slice(), crown: st.crown.slice() };
    place(S, trial, i);
    if (run(S, trial, 4).result === "x") { st.cand[i] = 0; return true; }
  }
  return false;
}

function run(S, st, maxTier) {
  let hardest = 0;
  for (;;) {
    if (st.crown.reduce((a, b) => a + b, 0) === S.size) return { result: "solved", hardest };
    let progressed = false;
    for (let t = 1; t <= maxTier; t++) {
      const r = apply(S, st, t);
      if (r === "x") return { result: "x", hardest };
      if (r) { hardest = Math.max(hardest, t); progressed = true; break; }
    }
    if (!progressed) return { result: "stuck", hardest };
  }
}

export function grade(size, regions) {
  const S = setup(size, regions);
  const st = { cand: new Array(S.n).fill(1), crown: new Array(S.n).fill(0) };
  const { result, hardest } = run(S, st, 5);
  return result === "solved" ? Math.max(1, hardest) : Infinity;
}
