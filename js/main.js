import { KEYBINDS, HUNTER_NAMES, HUNTER_COLORS, CLASSES, CLASS_ORDER } from './config.js';
import { createMatch, updateMatch, leverReadout } from './game.js';
import { mapByIndex, peekMapIndex, takeMapIndex } from './maps.js';
import { thinkBot } from './ai.js';
import { render, updateCamera, frameMap, focusSword } from './render.js';
import { hunterPortrait } from './sprites.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const menu = document.getElementById('menu');
const pause = document.getElementById('pause');
const end = document.getElementById('end');
const audio = createAudio();

const view = { w: 800, h: 600, dpr: 1 };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const held = new Set();
const edges = new Set();
let clickAttack = false;
const padPrev = [[], [], [], []];

const blockedKeys = new Set([
  'Escape', 'KeyZ', 'KeyM', 'Space', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
for (const bind of KEYBINDS) {
  for (const key of ['up', 'down', 'left', 'right', 'attack', 'charge', 'use', 'block', 'sprint']) {
    blockedKeys.add(bind[key]);
  }
}

let mode = 'menu';
let humanCount = 1;
const seatClasses = [...CLASS_ORDER];
let game = createMatch(0, Math.random, seatClasses, peekMapIndex());
let camera = frameMap(view);
let muted = false;

const help = KEYBINDS.map((bind, i) => `
  <div class="bind">
    <strong style="color:${HUNTER_COLORS[i]}">${HUNTER_NAMES[i]}</strong>
    <span>Walk ${bind.move}</span>
    <span>Run ${bind.sprintName}</span>
    <span>Strike ${bind.attackName}</span>
    <span>Charge ${bind.chargeName}</span>
    <span>Shield ${bind.blockName}</span>
    <span>Lever ${bind.useName}</span>
  </div>
`).join('');
document.getElementById('controls-help').innerHTML = help;
document.getElementById('pause-controls').innerHTML = help;

window.addEventListener('keydown', (event) => {
  if ((mode === 'play' || mode === 'pause') && blockedKeys.has(event.code)) event.preventDefault();
  if (!held.has(event.code)) edges.add(event.code);
  held.add(event.code);
  audio.unlock();
});
window.addEventListener('keyup', (event) => held.delete(event.code));
window.addEventListener('blur', () => {
  held.clear();
  edges.clear();
  clickAttack = false;
});
window.addEventListener('pointerdown', (event) => {
  audio.unlock();
  if (event.button !== 0 || mode !== 'play') return;
  const el = event.target;
  if (!(el instanceof Element) || el.closest('button, a, input, textarea, select')) return;
  clickAttack = true;
});

document.getElementById('mute').addEventListener('click', toggleMute);
document.getElementById('resume').addEventListener('click', () => setMode('play'));
document.getElementById('pause-menu').addEventListener('click', returnToMenu);
document.getElementById('rematch').addEventListener('click', () => startMatch(humanCount));
document.getElementById('end-menu').addEventListener('click', returnToMenu);
for (const button of document.querySelectorAll('[data-humans]')) {
  button.addEventListener('click', () => startMatch(Number(button.dataset.humans)));
}
renderClassPicks();
paintBoard('scoreboard');
labelNextMap();

new ResizeObserver(() => resize()).observe(stage);
resize();
requestAnimationFrame(frame);
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (edges.has('KeyM')) toggleMute();
  if (edges.has('Escape')) {
    if (mode === 'play') setMode('pause');
    else if (mode === 'pause') setMode('play');
  }

  if (mode === 'menu') {
    game.time += dt;
    camera = frameMap(view);
    render(ctx, game, view, camera, { bare: true, reduce: reduceMotion });
  } else if (mode === 'pause') {
    render(ctx, game, view, camera, { reduce: reduceMotion });
  } else {
    game.frozen = (camera.introLeft || 0) > 0;
    const intents = mode === 'play' && !game.frozen
      ? game.players.map((p, i) => (p.bot ? thinkBot(p, game, dt) : humanIntent(p, i)))
      : game.players.map(() => ({ mx: 0, my: 0, attack: false, charge: false, use: false }));
    clickAttack = false;
    updateMatch(game, intents, dt, game.frozen);
    updateCamera(camera, game, view, held.has('KeyZ'), dt);
    if (game.phase === 'victory' && mode === 'play') showEnd();
    render(ctx, game, view, camera, { reduce: reduceMotion });
    syncHud();
  }

  while (game.fx.length) audio.play(game.fx.shift());
  edges.clear();
  requestAnimationFrame(frame);
}

function humanIntent(player, index) {
  const bind = player.bind;
  let mx = 0;
  let my = 0;
  if (held.has(bind.up)) my -= 1;
  if (held.has(bind.down)) my += 1;
  if (held.has(bind.left)) mx -= 1;
  if (held.has(bind.right)) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const pad = gamepadIntent(index);
  if (pad && (pad.mx || pad.my)) {
    mx = pad.mx;
    my = pad.my;
  }
  return {
    mx,
    my,
    attack: edges.has(bind.attack) || Boolean(pad?.attack) || (index === 0 && clickAttack),
    charge: edges.has(bind.charge) || Boolean(pad?.charge),
    use: edges.has(bind.use) || Boolean(pad?.use),
    block: held.has(bind.block) || Boolean(pad?.block),
    sprint: held.has(bind.sprint) || Boolean(pad?.sprint),
  };
}

function gamepadIntent(index) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const pad = pads[index];
  if (!pad) return null;
  let mx = pad.axes[0] || 0;
  let my = pad.axes[1] || 0;
  if (Math.hypot(mx, my) < 0.28) {
    mx = 0;
    my = 0;
  } else {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
  }
  const buttons = pad.buttons.map((button) => button.pressed);
  const prev = padPrev[index];
  const edge = (i) => buttons[i] && !prev[i];
  padPrev[index] = buttons;
  return { mx, my, attack: edge(0), charge: edge(1), use: edge(2), block: buttons[3], sprint: buttons[4] };
}

function labelNextMap() {
  const el = document.getElementById('next-map');
  if (!el) return;
  el.textContent = `Next maze · ${mapByIndex(peekMapIndex()).name}`;
}

function startMatch(count) {
  audio.unlock();
  humanCount = count;
  game = createMatch(count, Math.random, seatClasses, takeMapIndex());
  camera = focusSword(view, game.sword);
  buildHud();
  menu.classList.add('hidden');
  pause.classList.add('hidden');
  end.classList.add('hidden');
  document.getElementById('topbar').hidden = false;
  document.getElementById('hud').hidden = false;
  mode = 'play';
  resize();
  canvas.focus();
}

function setMode(next) {
  mode = next;
  pause.classList.toggle('hidden', next !== 'pause');
  if (next === 'play') canvas.focus();
}

function returnToMenu() {
  game = createMatch(0, Math.random, seatClasses, peekMapIndex());
  labelNextMap();
  camera = frameMap(view);
  menu.classList.remove('hidden');
  pause.classList.add('hidden');
  end.classList.add('hidden');
  paintBoard('scoreboard');
  document.getElementById('topbar').hidden = true;
  document.getElementById('hud').hidden = true;
  mode = 'menu';
  resize();
}

function showEnd() {
  mode = 'end';
  const winner = game.winner;
  document.getElementById('end-title').textContent = winner.name === 'You'
    ? 'You kill the Minotaur'
    : `${winner.name} kills the Minotaur`;
  document.getElementById('end-title').style.color = winner.color;
  document.getElementById('end-sub').textContent = winner.bot
    ? `${winner.name} takes the last blow. The gate stays shut for you.`
    : winner.name === 'You'
      ? 'The lock springs. You walk out.'
      : `${winner.name} lands the last blow, and the gate opens.`;
  const list = document.getElementById('end-stats');
  list.replaceChildren();
  for (const p of game.players) {
    const li = document.createElement('li');
    li.textContent = `${p.name} · ${p.class.name} — ${p.score || 0} pts, ${p.bossHits} wounds, ${p.huntersSlain} hunters, ${p.goblinsSlain} goblins`;
    if (p === winner) li.className = 'champ';
    list.appendChild(li);
  }
  end.classList.remove('hidden');
  recordScores();
  paintBoard('end-board');
  paintBoard('scoreboard');
  document.getElementById('rematch').focus();
}

function buildHud() {
  const hud = document.getElementById('hud');
  hud.replaceChildren();
  for (const p of game.players) {
    const card = document.createElement('article');
    card.className = 'card';
    card.id = `card-${p.index}`;
    card.style.setProperty('--pc', p.color);
    card.innerHTML = `
      <header>
        <span class="seat">${p.index + 1}</span>
        <strong class="pname"></strong>
        <em class="role"></em>
      </header>
      <div class="hpbar"><div class="hpfill"></div></div>
      <div class="staminabar"><div class="stamfill"></div></div>
      <div class="stats"><span class="hptext"></span><span class="chg"></span></div>
      <div class="controls"></div>
    `;
    card.querySelector('.pname').textContent = p.name;
    card.querySelector('.role').textContent = p.class.name;
    const shieldBit = p.class.id === 'knight' ? ` · ${p.bind.blockName} shield` : '';
    card.querySelector('.controls').textContent = p.bot
      ? p.class.tag
      : `${p.class.tag}. ${p.bind.move} walk · ${p.bind.sprintName} run${shieldBit} · ${p.bind.attackName} strike · ${p.bind.chargeName} charge · ${p.bind.useName} lever`;
    hud.appendChild(card);
  }
}

function syncHud() {
  const m = game.minotaur;
  document.getElementById('clock').textContent = formatTime(game.time);
  document.getElementById('boss-fill').style.width = `${(Math.max(0, m.hp) / m.maxHp) * 100}%`;
  document.getElementById('boss-hp').textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
  for (const p of game.players) {
    const card = document.getElementById(`card-${p.index}`);
    if (!card) continue;
    card.classList.toggle('down', !p.alive);
    card.classList.toggle('champ', game.winner === p);
    card.querySelector('.hpfill').style.width = `${Math.max(0, p.hp) / p.maxHp * 100}%`;
    const marks = [];
    if (p.buffs?.spread > 0) marks.push('Wildfire');
    else if (p.buffs?.fire > 0) marks.push('Fire');
    if (p.buffs?.boon > 0) {
      marks.push({ knight: 'Bulwark', archer: 'Pierce', wizard: 'Hex', thief: 'Venom' }[p.class.id] || 'Boon');
    }
    if (p.blocking) {
      const window = p.buffs?.boon > 0 ? 0.24 : 0.16;
      marks.unshift((p.blockAge || 0) < window ? 'Parry' : 'Shield');
    }
    const stam = card.querySelector('.stamfill');
    if (stam) stam.style.width = `${Math.max(0, (p.stamina || 0) / (p.staminaMax || 1)) * 100}%`;
    card.querySelector('.hptext').textContent = p.alive
      ? `${Math.max(0, Math.ceil(p.hp))} hp · ${p.score || 0}`
      : `Back in ${Math.ceil(p.respawn)}s`;
    card.querySelector('.chg').textContent = `${p.bearing ? 'Sword' : 'No sword'} · ${p.charges}${marks.length ? ` · ${marks.join(' ')}` : ''}`;
  }

  const banner = document.getElementById('banner');
  if (game.bannerT > 0 && mode === 'play') {
    banner.textContent = game.banner;
    banner.classList.remove('hidden');
  } else banner.classList.add('hidden');

  const info = leverReadout(game);
  const prompt = document.getElementById('prompt');
  if (!info.show || mode !== 'play') prompt.classList.add('hidden');
  else {
    prompt.classList.remove('hidden');
    document.getElementById('prompt-title').textContent = info.title;
    const lines = document.getElementById('prompt-lines');
    lines.replaceChildren();
    for (const line of info.lines) {
      const row = document.createElement('div');
      row.textContent = line;
      lines.appendChild(row);
    }
  }

  const stack = document.getElementById('toasts');
  stack.replaceChildren();
  if (mode === 'play' || mode === 'end') {
    for (const toast of game.toasts) {
      const row = document.createElement('div');
      row.className = 'toast';
      row.textContent = toast.text;
      stack.appendChild(row);
    }
  }
}

function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem('labyrinth-scores') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function recordScores() {
  const board = loadScores();
  const at = Date.now();
  const hunters = game.players.filter((p) => !p.bot);
  for (const p of hunters) {
    board.push({
      name: p.name,
      cls: p.class.name,
      score: p.score || 0,
      time: game.time,
      won: game.winner === p,
      at: at + p.index,
    });
  }
  board.sort((a, b) => b.score - a.score || a.time - b.time);
  const top = board.slice(0, 8);
  localStorage.setItem('labyrinth-scores', JSON.stringify(top));
}

function paintBoard(id) {
  const root = document.getElementById(id);
  if (!root) return;
  const board = loadScores();
  root.replaceChildren();
  if (!board.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No hunt has been entered yet.';
    root.appendChild(li);
    return;
  }
  for (const row of board) {
    const li = document.createElement('li');
    const mins = Math.floor((row.time || 0) / 60);
    const secs = Math.floor((row.time || 0) % 60);
    li.textContent = `${row.name} the ${row.cls} — ${row.score} pts, ${mins}:${String(secs).padStart(2, '0')}${row.won ? ', horn' : ''}`;
    root.appendChild(li);
  }
}

function renderClassPicks() {
  const root = document.getElementById('class-picks');
  if (!root) return;
  root.replaceChildren();
  seatClasses.forEach((id, i) => {
    const cls = CLASSES[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'class-pick';
    btn.style.setProperty('--pc', HUNTER_COLORS[i]);
    const portrait = document.createElement('img');
    portrait.className = 'hunter-portrait';
    portrait.src = hunterPortrait(id);
    portrait.alt = cls.name;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = HUNTER_NAMES[i];
    const calling = document.createElement('span');
    calling.className = 'calling';
    calling.textContent = cls.name;
    const blurb = document.createElement('span');
    blurb.className = 'blurb';
    blurb.textContent = cls.blurb;
    btn.append(portrait, swatch, who, calling, blurb);
    btn.addEventListener('click', () => {
      const next = CLASS_ORDER[(CLASS_ORDER.indexOf(id) + 1) % CLASS_ORDER.length];
      seatClasses[i] = next;
      renderClassPicks();
    });
    root.appendChild(btn);
  });
}

function toggleMute() {
  muted = !muted;
  audio.muted = muted;
  document.getElementById('mute').textContent = muted ? 'Sound off' : 'Sound on';
}

function formatTime(time) {
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  view.w = Math.max(320, rect.width);
  view.h = Math.max(240, rect.height);
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
}
