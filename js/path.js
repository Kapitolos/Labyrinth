import { COLS, ROWS, TILE, DIRS } from './config.js';
import { isFloor } from './maze.js';

function index(c, r) {
  return r * COLS + c;
}

export function flood(grid, sc, sr) {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  if (!isFloor(grid, sc, sr)) return dist;
  const queue = new Int32Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  const start = index(sc, sr);
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const cur = queue[head++];
    const c = cur % COLS;
    const r = (cur / COLS) | 0;
    const base = dist[cur];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isFloor(grid, nc, nr)) continue;
      const ni = index(nc, nr);
      if (dist[ni] !== -1) continue;
      dist[ni] = base + 1;
      queue[tail++] = ni;
    }
  }
  return dist;
}

export function shortestStep(grid, sc, sr, tc, tr) {
  if (!isFloor(grid, sc, sr) || !isFloor(grid, tc, tr)) return null;
  if (sc === tc && sr === tr) return { c: sc, r: sr };
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const queue = new Int32Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  const start = index(sc, sr);
  const goal = index(tc, tr);
  queue[tail++] = start;
  prev[start] = start;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goal) break;
    const c = cur % COLS;
    const r = (cur / COLS) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isFloor(grid, nc, nr)) continue;
      const ni = index(nc, nr);
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  if (prev[goal] === -1) return null;
  let cur = goal;
  let before = prev[cur];
  while (before !== start && before !== -1) {
    cur = before;
    before = prev[cur];
  }
  return { c: cur % COLS, r: (cur / COLS) | 0 };
}

export function bestStepAway(grid, c, r, tc, tr) {
  let best = null;
  let score = -Infinity;
  for (const [dc, dr] of DIRS) {
    const nc = c + dc;
    const nr = r + dr;
    if (!isFloor(grid, nc, nr)) continue;
    const s = Math.abs(nc - tc) + Math.abs(nr - tr);
    if (s > score) {
      score = s;
      best = { c: nc, r: nr };
    }
  }
  return best;
}

export function lineOfSight(grid, x0, y0, x1, y1) {
  let c = Math.floor(x0 / TILE);
  let r = Math.floor(y0 / TILE);
  const c1 = Math.floor(x1 / TILE);
  const r1 = Math.floor(y1 / TILE);
  const dc = Math.abs(c1 - c);
  const dr = Math.abs(r1 - r);
  const sc = c < c1 ? 1 : -1;
  const sr = r < r1 ? 1 : -1;
  let err = dc - dr;
  while (c !== c1 || r !== r1) {
    const e2 = 2 * err;
    if (e2 > -dr) {
      err -= dr;
      c += sc;
    }
    if (e2 < dc) {
      err += dc;
      r += sr;
    }
    if (c === c1 && r === r1) return true;
    if (!isFloor(grid, c, r)) return false;
  }
  return true;
}
