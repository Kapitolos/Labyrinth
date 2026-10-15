import { COLS, ROWS, TILE } from './config.js';
import { isFloor, inLair, pointInRegion } from './maze.js';

export function frameMap(view) {
  const scale = Math.min(view.w / (COLS * TILE), view.h / (ROWS * TILE));
  return {
    x: (COLS * TILE) / 2,
    y: (ROWS * TILE) / 2,
    scale: scale || 1,
    ready: true,
    introLeft: 0,
  };
}

export function focusSword(view, sword) {
  const scale = Math.min(view.w / (TILE * 6.2), view.h / (TILE * 4.4));
  return {
    x: sword.x,
    y: sword.y,
    scale: scale || 1,
    ready: true,
    intro: 4.6,
    introLeft: 4.6,
    introHold: 2.2,
    focusX: sword.x,
    focusY: sword.y,
  };
}

export function updateCamera(cam, game, view, overview, dt) {
  if (!view.w || !view.h) return;
  if (cam.introLeft > 0) cam.introLeft = Math.max(0, cam.introLeft - dt);
  const showingSword = cam.introLeft > 0 && cam.introLeft > (cam.intro || 0) - (cam.introHold || 0) && !overview;
  if (showingSword) {
    const scale = Math.min(view.w / (TILE * 6.2), view.h / (TILE * 4.4));
    cam.x = cam.focusX;
    cam.y = cam.focusY;
    cam.scale = scale || cam.scale || 1;
    cam.ready = true;
    return;
  }
  const pts = [];
  const add = (x, y) => pts.push({ x, y });
  if (overview) {
    add(TILE, TILE);
    add((COLS - 1) * TILE, (ROWS - 1) * TILE);
  } else {
    const humans = game.players.filter((p) => !p.bot && p.alive);
    const focus = humans.length ? humans : game.players.filter((p) => p.alive);
    for (const p of focus) add(p.x, p.y);
    if (!humans.length && game.minotaur.hp > 0) add(game.minotaur.x, game.minotaur.y);
    for (const sw of game.switches) {
      if (!sw.litByHuman && sw.telegraph <= 0) continue;
      const region = sw.region;
      add(region.x * TILE, region.y * TILE);
      add((region.x + region.w) * TILE, (region.y + region.h) * TILE);
      add(sw.x, sw.y);
    }
    if (!pts.length) add(game.minotaur.x, game.minotaur.y);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = overview ? TILE : TILE * 2.4;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const wantW = Math.max(TILE * 8, maxX - minX);
  const wantH = Math.max(TILE * 6, maxY - minY);
  const fit = Math.min(view.w / (COLS * TILE), view.h / (ROWS * TILE));
  const close = Math.min(view.w / (TILE * 13), view.h / (TILE * 9));
  let scale = Math.min(view.w / wantW, view.h / wantH);
  scale = Math.min(scale, close);
  scale = Math.max(scale, fit);
  let cx = (minX + maxX) / 2;
  let cy = (minY + maxY) / 2;
  const worldW = COLS * TILE;
  const worldH = ROWS * TILE;
  const halfW = view.w / scale / 2;
  const halfH = view.h / scale / 2;
  cx = halfW * 2 >= worldW ? worldW / 2 : Math.max(halfW, Math.min(worldW - halfW, cx));
  cy = halfH * 2 >= worldH ? worldH / 2 : Math.max(halfH, Math.min(worldH - halfH, cy));
  const ease = cam.introLeft > 0 ? 1.35 : 4.2;
  const k = 1 - Math.exp(-ease * Math.max(0.001, dt));
  if (!cam.ready) {
    cam.x = cx;
    cam.y = cy;
    cam.scale = scale;
    cam.ready = true;
    return;
  }
  cam.x += (cx - cam.x) * k;
  cam.y += (cy - cam.y) * k;
  cam.scale += (scale - cam.scale) * k;
}

export function render(ctx, game, view, cam, opts = {}) {
  if (!view.w || !view.h || !cam.scale) return;
  const dpr = view.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.w * dpr, view.h * dpr);
  ctx.fillStyle = '#070605';
  ctx.fillRect(0, 0, view.w * dpr, view.h * dpr);

  const mag = opts.reduce ? 0 : (game.shake || 0) * 8;
  const shx = Math.sin((game.time || 0) * 73) * mag;
  const shy = Math.cos((game.time || 0) * 59) * mag;
  const ox = (view.w / 2 + shx - cam.x * cam.scale) * dpr;
  const oy = (view.h / 2 + shy - cam.y * cam.scale) * dpr;
  ctx.setTransform(cam.scale * dpr, 0, 0, cam.scale * dpr, ox, oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawTiles(ctx, game);
  drawHighlights(ctx, game, cam);
  drawSprites(ctx, game);
  drawParticles(ctx, game);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!opts.bare) {
    drawLabels(ctx, game, view, cam);
    drawWingTags(ctx, game, view, cam);
    drawFloats(ctx, game, view, cam);
    drawMinimap(ctx, game, view);
    drawPointers(ctx, game, view, cam);
    drawVignette(ctx, view, game);
  }
}

function drawTiles(ctx, game) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;
      if (game.grid[r][c] !== 0) {
        ctx.fillStyle = '#100e0c';
        ctx.fillRect(x, y, TILE, TILE);
        if (isFloor(game.grid, c, r + 1)) {
          ctx.fillStyle = '#3c352c';
          ctx.fillRect(x, y + TILE - 7, TILE, 7);
          ctx.fillStyle = '#231e19';
          ctx.fillRect(x, y + TILE - 3, TILE, 3);
        }
        if (isFloor(game.grid, c, r + 1) && hash2(c, r) < 0.09) {
          const flick = 0.75 + Math.sin(game.time * 9 + c * 1.7 + r) * 0.25;
          ctx.fillStyle = `rgba(255, ${150 + flick * 50}, 70, 0.95)`;
          ctx.beginPath();
          ctx.arc(x + TILE * 0.5, y + TILE - 5, 2.1 * flick, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      const n = hash2(c, r);
      if (inLair(c, r)) ctx.fillStyle = n < 0.5 ? '#3a2422' : '#311e1c';
      else ctx.fillStyle = n < 0.5 ? '#2b261f' : '#241f1b';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, y + TILE - 1, TILE, 1);
      ctx.fillRect(x + TILE - 1, y, 1, TILE);
      if (inLair(c, r) && n > 0.86) {
        ctx.fillStyle = '#6a5344';
        ctx.fillRect(x + 8, y + 14, 10, 3);
        ctx.fillRect(x + 16, y + 12, 3, 7);
      }
    }
  }
}

function drawHighlights(ctx, game, cam) {
  for (const sw of game.switches) {
    const show = sw.lit || sw.telegraph > 0 || sw.flash > 0;
    if (!show) continue;
    const pulse = 0.14 + Math.sin(game.time * 5 + sw.x) * 0.05;
    const alpha = sw.flash > 0 ? 0.28 + sw.flash * 0.25 : pulse;
    const region = sw.region;
    ctx.fillStyle = rgba(sw.region.color, alpha);
    for (let r = region.y; r < region.y + region.h; r++) {
      for (let c = region.x; c < region.x + region.w; c++) {
        if (!isFloor(game.grid, c, r)) continue;
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    ctx.save();
    ctx.strokeStyle = rgba(sw.region.color, 0.95);
    ctx.lineWidth = 3 / cam.scale;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -game.time * 28;
    ctx.strokeRect(
      region.x * TILE + 2,
      region.y * TILE + 2,
      region.w * TILE - 4,
      region.h * TILE - 4,
    );
    ctx.restore();
  }
}

function drawSprites(ctx, game) {
  const sprites = [];
  for (const chest of game.chests) sprites.push({ y: chest.y, draw: () => drawChest(ctx, chest, game.time) });
  for (const k of game.pickups) sprites.push({ y: k.y, draw: () => drawPickup(ctx, k, game.time) });
  if (game.sword && game.sword.held == null) {
    sprites.push({ y: game.sword.y, draw: () => drawChargedSword(ctx, game.sword, game.time) });
  }
  for (const gate of game.gates || []) {
    sprites.push({ y: gate.y, draw: () => drawGate(ctx, gate, game.time, game.gateCd) });
  }
  for (const sw of game.switches) sprites.push({ y: sw.y, draw: () => drawSwitch(ctx, sw, game.time) });
  for (const g of game.goblins) sprites.push({ y: g.y, draw: () => drawGoblin(ctx, g, game.time) });
  for (const p of game.players) sprites.push({ y: p.y, draw: () => drawHunter(ctx, p, game.time) });
  if (game.minotaur) sprites.push({ y: game.minotaur.y, draw: () => drawMinotaur(ctx, game.minotaur, game.time) });
  sprites.sort((a, b) => a.y - b.y);
  for (const sprite of sprites) sprite.draw();
  for (const p of game.players) drawSwing(ctx, p);
  drawBolts(ctx, game);
}

function drawChargedSword(ctx, sword, time) {
  const bob = Math.sin(time * 3) * 3;
  ctx.save();
  ctx.translate(sword.x, sword.y + bob);
  ctx.fillStyle = 'rgba(255, 211, 106, 0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, 18 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-0.65);
  ctx.strokeStyle = '#ffd36a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(0, -14);
  ctx.stroke();
  ctx.strokeStyle = '#fff4d2';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.fillStyle = '#ffe7a3';
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(6, -12);
  ctx.lineTo(0, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9a15a';
  ctx.fillRect(-7, 8, 14, 3);
  ctx.restore();
  ctx.fillStyle = '#ffd36a';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(sword.charges || 0), sword.x, sword.y - 26);
}

function drawGate(ctx, gate, time, cd) {
  const ready = !(cd > 0);
  ctx.save();
  ctx.translate(gate.x, gate.y);
  ctx.strokeStyle = ready ? '#7ee0d2' : '#3e5854';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, ready ? 13 + Math.sin(time * 3) * 1.4 : 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.stroke();
  if (!ready) {
    ctx.fillStyle = '#9fd8cf';
    ctx.font = '700 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.ceil(cd)), 0, -16);
  }
  ctx.restore();
}

function drawChest(ctx, chest, time) {
  const bob = chest.open ? 0 : Math.sin(time * 3 + chest.x) * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(chest.x, chest.y + 8, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = chest.open ? '#3a2a18' : '#6b4424';
  ctx.fillRect(chest.x - 8, chest.y - 6 + bob, 16, 11);
  ctx.fillStyle = chest.open ? '#2a1c10' : '#8a6230';
  ctx.fillRect(chest.x - 8, chest.y - 8 + bob, 16, 4);
  ctx.fillStyle = '#e2b657';
  ctx.fillRect(chest.x - 1.5, chest.y - 2 + bob, 3, 4);
}

function drawPickup(ctx, k, time) {
  const bob = Math.sin(time * 5 + k.x) * 2;
  ctx.save();
  ctx.translate(k.x, k.y + bob);
  if (k.kind === 'charge') {
    ctx.rotate(time * 1.4);
    ctx.fillStyle = '#ffd36a';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
  } else if (k.kind === 'fire' || k.kind === 'wildfire') {
    ctx.fillStyle = k.kind === 'wildfire' ? '#ff5a2a' : '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, 2);
    ctx.lineTo(0, 0);
    ctx.lineTo(-4, 2);
    ctx.closePath();
    ctx.fill();
  } else if (k.kind === 'boon') {
    ctx.fillStyle = '#c4b2ff';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#e23d3d';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4f4';
    ctx.fillRect(-1.2, -3.2, 2.4, 6.4);
    ctx.fillRect(-3.2, -1.2, 6.4, 2.4);
  }
  ctx.restore();
}

function drawSwitch(ctx, sw, time) {
  const pulse = sw.lit || sw.telegraph > 0 ? 0.45 + Math.sin(time * 7) * 0.25 : 0.2;
  ctx.fillStyle = rgba(sw.region.color, pulse);
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.lit || sw.telegraph > 0 ? 16 : 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a241c';
  ctx.fillRect(sw.x - 7, sw.y - 3, 14, 8);
  ctx.strokeStyle = sw.cd > 0 ? '#8a8074' : sw.region.color;
  ctx.lineWidth = 3;
  const angle = sw.cd > 0 ? 0.9 : -0.8;
  ctx.beginPath();
  ctx.moveTo(sw.x, sw.y);
  ctx.lineTo(sw.x + Math.cos(angle) * 12, sw.y + Math.sin(angle) * 12);
  ctx.stroke();
  ctx.fillStyle = '#e8d7b0';
  ctx.beginPath();
  ctx.arc(sw.x + Math.cos(angle) * 12, sw.y + Math.sin(angle) * 12, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoblin(ctx, g, time) {
  const bob = Math.sin(time * 8 + g.x) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(g.x, g.y + 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d3a22';
  ctx.beginPath();
  ctx.arc(g.x, g.y + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#67b85a';
  ctx.beginPath();
  ctx.arc(g.x, g.y + bob, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#163018';
  ctx.beginPath();
  ctx.moveTo(g.x - 5, g.y - 4 + bob);
  ctx.lineTo(g.x - 9, g.y - 10 + bob);
  ctx.lineTo(g.x - 2, g.y - 5 + bob);
  ctx.moveTo(g.x + 5, g.y - 4 + bob);
  ctx.lineTo(g.x + 9, g.y - 10 + bob);
  ctx.lineTo(g.x + 2, g.y - 5 + bob);
  ctx.fill();
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(g.x - 3, g.y - 1 + bob, 2, 2);
  ctx.fillRect(g.x + 1, g.y - 1 + bob, 2, 2);
  const fx = g.fx || 1;
  const fy = g.fy || 0;
  const px = -fy;
  const py = fx;
  const guard = g.guard > 0;
  const windup = g.strike === 'windup';
  const lunging = g.strike === 'lunge';
  const reach = windup ? -12 : lunging ? 18 : (guard ? 8 : 14);
  ctx.strokeStyle = windup ? '#ffb0a4' : '#e7eef6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.x + fx * 3 + px * 5, g.y + bob + fy * 3 + py * 5);
  ctx.lineTo(g.x + fx * reach + px * 5, g.y + bob + fy * reach + py * 5);
  ctx.stroke();
  ctx.fillStyle = guard ? '#f4f7fb' : '#8d97a6';
  ctx.beginPath();
  ctx.arc(g.x - px * (guard ? 9 : 6), g.y + bob - py * (guard ? 9 : 6), guard ? 5.2 : 3.4, 0, Math.PI * 2);
  ctx.fill();
  if (windup) {
    const pulse = 0.4 + Math.sin(time * 22) * 0.45;
    ctx.strokeStyle = `rgba(255, 70, 54, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.x + fx * 18, g.y + bob + fy * 18, 7 + Math.sin(time * 22) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff5a4a';
    ctx.font = '700 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', g.x, g.y - 18);
  }
  if (g.burn > 0) {
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(g.x - 2, g.y - 12 + bob, 3, 3);
    ctx.fillRect(g.x + 3, g.y - 9 + bob, 2, 2);
  }
}

function drawHunter(ctx, p, time) {
  const fallen = !p.alive;
  const blink = p.invuln > 0 && Math.sin(time * 28) > 0;
  ctx.save();
  ctx.globalAlpha = fallen ? 0.4 : blink ? 0.45 : 1;
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.burn > 0) {
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(-2, -16 + Math.sin(time * 12) * 2, 3, 4);
    ctx.fillRect(3, -13, 2, 3);
  }
  ctx.strokeStyle = p.bearing ? '#ffd36a' : (p.buffs?.fire > 0 ? '#ff8a3a' : p.color);
  ctx.lineWidth = p.bearing ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.bearing ? 14 : 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = shade(p.color, 0.55);
  ctx.beginPath();
  ctx.arc(0, 1, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, -1, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a120e';
  ctx.font = '700 9px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.index + 1), 0, -1);
  if (!fallen) drawArms(ctx, p);
  if (!fallen && p.staminaMax) {
    const ratio = Math.max(0, Math.min(1, p.stamina / p.staminaMax));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-11, 15, 22, 3);
    ctx.fillStyle = ratio < 0.25 ? '#e23d3d' : '#d7c48a';
    ctx.fillRect(-11, 15, 22 * ratio, 3);
  }
  ctx.restore();
}

function drawArms(ctx, p) {
  const windup = p.swing && p.swing.age / p.swing.duration < 0.34;
  const dirx = p.swing ? p.swing.dirx : p.fx;
  const diry = p.swing ? p.swing.diry : p.fy;
  const px = -diry;
  const py = dirx;
  const gold = p.bearing || p.charges > 0;
  const id = p.class?.id || 'knight';
  if (id === 'knight') {
    const parry = p.blocking && (p.blockAge || 0) < (p.buffs?.boon > 0 ? 0.24 : 0.16);
    const sign = p.blocking ? -1 : (windup ? -1 : 1);
    const len = p.blocking ? 8 : (windup ? 9 : 16);
    ctx.strokeStyle = gold ? '#ffd36a' : '#d5dbe6';
    ctx.lineWidth = gold ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(dirx * 4 + px * 3, diry * 4 + py * 3);
    ctx.lineTo(dirx * sign * len + px * 3, diry * sign * len + py * 3);
    ctx.stroke();
    const shield = p.blocking ? 1.45 : 1;
    const ox = p.blocking ? dirx * 8 : 0;
    const oy = p.blocking ? diry * 8 : 0;
    ctx.fillStyle = parry ? '#fff6d0' : '#c5ccd6';
    ctx.beginPath();
    ctx.moveTo(ox + px * 7 * shield + dirx * 3, oy + py * 7 * shield + diry * 3);
    ctx.lineTo(ox + px * 7 * shield - dirx * 5, oy + py * 7 * shield - diry * 5);
    ctx.lineTo(ox + px * 13 * shield - dirx * 3, oy + py * 13 * shield - diry * 3);
    ctx.lineTo(ox + px * 13 * shield + dirx * 5, oy + py * 13 * shield + diry * 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = parry ? '#fff4d2' : (gold ? '#ffd36a' : '#8d96a3');
    ctx.lineWidth = parry ? 2.4 : 1.4;
    ctx.stroke();
  } else if (id === 'archer') {
    const bow = Math.atan2(py, px);
    ctx.strokeStyle = '#c4a574';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dirx * 8, diry * 8, 7, bow - 1.15, bow + 1.15);
    ctx.stroke();
    ctx.strokeStyle = gold ? '#ffd36a' : '#efe6d6';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px * 6 + dirx * 4, py * 6 + diry * 4);
    ctx.lineTo(-px * 6 + dirx * 4, -py * 6 + diry * 4);
    ctx.stroke();
    if (!windup) {
      ctx.strokeStyle = gold ? '#ffd36a' : '#d5dbe6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dirx * 6, diry * 6);
      ctx.lineTo(dirx * 16, diry * 16);
      ctx.stroke();
    }
  } else if (id === 'wizard') {
    ctx.strokeStyle = '#6b5344';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-dirx * 4, -diry * 4);
    ctx.lineTo(dirx * 14, diry * 14);
    ctx.stroke();
    ctx.fillStyle = windup ? '#8d7ad4' : (gold ? '#ffd36a' : '#c4b2ff');
    ctx.beginPath();
    ctx.arc(dirx * 15, diry * 15, windup ? 3.2 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sign = windup ? -1 : 1;
    ctx.strokeStyle = gold ? '#ffd36a' : '#d5dbe6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px * 4, py * 4);
    ctx.lineTo(px * 4 + dirx * sign * 12, py * 4 + diry * sign * 12);
    ctx.moveTo(-px * 3, -py * 3);
    ctx.lineTo(-px * 3 + dirx * sign * 11, -py * 3 + diry * sign * 11);
    ctx.stroke();
  }
}

function drawMinotaur(ctx, m, time) {
  const dead = m.hp <= 0;
  const bob = dead ? 0 : Math.sin(time * (m.state === 'charge' ? 18 : 6)) * 1.4;
  ctx.save();
  ctx.translate(m.x, m.y + bob);
  if (dead) ctx.rotate(1.15);
  ctx.globalAlpha = dead ? 0.75 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (m.state === 'charge') {
    ctx.strokeStyle = 'rgba(224, 90, 80, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-m.dx * 16, -m.dy * 16);
    ctx.lineTo(-m.dx * 34, -m.dy * 34);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a0d0a';
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.hurtFlash > 0 ? '#a8483c' : '#6a341f';
  ctx.beginPath();
  ctx.ellipse(0, 2, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a2416';
  ctx.beginPath();
  ctx.arc(0, -6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e6d2b0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-4, -10);
  ctx.quadraticCurveTo(-12, -22, -16, -12);
  ctx.moveTo(4, -10);
  ctx.quadraticCurveTo(12, -22, 16, -12);
  ctx.stroke();
  ctx.fillStyle = dead ? '#5a4038' : '#ffb15a';
  ctx.beginPath();
  ctx.arc(-3, -7, 1.5, 0, Math.PI * 2);
  ctx.arc(3, -7, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBolts(ctx, game) {
  for (const b of game.bolts || []) {
    const len = Math.hypot(b.vx, b.vy) || 1;
    const dx = b.vx / len;
    const dy = b.vy / len;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.charged ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(b.x - dx * 9, b.y - dy * 9);
    ctx.lineTo(b.x + dx * 3, b.y + dy * 3);
    ctx.stroke();
    if (b.pierce) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.charged ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSwing(ctx, p) {
  if (!p.swing || !p.alive || p.swing.style === 'bolt') return;
  const s = p.swing;
  const t = s.age / s.duration;
  if (t < 0.28 || t > 0.96) return;
  const ang = Math.atan2(s.diry, s.dirx);
  const sweep = s.kind === 'charged' ? 1.15 : 0.7;
  const start = ang - sweep * 0.5 + sweep * ((t - 0.28) / 0.68);
  ctx.save();
  ctx.strokeStyle = s.kind === 'charged' ? 'rgba(255, 211, 106, 0.95)' : 'rgba(226, 232, 242, 0.8)';
  ctx.lineWidth = s.kind === 'charged' ? 4 : 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, s.range * 0.72, start, start + 0.45);
  ctx.stroke();
  if (s.kind === 'charged') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawLabels(ctx, game, view, cam) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const p of game.players) {
    const [sx, sy] = worldToScreen(cam, view, p.x, p.y);
    if (!inView(sx, sy, view, -30)) continue;
    ctx.globalAlpha = p.alive ? 1 : 0.75;
    ctx.font = '11px Georgia, Palatino, serif';
    ctx.fillStyle = p.bearing ? '#ffd36a' : '#e7d7b0';
    ctx.fillText(p.bearing ? `Sword ${p.charges}` : (p.class?.name || ''), sx, sy - 38);
    ctx.font = '700 13px Georgia, Palatino, serif';
    ctx.fillStyle = p.color;
    ctx.fillText(p.name, sx, sy - 24);
    if (!p.alive) {
      ctx.fillStyle = '#efe6d6';
      ctx.font = '12px Georgia, Palatino, serif';
      ctx.fillText(`${Math.ceil(p.respawn)}s`, sx, sy + 26);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - 18, sy - 20, 36, 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - 18, sy - 20, 36 * Math.max(0, p.hp) / p.maxHp, 4);
    }
  }
  if (game.minotaur) {
    const [sx, sy] = worldToScreen(cam, view, game.minotaur.x, game.minotaur.y);
    if (inView(sx, sy, view, -20)) {
      ctx.globalAlpha = 1;
      ctx.font = '700 13px Georgia, Palatino, serif';
      ctx.fillStyle = '#e06a62';
      ctx.fillText(game.minotaur.hp > 0 ? 'Minotaur' : 'Fallen', sx, sy - 30);
    }
  }
  ctx.globalAlpha = 1;
}

function drawWingTags(ctx, game, view, cam) {
  ctx.textAlign = 'center';
  for (const sw of game.switches) {
    if (!sw.lit && sw.telegraph <= 0 && sw.flash <= 0) continue;
    const region = sw.region;
    const [sx, sy] = worldToScreen(
      cam,
      view,
      (region.x + region.w / 2) * TILE,
      region.y * TILE + 10,
    );
    if (!inView(sx, sy, view, 10)) continue;
    const names = [];
    for (const p of game.players) {
      if (p.alive && pointInRegion(p.x, p.y, region)) names.push(p.name);
    }
    if (game.minotaur.hp > 0 && pointInRegion(game.minotaur.x, game.minotaur.y, region)) {
      names.push('Minotaur');
    }
    ctx.font = '700 15px Georgia, Palatino, serif';
    ctx.fillStyle = '#140f0c';
    ctx.fillText(region.name, sx + 1, sy + 1);
    ctx.fillStyle = region.color;
    ctx.fillText(region.name, sx, sy);
    ctx.font = '13px Georgia, Palatino, serif';
    ctx.fillStyle = '#f3ecdf';
    const detail = sw.telegraph > 0
      ? `${sw.telegraphName} is throwing this lever`
      : 'Throwing the lever rebuilds this wing';
    ctx.fillText(detail, sx, sy + 16);
    ctx.fillStyle = names.includes('Minotaur') ? '#ffb0a8' : '#e7d7b0';
    ctx.fillText(names.length ? names.join(' · ') : 'Empty', sx, sy + 32);
  }
}

function drawFloats(ctx, game, view, cam) {
  ctx.textAlign = 'center';
  ctx.font = '700 16px Georgia, Palatino, serif';
  for (const t of game.texts) {
    const [sx, sy] = worldToScreen(cam, view, t.x, t.y);
    ctx.globalAlpha = Math.max(0, Math.min(1, t.life));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}

function drawMinimap(ctx, game, view) {
  const mw = 148;
  const mh = mw * (ROWS / COLS);
  const x = view.w - mw - 12;
  const y = 12;
  ctx.fillStyle = 'rgba(10, 8, 7, 0.86)';
  ctx.fillRect(x - 6, y - 6, mw + 12, mh + 22);
  ctx.strokeStyle = '#6a5428';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y - 6, mw + 12, mh + 22);
  const tw = mw / COLS;
  const th = mh / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r][c] !== 0) continue;
      ctx.fillStyle = inLair(c, r) ? '#6a3530' : '#3a332b';
      ctx.fillRect(x + c * tw, y + r * th, tw + 0.4, th + 0.4);
    }
  }
  for (const sw of game.switches) {
    if (sw.lit || sw.telegraph > 0 || sw.flash > 0) {
      ctx.fillStyle = rgba(sw.region.color, 0.35);
      ctx.fillRect(
        x + sw.region.x * tw,
        y + sw.region.y * th,
        sw.region.w * tw,
        sw.region.h * th,
      );
    }
    ctx.fillStyle = sw.region.color;
    ctx.fillRect(x + sw.c * tw - 1, y + sw.r * th - 1, 3, 3);
  }
  for (const chest of game.chests) {
    if (chest.open) continue;
    ctx.fillStyle = '#e2b657';
    ctx.fillRect(x + chest.c * tw, y + chest.r * th, 2, 2);
  }
  if (game.sword && game.sword.held == null) {
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(x + (game.sword.x / TILE) * tw - 1.5, y + (game.sword.y / TILE) * th - 1.5, 4, 4);
  }
  ctx.fillStyle = '#7ee0d2';
  for (const gate of game.gates || []) {
    ctx.fillRect(x + gate.c * tw, y + gate.r * th, 3, 3);
  }
  ctx.fillStyle = '#e06a62';
  ctx.beginPath();
  ctx.arc(
    x + (game.minotaur.x / TILE) * tw,
    y + (game.minotaur.y / TILE) * th,
    3.2,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  for (const p of game.players) {
    if (!p.alive) continue;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + (p.x / TILE) * tw, y + (p.y / TILE) * th, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#d7b15a';
  ctx.font = '11px Georgia, Palatino, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Maze', x, y + mh + 12);
}

function drawPointers(ctx, game, view, cam) {
  const marks = [];
  if (game.sword && game.sword.held == null) {
    marks.push({ x: game.sword.x, y: game.sword.y, color: '#ffd36a', label: 'Sword' });
  }
  for (const gate of game.gates || []) {
    marks.push({ x: gate.x, y: gate.y, color: '#7ee0d2', label: 'Pad' });
  }
  if (game.minotaur.hp > 0) {
    marks.push({ x: game.minotaur.x, y: game.minotaur.y, color: '#e06a62', label: 'Minotaur' });
  }
  for (const p of game.players) {
    if (!p.alive) continue;
    marks.push({ x: p.x, y: p.y, color: p.color, label: p.name });
  }
  for (const mark of marks) {
    const [sx, sy] = worldToScreen(cam, view, mark.x, mark.y);
    if (inView(sx, sy, view, 18)) continue;
    const [ex, ey] = edgePoint(view.w, view.h, sx, sy, 28);
    const ang = Math.atan2(sy - view.h / 2, sx - view.w / 2);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = mark.color;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-7, -5);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-ang);
    ctx.font = '12px Georgia, Palatino, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3ecdf';
    ctx.fillText(mark.label, 0, 18);
    ctx.restore();
  }
}

function drawVignette(ctx, view, game) {
  const g = ctx.createRadialGradient(
    view.w / 2,
    view.h / 2,
    Math.min(view.w, view.h) * 0.35,
    view.w / 2,
    view.h / 2,
    Math.max(view.w, view.h) * 0.72,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);

  const hero = game.players.find((p) => !p.bot && p.alive);
  if (hero && hero.hp < 36) {
    const a = ((36 - hero.hp) / 36) * 0.45;
    const red = ctx.createRadialGradient(
      view.w / 2,
      view.h / 2,
      Math.min(view.w, view.h) * 0.2,
      view.w / 2,
      view.h / 2,
      Math.max(view.w, view.h) * 0.65,
    );
    red.addColorStop(0, 'rgba(120,0,0,0)');
    red.addColorStop(1, `rgba(120, 0, 0, ${a})`);
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255, 236, 200, ${game.flash * 0.38})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

function worldToScreen(cam, view, x, y) {
  return [
    view.w / 2 + (x - cam.x) * cam.scale,
    view.h / 2 + (y - cam.y) * cam.scale,
  ];
}

function inView(x, y, view, margin) {
  return x > margin && y > margin && x < view.w - margin && y < view.h - margin;
}

function edgePoint(w, h, sx, sy, margin) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const hw = w / 2 - margin;
  const hh = h / 2 - margin;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, hw / Math.abs(dx));
  if (dy !== 0) t = Math.min(t, hh / Math.abs(dy));
  return [cx + dx * t, cy + dy * t];
}

function hash2(c, r) {
  let n = Math.imul(c, 374761393) + Math.imul(r, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * amount;
  const g = ((n >> 8) & 255) * amount;
  const b = (n & 255) * amount;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
