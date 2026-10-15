import { COLS, ROWS, TILE } from './config.js';
import { tileCenter, tileOf } from './config.js';
import { lineOfSight } from './path.js';

export const SIGHT_BUBBLE = 72;
export const SIGHT_RANGE = 228;
export const SIGHT_CONE = 1.15;
export const REVEAL_TIME = 4.5;

export function fogActive(game) {
  return game.players.some((p) => !p.bot);
}

export function sees(grid, viewer, x, y) {
  if (!viewer) return false;
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= SIGHT_BUBBLE) return true;
  if (dist > SIGHT_RANGE) return false;
  const face = Math.atan2(viewer.fy || 0, viewer.fx || 1);
  let ang = Math.atan2(dy, dx) - face;
  if (ang > Math.PI) ang -= Math.PI * 2;
  if (ang < -Math.PI) ang += Math.PI * 2;
  if (Math.abs(ang) > SIGHT_CONE) return false;
  return lineOfSight(grid, viewer.x, viewer.y, x, y);
}

export function refreshVision(game) {
  if (!fogActive(game)) {
    game.vis = null;
    return;
  }
  if (!game.seen) game.seen = new Uint8Array(COLS * ROWS);
  const vis = new Uint8Array(COLS * ROWS);
  const eyes = game.players.filter((p) => !p.bot);
  const reach = Math.ceil(SIGHT_RANGE / TILE) + 1;
  for (const eye of eyes) {
    const [c0, r0] = tileOf(eye.x, eye.y);
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      if (r < 0 || r >= ROWS) continue;
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (c < 0 || c >= COLS) continue;
        const [x, y] = tileCenter(c, r);
        if (!sees(game.grid, eye, x, y)) continue;
        const i = r * COLS + c;
        vis[i] = 1;
        game.seen[i] = 1;
      }
    }
  }
  game.vis = vis;
}

export function spotLit(game, x, y) {
  if (!fogActive(game) || !game.vis) return true;
  const [c, r] = tileOf(x, y);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
  return game.vis[r * COLS + c] === 1;
}

export function tileKnown(game, c, r) {
  if (!fogActive(game) || !game.seen) return true;
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
  return game.seen[r * COLS + c] === 1;
}

export function markOnMap(game, p) {
  if (!p) return false;
  if (!fogActive(game)) return p.alive;
  if ((p.reveal || 0) > 0) return true;
  if (!p.alive) return false;
  if (!p.bot) return true;
  return spotLit(game, p.x, p.y);
}

export function forgetRegion(game, region) {
  if (!game.seen) return;
  for (let r = region.y; r < region.y + region.h; r++) {
    for (let c = region.x; c < region.x + region.w; c++) {
      if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
      game.seen[r * COLS + c] = 0;
    }
  }
}
