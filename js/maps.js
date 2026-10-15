import { COLS, ROWS, FLOOR, DIRS } from './config.js';
import {
  blankMaze, finishMap, generateMaze, carveRoom, carveTunnel, backtracker, sprinkleLoops,
} from './maze.js';

const MAP_KEY = 'labyrinth-map';
let cursor = 0;

function readStore() {
  try {
    if (!globalThis.sessionStorage) return null;
    const n = Number(sessionStorage.getItem(MAP_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return null;
  }
}

function writeStore(n) {
  try {
    if (globalThis.sessionStorage) sessionStorage.setItem(MAP_KEY, String(n));
  } catch {
    /* private mode and node keep the in-memory cursor */
  }
}

export function mapCount() {
  return MAPS.length;
}

export function mapByIndex(index) {
  const n = MAPS.length;
  const i = ((index % n) + n) % n;
  return MAPS[i];
}

export function peekMapIndex() {
  const stored = readStore();
  if (stored != null) return stored % MAPS.length;
  return cursor % MAPS.length;
}

export function takeMapIndex() {
  const i = peekMapIndex();
  const next = (i + 1) % MAPS.length;
  cursor = next;
  writeStore(next);
  return i;
}

function ponds(grid, spots, steps, rng) {
  for (const [sx, sy] of spots) {
    let c = sx;
    let r = sy;
    for (let n = 0; n < steps; n++) {
      carveRoom(grid, c - 1, r - 1, 3, 3);
      const [dc, dr] = DIRS[(rng() * DIRS.length) | 0];
      c = Math.max(2, Math.min(COLS - 3, c + dc * 2));
      r = Math.max(2, Math.min(ROWS - 3, r + dr * 2));
    }
  }
}

function diamond(grid, cx, cy, rad) {
  for (let r = cy - rad; r <= cy + rad; r++) {
    for (let c = cx - rad; c <= cx + rad; c++) {
      if (Math.abs(c - cx) + Math.abs(r - cy) > rad) continue;
      if (c <= 0 || r <= 0 || c >= COLS - 1 || r >= ROWS - 1) continue;
      grid[r][c] = FLOOR;
    }
  }
}

function buildCaldera() {
  const grid = blankMaze();
  for (const room of [
    [3, 3, 9, 7],
    [28, 3, 9, 7],
    [3, 20, 9, 7],
    [28, 20, 9, 7],
    [14, 2, 13, 5],
    [14, 23, 13, 5],
    [3, 11, 7, 7],
    [31, 11, 7, 7],
  ]) carveRoom(grid, ...room);
  carveRoom(grid, 15, 11, 11, 2);
  carveRoom(grid, 15, 18, 11, 2);
  carveRoom(grid, 15, 11, 2, 9);
  carveRoom(grid, 24, 11, 2, 9);
  carveTunnel(grid, 8, 6, 18, 12);
  carveTunnel(grid, 32, 6, 23, 12);
  carveTunnel(grid, 8, 23, 18, 18);
  carveTunnel(grid, 32, 23, 23, 18);
  return finishMap(grid);
}

function buildGlacier() {
  const grid = blankMaze();
  for (let c = 3; c < COLS - 3; c += 6) carveRoom(grid, c, 2, 2, ROWS - 4);
  for (let r = 4; r < ROWS - 4; r += 7) carveRoom(grid, 2, r, COLS - 4, 2);
  return finishMap(grid);
}

function buildMire(rng) {
  const grid = blankMaze();
  ponds(grid, [
    [8, 6], [20, 5], [32, 7],
    [10, 15], [22, 16], [33, 15],
    [8, 24], [20, 24], [32, 23],
  ], 28, rng);
  return finishMap(grid);
}

function buildDunes() {
  const grid = blankMaze();
  const doors = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = 3 + gx * 9;
      const y = 3 + gy * 8;
      carveRoom(grid, x, y, 6, 5);
      doors.push([x + 3, y + 2]);
    }
  }
  for (let i = 0; i < doors.length - 1; i++) {
    carveTunnel(grid, doors[i][0], doors[i][1], doors[i + 1][0], doors[i + 1][1]);
  }
  return finishMap(grid);
}

function buildThicket(rng) {
  const grid = blankMaze();
  backtracker(grid, rng, 1, 1, COLS - 2, ROWS - 2);
  sprinkleLoops(grid, rng, 1, 1, COLS - 2, ROWS - 2, 0.22);
  return finishMap(grid);
}

function buildSanguine() {
  const grid = blankMaze();
  carveRoom(grid, 2, 13, COLS - 4, 5);
  carveRoom(grid, 18, 2, 5, ROWS - 4);
  for (const [x, y] of [[3, 3], [31, 3], [3, 23], [31, 23], [8, 8], [28, 8], [8, 20], [28, 20]]) {
    carveRoom(grid, x, y, 5, 4);
    carveTunnel(grid, x + 2, y + 2, 20, 15);
  }
  return finishMap(grid);
}

function buildCrystal() {
  const grid = blankMaze();
  const hubs = [[8, 6], [32, 6], [8, 24], [32, 24], [20, 8], [20, 22], [12, 15], [28, 15]];
  for (const [c, r] of hubs) diamond(grid, c, r, 4);
  for (let i = 0; i < hubs.length - 1; i++) {
    carveTunnel(grid, hubs[i][0], hubs[i][1], hubs[i + 1][0], hubs[i + 1][1]);
  }
  carveTunnel(grid, 20, 8, 20, 15);
  return finishMap(grid);
}

function buildTide() {
  const grid = blankMaze();
  for (let r = 2; r < ROWS - 2; r += 4) carveRoom(grid, 2, r, COLS - 4, 2);
  for (const c of [6, 14, 20, 27, 34]) carveRoom(grid, c, 2, 2, ROWS - 4);
  return finishMap(grid);
}

function buildCinder() {
  const grid = blankMaze();
  carveRoom(grid, 4, 4, COLS - 8, 2);
  carveRoom(grid, 4, ROWS - 6, COLS - 8, 2);
  carveRoom(grid, 4, 4, 2, ROWS - 8);
  carveRoom(grid, COLS - 6, 4, 2, ROWS - 8);
  carveRoom(grid, 19, 4, 3, ROWS - 8);
  carveRoom(grid, 4, 14, COLS - 8, 3);
  for (const [x, y] of [[8, 8], [26, 8], [8, 18], [26, 18]]) carveRoom(grid, x, y, 6, 4);
  return finishMap(grid);
}

export const MAPS = [
  {
    id: 'crypt',
    name: 'Stone Crypt',
    short: 'Crypt',
    floorA: '#322c24',
    floorB: '#29241e',
    grout: '#3a332b',
    crack: '#1a1612',
    lairA: '#3a2422',
    lairB: '#2e1c1b',
    lairGrout: '#4a3030',
    lairCrack: '#5a3834',
    bone: '#cbb89a',
    wall: null,
    fog: '5,4,3',
    mapFloor: '#3a332b',
    mapLair: '#6a3530',
    mapDim: '#1a1612',
    mapFrame: '#6a5428',
    motif: 'stone',
    drift: null,
    build: generateMaze,
  },
  {
    id: 'caldera',
    name: 'The Caldera',
    short: 'Caldera',
    floorA: '#2a1814',
    floorB: '#1e100e',
    grout: '#4a2418',
    crack: '#ff6a2a',
    lairA: '#4a1c10',
    lairB: '#30140c',
    lairGrout: '#6a3018',
    lairCrack: '#ffb15a',
    bone: '#ff9a3c',
    wall: 'rgba(180, 60, 16, 0.38)',
    fog: '28,8,4',
    mapFloor: '#5a2a1c',
    mapLair: '#a84820',
    mapDim: '#1a0c08',
    mapFrame: '#c45a28',
    motif: 'lava',
    drift: '#ffb15a',
    driftSpeed: 10,
    build: () => buildCaldera(),
  },
  {
    id: 'glacier',
    name: 'White Glacier',
    short: 'Glacier',
    floorA: '#3a4550',
    floorB: '#2c3642',
    grout: '#8aa0b0',
    crack: '#d5e4ee',
    lairA: '#243038',
    lairB: '#1c2830',
    lairGrout: '#5a7080',
    lairCrack: '#e8f2f8',
    bone: '#e8f2f8',
    wall: 'rgba(180, 210, 230, 0.32)',
    fog: '8,14,18',
    mapFloor: '#4a5c6a',
    mapLair: '#2a3a44',
    mapDim: '#14181c',
    mapFrame: '#9eb4c4',
    motif: 'snow',
    drift: 'rgba(236,244,250,0.9)',
    driftSpeed: 14,
    build: () => buildGlacier(),
  },
  {
    id: 'mire',
    name: 'Black Mire',
    short: 'Mire',
    floorA: '#243028',
    floorB: '#1a241c',
    grout: '#3a4a32',
    crack: '#6a8a48',
    lairA: '#1a2420',
    lairB: '#121c18',
    lairGrout: '#2a4030',
    lairCrack: '#8aaa60',
    bone: '#9aaa70',
    wall: 'rgba(36, 80, 40, 0.4)',
    fog: '6,12,8',
    mapFloor: '#2e4434',
    mapLair: '#1e3028',
    mapDim: '#101610',
    mapFrame: '#6a8a58',
    motif: 'mire',
    drift: null,
    build: buildMire,
  },
  {
    id: 'dunes',
    name: 'Sunken Dunes',
    short: 'Dunes',
    floorA: '#4a3c28',
    floorB: '#3c301c',
    grout: '#6a5438',
    crack: '#c4a15a',
    lairA: '#3a2a22',
    lairB: '#2c2018',
    lairGrout: '#5a4030',
    lairCrack: '#e2c48a',
    bone: '#e2c48a',
    wall: 'rgba(170, 120, 50, 0.3)',
    fog: '24,16,8',
    mapFloor: '#6a5434',
    mapLair: '#5a4030',
    mapDim: '#1c140c',
    mapFrame: '#c4a15a',
    motif: 'dune',
    drift: null,
    build: () => buildDunes(),
  },
  {
    id: 'thicket',
    name: 'Thorn Thicket',
    short: 'Thicket',
    floorA: '#1e2a1c',
    floorB: '#162014',
    grout: '#3d5a32',
    crack: '#6a9a48',
    lairA: '#241c18',
    lairB: '#1a1410',
    lairGrout: '#3a3024',
    lairCrack: '#8aaa58',
    bone: '#c4b48a',
    wall: 'rgba(24, 70, 28, 0.42)',
    fog: '4,10,6',
    mapFloor: '#2a4028',
    mapLair: '#3a2820',
    mapDim: '#0e140e',
    mapFrame: '#7a9a58',
    motif: 'thicket',
    drift: null,
    build: buildThicket,
  },
  {
    id: 'sanguine',
    name: 'Sanguine Halls',
    short: 'Sanguine',
    floorA: '#3a1c22',
    floorB: '#2c141a',
    grout: '#5a2830',
    crack: '#8a3038',
    lairA: '#4a1820',
    lairB: '#301014',
    lairGrout: '#6a2830',
    lairCrack: '#c45a62',
    bone: '#e07a7a',
    wall: 'rgba(130, 24, 36, 0.36)',
    fog: '18,4,6',
    mapFloor: '#5a2830',
    mapLair: '#8a3038',
    mapDim: '#14080c',
    mapFrame: '#c45a62',
    motif: 'sanguine',
    drift: null,
    build: () => buildSanguine(),
  },
  {
    id: 'crystal',
    name: 'Crystal Vault',
    short: 'Crystal',
    floorA: '#24243a',
    floorB: '#1a1a30',
    grout: '#5a58a0',
    crack: '#c4c0f0',
    lairA: '#2a2040',
    lairB: '#1c1830',
    lairGrout: '#4a3868',
    lairCrack: '#e4e0ff',
    bone: '#e4e0ff',
    wall: 'rgba(90, 80, 170, 0.36)',
    fog: '10,8,22',
    mapFloor: '#3a3a5a',
    mapLair: '#4a3868',
    mapDim: '#101018',
    mapFrame: '#b0a4e0',
    motif: 'crystal',
    drift: 'rgba(230,226,255,0.85)',
    driftSpeed: 6,
    build: () => buildCrystal(),
  },
  {
    id: 'tide',
    name: 'Tide Galleries',
    short: 'Tide',
    floorA: '#1c2c32',
    floorB: '#142228',
    grout: '#3a6a72',
    crack: '#7ec8c4',
    lairA: '#1a2830',
    lairB: '#101c22',
    lairGrout: '#245058',
    lairCrack: '#b8ece8',
    bone: '#b8ece8',
    wall: 'rgba(30, 110, 120, 0.34)',
    fog: '4,12,14',
    mapFloor: '#245058',
    mapLair: '#1a3840',
    mapDim: '#0c1416',
    mapFrame: '#7ec8c4',
    motif: 'tide',
    drift: 'rgba(180,236,232,0.75)',
    driftSpeed: 8,
    build: () => buildTide(),
  },
  {
    id: 'cinder',
    name: 'Cinder Ring',
    short: 'Cinder',
    floorA: '#2a2624',
    floorB: '#201c1a',
    grout: '#4a4038',
    crack: '#d7b15a',
    lairA: '#3a2418',
    lairB: '#28180e',
    lairGrout: '#5a3824',
    lairCrack: '#ffb15a',
    bone: '#ffb15a',
    wall: 'rgba(90, 50, 24, 0.34)',
    fog: '12,8,6',
    mapFloor: '#3a342e',
    mapLair: '#6a4030',
    mapDim: '#141210',
    mapFrame: '#d7b15a',
    motif: 'cinder',
    drift: '#ff9a3c',
    driftSpeed: 7,
    build: () => buildCinder(),
  },
];
