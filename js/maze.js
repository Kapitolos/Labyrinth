import { COLS, ROWS, TILE, FLOOR, WALL, DIRS } from './config.js';

export const LAIR = { x: 18, y: 13, w: 5, h: 5 };

export function inLair(c, r) {
  return c >= LAIR.x && r >= LAIR.y && c < LAIR.x + LAIR.w && r < LAIR.y + LAIR.h;
}

export function lairCenter() {
  return [LAIR.x + 2, LAIR.y + 2];
}

export function defineRegions() {
  return [
    { id: 'west', name: 'West Wing', x: 6, y: 6, w: 10, h: 19, color: '#e0a15a' },
    { id: 'heart', name: 'Heart Galleries', x: 16, y: 6, w: 10, h: 19, color: '#e06a62' },
    { id: 'east', name: 'East Wing', x: 26, y: 6, w: 9, h: 19, color: '#6aa4e0' },
  ];
}

export function spawnTiles() {
  return [
    [3, 3],
    [COLS - 4, 3],
    [3, ROWS - 4],
    [COLS - 4, ROWS - 4],
  ];
}

export function isFloor(grid, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  return grid[r][c] === FLOOR;
}

export function pointInRegion(x, y, region) {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  return c >= region.x && r >= region.y && c < region.x + region.w && r < region.y + region.h;
}

export function nearestFloorTile(grid, c, r) {
  if (isFloor(grid, c, r)) return [c, r];
  for (let d = 1; d < 20; d++) {
    for (let rr = r - d; rr <= r + d; rr++) {
      for (let cc = c - d; cc <= c + d; cc++) {
        if (Math.abs(cc - c) !== d && Math.abs(rr - r) !== d) continue;
        if (isFloor(grid, cc, rr)) return [cc, rr];
      }
    }
  }
  return null;
}

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function sealBorder(grid) {
  for (let c = 0; c < COLS; c++) {
    grid[0][c] = WALL;
    grid[ROWS - 1][c] = WALL;
  }
  for (let r = 0; r < ROWS; r++) {
    grid[r][0] = WALL;
    grid[r][COLS - 1] = WALL;
  }
}

function carveRoom(grid, x, y, w, h) {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) continue;
      grid[r][c] = FLOOR;
    }
  }
}

function carveTunnel(grid, c0, r0, c1, r1) {
  let c = c0;
  let r = r0;
  const set = (cc, rr) => {
    if (cc <= 0 || rr <= 0 || cc >= COLS - 1 || rr >= ROWS - 1) return;
    grid[rr][cc] = FLOOR;
  };
  set(c, r);
  while (c !== c1) {
    c += Math.sign(c1 - c);
    set(c, r);
  }
  while (r !== r1) {
    r += Math.sign(r1 - r);
    set(c, r);
  }
}

export function connectAllFloors(grid) {
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let start = null;
  const floors = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FLOOR) continue;
      floors.push([c, r]);
      if (!start) start = [c, r];
    }
  }
  if (!start) return;

  const reach = (sc, sr) => {
    const queue = [[sc, sr]];
    seen[sr][sc] = true;
    let head = 0;
    while (head < queue.length) {
      const [c, r] = queue[head++];
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!isFloor(grid, nc, nr) || seen[nr][nc]) continue;
        seen[nr][nc] = true;
        queue.push([nc, nr]);
      }
    }
  };

  reach(start[0], start[1]);
  for (const [c, r] of floors) {
    if (seen[r][c]) continue;
    let best = null;
    let bestD = Infinity;
    for (let rr = 0; rr < ROWS; rr++) {
      for (let cc = 0; cc < COLS; cc++) {
        if (!seen[rr][cc]) continue;
        const d = Math.abs(cc - c) + Math.abs(rr - r);
        if (d < bestD) {
          bestD = d;
          best = [cc, rr];
        }
      }
    }
    if (!best) continue;
    carveTunnel(grid, c, r, best[0], best[1]);
    reach(c, r);
  }
}

function backtracker(grid, rng, x0, y0, x1, y1) {
  const stack = [];
  const step = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  let start = null;
  for (let r = y0; r <= y1 && !start; r += 2) {
    for (let c = x0; c <= x1; c += 2) {
      if (c >= COLS - 1 || r >= ROWS - 1) continue;
      start = [c, r];
      break;
    }
  }
  if (!start) return;
  grid[start[1]][start[0]] = FLOOR;
  stack.push(start);
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const options = [];
    for (const [dc, dr] of shuffle(step, rng)) {
      const nc = c + dc;
      const nr = r + dr;
      const mc = c + dc / 2;
      const mr = r + dr / 2;
      if (nc < x0 || nr < y0 || nc > x1 || nr > y1) continue;
      if (nc <= 0 || nr <= 0 || nc >= COLS - 1 || nr >= ROWS - 1) continue;
      if (grid[nr][nc] !== WALL) continue;
      options.push([nc, nr, mc, mr]);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nc, nr, mc, mr] = options[0];
    grid[mr][mc] = FLOOR;
    grid[nr][nc] = FLOOR;
    stack.push([nc, nr]);
  }
}

function sprinkleLoops(grid, rng, x0, y0, x1, y1, chance) {
  for (let r = Math.max(1, y0); r <= Math.min(ROWS - 2, y1); r++) {
    for (let c = Math.max(1, x0); c <= Math.min(COLS - 2, x1); c++) {
      if (grid[r][c] !== WALL) continue;
      const horizontal = grid[r][c - 1] === FLOOR && grid[r][c + 1] === FLOOR;
      const vertical = grid[r - 1][c] === FLOOR && grid[r + 1][c] === FLOOR;
      if ((horizontal || vertical) && rng() < chance) grid[r][c] = FLOOR;
    }
  }
}

export function generateMaze(rng = Math.random) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));
  backtracker(grid, rng, 1, 1, COLS - 2, ROWS - 2);
  sprinkleLoops(grid, rng, 1, 1, COLS - 2, ROWS - 2, 0.055);
  for (const [x, y] of [[1, 1], [COLS - 6, 1], [1, ROWS - 6], [COLS - 6, ROWS - 6]]) {
    carveRoom(grid, x, y, 5, 5);
  }
  carveRoom(grid, LAIR.x, LAIR.y, LAIR.w, LAIR.h);
  sealBorder(grid);
  connectAllFloors(grid);
  sealBorder(grid);
  return grid;
}

function connectToNearestFloor(grid, c, r, region) {
  const x0 = region.x;
  const y0 = region.y;
  const x1 = region.x + region.w - 1;
  const y1 = region.y + region.h - 1;
  const key = (cc, rr) => rr * COLS + cc;
  const prev = new Map();
  const queue = [[c, r]];
  let head = 0;
  prev.set(key(c, r), null);
  grid[r][c] = FLOOR;
  let found = null;
  while (head < queue.length) {
    const [cc, rr] = queue[head++];
    if ((cc !== c || rr !== r) && grid[rr][cc] === FLOOR) {
      found = [cc, rr];
      break;
    }
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc;
      const nr = rr + dr;
      if (nc < x0 || nr < y0 || nc > x1 || nr > y1) continue;
      const id = key(nc, nr);
      if (prev.has(id)) continue;
      prev.set(id, [cc, rr]);
      queue.push([nc, nr]);
    }
  }
  if (!found) return;
  let cur = prev.get(key(found[0], found[1]));
  while (cur) {
    grid[cur[1]][cur[0]] = FLOOR;
    cur = prev.get(key(cur[0], cur[1]));
  }
}

export function scrambleRegion(grid, region, rng = Math.random, preserve = new Set()) {
  const x0 = region.x;
  const y0 = region.y;
  const x1 = region.x + region.w - 1;
  const y1 = region.y + region.h - 1;
  const openings = [];
  const seen = new Set();

  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) {
      const onEdge = r === y0 || r === y1 || c === x0 || c === x1;
      if (!onEdge || grid[r][c] !== FLOOR) continue;
      let door = false;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        const outside = nc < x0 || nc > x1 || nr < y0 || nr > y1;
        if (outside && isFloor(grid, nc, nr)) door = true;
      }
      const key = `${c},${r}`;
      if (door && !seen.has(key)) {
        seen.add(key);
        openings.push([c, r]);
      }
    }
  }

  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) grid[r][c] = WALL;
  }

  backtracker(grid, rng, x0, y0, x1, y1);
  sprinkleLoops(grid, rng, x0, y0, x1, y1, 0.03);

  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) {
      if (inLair(c, r) || preserve.has(`${c},${r}`)) grid[r][c] = FLOOR;
    }
  }

  for (const [c, r] of openings) connectToNearestFloor(grid, c, r, region);

  connectAllFloors(grid);
  sealBorder(grid);
}
