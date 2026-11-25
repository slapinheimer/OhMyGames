// Crossword generator: template slots -> backtracking CSP fill -> clue pick.
// Pure logic (no DOM) so it runs in a Web Worker, on the main thread, and under
// JavaScriptCore (tools/gen_crosswords.mjs). Deterministic for a given rng.
//
// Fill algorithm
//   * Each slot's domain is a bitset over the word list of its length.
//   * pos[len][i][letter] bitsets give "words of this length with letter at i",
//     so constraining a crossing slot is a single AND over ~len/32 words.
//   * MRV: always fill the slot with the fewest remaining candidates.
//   * Forward checking: assigning a word ANDs every crossing slot's domain with
//     the letter it now carries; an empty domain rejects the word immediately.
//   * Value ordering: least-constraining value (sum of log crossing-letter
//     supports) + word score + seeded noise; only the best K are tried.
//   * Node-count budget per attempt (NOT wall-clock, so results are identical
//     on every machine), then restart with another template / rng state.

const A = 65;

/** Normalise "Seal off" -> "SEALOFF". */
const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, "");

function popcount32(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function popcount(bits) {
  let c = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) c += popcount32(bits[i]);
  return c;
}

/** Usable clues for an answer: must not give the answer away. */
export function validClues(answer, clues) {
  const out = [];
  for (const raw of clues || []) {
    const clue = String(raw).trim();
    if (!clue || clue.length > 90) continue;
    const norm = letters(clue);
    if (!norm || norm.includes(answer)) continue;
    // Reject clue words that are a big chunk of the answer ("Seal" for SEALOFF).
    const words = clue.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 3);
    if (words.some((w) => answer.includes(w) && w.length >= Math.min(4, answer.length - 1))) continue;
    if (words.some((w) => w.length >= 4 && w.includes(answer))) continue;
    out.push(clue.replace(/\s+/g, " "));
  }
  return out;
}

/**
 * Builds per-length indexes from words.json data.
 * raw: { "3": [[ANSWER, score, [clues]], ...], ... }
 * Words scoring below minScore are left out (obscure fill).
 * Returns Map(len -> { words, scores, clues, pos, codes, n, nw, all }).
 */
export function buildIndex(raw, lengths, minScore = 0) {
  const index = new Map();
  for (const len of lengths) {
    const list = raw[String(len)] || [];
    const words = [], scores = [], clues = [];
    const seen = new Set();
    for (const [w0, score, cl] of list) {
      const w = letters(w0);
      if (w.length !== len || seen.has(w) || score < minScore) continue;
      const ok = validClues(w, cl);
      if (!ok.length) continue;
      seen.add(w);
      words.push(w);
      scores.push(score);
      clues.push(ok);
    }
    const n = words.length, nw = (n + 31) >>> 5;
    const pos = [];
    for (let i = 0; i < len; i++) {
      const row = [];
      for (let c = 0; c < 26; c++) row.push(new Uint32Array(nw));
      pos.push(row);
    }
    for (let k = 0; k < n; k++) {
      const w = words[k];
      for (let i = 0; i < len; i++) pos[i][w.charCodeAt(i) - A][k >>> 5] |= 1 << (k & 31);
    }
    const codes = new Uint8Array(n * len);
    for (let k = 0; k < n; k++) for (let i = 0; i < len; i++) codes[k * len + i] = words[k].charCodeAt(i) - A;
    const all = new Uint32Array(nw);
    for (let k = 0; k < n; k++) all[k >>> 5] |= 1 << (k & 31);
    index.set(len, { words, scores, clues, pos, codes, n, nw, all });
  }
  return index;
}

// ---------------------------------------------------------------- templates

/** Parses ["..#..", ...] into a boolean black[][] grid. */
export function parseTemplate(rows) {
  return rows.map((r) => [...r].map((ch) => ch === "#"));
}

/** Across/down slots with standard numbering. */
export function findSlots(black) {
  const h = black.length, w = black[0].length;
  const slots = [];
  const numbers = [];
  let num = 0;
  for (let r = 0; r < h; r++) {
    numbers.push([]);
    for (let c = 0; c < w; c++) {
      numbers[r].push(0);
      if (black[r][c]) continue;
      const startA = (c === 0 || black[r][c - 1]) && c + 1 < w && !black[r][c + 1];
      const startD = (r === 0 || black[r - 1][c]) && r + 1 < h && !black[r + 1][c];
      if (!startA && !startD) continue;
      numbers[r][c] = ++num;
      if (startA) {
        const cells = [];
        for (let cc = c; cc < w && !black[r][cc]; cc++) cells.push([r, cc]);
        slots.push({ dir: "across", num, row: r, col: c, len: cells.length, cells });
      }
      if (startD) {
        const cells = [];
        for (let rr = r; rr < h && !black[rr][c]; rr++) cells.push([rr, c]);
        slots.push({ dir: "down", num, row: r, col: c, len: cells.length, cells });
      }
    }
  }
  return { slots, numbers };
}

/** Validates a template; returns a list of problems (empty = valid). */
export function checkTemplate(rows, { requireChecked = true, minLen = 3 } = {}) {
  const black = parseTemplate(rows);
  const h = black.length, w = black[0].length;
  const problems = [];
  if (rows.some((r) => r.length !== w)) problems.push("ragged rows");
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      if (black[r][c] !== black[h - 1 - r][w - 1 - c]) { problems.push("not symmetric"); r = h; break; }
  const { slots } = findSlots(black);
  if (slots.some((s) => s.len < minLen)) problems.push("short slot");
  const cover = black.map((row) => row.map(() => 0));
  for (const s of slots) for (const [r, c] of s.cells) cover[r][c]++;
  let white = 0, start = null;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      if (black[r][c]) continue;
      white++;
      start = start || [r, c];
      if (cover[r][c] === 0) problems.push(`orphan cell ${r},${c}`);
      else if (requireChecked && cover[r][c] < 2) problems.push(`unchecked cell ${r},${c}`);
    }
  // connectivity
  if (start) {
    const seen = new Set([start.join()]);
    const q = [start];
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= h || cc >= w || black[rr][cc] || seen.has(rr + "," + cc)) continue;
        seen.add(rr + "," + cc);
        q.push([rr, cc]);
      }
    }
    if (seen.size !== white) problems.push("disconnected");
  }
  return problems;
}

// ---------------------------------------------------------------- fill

class Budget extends Error {}

/**
 * Fills one template. Returns { words: [answer per slot] } or null.
 * opts: { nodeLimit, beam (max candidates tried per slot), scoreWeight }
 */
export function fillTemplate(black, index, rng, opts = {}) {
  const nodeLimit = opts.nodeLimit || 2000;
  const beam = opts.beam || 12;
  const scoreWeight = opts.scoreWeight ?? 2.5;
  const useAC = opts.ac !== false;
  const acLimit = opts.acLimit || 30;
  const acMax = opts.acMax || 1000;
  const { slots } = findSlots(black);
  const S = slots.length;
  const h = black.length, w = black[0].length;

  // cell -> [slot, position] for each direction
  const cellSlots = new Map();
  slots.forEach((s, si) => s.cells.forEach(([r, c], i) => {
    const k = r * w + c;
    if (!cellSlots.has(k)) cellSlots.set(k, []);
    cellSlots.get(k).push([si, i]);
  }));
  // crossings[si] = [[pos i in si, other slot t, pos j in t], ...]
  const crossings = slots.map((s, si) => {
    const out = [];
    s.cells.forEach(([r, c], i) => {
      for (const [t, j] of cellSlots.get(r * w + c)) if (t !== si) out.push([i, t, j]);
    });
    return out;
  });

  const idx = slots.map((s) => index.get(s.len));
  if (idx.some((x) => !x || !x.n)) return null;
  const dom = idx.map((x) => x.all.slice());
  const cnt = idx.map((x) => x.n);
  const assigned = new Int32Array(S).fill(-1);
  const used = new Set();
  const noise = new Float64Array(64);
  let nodes = 0;

  const LOG = new Float64Array(6000);
  for (let i = 1; i < LOG.length; i++) LOG[i] = Math.log(i);
  const lg = (n) => (n < LOG.length ? LOG[n] : Math.log(n));

  function pickSlot() {
    let best = -1, bestCnt = Infinity, bestTie = -1;
    for (let s = 0; s < S; s++) {
      if (assigned[s] >= 0) continue;
      const c = cnt[s];
      // tie-break on slot length (longer = harder to place later)
      const tie = slots[s].len;
      if (c < bestCnt || (c === bestCnt && tie > bestTie)) { best = s; bestCnt = c; bestTie = tie; }
    }
    return best;
  }

  function candidates(s) {
    const x = idx[s];
    const d = dom[s];
    const cr = crossings[s];
    // letter support for each crossed position: how many crossing words allow letter L there
    const support = [];
    for (const [i, t, j] of cr) {
      if (assigned[t] >= 0) { support.push(null); continue; }
      const tx = idx[t], td = dom[t];
      const sup = new Int32Array(26);
      if (cnt[t] <= 8 * td.length) {
        const codes = tx.codes, len = slots[t].len;
        for (let k = 0; k < td.length; k++) {
          let bits = td[k];
          while (bits) {
            const low = bits & -bits;
            bits ^= low;
            sup[codes[((k << 5) + (31 - Math.clz32(low))) * len + j]]++;
          }
        }
        support.push(sup);
        continue;
      }
      for (let L = 0; L < 26; L++) {
        const pb = tx.pos[j][L];
        let c = 0;
        for (let k = 0; k < td.length; k++) {
          const v = td[k] & pb[k];
          if (v) c += popcount32(v);
        }
        sup[L] = c;
      }
      support.push(sup);
    }
    const out = [];
    for (let k = 0; k < d.length; k++) {
      let bits = d[k];
      while (bits) {
        const low = bits & -bits;
        const wi = (k << 5) + (31 - Math.clz32(low));
        bits ^= low;
        const word = x.words[wi];
        if (used.has(word)) continue;
        let val = 0, dead = false;
        for (let q = 0; q < cr.length; q++) {
          const sup = support[q];
          if (!sup) continue;
          const n = sup[word.charCodeAt(cr[q][0]) - A];
          if (!n) { dead = true; break; }
          val += lg(n);
        }
        if (dead) continue;
        val += scoreWeight * (x.scores[wi] / 100) + 1.5 * rng();
        out.push([val, wi]);
      }
    }
    out.sort((a, b) => b[0] - a[0]);
    return out.length > beam ? out.slice(0, beam) : out;
  }

  // Arc consistency between crossing slots at their shared cell: a letter is
  // only possible there if both slots still have a word putting it there.
  const masks = slots.map((sl) => new Int32Array(sl.len).fill(-1));
  const setDom = (t, d, c) => { dom[t] = d; cnt[t] = c; masks[t].fill(-1); };
  function letterMask(t, j) {
    const mt = masks[t];
    if (mt[j] >= 0) return mt[j];
    const d = dom[t], x = idx[t], len = slots[t].len;
    if (cnt[t] <= 8 * d.length) {
      // few words: OR their letters into every position at once
      mt.fill(0);
      const codes = x.codes;
      for (let k = 0; k < d.length; k++) {
        let bits = d[k];
        while (bits) {
          const low = bits & -bits;
          const base = ((k << 5) + (31 - Math.clz32(low))) * len;
          bits ^= low;
          for (let p = 0; p < len; p++) mt[p] |= 1 << codes[base + p];
        }
      }
      return mt[j];
    }
    const P = x.pos[j];
    let m = 0;
    for (let L = 0; L < 26; L++) {
      const pb = P[L];
      for (let k = 0; k < d.length; k++) if (d[k] & pb[k]) { m |= 1 << L; break; }
    }
    mt[j] = m;
    return m;
  }

  function propagate(queue, trail) {
    const inQ = new Uint8Array(S);
    for (const t of queue) inQ[t] = 1;
    let steps = 0;
    while (queue.length) {
      const t = queue.pop();
      inQ[t] = 0;
      if (assigned[t] >= 0 || cnt[t] > acMax) continue;
      if (++steps > acLimit) break;
      for (const [i, u, j] of crossings[t]) {
        if (assigned[u] >= 0) continue;
        const mt = letterMask(t, i);
        const mu = letterMask(u, j);
        const keep = mt & mu;
        if (keep === mu) continue;
        const old = dom[u];
        const nd = new Uint32Array(old.length);
        let c = 0;
        if (cnt[u] <= 8 * old.length) {
          const codes = idx[u].codes, len = slots[u].len;
          for (let k = 0; k < old.length; k++) {
            let bits = old[k], v = 0;
            while (bits) {
              const low = bits & -bits;
              bits ^= low;
              if (keep & (1 << codes[((k << 5) + (31 - Math.clz32(low))) * len + j])) { v |= low; c++; }
            }
            nd[k] = v;
          }
        } else {
          const P = idx[u].pos[j];
          for (let L = 0; L < 26; L++) {
            if (!(keep & (1 << L))) continue;
            const pb = P[L];
            for (let k = 0; k < nd.length; k++) nd[k] |= pb[k];
          }
          for (let k = 0; k < nd.length; k++) {
            const v = nd[k] & old[k];
            nd[k] = v;
            if (v) c += popcount32(v);
          }
        }
        trail.push([u, old, cnt[u]]);
        setDom(u, nd, c);
        if (!c) return false;
        if (!inQ[u]) { inQ[u] = 1; queue.push(u); }
      }
    }
    return true;
  }

  function solve(depth) {
    if (++nodes > nodeLimit) throw new Budget();
    const s = pickSlot();
    if (s < 0) return true;
    if (cnt[s] === 0) return false;
    const x = idx[s];
    for (const [, wi] of candidates(s)) {
      const word = x.words[wi];
      // forward check crossing slots
      const trail = [];
      let ok = true;
      for (const [i, t, j] of crossings[s]) {
        if (assigned[t] >= 0) continue;
        const pb = idx[t].pos[j][word.charCodeAt(i) - A];
        const old = dom[t];
        const nd = new Uint32Array(old.length);
        let c = 0;
        for (let k = 0; k < old.length; k++) {
          const v = old[k] & pb[k];
          nd[k] = v;
          if (v) c += popcount32(v);
        }
        trail.push([t, old, cnt[t]]);
        setDom(t, nd, c);
        if (!c) { ok = false; break; }
      }
      if (ok) {
        assigned[s] = wi;
        used.add(word);
        if (useAC) ok = propagate(trail.map((e) => e[0]), trail);
      }
      if (ok) {
        if (solve(depth + 1)) return true;
      }
      if (assigned[s] >= 0) {
        used.delete(word);
        assigned[s] = -1;
      }
      for (let q = trail.length - 1; q >= 0; q--) {
        const [t, old, c] = trail[q];
        setDom(t, old, c);
      }
    }
    return false;
  }

  try {
    if (!solve(0)) return null;
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
  return { slots, words: slots.map((s, si) => idx[si].words[assigned[si]]), nodes };
}

// ---------------------------------------------------------------- clues

/** Picks a clue deterministically, favouring short crossword-style ones. */
export function pickClue(clues, rng) {
  const ranked = clues.map((c) => {
    const n = c.length;
    // sweet spot ~ 8-45 chars; single-word synonyms are fine but a little bland
    let w = n < 4 ? 0.4 : n <= 45 ? 1.6 : n <= 65 ? 0.8 : 0.3;
    if (/\b(etc|e\.g|i\.e)\b/i.test(c)) w *= 0.6;
    return [w * (0.35 + rng()), c];
  });
  ranked.sort((a, b) => b[0] - a[0]);
  let clue = ranked[0][1];
  clue = clue.charAt(0).toUpperCase() + clue.slice(1);
  return clue.replace(/\s*;\s*$/, "").replace(/\.$/, (m) => (/\b(etc|e\.g|i\.e|U\.S)\.$/i.test(clue) ? m : ""));
}

// ---------------------------------------------------------------- puzzle

/**
 * Generates a full puzzle.
 * cfg: { gameId, size, templates: [[rows...], ...], nodeLimit, beam, maxAttempts }
 * Returns { v, gameId, id, size, template, grid: ["AB#CD", ...], clues: { across, down }, attempts, nodes }.
 */
export function generatePuzzle(cfg, raw, rng, indexCache) {
  const templates = cfg.templates;
  const lengths = new Set();
  for (const t of templates) for (const s of findSlots(parseTemplate(t)).slots) lengths.add(s.len);
  const index = indexCache || buildIndex(raw, [...lengths], cfg.minScore || 0);
  const maxAttempts = cfg.maxAttempts || 60;
  let totalNodes = 0;
  // shuffled template order (deterministic), cycled with fresh rng state each attempt
  const order = templates.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ti = order[attempt % order.length];
    const black = parseTemplate(templates[ti]);
    // budgets grow on later passes in case every template is having a bad day
    const pass = Math.floor(attempt / order.length);
    const res = fillTemplate(black, index, rng, {
      nodeLimit: (cfg.nodeLimit || 20000) * (1 + pass),
      beam: (cfg.beam || 12) + pass * 4,
      scoreWeight: cfg.scoreWeight,
    });
    if (!res) { totalNodes += (cfg.nodeLimit || 20000) * (1 + pass); continue; }
    totalNodes += res.nodes;
    const h = black.length, w = black[0].length;
    const grid = black.map((row) => row.map((b) => (b ? "#" : "")));
    const clues = { across: [], down: [] };
    res.slots.forEach((s, si) => {
      const ans = res.words[si];
      s.cells.forEach(([r, c], i) => { grid[r][c] = ans[i]; });
      const x = index.get(s.len);
      const wi = x.words.indexOf(ans);
      clues[s.dir].push({ num: s.num, row: s.row, col: s.col, len: s.len, answer: ans, clue: pickClue(x.clues[wi], rng) });
    });
    return {
      v: 1, gameId: cfg.gameId, id: cfg.puzzleId, size: w, rows: h, template: ti,
      grid: grid.map((r) => r.join("")), clues, attempts: attempt + 1, nodes: totalNodes,
    };
  }
  return null;
}
