import { COLS, ROWS, TILE } from './config.js';
import { isFloor, inLair, pointInRegion } from './maze.js';
import { blit, facingDir, hunterCanvas, monsterCanvas, propCanvas, tileCanvas } from './sprites.js';
import { fogActive, fogAlpha, markOnMap, spotLit, tileKnown, veil } from './vision.js';

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
  ctx.imageSmoothingEnabled = false;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  game.fogIn = veil(cam);

  drawTiles(ctx, game);
  drawTurningWings(ctx, game);
  drawFog(ctx, game);
  drawHighlights(ctx, game, cam);
  drawSprites(ctx, game);
  drawParticles(ctx, game);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!opts.bare) {
    drawLabels(ctx, game, view, cam);
    drawWingTags(ctx, game, view, cam);
    drawFloats(ctx, game, view, cam);
    drawMinimap(ctx, game, view);
    drawCallout(ctx, game, view);
    drawPointers(ctx, game, view, cam);
    drawVignette(ctx, view, game);
  }
}

function wingTurning(game, c, r) {
  for (const turn of game.turns || []) {
    const reg = turn.region;
    if (c >= reg.x && c < reg.x + reg.w && r >= reg.y && r < reg.y + reg.h) return true;
  }
  return false;
}

function drawMazeCell(ctx, game, c, r) {
  const x = c * TILE;
  const y = r * TILE;
  const theme = game.theme;
  if (game.grid[r][c] !== 0) {
    blit(ctx, tileCanvas('wall'), x + TILE / 2, y + TILE / 2);
    if (isFloor(game.grid, c, r + 1) && !wingTurning(game, c, r + 1)) {
      blit(ctx, tileCanvas('lip'), x + TILE / 2, y + TILE / 2);
    }
    if (theme?.wall) {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(x, y, TILE, TILE);
    }
    return;
  }
  const n = hash2(c, r);
  const n2 = hash2(c + 13, r + 29);
  const lair = inLair(c, r);
  ctx.fillStyle = lair
    ? (n < 0.5 ? (theme?.lairA || '#3a2422') : (theme?.lairB || '#2e1c1b'))
    : (n < 0.5 ? (theme?.floorA || '#322c24') : (theme?.floorB || '#29241e'));
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = lair ? (theme?.lairGrout || '#4a3030') : (theme?.grout || '#3a332b');
  ctx.fillRect(x + 2, y + 2, 6, 4);
  ctx.fillRect(x + 16 + (n2 > 0.5 ? 4 : 0), y + 18, 5, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x, y + TILE - 1, TILE, 1);
  ctx.fillRect(x + TILE - 1, y, 1, TILE);
  paintMotif(ctx, theme, lair, n, n2, x, y, game.time || 0, c, r);
}

function paintMotif(ctx, theme, lair, n, n2, x, y, time, c, r) {
  const motif = theme?.motif || 'stone';
  const crack = lair ? (theme?.lairCrack || '#5a3834') : (theme?.crack || '#1a1612');
  if (motif === 'stone' || motif === 'lava' || motif === 'sanguine' || motif === 'cinder') {
    if (n > 0.72) {
      ctx.strokeStyle = crack;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 8);
      ctx.lineTo(x + 14, y + 18);
      ctx.lineTo(x + 22, y + 14);
      ctx.stroke();
    }
  }
  if (motif === 'lava' && n > 0.74) {
    ctx.fillStyle = n > 0.9 ? '#ffb15a' : '#c44820';
    ctx.fillRect(x + 8, y + 16, 14, 2);
    ctx.fillRect(x + 16, y + 10, 2, 8);
  } else if (motif === 'snow' && n > 0.5) {
    ctx.fillStyle = 'rgba(230,240,248,0.5)';
    ctx.fillRect(x + 3, y + 5 + ((n2 * 12) | 0), 16, 3);
    if (n > 0.82) ctx.fillRect(x + 18, y + 18, 7, 2);
  } else if (motif === 'mire' && n > 0.62) {
    ctx.fillStyle = '#4a6a38';
    ctx.fillRect(x + 6, y + 8, 1, 12);
    ctx.fillRect(x + 18, y + 12, 1, 10);
    ctx.fillRect(x + 5, y + 8, 3, 1);
  } else if (motif === 'dune' && n > 0.4) {
    ctx.fillStyle = 'rgba(226,196,138,0.35)';
    ctx.fillRect(x + 2, y + 8, 28, 1);
    ctx.fillRect(x + 2, y + 18, 28, 1);
  } else if (motif === 'thicket' && n > 0.58) {
    ctx.strokeStyle = '#3d6a30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 26);
    ctx.lineTo(x + 12, y + 12);
    ctx.lineTo(x + 22, y + 20);
    ctx.stroke();
  } else if (motif === 'crystal' && n > 0.6) {
    ctx.strokeStyle = 'rgba(220,216,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x + 24, y + 16);
    ctx.lineTo(x + 10, y + 26);
    ctx.stroke();
  } else if (motif === 'tide' && n > 0.35) {
    ctx.fillStyle = 'rgba(126,200,196,0.28)';
    ctx.fillRect(x, y + 10, TILE, 1);
    ctx.fillRect(x, y + 20, TILE, 1);
  }
  if (lair && n > 0.8) {
    ctx.fillStyle = theme?.bone || '#cbb89a';
    ctx.fillRect(x + 10, y + 20, 9, 2);
    ctx.fillRect(x + 18, y + 16, 2, 7);
  }
  if (theme?.drift && n2 < 0.18) {
    const speed = theme.driftSpeed || 8;
    const ox = (hash2(c, r) * 24 + time * speed) % TILE;
    const oy = (hash2(r, c) * 20 + time * speed * 0.4) % TILE;
    ctx.fillStyle = theme.drift;
    ctx.fillRect(x + ox, y + oy, 2, 2);
  }
}

function drawFog(ctx, game) {
  if (!fogActive(game) || !game.vis || (game.fogIn ?? 1) <= 0) return;
  const rgb = game.theme?.fog || '5,4,3';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const alpha = fogAlpha(game, c, r);
      if (alpha <= 0.01) continue;
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }
}

function drawTiles(ctx, game) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (wingTurning(game, c, r)) {
        ctx.fillStyle = '#070605';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        continue;
      }
      drawMazeCell(ctx, game, c, r);
    }
  }
}

function drawTurningWings(ctx, game) {
  for (const turn of game.turns || []) {
    const reg = turn.region;
    const x = reg.x * TILE;
    const y = reg.y * TILE;
    const w = reg.w * TILE;
    const h = reg.h * TILE;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(turn.angle || 0);
    ctx.translate(-cx, -cy);
    for (let r = reg.y; r < reg.y + reg.h; r++) {
      for (let c = reg.x; c < reg.x + reg.w; c++) drawMazeCell(ctx, game, c, r);
    }
    ctx.restore();
    ctx.strokeStyle = rgba(reg.color, 0.7);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
}

function drawHighlights(ctx, game, cam) {
  for (const sw of game.switches) {
    const show = sw.litByHuman || sw.flash > 0 || (sw.telegraph > 0 && lit(game, sw.x, sw.y));
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

function lit(game, x, y) {
  return spotLit(game, x, y);
}

function heardHere(game, x, y) {
  const ears = game.players.filter((p) => p.alive && !p.bot);
  const who = ears.length ? ears : game.players.filter((p) => p.alive);
  return who.some((p) => Math.hypot(p.x - x, p.y - y) <= 280);
}

function drawSprites(ctx, game) {
  const sprites = [];
  for (const chest of game.chests) {
    if (!lit(game, chest.x, chest.y)) continue;
    sprites.push({ y: chest.y, draw: () => drawChest(ctx, chest, game.time) });
  }
  for (const k of game.pickups) {
    if (!lit(game, k.x, k.y)) continue;
    sprites.push({ y: k.y, draw: () => drawPickup(ctx, k, game.time) });
  }
  if (game.sword && game.sword.held == null && lit(game, game.sword.x, game.sword.y)) {
    sprites.push({ y: game.sword.y, draw: () => drawChargedSword(ctx, game.sword, game.time) });
  }
  for (const gate of game.gates || []) {
    if (!lit(game, gate.x, gate.y) && !tileKnown(game, gate.c, gate.r)) continue;
    sprites.push({ y: gate.y, draw: () => drawGate(ctx, gate, game.time, game.gateCd) });
  }
  for (const door of game.doors || []) {
    if (!lit(game, door.x, door.y) && !tileKnown(game, door.c, door.r)) continue;
    sprites.push({ y: door.y, draw: () => drawDoor(ctx, door) });
  }
  for (const sw of game.switches) {
    if (!lit(game, sw.x, sw.y) && !tileKnown(game, sw.c, sw.r)) continue;
    sprites.push({ y: sw.y, draw: () => drawSwitch(ctx, sw, game.time) });
  }
  for (const g of game.goblins) {
    if (!lit(game, g.x, g.y)) continue;
    sprites.push({ y: g.y, draw: () => drawGoblin(ctx, g, game.time) });
  }
  for (const cult of game.cultists || []) {
    if (!lit(game, cult.x, cult.y)) continue;
    sprites.push({ y: cult.y, draw: () => drawCultist(ctx, cult, game.time) });
  }
  for (const p of game.players) {
    if (p.bot && !lit(game, p.x, p.y)) continue;
    sprites.push({ y: p.y, draw: () => drawHunter(ctx, p, game.time) });
  }
  if (game.minotaur && lit(game, game.minotaur.x, game.minotaur.y)) {
    sprites.push({ y: game.minotaur.y, draw: () => drawMinotaur(ctx, game.minotaur, game.time) });
  }
  sprites.sort((a, b) => a.y - b.y);
  for (const sprite of sprites) sprite.draw();
  for (const p of game.players) {
    if (p.bot && !lit(game, p.x, p.y)) continue;
    drawSwing(ctx, p);
  }
  drawBolts(ctx, game);
  drawFlames(ctx, game);
}

function drawChargedSword(ctx, sword, time) {
  const bob = Math.sin(time * 3) * 3;
  ctx.fillStyle = 'rgba(255, 211, 106, 0.18)';
  ctx.beginPath();
  ctx.arc(sword.x, sword.y + bob, 16 + Math.sin(time * 4) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  blit(ctx, propCanvas('sword'), sword.x, sword.y + bob);
  ctx.fillStyle = '#ffd36a';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(sword.charges || 0), sword.x, sword.y - 22);
}

function drawGate(ctx, gate, time, cd) {
  const ready = !(cd > 0);
  blit(ctx, propCanvas(ready ? 'gate' : 'gate-sleep'), gate.x, gate.y + Math.sin(time * (ready ? 2 : 0)) * 0.4);
  if (!ready) {
    ctx.fillStyle = '#9fd8cf';
    ctx.font = '700 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.ceil(cd)), gate.x, gate.y - 16);
  }
}

function drawChest(ctx, chest, time) {
  const bob = chest.open ? 0 : Math.sin(time * 3 + chest.x) * 0.6;
  shadow(ctx, chest.x, chest.y + 8, 10, 4);
  blit(ctx, propCanvas(chest.open ? 'chest-open' : 'chest'), chest.x, chest.y + bob);
}

function drawPickup(ctx, k, time) {
  const bob = Math.sin(time * 5 + k.x) * 2;
  if (k.kind === 'charge') {
    const pulse = 0.28 + Math.sin(time * 6) * 0.18;
    ctx.strokeStyle = `rgba(255, 211, 106, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(k.x, k.y + bob, 11 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  blit(ctx, propCanvas(k.kind || 'heal'), k.x, k.y + bob);
}

function drawDoor(ctx, door) {
  const leaf = door.leaf || 0;
  ctx.save();
  ctx.translate(door.x, door.y);
  if (door.axis === 'v') ctx.rotate(Math.PI / 2);
  ctx.rotate(leaf * 1.25);
  ctx.fillStyle = '#24180f';
  ctx.fillRect(-4, -15, 8, 30);
  ctx.fillStyle = leaf > 0.8 ? '#5a4630' : '#6e5130';
  ctx.fillRect(-3, -14, 6, 28);
  ctx.fillStyle = '#d7c091';
  ctx.fillRect(-1, 4, 2, 3);
  ctx.restore();
}

function drawCallout(ctx, game, view) {
  const call = game.callout;
  if (!call || call.life <= 0) return;
  const shown = (call.max || 2.6) - call.life;
  const alpha = Math.max(0, Math.min(1, shown / 0.18, call.life / 0.4));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = '700 42px Georgia, Palatino, serif';
  ctx.fillStyle = '#1a1208';
  ctx.fillText(call.text, view.w / 2 + 2, view.h * 0.46 + 2);
  ctx.fillStyle = '#ffd36a';
  ctx.fillText(call.text, view.w / 2, view.h * 0.46);
  ctx.restore();
}

function drawSwitch(ctx, sw, time) {
  const pulse = sw.lit || sw.telegraph > 0 ? 0.45 + Math.sin(time * 7) * 0.25 : 0.16;
  ctx.fillStyle = rgba(sw.region.color, pulse);
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.lit || sw.telegraph > 0 ? 15 : 11, 0, Math.PI * 2);
  ctx.fill();
  blit(ctx, propCanvas(sw.cd > 0 ? 'lever-down' : 'lever'), sw.x, sw.y);
}

function drawGoblin(ctx, g, time) {
  if (!g.alive) return;
  const bob = Math.sin(time * 8 + g.x) * 1;
  const windup = g.strike === 'windup';
  const dir = facingDir(g.fx, g.fy);
  let frame = 'idle';
  if (g.guard > 0) frame = 'guard';
  else if (windup) frame = 'windup';
  else if (g.strike === 'lunge' || Math.floor(time * 4 + g.x) % 2 === 1) frame = 'walk';
  shadow(ctx, g.x, g.y + 10, 8, 3);
  ctx.save();
  ctx.globalAlpha = g.stun > 0 ? 0.7 : 1;
  blit(ctx, monsterCanvas('goblin', dir, frame), g.x, g.y + bob, { flip: dir === 'w' });
  ctx.restore();
  if (windup) {
    const pulse = 0.45 + Math.sin(time * 22) * 0.4;
    ctx.strokeStyle = `rgba(255, 70, 54, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.x + (g.fx || 1) * 10, g.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff5a4a';
    ctx.font = '700 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', g.x, g.y - 20);
  }
  if (g.burn > 0) {
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(g.x + 4, g.y - 14, 2, 3);
    ctx.fillRect(g.x + 7, g.y - 12, 2, 2);
  }
}

function drawHunter(ctx, p, time) {
  const fallen = !p.alive;
  const blink = p.invuln > 0 && Math.sin(time * 28) > 0;
  const id = p.class?.id || 'knight';
  if (Math.abs(p.fx) > 0.2) p.faceSign = Math.sign(p.fx);
  const moving = p.gait !== p.drawnGait;
  p.drawnGait = p.gait;
  const step = Math.floor(((moving ? p.gait : time * 2.4) || 0) / 1.7) % 4;
  let frame = moving ? `run_${step}` : `idle_${Math.floor(time * 3) % 4}`;
  if (p.swing && p.swing.age < p.swing.duration * 0.7) frame = 'hit';
  if (id === 'knight' && p.blocking) frame = 'idle_0';
  const dir = (p.faceSign || 1) < 0 ? 'w' : 'e';
  const sprite = hunterCanvas(id, p.color, dir, frame);
  shadow(ctx, p.x, p.y + 12, 8, 3);
  ctx.save();
  ctx.globalAlpha = fallen ? 0.4 : blink ? 0.45 : 1;
  const feet = sprite ? 14 - sprite.height / 2 : 0;
  blit(ctx, sprite, p.x, p.y + (fallen ? 4 : 0), { flip: dir === 'w', oy: feet });
  ctx.restore();
  if (p.bearing) {
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 14, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.buffs?.fire > 0) {
    ctx.strokeStyle = '#ff8a3a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.burn > 0) {
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(p.x + 6, p.y - 16 + Math.sin(time * 12), 2, 3);
  }
  if (!fallen && p.staminaMax) {
    const ratio = Math.max(0, Math.min(1, p.stamina / p.staminaMax));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - 11, p.y + 16, 22, 3);
    ctx.fillStyle = ratio < 0.25 ? '#e23d3d' : '#d7c48a';
    ctx.fillRect(p.x - 11, p.y + 16, 22 * ratio, 3);
  }
}

function drawMinotaur(ctx, m, time) {
  const dead = m.hp <= 0;
  const bob = dead ? 0 : Math.sin(time * (m.state === 'charge' ? 18 : 6)) * 1.2;
  const dir = facingDir(m.fx, m.fy);
  const frame = m.state === 'charge' ? 'charge' : 'idle';
  if (m.state === 'charge') {
    ctx.strokeStyle = 'rgba(224, 90, 80, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x - (m.dx || m.fx || 0) * 18, m.y - (m.dy || m.fy || 0) * 18);
    ctx.lineTo(m.x - (m.dx || m.fx || 0) * 36, m.y - (m.dy || m.fy || 0) * 36);
    ctx.stroke();
  }
  shadow(ctx, m.x, m.y + 14, 14, 5);
  ctx.save();
  ctx.globalAlpha = dead ? 0.55 : 1;
  blit(ctx, monsterCanvas('minotaur', dir, frame), m.x, m.y + bob + (dead ? 4 : 0), { flip: dir === 'w' });
  ctx.restore();
  if (m.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(255, 80, 60, 0.35)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.stun > 0) {
    ctx.fillStyle = '#d5e6ff';
    ctx.font = '700 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('…', m.x, m.y - 24);
  }
}

function drawCultist(ctx, cult, time) {
  if (!cult.alive) return;
  const wind = cult.cast === 'windup';
  const dir = facingDir(cult.fx, cult.fy);
  const frame = wind ? 'windup' : (Math.floor(time * 3 + cult.x) % 2 === 1 ? 'walk' : 'idle');
  shadow(ctx, cult.x, cult.y + 10, 8, 3);
  blit(ctx, monsterCanvas('cultist', dir, frame), cult.x, cult.y, { flip: dir === 'w' });
  if (wind) {
    const pulse = 0.4 + Math.sin(time * 18) * 0.35;
    ctx.strokeStyle = `rgba(255, 90, 40, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cult.x + (cult.fx || 1) * 12, cult.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff6a2a';
    ctx.font = '700 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', cult.x, cult.y - 20);
  }
  if (cult.burn > 0) {
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(cult.x + 4, cult.y - 16, 2, 3);
  }
}

function drawFlames(ctx, game) {
  for (const flame of game.flames || []) {
    if (!lit(game, flame.x, flame.y)) continue;
    const ang = Math.atan2(flame.vy, flame.vx);
    const img = propCanvas('flame');
    ctx.save();
    ctx.translate(flame.x, flame.y);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

function drawBolts(ctx, game) {
  for (const b of game.bolts || []) {
    if (!lit(game, b.x, b.y)) continue;
    const ang = Math.atan2(b.vy, b.vx);
    const img = propCanvas(b.pierce ? 'bolt' : 'arrow');
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    const s = b.charged ? 1.35 : 1;
    ctx.drawImage(img, -img.width / 2 * s, -img.height / 2, img.width * s, img.height);
    ctx.restore();
  }
}

function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function stepFrame(gait) {
  return Math.floor((gait || 0) / 0.55) % 2 === 1 ? 'walk' : 'idle';
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
    if (!lit(game, p.x, p.y)) continue;
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
    if (p.bot && !lit(game, p.x, p.y)) continue;
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
  if (game.minotaur && lit(game, game.minotaur.x, game.minotaur.y)) {
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
    if (!sw.litByHuman && sw.flash <= 0 && !(sw.telegraph > 0 && lit(game, sw.x, sw.y))) continue;
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
    if (!lit(game, t.x, t.y)) continue;
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
  ctx.strokeStyle = game.theme?.mapFrame || '#6a5428';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y - 6, mw + 12, mh + 22);
  const tw = mw / COLS;
  const th = mh / ROWS;
  const fog = fogActive(game);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r][c] !== 0) continue;
      if (fog && !tileKnown(game, c, r)) continue;
      const live = !fog || (game.vis && game.vis[r * COLS + c]);
      const theme = game.theme;
      ctx.fillStyle = live
        ? (inLair(c, r) ? (theme?.mapLair || '#6a3530') : (theme?.mapFloor || '#3a332b'))
        : (theme?.mapDim || '#1a1612');
      ctx.fillRect(x + c * tw, y + r * th, tw + 0.4, th + 0.4);
    }
  }
  for (const sw of game.switches) {
    if (fog && !tileKnown(game, sw.c, sw.r) && !lit(game, sw.x, sw.y)) continue;
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
    if (chest.open || !lit(game, chest.x, chest.y)) continue;
    ctx.fillStyle = '#e2b657';
    ctx.fillRect(x + chest.c * tw, y + chest.r * th, 2, 2);
  }
  if (game.sword && game.sword.held == null && (game.sword.dropped || lit(game, game.sword.x, game.sword.y))) {
    const sx = x + (game.sword.x / TILE) * tw;
    const sy = y + (game.sword.y / TILE) * th;
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
  }
  for (const k of game.pickups) {
    if (k.kind !== 'charge' || !(k.mapT > 0)) continue;
    const fade = Math.min(1, k.mapT / 1.3);
    const pulse = 0.45 + Math.sin(game.time * 6) * 0.35;
    const sx = x + (k.x / TILE) * tw;
    const sy = y + (k.y / TILE) * th;
    ctx.globalAlpha = fade * pulse;
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
    ctx.globalAlpha = 1;
  }
  for (const door of game.doors || []) {
    if (!(door.ping > 0) || !heardHere(game, door.x, door.y)) continue;
    const sx = x + (door.x / TILE) * tw;
    const sy = y + (door.y / TILE) * th;
    const pulse = 0.45 + Math.sin(game.time * 10) * 0.4;
    ctx.strokeStyle = `rgba(214, 186, 120, ${pulse})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 2.5, sy - 2.5, 5, 5);
  }
  ctx.fillStyle = '#7ee0d2';
  for (const gate of game.gates || []) {
    if (fog && !tileKnown(game, gate.c, gate.r)) continue;
    ctx.fillRect(x + gate.c * tw, y + gate.r * th, 3, 3);
  }
  const horn = game.minotaur;
  if (horn && horn.hp > 0 && (lit(game, horn.x, horn.y) || (horn.reveal || 0) > 0)) {
    const hx = x + (horn.x / TILE) * tw;
    const hy = y + (horn.y / TILE) * th;
    ctx.fillStyle = '#e06a62';
    ctx.beginPath();
    ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of game.players) {
    if (!markOnMap(game, p)) continue;
    const px = x + (p.x / TILE) * tw;
    const py = y + (p.y / TILE) * th;
    if (game.sword && game.sword.held === p.index) {
      ctx.strokeStyle = '#ffd36a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 5.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(px, py, p.reveal > 0 && p.bot ? 3.4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#d7b15a';
  ctx.font = '11px Georgia, Palatino, serif';
  ctx.textAlign = 'left';
  ctx.fillText(game.theme?.short || 'Maze', x, y + mh + 12);
}

function drawPointers(ctx, game, view, cam) {
  const marks = [];
  if (game.sword && game.sword.held == null && lit(game, game.sword.x, game.sword.y)) {
    marks.push({ x: game.sword.x, y: game.sword.y, color: '#ffd36a', label: 'Sword' });
  }
  if (game.minotaur.hp > 0 && lit(game, game.minotaur.x, game.minotaur.y)) {
    marks.push({ x: game.minotaur.x, y: game.minotaur.y, color: '#e06a62', label: 'Minotaur' });
  }
  for (const p of game.players) {
    if (!markOnMap(game, p)) continue;
    if (p.bot && !lit(game, p.x, p.y)) continue;
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
