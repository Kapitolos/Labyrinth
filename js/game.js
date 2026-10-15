import {
  COLS, ROWS, TILE, FLOOR, DIRS,
  PLAYER_SPEED, PLAYER_RADIUS,
  GOBLIN_SPEED, GOBLIN_RADIUS, GOBLIN_HP,
  MINO_SPEED, MINO_CHARGE_SPEED, MINO_RADIUS, MINO_HP, MINO_TOUCH, MINO_RAM,
  LEVER_SIGHT, LEVER_USE, LEVER_COOLDOWN,
  SWORD_CHARGES, GATE_COOLDOWN,
  NORMAL_RANGE, CHARGED_RANGE, NORMAL_CONE, CHARGED_CONE,
  BOT_NAMES, HUNTER_NAMES, HUNTER_COLORS, KEYBINDS,
  CLASSES, CLASS_ORDER,
  tileCenter, tileOf,
} from './config.js';
import {
  generateMaze, defineRegions, spawnTiles, lairCenter, inLair,
  scrambleRegion, isFloor, nearestFloorTile, pointInRegion,
} from './maze.js';
import { flood, shortestStep, lineOfSight } from './path.js';

function classFor(index, classIds) {
  const id = classIds && classIds[index];
  if (id && CLASSES[id]) return CLASSES[id];
  return CLASSES[CLASS_ORDER[index % CLASS_ORDER.length]];
}

export function createMatch(humanCount, rng = Math.random, classIds = null) {
  const humans = Math.max(0, Math.min(4, humanCount | 0));
  const grid = generateMaze(rng);
  const regions = defineRegions();
  const switches = placeSwitches(grid, regions, rng);
  const blocked = new Set(switches.map((sw) => `${sw.c},${sw.r}`));
  for (const [c, r] of spawnTiles()) blocked.add(`${c},${r}`);
  const [lc, lr] = lairCenter();
  const chests = placeChests(grid, rng, blocked);
  for (const chest of chests) blocked.add(`${chest.c},${chest.r}`);
  const goblins = [];
  const game = {
    rng,
    grid,
    humanCount: humans,
    players: [],
    minotaur: null,
    switches,
    chests,
    goblins,
    pickups: [],
    bolts: [],
    particles: [],
    texts: [],
    toasts: [],
    fx: [],
    phase: 'play',
    winner: null,
    time: 0,
    shake: 0,
    flash: 0,
    banner: 'Three charges. Then take them from someone else',
    bannerT: 3.6,
    nextId: 1,
    spawnT: 16,
    pityT: 4,
  };

  const spawns = spawnTiles();
  let botN = 0;
  const cx = (COLS * TILE) / 2;
  const cy = (ROWS * TILE) / 2;
  for (let i = 0; i < 4; i++) {
    const human = i < humans;
    const [sc, sr] = spawns[i];
    const [x, y] = tileCenter(sc, sr);
    const cls = classFor(i, classIds);
    let fx = cx - x;
    let fy = cy - y;
    const fl = Math.hypot(fx, fy) || 1;
    fx /= fl;
    fy /= fl;
    game.players.push({
      index: i,
      name: human ? (humans === 1 && i === 0 ? 'You' : HUNTER_NAMES[i]) : BOT_NAMES[botN++],
      color: HUNTER_COLORS[i],
      bot: !human,
      bind: KEYBINDS[i],
      x, y, fx, fy,
      spawnC: sc,
      spawnR: sr,
      class: cls,
      hp: cls.hp,
      maxHp: cls.hp,
      stamina: cls.stamina ?? 100,
      staminaMax: cls.stamina ?? 100,
      staminaCd: 0,
      blocking: false,
      blockAge: 0,
      charges: 0,
      score: 0,
      bearing: false,
      buffs: { fire: 0, spread: 0, boon: 0 },
      burn: 0,
      poison: 0,
      slow: 0,
      radius: PLAYER_RADIUS,
      alive: true,
      respawn: 0,
      invuln: 1.1,
      hurtCd: 0,
      stun: 0,
      swing: null,
      attackCd: 0,
      kbx: 0,
      kby: 0,
      goblinsSlain: 0,
      huntersSlain: 0,
      chargesSpent: 0,
      bossHits: 0,
      levers: 0,
      prevX: x,
      prevY: y,
      wasMoving: false,
      stuckT: 0,
      pathT: 0,
      goal: null,
      lockSwitch: null,
      lockChoice: false,
      leverTimer: 0,
      telegraphSwitchId: null,
      visited: new Set(),
    });
  }

  const [sx, sy] = tileCenter(lc, lr);
  game.sword = { x: sx, y: sy, c: lc, r: lr, held: null, radius: 8, charges: SWORD_CHARGES };
  game.gates = placeGates(grid);
  game.gateCd = 0;
  const [mx, my] = tileCenter(lc, lr + 1);
  game.minotaur = {
    x: mx,
    y: my,
    fx: 1,
    fy: 0,
    dx: 1,
    dy: 0,
    hp: MINO_HP,
    maxHp: MINO_HP,
    radius: MINO_RADIUS,
    state: 'chase',
    stateT: 0,
    cd: 1.4,
    think: 0.3,
    target: 0,
    step: null,
    stun: 0,
    kbx: 0,
    kby: 0,
    hurtFlash: 0,
  };

  const avoid = spawns.map(([c, r]) => [c, r]);
  avoid.push([lc, lr]);
  for (const sw of switches) avoid.push([sw.c, sw.r]);
  for (const chest of chests) avoid.push([chest.c, chest.r]);
  for (const gate of game.gates) avoid.push([gate.c, gate.r]);
  for (let n = 0; n < 7; n++) {
    const spot = findSpot(grid, rng, avoid, 4, (c, r) => !inLair(c, r));
    if (!spot) break;
    avoid.push(spot);
    game.goblins.push(makeGoblin(game, spot[0], spot[1]));
  }

  return game;
}

function placeSwitches(grid, regions, rng) {
  const used = new Set();
  return regions.map((region) => {
    const spot = leverSpot(grid, region, regions, rng, used);
    used.add(`${spot[0]},${spot[1]}`);
    const [x, y] = tileCenter(spot[0], spot[1]);
    return {
      id: region.id,
      c: spot[0],
      r: spot[1],
      x,
      y,
      region,
      cd: 0,
      flash: 0,
      lit: false,
      litByHuman: false,
      near: [],
      telegraph: 0,
      telegraphName: '',
    };
  });
}

function insideAnyRegion(c, r, regions) {
  return regions.some((region) => (
    c >= region.x && r >= region.y && c < region.x + region.w && r < region.y + region.h
  ));
}

// Levers stand just outside the wing they rebuild, so a hunter can read
// who is inside — and whether the Minotaur is with them — before throwing.
function leverSpot(grid, region, regions, rng, used) {
  const goal = region.id === 'west'
    ? [region.x - 1, region.y + (region.h >> 1)]
    : region.id === 'east'
      ? [region.x + region.w, region.y + (region.h >> 1)]
      : [region.x + (region.w >> 1), region.y - 1];
  const candidates = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!isFloor(grid, c, r) || used.has(`${c},${r}`)) continue;
      if (insideAnyRegion(c, r, regions)) continue;
      let touches = false;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc >= region.x && nr >= region.y && nc < region.x + region.w && nr < region.y + region.h) {
          touches = true;
        }
      }
      if (!touches) continue;
      candidates.push([c, r]);
    }
  }
  candidates.sort((a, b) => (
    Math.abs(a[0] - goal[0]) + Math.abs(a[1] - goal[1])
    - (Math.abs(b[0] - goal[0]) + Math.abs(b[1] - goal[1]))
  ));
  const pool = candidates.slice(0, Math.min(5, candidates.length));
  if (pool.length) return pool[(rng() * pool.length) | 0];

  let best = null;
  let bestD = Infinity;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!isFloor(grid, c, r) || used.has(`${c},${r}`)) continue;
      if (insideAnyRegion(c, r, regions)) continue;
      const d = Math.abs(c - goal[0]) + Math.abs(r - goal[1]);
      if (d < bestD) {
        bestD = d;
        best = [c, r];
      }
    }
  }
  return best || [2, 2];
}

function placeChests(grid, rng, blocked) {
  const dead = [];
  const other = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] !== FLOOR || blocked.has(`${c},${r}`) || inLair(c, r)) continue;
      let n = 0;
      for (const [dc, dr] of DIRS) if (isFloor(grid, c + dc, r + dr)) n++;
      if (n <= 1) dead.push([c, r]);
      else other.push([c, r]);
    }
  }
  const order = shuffle(dead, rng).concat(shuffle(other, rng));
  const chests = [];
  const placed = [];
  for (const [c, r] of order) {
    if (chests.length >= 6) break;
    if (placed.some(([pc, pr]) => Math.abs(pc - c) + Math.abs(pr - r) < 6)) continue;
    if ([...blocked].some((key) => {
      const [bc, br] = key.split(',').map(Number);
      return Math.abs(bc - c) + Math.abs(br - r) < 3;
    })) continue;
    const [x, y] = tileCenter(c, r);
    chests.push({ c, r, x, y, open: false });
    placed.push([c, r]);
  }
  return chests;
}

function placeGates(grid) {
  const west = gateSpot(grid, 2, 7);
  const east = gateSpot(grid, COLS - 8, COLS - 3);
  if (!west || !east) return [];
  return [west, east].map((spot, i) => {
    const [x, y] = tileCenter(spot[0], spot[1]);
    return { id: i, c: spot[0], r: spot[1], x, y, radius: 10 };
  });
}

function gateSpot(grid, c0, c1) {
  let best = null;
  let bestRow = Infinity;
  const mid = (ROWS / 2) | 0;
  for (let r = 2; r < ROWS - 2; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isFloor(grid, c, r)) continue;
      const score = Math.abs(r - mid);
      if (score < bestRow) {
        bestRow = score;
        best = [c, r];
      }
    }
  }
  return best;
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

function findSpot(grid, rng, avoid, minDist, extra) {
  const floors = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] !== FLOOR) continue;
      if (extra && !extra(c, r)) continue;
      let ok = true;
      for (const [ac, ar] of avoid) {
        if (Math.abs(ac - c) + Math.abs(ar - r) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) floors.push([c, r]);
    }
  }
  if (!floors.length) return null;
  return floors[(rng() * floors.length) | 0];
}

function makeGoblin(game, c, r) {
  const [x, y] = tileCenter(c, r);
  return {
    id: `g${game.nextId++}`,
    x, y,
    fx: 1,
    fy: 0,
    hp: GOBLIN_HP,
    radius: GOBLIN_RADIUS,
    alive: true,
    stun: 0,
    kbx: 0,
    kby: 0,
    think: game.rng() * 0.5,
    step: null,
    guard: 0,
    guardAge: 0,
    guardCd: 0.4 + game.rng() * 0.4,
    strike: null,
    strikeT: 0,
    strikeCd: 0.55 + game.rng() * 0.45,
    strikeWho: -1,
    struck: false,
    lx: 1,
    ly: 0,
    burn: 0,
    slow: 0,
  };
}

export function occupantsOf(game, region) {
  return {
    players: game.players.filter((p) => p.alive && pointInRegion(p.x, p.y, region)),
    minotaur: game.minotaur.hp > 0 && pointInRegion(game.minotaur.x, game.minotaur.y, region),
  };
}

export function leverReadout(game) {
  const lines = [];
  const humans = game.players.filter((p) => !p.bot && p.alive);
  const used = new Set();
  for (const p of humans) {
    let best = null;
    let bestD = LEVER_SIGHT;
    for (const sw of game.switches) {
      const d = Math.hypot(p.x - sw.x, p.y - sw.y);
      if (d <= bestD) {
        best = sw;
        bestD = d;
      }
    }
    if (!best) continue;
    used.add(best.id);
    let action;
    if (best.cd > 0) action = `Jammed for ${Math.ceil(best.cd)}s.`;
    else if (bestD > LEVER_USE) action = 'Step closer to throw it.';
    else action = `${p.bind.useName} — scramble this wing.`;
    const who = game.humanCount > 1 ? `${p.name}: ` : '';
    lines.push(`${who}${best.region.name}. ${describeWing(game, best, p)} ${action}`);
  }
  for (const sw of game.switches) {
    if (sw.telegraph <= 0 || used.has(sw.id)) continue;
    lines.push(`${sw.telegraphName} is throwing the ${sw.region.name}. ${describeWing(game, sw, null)}`);
  }
  for (const p of humans) {
    for (const gate of game.gates || []) {
      if (Math.hypot(p.x - gate.x, p.y - gate.y) > 72) continue;
      const who = game.humanCount > 1 ? `${p.name}: ` : '';
      lines.push(game.gateCd > 0
        ? `${who}The far pad sleeps for ${Math.ceil(game.gateCd)}s.`
        : `${who}${p.bind.useName} — step to the other end of the maze.`);
      break;
    }
  }
  if (!lines.length) return { show: false, title: '', lines: [] };
  return {
    show: true,
    title: lines.length > 1 ? 'Wings in reach' : 'Wing in reach',
    lines,
  };
}

function describeWing(game, sw, actor) {
  const occ = occupantsOf(game, sw.region);
  const people = occ.players.map((p) => (
    actor && p === actor ? `${p.name} (at the lever)` : p.name
  ));
  if (occ.minotaur) people.push('the Minotaur');
  let text = people.length ? `Inside: ${people.join(', ')}.` : 'Nobody is inside.';
  const others = actor ? occ.players.filter((p) => p !== actor) : occ.players;
  if (occ.minotaur && others.length) text += ' Someone in there is already in danger.';
  else if (actor && occ.minotaur && occ.players.includes(actor)) {
    text += ' Scrambling catches you with the beast.';
  }
  return text;
}

export function pushToast(game, text) {
  game.toasts.push({ text, life: 3.5 });
  if (game.toasts.length > 4) game.toasts.shift();
}

export function updateMatch(game, intents, dt) {
  const step = Math.min(Math.max(dt, 0), 0.05);
  decayVisuals(game, step);
  if (game.phase !== 'play') return;
  game.time += step;
  for (const sw of game.switches) sw.cd = Math.max(0, sw.cd - step);
  game.gateCd = Math.max(0, (game.gateCd || 0) - step);

  for (let i = 0; i < game.players.length; i++) {
    const intent = intents[i] || { mx: 0, my: 0, attack: false, charge: false, use: false };
    updatePlayer(game, game.players[i], intent, step);
    if (game.phase !== 'play') break;
  }
    if (game.phase === 'play') {
    updateBolts(game, step);
    syncSword(game);
  }
  if (game.phase === 'play') {
    updateGoblins(game, step);
    updateMinotaur(game, step);
    collect(game);
    separateAll(game);
    maybeSpawn(game, step);
  }
  refreshLevers(game);
}

function decayVisuals(game, step) {
  game.shake = Math.max(0, game.shake - step * 1.5);
  game.flash = Math.max(0, game.flash - step * 1.25);
  game.bannerT -= step;
  for (const sw of game.switches) sw.flash = Math.max(0, sw.flash - step);
  for (const t of game.toasts) t.life -= step;
  game.toasts = game.toasts.filter((t) => t.life > 0);
  for (const t of game.texts) {
    t.life -= step;
    t.y -= 20 * step;
  }
  game.texts = game.texts.filter((t) => t.life > 0);
  for (const p of game.particles) {
    p.life -= step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += 28 * step;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function refreshLevers(game) {
  for (const sw of game.switches) {
    sw.lit = false;
    sw.litByHuman = false;
    sw.near = [];
    for (const p of game.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - sw.x, p.y - sw.y);
      if (d > LEVER_SIGHT) continue;
      sw.lit = true;
      sw.near.push(p);
      if (!p.bot) sw.litByHuman = true;
    }
  }
}

function updatePlayer(game, p, intent, dt) {
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  if (p.buffs) {
    p.buffs.fire = Math.max(0, p.buffs.fire - dt);
    p.buffs.spread = Math.max(0, p.buffs.spread - dt);
    p.buffs.boon = Math.max(0, p.buffs.boon - dt);
  }
  p.slow = Math.max(0, (p.slow || 0) - dt);
  if (p.alive) {
    tickDot(game, p, 'burn', dt, 5, p.burner);
    tickDot(game, p, 'poison', dt, 4, p.poisoner);
  }
  p.stun = Math.max(0, p.stun - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.staminaCd = Math.max(0, (p.staminaCd || 0) - dt);

  if (!p.alive) {
    p.respawn -= dt;
    if (p.respawn <= 0) respawn(game, p);
    return;
  }

  if (p.stun > 0) {
    if (p.swing) cancelSwing(p);
    p.blocking = false;
    p.blockAge = 0;
  } else {
    if (intent.use && !intent.block) tryUse(game, p);
    let mx = intent.mx || 0;
    let my = intent.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const knight = p.class?.id === 'knight';
    const raise = Boolean(intent.block) && knight && !p.swing;
    if (raise) {
      if (!p.blocking) p.blockAge = 0;
      p.blocking = true;
      p.blockAge += dt;
    } else {
      p.blocking = false;
      p.blockAge = 0;
    }
    if ((mx || my) && !p.swing) {
      p.fx = mx;
      p.fy = my;
    }
    if (!p.blocking) {
      if (intent.charge) startSwing(game, p, 'charged');
      else if (intent.attack) startSwing(game, p, 'normal');
    }
    const running = Boolean(intent.sprint) && (mx || my) && !p.blocking && !p.swing && p.stamina > 0;
    if (running) p.stamina = Math.max(0, p.stamina - 42 * dt);
    else if (!p.blocking && p.staminaCd <= 0) {
      const regen = p.class?.staminaRegen ?? 20;
      p.stamina = Math.min(p.staminaMax || 100, p.stamina + regen * dt);
    }
    let speed = p.class?.speed || PLAYER_SPEED;
    speed *= running ? 1.08 : 0.68;
    if (p.slow > 0) speed *= 0.55;
    if (p.blocking) speed *= 0.34;
    if (p.swing?.kind === 'charged') speed *= p.class?.chargedMove ?? 0.28;
    else if (p.swing) speed *= p.class?.normalMove ?? 0.55;
    tryMove(game.grid, p, mx * speed * dt, my * speed * dt);
  }

  tryMove(game.grid, p, p.kbx * dt, p.kby * dt);
  p.kbx *= Math.exp(-7 * dt);
  p.kby *= Math.exp(-7 * dt);

  if (p.swing) {
    p.swing.age += dt;
    resolveSwing(game, p);
    if (p.swing && p.swing.age >= p.swing.duration) p.swing = null;
  }
}

function respawn(game, p) {
  const [x, y] = tileCenter(p.spawnC, p.spawnR);
  p.x = x;
  p.y = y;
  p.alive = true;
  p.hp = Math.round(p.maxHp * 0.62);
  p.invuln = 2.2;
  p.stun = 0;
  p.kbx = 0;
  p.kby = 0;
  p.swing = null;
  p.blocking = false;
  p.blockAge = 0;
  p.stamina = p.staminaMax || p.class?.stamina || 100;
  p.staminaCd = 0;
  burst(game, x, y, p.color, 12, 80);
  floatText(game, x, y - 18, 'Returned', '#efe6d6');
  game.fx.push('glint');
}

function startSwing(game, p, kind) {
  if (p.swing || p.attackCd > 0 || p.stun > 0 || !p.alive) return;
  const bearing = game.sword && game.sword.held === p.index;
  if (kind === 'charged' && !bearing) {
    if (!p.bot) floatText(game, p.x, p.y - 18, 'No sword', '#e7d7a4');
    return;
  }
  if (kind === 'charged' && p.charges <= 0) {
    if (!p.bot) floatText(game, p.x, p.y - 18, 'No charges', '#e7d7a4');
    return;
  }
  const charged = kind === 'charged';
  const cls = p.class;
  const cost = charged ? (cls?.chargedStamina ?? 34) : (cls?.normalStamina ?? 18);
  if ((p.stamina ?? 0) < cost) {
    if (!p.bot) floatText(game, p.x, p.y - 18, 'Winded', '#d7c48a');
    return;
  }
  p.stamina -= cost;
  p.staminaCd = 0.42;
  if (charged) {
    p.charges -= 1;
    p.chargesSpent += 1;
  }
  const len = Math.hypot(p.fx, p.fy) || 1;
  p.swing = {
    kind,
    style: cls?.attack || 'melee',
    age: 0,
    duration: charged ? (cls?.chargedDuration ?? 0.42) : (cls?.normalDuration ?? 0.22),
    range: charged ? (cls?.chargedRange ?? CHARGED_RANGE) : (cls?.normalRange ?? NORMAL_RANGE),
    cone: charged ? (cls?.chargedCone ?? CHARGED_CONE) : (cls?.normalCone ?? NORMAL_CONE),
    dirx: p.fx / len,
    diry: p.fy / len,
    hit: new Set(),
    connected: false,
    fired: false,
    spent: charged,
  };
  p.attackCd = charged ? (cls?.chargedCd ?? 0.92) : (cls?.normalCd ?? 0.46);
  game.fx.push(charged ? (cls?.chargedSound || 'charge') : (cls?.normalSound || 'swing'));
}

function cancelSwing(p) {
  if (!p.swing) return;
  const s = p.swing;
  if (s.spent && s.kind === 'charged' && !s.connected && s.age < s.duration * 0.4) {
    p.charges += 1;
    p.chargesSpent = Math.max(0, p.chargesSpent - 1);
    p.stamina = Math.min(p.staminaMax || 100, (p.stamina || 0) + (p.class?.chargedStamina ?? 34));
    s.spent = false;
  }
  p.swing = null;
}

function resolveSwing(game, p) {
  const s = p.swing;
  if (!s) return;
  const t = s.age / s.duration;
  if (s.style === 'bolt') {
    if (!s.fired && t >= 0.34) {
      s.fired = true;
      s.connected = true;
      spawnBolt(game, p, s);
    }
    return;
  }
  if (t < 0.34 || t > 0.92) return;

  const amount = s.kind === 'charged'
    ? (p.class?.chargedGoblin ?? 2)
    : (p.class?.normalGoblin ?? 1);
  for (const g of game.goblins) {
    if (!g.alive || s.hit.has(g.id)) continue;
    if (!inCone(game.grid, p, s, g)) continue;
    s.hit.add(g.id);
    s.connected = true;
    damageGoblin(game, p, g, amount, 170, s.kind === 'charged');
  }

  const hunterHit = s.kind === 'charged'
    ? (p.class?.chargedHunter ?? 48)
    : (p.class?.normalHunter ?? 28);
  for (const other of game.players) {
    if (other === p || !other.alive || other.invuln > 0 || s.hit.has(other.index)) continue;
    if (!inCone(game.grid, p, s, other)) continue;
    s.hit.add(other.index);
    s.connected = true;
    damageHunter(game, p, other, hunterHit, 160, s.kind === 'charged');
  }

  const m = game.minotaur;
  if (m.hp > 0 && !s.hit.has('minotaur') && inCone(game.grid, p, s, m)) {
    s.hit.add('minotaur');
    if (s.kind === 'charged') s.connected = true;
    damageMinotaur(game, p, s.kind === 'charged');
  }
}

function spawnBolt(game, p, swing) {
  const cls = p.class;
  const speed = cls?.boltSpeed || 280;
  const life = swing.range / speed;
  game.bolts.push({
    x: p.x + swing.dirx * 16,
    y: p.y + swing.diry * 16,
    vx: swing.dirx * speed,
    vy: swing.diry * speed,
    life,
    charged: swing.kind === 'charged',
    pierce: !!cls?.pierce || (p.buffs?.boon > 0 && cls?.id === 'archer'),
    owner: p.index,
    hit: new Set(),
    radius: cls?.boltRadius || 4,
    color: swing.kind === 'charged' ? '#ffd36a' : (cls?.boltColor || '#e7dcc4'),
    damage: swing.kind === 'charged' ? (cls?.chargedGoblin ?? 2) : (cls?.normalGoblin ?? 1),
    hunterDamage: swing.kind === 'charged' ? (cls?.chargedHunter ?? 48) : (cls?.normalHunter ?? 28),
  });
}

function updateBolts(game, dt) {
  for (const b of game.bolts) {
    if (b.life <= 0 || game.phase !== 'play') continue;
    const steps = 3;
    const step = dt / steps;
    for (let i = 0; i < steps && b.life > 0 && game.phase === 'play'; i++) {
      b.x += b.vx * step;
      b.y += b.vy * step;
      b.life -= step;
      const [c, r] = tileOf(b.x, b.y);
      if (!isFloor(game.grid, c, r)) {
        b.life = 0;
        break;
      }
      const owner = game.players[b.owner];
      const struck = [];
      for (const g of game.goblins) {
        if (!g.alive || b.hit.has(g.id)) continue;
        const dist = Math.hypot(g.x - b.x, g.y - b.y);
        if (dist > g.radius + b.radius) continue;
        struck.push({ dist, kind: 'goblin', ent: g });
      }
      for (const other of game.players) {
        if (!other.alive || other.invuln > 0 || other.index === b.owner || b.hit.has(other.index)) continue;
        const dist = Math.hypot(other.x - b.x, other.y - b.y);
        if (dist > other.radius + b.radius) continue;
        struck.push({ dist, kind: 'hunter', ent: other });
      }
      struck.sort((a, c) => a.dist - c.dist);
      let stopped = false;
      for (const hit of struck) {
        if (hit.kind === 'goblin') {
          b.hit.add(hit.ent.id);
          damageGoblin(game, owner, hit.ent, b.damage, 140, b.charged);
        } else {
          b.hit.add(hit.ent.index);
          damageHunter(game, owner, hit.ent, b.hunterDamage, 120, b.charged);
        }
        if (!b.pierce) {
          stopped = true;
          break;
        }
      }
      if (stopped) {
        b.life = 0;
        break;
      }
      const m = game.minotaur;
      if (m.hp > 0 && !b.hit.has('minotaur') && Math.hypot(m.x - b.x, m.y - b.y) <= m.radius + b.radius) {
        b.hit.add('minotaur');
        damageMinotaur(game, owner, b.charged);
        if (!b.pierce || !b.charged) b.life = 0;
      }
    }
  }
  game.bolts = game.bolts.filter((b) => b.life > 0);
}

function damageGoblin(game, attacker, g, amount, knock, charged = false) {
  if (!g.alive || !attacker) return;
  const guard = goblinGuard(g, attacker, charged);
  if (guard === 'parry') {
    g.guard = 0;
    attacker.stun = Math.max(attacker.stun || 0, 0.45);
    if (attacker.swing) cancelSwing(attacker);
    floatText(game, g.x, g.y - 16, 'Parry', '#d5e6ff');
    game.fx.push('clink');
    if (attacker.hp != null) hurtPlayer(game, attacker, 10, g.x, g.y, 90, 'contact');
    return;
  }
  if (guard === 'block') {
    floatText(game, g.x, g.y - 16, 'Blocked', '#c5d0dc');
    game.fx.push('clink');
    return;
  }
  const hit = guard === 'break' ? Math.max(1, Math.ceil(amount / 2)) : amount;
  if (guard === 'break') g.guard = 0;
  const dx = g.x - attacker.x;
  const dy = g.y - attacker.y;
  const d = Math.hypot(dx, dy) || 1;
  g.kbx = (dx / d) * knock;
  g.kby = (dy / d) * knock;
  g.stun = Math.max(g.stun, 0.12);
  g.hp -= hit;
  burst(game, g.x, g.y, attacker.buffs?.fire > 0 ? '#ff9a3c' : '#b6e38a', 8, 70);
  if (g.hp <= 0) killGoblin(game, g, attacker);
  else {
    game.fx.push('hit');
    floatText(game, g.x, g.y - 12, String(hit), '#d7f0b8');
    ignite(game, attacker, g);
    if (attacker.buffs?.boon > 0 && attacker.class?.id === 'thief') g.poison = Math.max(g.poison || 0, 3);
    if (attacker.buffs?.boon > 0 && attacker.class?.id === 'wizard') g.slow = Math.max(g.slow || 0, 2.2);
  }
}

function goblinGuard(g, attacker, charged) {
  if (!(g.guard > 0) || !facingHit(g, attacker)) return 'hit';
  if (g.guardAge < 0.2) return 'parry';
  if (!charged) return 'block';
  return 'break';
}

function facingHit(defender, attacker) {
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = defender.fx || 1;
  const fy = defender.fy || 0;
  return (fx * dx + fy * dy) / len > 0.2;
}

function hunterGuard(target, attacker, charged) {
  const knight = target.class?.id === 'knight';
  const bulwark = knight && target.buffs?.boon > 0;
  if (knight && target.blocking && facingHit(target, attacker)) {
    const window = bulwark ? 0.24 : 0.16;
    if ((target.blockAge || 0) < window) return 'parry';
    if (bulwark || !charged) return 'block';
    return 'chip';
  }
  if (!knight && target.swing && target.swing.age < 0.11) return 'parry';
  return 'hit';
}

function damageMinotaur(game, attacker, charged) {
  const m = game.minotaur;
  if (m.hp <= 0) return;
  if (!charged) {
    floatText(game, m.x, m.y - 20, 'Untouched', '#c8bba6');
    game.fx.push('clink');
    burst(game, m.x, m.y, '#d5d8df', 8, 50);
    return;
  }
  m.hp -= 1;
  m.hurtFlash = 0.28;
  if (attacker) {
    attacker.bossHits += 1;
    attacker.score = (attacker.score || 0) + 120;
  }
  const dx = m.x - (attacker?.x ?? m.x);
  const dy = m.y - (attacker?.y ?? m.y);
  const d = Math.hypot(dx, dy) || 1;
  m.kbx = (dx / d) * 80;
  m.kby = (dy / d) * 80;
  if (m.state === 'charge') {
    m.state = 'recover';
    m.stateT = 0.4;
  }
  burst(game, m.x, m.y, '#ffd36a', 16, 110);
  game.shake = Math.max(game.shake, 0.65);
  game.fx.push('boss');
  floatText(game, m.x, m.y - 22, 'Charged', '#ffd36a');
  if (m.hp <= 0) {
    m.hp = 0;
    game.phase = 'victory';
    game.winner = attacker;
    game.shake = 1;
    game.flash = 0.9;
    if (attacker) attacker.score = (attacker.score || 0) + 500;
    game.fx.push('win');
    floatText(game, m.x, m.y - 36, 'The horn breaks', '#fff4d2');
    pushToast(game, `${verb(attacker?.name || 'Someone', 'land')} the killing blow`);
  }
}

function inCone(grid, attacker, swing, target) {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const dist = Math.hypot(dx, dy);
  if (dist > swing.range + target.radius) return false;
  if (dist > 0.001) {
    const ang = Math.atan2(dy, dx);
    const face = Math.atan2(swing.diry, swing.dirx);
    let diff = Math.abs(ang - face);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > swing.cone) return false;
  }
  const [c, r] = tileOf(attacker.x + dx * 0.55, attacker.y + dy * 0.55);
  return isFloor(grid, c, r);
}

function killGoblin(game, g, killer) {
  if (!g.alive) return;
  g.alive = false;
  g.hp = 0;
  if (killer) {
    killer.goblinsSlain += 1;
    killer.score = (killer.score || 0) + 50;
  }
  burst(game, g.x, g.y, '#6fbf62', 12, 80);
  game.fx.push('pop');
  const roll = game.rng();
  if (roll < 0.22) spawnPickup(game, g.x, g.y, 'heal');
  else if (roll < 0.34) spawnPickup(game, g.x, g.y, 'charge');
  else if (roll < 0.46) spawnPickup(game, g.x, g.y, 'fire');
  else if (roll < 0.54) spawnPickup(game, g.x, g.y, 'boon');
  else if (roll < 0.6) spawnPickup(game, g.x, g.y, 'wildfire');
}

function tryUse(game, p) {
  if (tryGate(game, p)) return;
  let best = null;
  let bestD = LEVER_USE;
  for (const sw of game.switches) {
    const d = Math.hypot(p.x - sw.x, p.y - sw.y);
    if (d <= bestD) {
      best = sw;
      bestD = d;
    }
  }
  if (!best) return;
  if (best.cd > 0) {
    if (!p.bot) floatText(game, p.x, p.y - 18, 'Jammed', '#c8bba6');
    return;
  }
  scrambleWing(game, best, p);
}

function scrambleWing(game, sw, actor) {
  const region = sw.region;
  scrambleRegion(game.grid, region, game.rng, new Set());
  sw.cd = LEVER_COOLDOWN;
  sw.flash = 0.75;
  sw.telegraph = 0;
  sw.telegraphName = '';
  actor.levers += 1;
  actor.score = (actor.score || 0) + 25;
  actor.telegraphSwitchId = null;
  actor.leverTimer = 0;

  const bump = (ent, minotaur) => {
    if (!ent || (ent.alive === false)) return;
    if (!pointInRegion(ent.x, ent.y, region)) return;
    ent.stun = Math.max(ent.stun || 0, 0.55);
    if (ent.swing) cancelSwing(ent);
    if (minotaur) {
      ent.state = 'recover';
      ent.stateT = Math.max(ent.stateT || 0, 0.55);
    }
  };
  for (const p of game.players) if (p.alive) bump(p, false);
  for (const g of game.goblins) bump(g, false);
  bump(game.minotaur, true);

  for (const p of game.players) ensureFloor(game.grid, p);
  for (const g of game.goblins) ensureFloor(game.grid, g);
  ensureFloor(game.grid, game.minotaur);
  for (const chest of game.chests) ensureFloor(game.grid, chest);
  for (const pickup of game.pickups) ensureFloor(game.grid, pickup);
  for (const other of game.switches) ensureFloor(game.grid, other);
  if (game.sword && game.sword.held == null) ensureFloor(game.grid, game.sword);
  for (const gate of game.gates || []) ensureFloor(game.grid, gate);
  game.bolts = game.bolts.filter((b) => {
    const [c, r] = tileOf(b.x, b.y);
    return isFloor(game.grid, c, r);
  });

  for (const p of game.players) p.pathT = 0;
  game.shake = Math.max(game.shake, 1);
  burst(game, sw.x, sw.y, sw.region.color, 18, 120, 0.6);
  game.fx.push('lever');
  pushToast(game, `${verb(actor.name, 'scramble')} the ${region.name}`);
}

function ensureFloor(grid, ent) {
  const [c, r] = tileOf(ent.x, ent.y);
  const radius = ent.radius || 6;
  if (isFloor(grid, c, r) && !blocked(grid, ent.x, ent.y, Math.min(radius, 8))) return;
  const spot = nearestFloorTile(grid, c, r);
  if (!spot) return;
  const [x, y] = tileCenter(spot[0], spot[1]);
  ent.x = x;
  ent.y = y;
}

function tickGoblinStrike(game, g, dt) {
  const target = game.players[g.strikeWho];
  if (g.strike === 'windup') {
    g.strikeT += dt;
    if (!target?.alive || Math.hypot(target.x - g.x, target.y - g.y) > 96) {
      g.strike = null;
      g.strikeCd = 0.45;
      return;
    }
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const len = Math.hypot(dx, dy) || 1;
    g.fx = dx / len;
    g.fy = dy / len;
    if (g.strikeT >= 0.55) {
      g.strike = 'lunge';
      g.strikeT = 0;
      g.struck = false;
      g.lx = g.fx;
      g.ly = g.fy;
    }
    return;
  }
  if (g.strike === 'lunge') {
    g.strikeT += dt;
    g.fx = g.lx || g.fx;
    g.fy = g.ly || g.fy;
    tryMove(game.grid, g, g.fx * 220 * dt, g.fy * 220 * dt);
    if (!g.struck && target?.alive) {
      const dx = target.x - g.x;
      const dy = target.y - g.y;
      const dist = Math.hypot(dx, dy);
      const ahead = dx * g.fx + dy * g.fy;
      if (dist < g.radius + target.radius + 10 && ahead > -6) {
        g.struck = true;
        landGoblinStrike(game, g, target);
      }
    }
    if (g.strikeT >= 0.2 || g.struck) {
      g.strike = 'recover';
      g.strikeT = 0;
    }
    return;
  }
  g.strikeT += dt;
  if (g.strikeT >= 0.34) {
    g.strike = null;
    g.strikeCd = 1.05;
  }
}

function landGoblinStrike(game, g, target) {
  const guard = hunterGuard(target, g, false);
  if (guard === 'parry') {
    g.stun = Math.max(g.stun || 0, 0.55);
    g.strike = 'recover';
    g.strikeT = 0;
    target.score = (target.score || 0) + 35;
    floatText(game, target.x, target.y - 18, 'Parry', '#d5e6ff');
    game.fx.push('clink');
    return;
  }
  if (guard === 'block') {
    g.strike = 'recover';
    g.strikeT = 0;
    floatText(game, target.x, target.y - 18, 'Blocked', '#d5e6ff');
    game.fx.push('clink');
    return;
  }
  hurtPlayer(game, target, 18, g.x, g.y, 150, 'weapon', null);
}

function updateGoblins(game, dt) {
  const m = game.minotaur;
  for (const g of game.goblins) {
    if (!g.alive) continue;
    g.stun = Math.max(0, g.stun - dt);
    g.slow = Math.max(0, (g.slow || 0) - dt);
    g.guard = Math.max(0, (g.guard || 0) - dt);
    if (g.guard > 0) g.guardAge = (g.guardAge || 0) + dt;
    g.guardCd = Math.max(0, (g.guardCd || 0) - dt);
    g.strikeCd = Math.max(0, (g.strikeCd || 0) - dt);
    if ((g.burn || 0) > 0) {
      g.burn -= dt;
      g.burnAcc = (g.burnAcc || 0) + dt;
      if (g.burnAcc >= 0.5) {
        g.burnAcc = 0;
        g.hp -= 4;
        if (g.hp <= 0) {
          killGoblin(game, g, g.burner || null);
          continue;
        }
      }
    }
    if ((g.poison || 0) > 0) {
      g.poison -= dt;
      g.poisonAcc = (g.poisonAcc || 0) + dt;
      if (g.poisonAcc >= 0.5) {
        g.poisonAcc = 0;
        g.hp -= 3;
        if (g.hp <= 0) {
          killGoblin(game, g, null);
          continue;
        }
      }
    }
    tryMove(game.grid, g, g.kbx * dt, g.kby * dt);
    g.kbx *= Math.exp(-7 * dt);
    g.kby *= Math.exp(-7 * dt);
    if (g.stun > 0) {
      if (g.strike === 'windup' || g.strike === 'lunge') {
        g.strike = null;
        g.strikeCd = 0.55;
      }
      continue;
    }
    if (g.strike) {
      tickGoblinStrike(game, g, dt);
      continue;
    }
    g.think -= dt;
    if (g.think <= 0) {
      g.think = 0.42 + game.rng() * 0.2;
      const md = Math.hypot(g.x - m.x, g.y - m.y);
      const [c, r] = tileOf(g.x, g.y);
      if (md < 84 && m.hp > 0) {
        const [mc, mr] = tileOf(m.x, m.y);
        g.step = bestAway(game.grid, c, r, mc, mr);
      } else {
        let target = null;
        let best = 150;
        for (const p of game.players) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - g.x, p.y - g.y);
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (target) {
          const dx = target.x - g.x;
          const dy = target.y - g.y;
          const len = Math.hypot(dx, dy) || 1;
          g.fx = dx / len;
          g.fy = dy / len;
          if (best < 46 && g.strikeCd <= 0 && g.guard <= 0) {
            g.strike = 'windup';
            g.strikeT = 0;
            g.strikeWho = target.index;
            g.struck = false;
            g.guard = 0;
            g.step = null;
          } else if (best < 78 && g.guard <= 0 && g.guardCd <= 0) {
            g.guard = 0.9;
            g.guardAge = 0;
            g.guardCd = 1.15;
          }
          const [tc, tr] = tileOf(target.x, target.y);
          g.step = g.strike ? null : shortestStep(game.grid, c, r, tc, tr);
        } else {
          const options = [];
          for (const [dc, dr] of DIRS) {
            if (isFloor(game.grid, c + dc, r + dr)) options.push({ c: c + dc, r: r + dr });
          }
          g.step = options.length ? options[(game.rng() * options.length) | 0] : null;
        }
      }
    }
    if (g.step && isFloor(game.grid, g.step.c, g.step.r)) {
      const [x, y] = tileCenter(g.step.c, g.step.r);
      const dx = x - g.x;
      const dy = y - g.y;
      const len = Math.hypot(dx, dy) || 1;
      if (len > 3) {
        g.fx = dx / len;
        g.fy = dy / len;
        const pace = GOBLIN_SPEED * (g.slow > 0 ? 0.55 : 1) * (g.guard > 0 ? 0.2 : 1);
        tryMove(game.grid, g, g.fx * pace * dt, g.fy * pace * dt);
      }
    }
  }
  game.goblins = game.goblins.filter((g) => g.alive);
}

function bestAway(grid, c, r, tc, tr) {
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

function updateMinotaur(game, dt) {
  const m = game.minotaur;
  if (m.hp <= 0) return;
  m.cd = Math.max(0, m.cd - dt);
  m.hurtFlash = Math.max(0, m.hurtFlash - dt);
  m.stun = Math.max(0, m.stun - dt);
  tryMove(game.grid, m, m.kbx * dt, m.kby * dt);
  m.kbx *= Math.exp(-6 * dt);
  m.kby *= Math.exp(-6 * dt);

  const living = game.players.filter((p) => p.alive);
  if (!living.length || m.stun > 0) return;

  if (m.state === 'recover') {
    m.stateT -= dt;
    if (m.stateT <= 0) m.state = 'chase';
    return;
  }

  if (m.state === 'charge') {
    m.stateT -= dt;
    const beforeX = m.x;
    const beforeY = m.y;
    tryMove(game.grid, m, m.dx * MINO_CHARGE_SPEED * dt, m.dy * MINO_CHARGE_SPEED * dt);
    const moved = Math.hypot(m.x - beforeX, m.y - beforeY);
    touchPlayers(game, m, MINO_RAM, 320);
    if (m.stateT <= 0 || moved < MINO_CHARGE_SPEED * dt * 0.18) {
      m.state = 'recover';
      m.stateT = 0.32;
    }
    return;
  }

  m.think -= dt;
  if (m.think <= 0) {
    m.think = 0.34;
    const [sc, sr] = tileOf(m.x, m.y);
    const distMap = flood(game.grid, sc, sr);
    let target = living[0];
    let best = Infinity;
    for (const p of living) {
      const [c, r] = tileOf(p.x, p.y);
      const d = distMap[r * COLS + c];
      const score = d >= 0 ? d : Math.hypot(p.x - m.x, p.y - m.y) / TILE + 100;
      if (score < best) {
        best = score;
        target = p;
      }
    }
    m.target = target.index;
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (
      lineOfSight(game.grid, m.x, m.y, target.x, target.y)
      && dist < 230
      && dist > 56
      && m.cd <= 0
    ) {
      m.state = 'charge';
      m.stateT = 0.42;
      m.dx = dx / dist;
      m.dy = dy / dist;
      m.fx = m.dx;
      m.fy = m.dy;
      m.cd = 1.25;
      game.fx.push('horn');
      game.shake = Math.max(game.shake, 0.4);
      return;
    }
    const [tc, tr] = tileOf(target.x, target.y);
    m.step = shortestStep(game.grid, sc, sr, tc, tr);
  }

  const focused = game.players[m.target]?.alive ? game.players[m.target] : living[0];
  const [mc, mr] = tileOf(m.x, m.y);
  let sx = focused.x;
  let sy = focused.y;
  if (m.step && isFloor(game.grid, m.step.c, m.step.r) && (m.step.c !== mc || m.step.r !== mr)) {
    const center = tileCenter(m.step.c, m.step.r);
    sx = center[0];
    sy = center[1];
  }
  const dx = sx - m.x;
  const dy = sy - m.y;
  const len = Math.hypot(dx, dy) || 1;
  m.fx = dx / len;
  m.fy = dy / len;
  tryMove(game.grid, m, m.fx * MINO_SPEED * dt, m.fy * MINO_SPEED * dt);
  touchPlayers(game, m, MINO_TOUCH, 220);
}

function touchPlayers(game, m, dmg, knock) {
  for (const p of game.players) {
    if (!p.alive || p.invuln > 0 || p.hurtCd > 0) continue;
    if (Math.hypot(p.x - m.x, p.y - m.y) <= m.radius + p.radius + 3) {
      hurtPlayer(game, p, dmg, m.x, m.y, knock);
    }
  }
}

function damageHunter(game, attacker, target, amount, knock, charged = false) {
  if (!attacker || !target || target === attacker || !target.alive || target.invuln > 0) return;
  const guard = hunterGuard(target, attacker, charged);
  if (guard === 'parry') {
    attacker.stun = Math.max(attacker.stun || 0, 0.4);
    if (attacker.swing) cancelSwing(attacker);
    target.score = (target.score || 0) + 35;
    floatText(game, target.x, target.y - 18, 'Parry', '#d5e6ff');
    game.fx.push('clink');
    return;
  }
  let dmg = amount;
  if (guard === 'block') {
    floatText(game, target.x, target.y - 18, 'Blocked', '#d5e6ff');
    game.fx.push('clink');
    return;
  }
  if (guard === 'chip') dmg = Math.max(1, Math.round(amount * 0.4));
  const before = target.alive;
  hurtPlayer(game, target, dmg, attacker.x, attacker.y, knock, 'weapon', attacker);
  if (before && !target.alive) {
    attacker.huntersSlain += 1;
    attacker.score = (attacker.score || 0) + 150;
  } else if (target.alive) {
    ignite(game, attacker, target);
    if (attacker.buffs?.boon > 0 && attacker.class?.id === 'thief') {
      target.poison = Math.max(target.poison || 0, 3);
      target.poisoner = attacker;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 6);
    }
    if (attacker.buffs?.boon > 0 && attacker.class?.id === 'wizard') {
      target.slow = Math.max(target.slow || 0, 2.2);
    }
  }
}

function hurtPlayer(game, p, dmg, sx, sy, knock, kind = 'contact', killer = null) {
  if (!p.alive) return;
  if (kind === 'dot') {
    p.hp -= dmg;
    if (p.hp <= 0) killPlayer(game, p, killer);
    return;
  }
  const fromWeapon = kind === 'weapon';
  if (fromWeapon && p.invuln > 0) return;
  const shield = fromWeapon ? 0 : (p.class?.shield || 0);
  const taken = Math.max(1, Math.round(dmg * (1 - shield)));
  const knockScale = 1 - shield * 0.5;
  p.hp -= taken;
  if (!fromWeapon) p.hurtCd = 0.36;
  p.stun = Math.max(p.stun, fromWeapon ? 0.08 : 0.2);
  const dx = p.x - sx;
  const dy = p.y - sy;
  const d = Math.hypot(dx, dy) || 1;
  p.kbx = (dx / d) * knock * knockScale;
  p.kby = (dy / d) * knock * knockScale;
  if (p.swing) cancelSwing(p);
  floatText(game, p.x, p.y - 14, String(taken), '#ff8d8d');
  burst(game, p.x, p.y, '#e23d3d', 8, 70);
  game.fx.push('hurt');
  if (p.hp <= 0) killPlayer(game, p, fromWeapon ? killer : null);
}

function killPlayer(game, p, killer = null) {
  p.hp = 0;
  p.alive = false;
  p.respawn = 7;
  p.swing = null;
  p.kbx = 0;
  p.kby = 0;
  const stolen = p.charges;
  p.charges = 0;
  if (stolen > 0) {
    if (killer && killer !== p && killer.alive) {
      killer.charges += stolen;
      killer.score = (killer.score || 0) + stolen * 40;
      floatText(game, killer.x, killer.y - 20, `+${stolen} charge${stolen === 1 ? '' : 's'}`, '#ffd36a');
      pushToast(game, `${verb(killer.name, 'take')} ${stolen} charge${stolen === 1 ? '' : 's'}`);
    } else {
      spawnPickup(game, p.x, p.y, 'charge', stolen);
      floatText(game, p.x, p.y - 18, stolen === 1 ? 'Charge dropped' : `${stolen} charges`, '#ffd36a');
    }
  }
  if (game.sword && game.sword.held === p.index) {
    game.sword.held = null;
    game.sword.charges = 0;
    game.sword.x = p.x;
    game.sword.y = p.y;
    ensureFloor(game.grid, game.sword);
    const [c, r] = tileOf(game.sword.x, game.sword.y);
    game.sword.c = c;
    game.sword.r = r;
    p.bearing = false;
    floatText(game, game.sword.x, game.sword.y - 34, 'The sword falls', '#ffd36a');
  }
  game.fx.push('die');
  pushToast(game, `${verb(p.name, 'fall')}`);
}

function syncSword(game) {
  const sword = game.sword;
  for (const p of game.players) p.bearing = !!(sword && sword.held === p.index);
  if (!sword || sword.held == null) return;
  const holder = game.players[sword.held];
  if (!holder || !holder.alive) {
    sword.held = null;
    return;
  }
  sword.x = holder.x;
  sword.y = holder.y;
}

function takeSword(game) {
  const sword = game.sword;
  if (!sword || sword.held != null) return;
  let best = null;
  let bestD = Infinity;
  for (const p of game.players) {
    if (!p.alive) continue;
    const reach = 14 + (p.class?.pickupBonus || 12);
    const d = Math.hypot(p.x - sword.x, p.y - sword.y);
    if (d <= reach && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (!best) return;
  const gained = sword.charges || 0;
  best.charges += gained;
  sword.charges = 0;
  sword.held = best.index;
  sword.x = best.x;
  sword.y = best.y;
  for (const p of game.players) p.bearing = p === best;
  floatText(game, best.x, best.y - 20, gained ? `Sword +${gained}` : 'The sword', '#ffd36a');
  burst(game, best.x, best.y, '#ffd36a', 12, 70);
  game.fx.push('glint');
  pushToast(game, `${verb(best.name, 'take')} the charged sword`);
}

function collect(game) {
  takeSword(game);
  for (const p of game.players) {
    if (!p.alive) continue;
    for (const chest of game.chests) {
      if (chest.open) continue;
      if (Math.hypot(p.x - chest.x, p.y - chest.y) > 22 + (p.class?.chestReach || 0)) continue;
      chest.open = true;
      grantLoot(game, p, rollChest(game));
      burst(game, chest.x, chest.y, '#ffd36a', 10, 55);
      game.fx.push('chest');
    }
    for (const k of game.pickups) {
      if (k.taken) continue;
      if (Math.hypot(p.x - k.x, p.y - k.y) > p.radius + (p.class?.pickupBonus || 12)) continue;
      k.taken = true;
      grantLoot(game, p, k.kind === 'heal' ? 'vigor' : k.kind, k.amount || 1);
    }
  }
  game.pickups = game.pickups.filter((k) => !k.taken);
}

function separateAll(game) {
  const living = game.players.filter((p) => p.alive);
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) separate(game, living[i], living[j]);
    if (game.minotaur.hp > 0) separate(game, living[i], game.minotaur);
  }
  for (const g of game.goblins) {
    for (const p of living) separate(game, g, p);
  }
}

function separate(game, a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const min = a.radius + b.radius;
  if (dist >= min) return;
  if (dist < 0.001) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const push = (min - dist) * 0.5;
  tryMove(game.grid, a, (-dx / dist) * push, (-dy / dist) * push);
  tryMove(game.grid, b, (dx / dist) * push, (dy / dist) * push);
}

function maybeSpawn(game, step) {
  game.spawnT -= step;
  if (game.spawnT > 0) return;
  game.spawnT = 18;
  if (game.goblins.length >= 6) return;
  const avoid = [];
  for (const p of game.players) if (p.alive) avoid.push(tileOf(p.x, p.y));
  if (game.minotaur.hp > 0) avoid.push(tileOf(game.minotaur.x, game.minotaur.y));
  const spot = findSpot(game.grid, game.rng, avoid, 7, (c, r) => !inLair(c, r));
  if (!spot) return;
  game.goblins.push(makeGoblin(game, spot[0], spot[1]));
}

function spawnPickup(game, x, y, kind, amount = 1) {
  const [c, r] = tileOf(x, y);
  const spot = isFloor(game.grid, c, r) ? [c, r] : nearestFloorTile(game.grid, c, r);
  if (!spot) return;
  const [px, py] = tileCenter(spot[0], spot[1]);
  game.pickups.push({ x: px, y: py, kind, amount, taken: false });
}

function tickDot(game, p, key, dt, dmg, killer) {
  if (!(p[key] > 0)) return;
  p[key] -= dt;
  const acc = `${key}Acc`;
  p[acc] = (p[acc] || 0) + dt;
  if (p[acc] < 0.5) return;
  p[acc] = 0;
  hurtPlayer(game, p, dmg, p.x, p.y, 0, 'dot', killer);
}

function ignite(game, attacker, target) {
  if (!attacker?.buffs || attacker.buffs.fire <= 0 || !target) return;
  target.burn = Math.max(target.burn || 0, 3.2);
  target.burner = attacker;
  if (attacker.buffs.spread <= 0) return;
  const spark = (ent) => {
    if (!ent || ent === target || ent === attacker) return;
    if (ent.alive === false || (ent.hp != null && ent.hp <= 0)) return;
    if (Math.hypot(ent.x - target.x, ent.y - target.y) > 52) return;
    ent.burn = Math.max(ent.burn || 0, 2.4);
    ent.burner = attacker;
  };
  for (const g of game.goblins) spark(g);
  for (const other of game.players) spark(other);
}

const BOONS = { knight: 'Bulwark', archer: 'Pierce', wizard: 'Hex', thief: 'Venom' };

function rollChest(game) {
  const roll = game.rng();
  if (roll < 0.34) return 'vigor';
  if (roll < 0.52) return 'charge';
  if (roll < 0.7) return 'fire';
  if (roll < 0.8) return 'wildfire';
  return 'boon';
}

function grantLoot(game, p, kind, amount = 1) {
  if (kind === 'vigor' || kind === 'heal') {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + (kind === 'heal' ? 34 : 40));
    if (p.hp > before) floatText(game, p.x, p.y - 18, '+ vigor', '#ff8d8d');
    game.fx.push('heal');
    return;
  }
  if (kind === 'charge') {
    p.charges += amount;
    floatText(game, p.x, p.y - 18, amount > 1 ? `+${amount} charges` : '+ charge', '#ffd36a');
    game.fx.push('glint');
    return;
  }
  if (kind === 'fire') {
    p.buffs.fire = Math.max(p.buffs.fire, 14);
    floatText(game, p.x, p.y - 18, 'Fire sword', '#ff9a3c');
    game.fx.push('charge');
    return;
  }
  if (kind === 'wildfire') {
    p.buffs.fire = Math.max(p.buffs.fire, 14);
    p.buffs.spread = Math.max(p.buffs.spread, 14);
    floatText(game, p.x, p.y - 18, 'Wildfire', '#ff5a2a');
    game.fx.push('charge');
    return;
  }
  if (kind === 'boon') {
    p.buffs.boon = Math.max(p.buffs.boon, 16);
    floatText(game, p.x, p.y - 18, BOONS[p.class?.id] || 'Boon', '#c4b2ff');
    game.fx.push('glint');
  }
}

function tryGate(game, p) {
  const gates = game.gates || [];
  if (gates.length < 2) return false;
  let best = null;
  let bestD = 28;
  for (const gate of gates) {
    const d = Math.hypot(p.x - gate.x, p.y - gate.y);
    if (d <= bestD) {
      best = gate;
      bestD = d;
    }
  }
  if (!best) return false;
  if (game.gateCd > 0) {
    if (!p.bot) floatText(game, p.x, p.y - 18, `Shut ${Math.ceil(game.gateCd)}s`, '#9fd8cf');
    return true;
  }
  const other = gates.find((gate) => gate !== best);
  p.x = other.x;
  p.y = other.y;
  p.kbx = 0;
  p.kby = 0;
  p.invuln = Math.max(p.invuln, 0.45);
  game.gateCd = GATE_COOLDOWN;
  burst(game, best.x, best.y, '#7ee0d2', 10, 60);
  burst(game, other.x, other.y, '#7ee0d2', 12, 70);
  game.fx.push('spell');
  floatText(game, other.x, other.y - 18, 'Far side', '#9fd8cf');
  pushToast(game, `${verb(p.name, 'step')} through the maze`);
  return true;
}

function verb(name, stem) {
  return name === 'You' ? `You ${stem}` : `${name} ${stem}s`;
}

function floatText(game, x, y, text, color) {
  game.texts.push({ x, y, text, color, life: 0.95 });
  if (game.texts.length > 36) game.texts.splice(0, game.texts.length - 36);
}

function burst(game, x, y, color, n, speed, life = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = game.rng() * Math.PI * 2;
    const s = speed * (0.35 + game.rng());
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      color,
      size: 1.6 + game.rng() * 2.2,
    });
  }
  if (game.particles.length > 240) game.particles.splice(0, game.particles.length - 240);
}

function blocked(grid, x, y, radius) {
  const checks = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
  for (const [dx, dy] of checks) {
    const c = Math.floor((x + dx) / TILE);
    const r = Math.floor((y + dy) / TILE);
    if (!isFloor(grid, c, r)) return true;
  }
  return false;
}

function tryMove(grid, ent, dx, dy) {
  if (!dx && !dy) return;
  if (dx && !blocked(grid, ent.x + dx, ent.y, ent.radius || 6)) ent.x += dx;
  if (dy && !blocked(grid, ent.x, ent.y + dy, ent.radius || 6)) ent.y += dy;
}
