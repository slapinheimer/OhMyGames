// Crossword puzzle model: cells, words, numbering and cursor navigation.
// Pure (no DOM) so it can be unit-tested under JavaScriptCore.

export const ACROSS = "across";
export const DOWN = "down";
export const other = (dir) => (dir === ACROSS ? DOWN : ACROSS);

/**
 * puzzle: { grid: ["AB#CD", ...], clues: { across: [{num,row,col,len,answer,clue}], down: [...] } }
 */
export function buildModel(puzzle) {
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = puzzle.grid[r][c];
      cells.push({ idx: r * cols + c, r, c, black: ch === "#", answer: ch === "#" ? "" : ch, num: 0, across: -1, down: -1 });
    }
  }
  const words = [];
  for (const dir of [ACROSS, DOWN]) {
    const list = [...puzzle.clues[dir]].sort((a, b) => a.num - b.num);
    for (const cl of list) {
      const wi = words.length;
      const wcells = [];
      for (let i = 0; i < cl.len; i++) {
        const r = cl.row + (dir === DOWN ? i : 0);
        const c = cl.col + (dir === ACROSS ? i : 0);
        const idx = r * cols + c;
        wcells.push(idx);
        cells[idx][dir] = wi;
      }
      cells[cl.row * cols + cl.col].num = cl.num;
      words.push({ wi, dir, num: cl.num, clue: cl.clue, answer: cl.answer, cells: wcells, label: `${cl.num}${dir === ACROSS ? "A" : "D"}` });
    }
  }
  const white = cells.filter((c) => !c.black).map((c) => c.idx);
  return { rows, cols, cells, words, white };
}

/** Word index for a cell in a direction (falls back to the other direction). */
export function wordFor(model, idx, dir) {
  const cell = model.cells[idx];
  if (cell[dir] >= 0) return cell[dir];
  return cell[other(dir)];
}

/** Next/previous white cell in a straight line (skips black squares); null at edge. */
export function step(model, idx, dr, dc) {
  let r = model.cells[idx].r + dr, c = model.cells[idx].c + dc;
  while (r >= 0 && c >= 0 && r < model.rows && c < model.cols) {
    const cell = model.cells[r * model.cols + c];
    if (!cell.black) return cell.idx;
    r += dr;
    c += dc;
  }
  return null;
}

/** Words in solving order (all across then all down), cycling. */
export function nextWordIndex(model, wi, delta) {
  const n = model.words.length;
  return (((wi + delta) % n) + n) % n;
}

/** First cell in the word satisfying pred, else null. */
export function firstWhere(model, wi, pred, from = 0) {
  const cells = model.words[wi].cells;
  for (let i = from; i < cells.length; i++) if (pred(cells[i])) return cells[i];
  return null;
}
