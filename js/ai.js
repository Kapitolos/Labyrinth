import { COLS, ROWS, LEVER_SIGHT, LEVER_USE } from './config.js';
import { tileCenter, tileOf } from './config.js';
import { isFloor, pointInRegion } from './maze.js';
import { flood, shortestStep, bestStepAway, lineOfSight } from './path.js';
import { occupantsOf } from './game.js';

export function thinkBot(bot, game, dt) {
  const intent = { mx: 0, my: 0, attack: false, charge: false, use: false };
  if (!bot.alive || game.phase !== 'play') {
    releaseLever(bot, game);
    return intent;
  }

  const moved = Math.hypot(bot.x - bot.prevX, bot.y - bot.prevY);
  if (bot.wasMoving && moved < 0.6) bot.stuckT += dt;
  else bot.stuckT = 0;
  bot.prevX = bot.x;
  bot.prevY = bot.y;

  const horn = game.minotaur;
  const threat = Math.hypot(bot.x - horn.x, bot.y - horn.y);

  if (bot.leverTimer > 0) {
    const sw = game.switches.find((s) => s.id === bot.telegraphSwitchId);
    bot.leverTimer -= dt;
    const tooFar = sw && Math.hypot(bot.x - sw.x, bot.y - sw.y) > LEVER_USE + 8;
    if (!sw || sw.cd > 0 || threat < 46 || tooFar) {
      releaseLever(bot, game);
    } else if (bot.leverTimer <= 0) {
      sw.telegraph = 0;
      bot.telegraphSwitchId = null;
      intent.use = true;
      bot.wasMoving = false;
      return intent;
    } else {
      sw.telegraph = bot.leverTimer;
      sw.telegraphName = bot.name;
      bot.wasMoving = false;
      return intent;
    }
  }

  const cls = bot.class;
  const melee = !cls || cls.attack !== 'bolt';
  const prey = bestPrey(bot, game);
  const swordFree = game.sword && game.sword.held == null;
  const holding = game.sword && game.sword.held === bot.index;
  const huntNow = !holding && (swordFree || game.players.some((p) => p.alive && p !== bot && (p.charges > 0 || game.sword?.held === p.index)));

  const trap = hotLever(bot, game);
  if (trap && !huntNow) {
    const selfIn = pointInRegion(bot.x, bot.y, trap.region);
    const d = Math.hypot(bot.x - trap.x, bot.y - trap.y);
    const unarmed = bot.charges <= 0 || bot.hp < bot.maxHp * 0.38;
    const alreadyOutside = !selfIn && d < 300 && !(bot.charges > 0 && threat < 90);
    if (unarmed || alreadyOutside) {
      if (threat < 50 && horn.hp > 0) {
        const [c, r] = tileOf(bot.x, bot.y);
        const [mc, mr] = tileOf(horn.x, horn.y);
        faceStep(bot, intent, bestStepAway(game.grid, c, r, mc, mr));
        bot.wasMoving = intent.mx !== 0 || intent.my !== 0;
        return intent;
      }
      if (selfIn || d > LEVER_USE - 2) {
        stepToward(bot, intent, game, trap.x, trap.y);
        bot.wasMoving = true;
        return intent;
      }
      beginThrow(bot, trap);
      bot.wasMoving = false;
      return intent;
    }
  }

  if (maybeShield(bot, intent, game) && threat > 80) {
    bot.wasMoving = false;
    return intent;
  }

  const charging = horn.hp > 0 && horn.state === 'charge';
  const fleeRadius = bot.charges <= 0 ? 52 : 78;
  const swordDist = swordFree ? Math.hypot(bot.x - game.sword.x, bot.y - game.sword.y) : Infinity;
  const diving = swordFree && bot.charges <= 0 && swordDist < 120;
  if (!diving && threat < fleeRadius && horn.hp > 0 && (bot.charges <= 0 || bot.hp < bot.maxHp * 0.38 || charging || bot.stuckT > 0.9)) {
    if (bot.stuckT > 0.9) bot.stuckT = 0;
    const [c, r] = tileOf(bot.x, bot.y);
    const [mc, mr] = tileOf(horn.x, horn.y);
    faceStep(bot, intent, bestStepAway(game.grid, c, r, mc, mr));
    bot.wasMoving = intent.mx !== 0 || intent.my !== 0;
    return intent;
  }
  if (bot.stuckT > 0.9) {
    bot.stuckT = 0;
    const [c, r] = tileOf(bot.x, bot.y);
    const options = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isFloor(game.grid, c + dc, r + dr)) options.push({ c: c + dc, r: r + dr });
    }
    if (options.length) faceStep(bot, intent, options[(Math.random() * options.length) | 0]);
    bot.wasMoving = true;
    return intent;
  }

  const sw = nearestSwitch(game, bot, LEVER_SIGHT);
  if (!huntNow && sw && sw.cd <= 0 && !(sw.telegraph > 0 && sw.telegraphName !== bot.name)) {
    if (bot.lockSwitch !== sw.id) {
      bot.lockSwitch = sw.id;
      bot.lockChoice = shouldPull(bot, sw, game);
    }
    if (bot.lockChoice) {
      const d = Math.hypot(bot.x - sw.x, bot.y - sw.y);
      if (d > LEVER_USE - 2 || pointInRegion(bot.x, bot.y, sw.region)) {
        stepToward(bot, intent, game, sw.x, sw.y);
        bot.wasMoving = true;
        return intent;
      }
      beginThrow(bot, sw);
      bot.wasMoving = false;
      return intent;
    }
  } else if (!sw) {
    bot.lockSwitch = null;
    bot.lockChoice = false;
  }

  if (!holding && swordFree) {
    if (maybeGate(bot, intent, game, game.sword)) return intent;
    stepToward(bot, intent, game, game.sword.x, game.sword.y);
    bot.wasMoving = true;
    return intent;
  }

  const quarry = !holding
    ? game.players.find((p) => p.alive && p !== bot && game.sword?.held === p.index) || (prey && prey.charges > 0 ? prey : null)
    : (bot.charges <= 0 && prey && prey.charges > 0 ? prey : null);
  if (quarry) {
    if (maybeGate(bot, intent, game, quarry)) return intent;
    const d = Math.hypot(quarry.x - bot.x, quarry.y - bot.y);
    const los = melee || lineOfSight(game.grid, bot.x, bot.y, quarry.x, quarry.y);
    const reach = melee
      ? (cls?.normalRange || 36) + quarry.radius + 4
      : (cls?.normalRange || 180) * 0.82;
    if (los && d <= reach) {
      faceToward(bot, intent, quarry.x, quarry.y);
      intent.mx = 0;
      intent.my = 0;
      intent.attack = true;
      bot.wasMoving = false;
      return intent;
    }
    stepToward(bot, intent, game, quarry.x, quarry.y);
    bot.wasMoving = true;
    return intent;
  }

  if (holding && bot.charges > 0 && bot.hp > bot.maxHp * 0.3 && horn.hp > 0 && horn.state !== 'charge') {
    const reach = melee
      ? (cls?.chargedRange || 54) + horn.radius - 4
      : (cls.chargedRange || 220) * 0.92;
    const los = melee || lineOfSight(game.grid, bot.x, bot.y, horn.x, horn.y);
    if (los && threat < (melee ? 90 : reach + 24)) {
      faceToward(bot, intent, horn.x, horn.y);
      if (threat < reach) {
        intent.mx = 0;
        intent.my = 0;
        intent.charge = true;
        bot.wasMoving = false;
        return intent;
      }
      bot.wasMoving = true;
      return intent;
    }
  }

  const gobSeek = melee ? 50 : Math.min((cls?.normalRange || 180) * 0.85, 200);
  const gob = bot.charges > 0 ? nearestGoblin(game, bot, gobSeek) : null;
  if (gob && threat > 160) {
    const gd = Math.hypot(gob.x - bot.x, gob.y - bot.y);
    const los = melee || lineOfSight(game.grid, bot.x, bot.y, gob.x, gob.y);
    if (los) {
      faceToward(bot, intent, gob.x, gob.y);
      const fire = melee
        ? (cls?.normalRange || 36) + gob.radius - 2
        : (cls.normalRange || 180) * 0.8;
      if (gd < fire) {
        intent.mx = 0;
        intent.my = 0;
        intent.attack = true;
        bot.wasMoving = false;
        return intent;
      }
      bot.wasMoving = true;
      return intent;
    }
  }

  bot.pathT -= dt;
  const [c, r] = tileOf(bot.x, bot.y);
  if (!bot.goal || !isFloor(game.grid, bot.goal.c, bot.goal.r)) bot.goal = null;
  if (bot.pathT <= 0 || !bot.goal) {
    bot.pathT = 0.32;
    bot.goal = chooseGoal(bot, game);
  }
  if (bot.goal) {
    const step = shortestStep(game.grid, c, r, bot.goal.c, bot.goal.r);
    if (step && (step.c !== c || step.r !== r)) faceStep(bot, intent, step);
    else {
      bot.goal = null;
      bot.pathT = 0.05;
    }
  }
  bot.wasMoving = intent.mx !== 0 || intent.my !== 0;
  return intent;
}

function hotLever(bot, game) {
  let best = null;
  let bestD = Infinity;
  for (const sw of game.switches) {
    if (sw.cd > 0 || (sw.telegraph > 0 && sw.telegraphName !== bot.name)) continue;
    const occ = occupantsOf(game, sw.region);
    const rivals = occ.players.filter((p) => p !== bot);
    if (!(rivals.length && occ.minotaur)) continue;
    const d = Math.hypot(bot.x - sw.x, bot.y - sw.y);
    if (d < bestD) {
      bestD = d;
      best = sw;
    }
  }
  return best;
}

function beginThrow(bot, sw) {
  bot.leverTimer = 0.8;
  bot.telegraphSwitchId = sw.id;
  sw.telegraph = 0.8;
  sw.telegraphName = bot.name;
}

function shouldPull(bot, sw, game) {
  const occ = occupantsOf(game, sw.region);
  const rivals = occ.players.filter((p) => p !== bot);
  const selfIn = occ.players.includes(bot);
  if (selfIn && occ.minotaur) return false;
  if (rivals.length && occ.minotaur && !selfIn) return true;
  if (!selfIn && rivals.some((p) => p.hp < p.maxHp * 0.4) && Math.random() < 0.6) return true;
  if (!selfIn && rivals.length && Math.random() < 0.2) return true;
  return false;
}

function chooseGoal(bot, game) {
  const [sc, sr] = tileOf(bot.x, bot.y);
  const dist = flood(game.grid, sc, sr);
  const scoreOf = (c, r) => {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    return dist[r * COLS + c];
  };
  if (bot.hp < bot.maxHp * 0.45) {
    const heal = nearestLoot(game, scoreOf, 'heal');
    if (heal) return heal;
  }
  if (bot.charges <= 0 && game.sword && game.sword.held == null) {
    const [c, r] = tileOf(game.sword.x, game.sword.y);
    if (scoreOf(c, r) >= 0) return { c, r };
  }
  if (bot.charges <= 0) {
    const charge = nearestLoot(game, scoreOf, 'charge');
    if (charge) return charge;
    const prey = bestPrey(bot, game);
    if (prey) {
      const [pc, pr] = tileOf(prey.x, prey.y);
      if (scoreOf(pc, pr) >= 0) return { c: pc, r: pr };
    }
  } else if (game.minotaur.hp > 0) {
    const [c, r] = tileOf(game.minotaur.x, game.minotaur.y);
    if (scoreOf(c, r) >= 0) return { c, r };
  }
  return explore(game, bot, scoreOf);
}

function nearestLoot(game, scoreOf, kind) {
  let best = null;
  let bestD = Infinity;
  for (const chest of game.chests) {
    if (chest.open) continue;
    const d = scoreOf(chest.c, chest.r);
    if (d >= 0 && d < bestD) {
      bestD = d;
      best = { c: chest.c, r: chest.r };
    }
  }
  for (const k of game.pickups) {
    if (k.kind !== kind) continue;
    const [c, r] = tileOf(k.x, k.y);
    const d = scoreOf(c, r);
    if (d >= 0 && d < bestD) {
      bestD = d;
      best = { c, r };
    }
  }
  return best;
}

function explore(game, bot, scoreOf) {
  const [c, r] = tileOf(bot.x, bot.y);
  bot.visited.add(`${c},${r}`);
  if (bot.visited.size > 280) bot.visited.clear();
  let best = null;
  let bestD = -1;
  for (let i = 0; i < 28; i++) {
    const cc = 1 + ((Math.random() * (COLS - 2)) | 0);
    const rr = 1 + ((Math.random() * (ROWS - 2)) | 0);
    if (!isFloor(game.grid, cc, rr) || bot.visited.has(`${cc},${rr}`)) continue;
    const d = scoreOf(cc, rr);
    if (d > bestD) {
      bestD = d;
      best = { c: cc, r: rr };
    }
  }
  if (best) return best;
  for (let i = 0; i < 20; i++) {
    const cc = 1 + ((Math.random() * (COLS - 2)) | 0);
    const rr = 1 + ((Math.random() * (ROWS - 2)) | 0);
    if (!isFloor(game.grid, cc, rr)) continue;
    if (scoreOf(cc, rr) > 5) return { c: cc, r: rr };
  }
  return null;
}

function releaseLever(bot, game) {
  if (bot.telegraphSwitchId) {
    const sw = game.switches.find((s) => s.id === bot.telegraphSwitchId);
    if (sw && sw.telegraphName === bot.name) {
      sw.telegraph = 0;
      sw.telegraphName = '';
    }
  }
  bot.telegraphSwitchId = null;
  bot.leverTimer = 0;
}

function nearestSwitch(game, bot, range) {
  let best = null;
  let bestD = range;
  for (const sw of game.switches) {
    const d = Math.hypot(bot.x - sw.x, bot.y - sw.y);
    if (d <= bestD) {
      best = sw;
      bestD = d;
    }
  }
  return best;
}

function maybeGate(bot, intent, game, goal) {
  if (!goal || game.gateCd > 0 || !game.gates || game.gates.length < 2) return false;
  const here = Math.hypot(bot.x - goal.x, bot.y - goal.y);
  if (here < 320) return false;
  let pad = null;
  let padD = 90;
  for (const gate of game.gates) {
    const d = Math.hypot(bot.x - gate.x, bot.y - gate.y);
    if (d < padD) {
      pad = gate;
      padD = d;
    }
  }
  if (!pad) return false;
  const other = game.gates.find((gate) => gate !== pad);
  if (Math.hypot(other.x - goal.x, other.y - goal.y) > here - 140) return false;
  if (padD < 26) {
    intent.use = true;
    intent.mx = 0;
    intent.my = 0;
    bot.wasMoving = false;
    return true;
  }
  stepToward(bot, intent, game, pad.x, pad.y);
  bot.wasMoving = true;
  return true;
}

function bestPrey(bot, game) {
  let best = null;
  let bestScore = Infinity;
  for (const p of game.players) {
    if (p === bot || !p.alive) continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    const score = d - (p.charges > 0 ? 240 : 0) + p.hp * 0.15;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function nearestGoblin(game, bot, range) {
  let best = null;
  let bestD = range;
  for (const g of game.goblins) {
    if (!g.alive) continue;
    const d = Math.hypot(bot.x - g.x, bot.y - g.y);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

function maybeShield(bot, intent, game) {
  if (bot.class?.id !== 'knight' || bot.stun > 0) return false;
  let threat = null;
  let best = 90;
  for (const g of game.goblins) {
    if (!g.alive || g.strike !== 'windup' || g.strikeWho !== bot.index) continue;
    if ((g.strikeT || 0) < 0.32) continue;
    const d = Math.hypot(g.x - bot.x, g.y - bot.y);
    if (d < best) {
      best = d;
      threat = g;
    }
  }
  for (const p of game.players) {
    if (!p.alive || p === bot || !p.swing || p.swing.style === 'bolt') continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    const reach = (p.swing.range || 40) + bot.radius + 10;
    if (d > reach || d >= best) continue;
    const dx = bot.x - p.x;
    const dy = bot.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    if ((p.swing.dirx * dx + p.swing.diry * dy) / len < 0.35) continue;
    best = d;
    threat = p;
  }
  if (!threat) return false;
  faceToward(bot, intent, threat.x, threat.y);
  intent.mx = 0;
  intent.my = 0;
  intent.block = true;
  return true;
}

function stepToward(bot, intent, game, x, y) {
  const [c, r] = tileOf(bot.x, bot.y);
  const [tc, tr] = tileOf(x, y);
  if (c === tc && r === tr) {
    faceToward(bot, intent, x, y);
    return;
  }
  const step = shortestStep(game.grid, c, r, tc, tr);
  if (step) faceStep(bot, intent, step);
  else faceToward(bot, intent, x, y);
  if (bot.stamina > 32) intent.sprint = true;
}

function faceToward(bot, intent, x, y) {
  const dx = x - bot.x;
  const dy = y - bot.y;
  const len = Math.hypot(dx, dy) || 1;
  bot.fx = dx / len;
  bot.fy = dy / len;
  intent.mx = bot.fx;
  intent.my = bot.fy;
}

function faceStep(bot, intent, step) {
  if (!step) return;
  const [x, y] = tileCenter(step.c, step.r);
  faceToward(bot, intent, x, y);
  if (bot.stamina > 32) intent.sprint = true;
}
