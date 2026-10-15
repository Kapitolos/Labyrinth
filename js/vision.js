import { COLS, ROWS, TILE } from './config.js';
import { tileCenter, tileOf } from './config.js';
import { lineOfSight } from './path.js';

export const SIGHT_BUBBLE = 96;
export const SIGHT_RANGE = 304;
export const SIGHT_CONE = 1.38;
export const REVEAL_TIME = 4.5;

export function veil(cam) {
  if (!cam || !(cam.intro > 0) || !(cam.introLeft > 0)) return 1;
  const travel = cam.intro - (cam.introHold || 0);
  if (travel <= 0) return 0;
  if (cam.introLeft >= travel) return 0;
  return 1 - cam.introLeft / travel;
}

export function fogActive(game) {
  return game.players.some((p) => !p.bot);
}

function sightGrade(grid, viewer, x, y) {
  if (!viewer) return 0;
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= SIGHT_BUBBLE) return 1;
  const face = Math.atan2(viewer.fy || 0, viewer.fx || 1);
  let ang = Math.atan2(dy, dx) - face;
  if (ang > Math.PI) ang -= Math.PI * 2;
  if (ang < -Math.PI) ang += Math.PI * 2;
  const turn = Math.abs(ang);
  const los = () => lineOfSight(grid, viewer.x, viewer.y, x, y);
  if (dist <= SIGHT_RANGE && turn <= SIGHT_CONE && los()) return 1;
  if (dist <= SIGHT_RANGE * 1.16 && turn <= SIGHT_CONE * 1.22 && los()) return 2;
  if (dist <= SIGHT_BUBBLE * 1.4 && los()) return 2;
  return 0;
}

export function sees(grid, viewer, x, y) {
  return sightGrade(grid, viewer, x, y) > 0;
}

export function refreshVision(game) {
  if (!fogActive(game)) {
    game.vis = null;
    return;
  }
  if (!game.seen) game.seen = new Uint8Array(COLS * ROWS);
  const vis = new Uint8Array(COLS * ROWS);
  const eyes = game.players.filter((p) => !p.bot);
  const reach = Math.ceil((SIGHT_RANGE * 1.2) / TILE) + 1;
  for (const eye of eyes) {
    const [c0, r0] = tileOf(eye.x, eye.y);
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      if (r < 0 || r >= ROWS) continue;
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (c < 0 || c >= COLS) continue;
        const [x, y] = tileCenter(c, r);
        const grade = sightGrade(game.grid, eye, x, y);
        if (!grade) continue;
        const i = r * COLS + c;
        if (grade === 1 || vis[i] !== 1) vis[i] = grade;
        if (grade === 1) game.seen[i] = 1;
      }
    }
  }
  game.vis = vis;
}

export function spotLit(game, x, y) {
  if ((game.fogIn ?? 1) < 0.45) return true;
  if (!fogActive(game) || !game.vis) return true;
  const [c, r] = tileOf(x, y);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
  return game.vis[r * COLS + c] > 0;
}

export function fogAlpha(game, c, r) {
  const cover = game.fogIn ?? 1;
  if (cover <= 0 || !game.vis) return 0;
  const i = r * COLS + c;
  const grade = game.vis[i] || 0;
  if (grade === 1) return 0;
  let alpha = 0.94;
  if (grade === 2) alpha = 0.34;
  else if (game.seen && game.seen[i]) {
    const [x, y] = tileCenter(c, r);
    const near = game.players.some((p) => !p.bot && Math.hypot(p.x - x, p.y - y) < SIGHT_RANGE * 0.9);
    alpha = near ? 0.46 : 0.72;
  }
  return alpha * cover;
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
