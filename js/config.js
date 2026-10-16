export const COLS = 41;
export const ROWS = 31;
export const TILE = 32;

export const FLOOR = 0;
export const WALL = 1;

export const DIRS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

export const PLAYER_SPEED = 112;
export const PLAYER_RADIUS = 9;
export const PLAYER_HP = 100;

export const GOBLIN_SPEED = 64;
export const GOBLIN_RADIUS = 8;
export const GOBLIN_HP = 2;

export const MINO_SPEED = 90;
export const MINO_CHARGE_SPEED = 220;
export const MINO_RADIUS = 11;
export const MINO_HP = 6;
export const MINO_TOUCH = 72;
export const MINO_RAM = 120;

export const LEVER_SIGHT = 96;
export const LEVER_USE = 52;
export const LEVER_COOLDOWN = 16;
export const WING_TURN = 4.2;

export const SWORD_CHARGES = 3;
export const GATE_COOLDOWN = 10;

export const NORMAL_RANGE = 36;
export const CHARGED_RANGE = 54;
export const NORMAL_CONE = 0.72;
export const CHARGED_CONE = 0.98;

export const BOT_NAMES = ['Mira', 'Cedric', 'Nyx', 'Roland'];
export const HUNTER_NAMES = ['Red', 'Blue', 'Green', 'Gold'];
export const HUNTER_COLORS = ['#e23d3d', '#3c7dff', '#2fbf71', '#e2a63a'];

export const CLASS_ORDER = ['knight', 'archer', 'wizard', 'thief'];

export const CLASSES = {
  knight: {
    id: 'knight',
    name: 'Knight',
    tag: 'Sword and shield',
    blurb: 'Raise the shield to block. Raise it as the blow lands and you parry. Your stamina returns slowly.',
    hp: 130,
    speed: 96,
    stamina: 110,
    staminaRegen: 12,
    normalStamina: 24,
    chargedStamina: 40,
    attack: 'melee',
    shield: 0.4,
    normalRange: 38,
    chargedRange: 56,
    normalCone: 0.82,
    chargedCone: 1.05,
    normalCd: 0.5,
    chargedCd: 0.68,
    normalDuration: 0.24,
    chargedDuration: 0.28,
    normalMove: 0.5,
    chargedMove: 0.62,
    normalGoblin: 1,
    chargedGoblin: 2,
    normalHunter: 36,
    chargedHunter: 64,
    pickupBonus: 12,
    pierce: false,
    normalSound: 'swing',
    chargedSound: 'charge',
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    tag: 'Bow',
    blurb: 'Arrows fell goblins down a corridor. The charged sword is a blade you must swing up close.',
    hp: 84,
    speed: 118,
    stamina: 100,
    staminaRegen: 22,
    normalStamina: 16,
    chargedStamina: 30,
    attack: 'bolt',
    shield: 0,
    normalRange: 220,
    chargedRange: 280,
    boltSpeed: 300,
    boltRadius: 4,
    boltColor: '#e7dcc4',
    normalCd: 0.44,
    chargedCd: 0.58,
    normalDuration: 0.2,
    chargedDuration: 0.22,
    normalMove: 0.9,
    chargedMove: 0.8,
    normalGoblin: 1,
    chargedGoblin: 2,
    normalHunter: 28,
    chargedHunter: 52,
    pickupBonus: 12,
    pierce: false,
    normalSound: 'arrow',
    chargedSound: 'charge',
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    tag: 'Staff',
    blurb: 'A bolt pierces every goblin in a line. The charged sword is a blade, not a spell.',
    hp: 78,
    speed: 104,
    stamina: 90,
    staminaRegen: 18,
    normalStamina: 18,
    chargedStamina: 32,
    attack: 'bolt',
    shield: 0,
    normalRange: 200,
    chargedRange: 250,
    boltSpeed: 250,
    boltRadius: 5,
    boltColor: '#c4b2ff',
    normalCd: 0.52,
    chargedCd: 0.64,
    normalDuration: 0.28,
    chargedDuration: 0.26,
    normalMove: 0.85,
    chargedMove: 0.76,
    normalGoblin: 1,
    chargedGoblin: 2,
    normalHunter: 24,
    chargedHunter: 44,
    pickupBonus: 12,
    pierce: true,
    normalSound: 'spell',
    chargedSound: 'charge',
  },
  thief: {
    id: 'thief',
    name: 'Thief',
    tag: 'Daggers',
    blurb: 'Fast daggers, and the quickest breath. Reach the heart first, or cut down whoever holds the sword.',
    hp: 88,
    speed: 136,
    stamina: 100,
    staminaRegen: 32,
    normalStamina: 12,
    chargedStamina: 26,
    attack: 'melee',
    shield: 0,
    normalRange: 28,
    chargedRange: 40,
    normalCone: 0.65,
    chargedCone: 0.85,
    normalCd: 0.28,
    chargedCd: 0.52,
    normalDuration: 0.16,
    chargedDuration: 0.2,
    normalMove: 0.88,
    chargedMove: 0.74,
    normalGoblin: 1,
    chargedGoblin: 2,
    normalHunter: 22,
    chargedHunter: 40,
    pickupBonus: 18,
    pierce: false,
    normalSound: 'swing',
    chargedSound: 'charge',
  },
};

export const KEYBINDS = [
  {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    attack: 'Space', charge: 'KeyQ', use: 'KeyE', block: 'KeyF', sprint: 'ShiftLeft',
    move: 'WASD', attackName: 'Space', chargeName: 'Q', useName: 'E', blockName: 'F', sprintName: 'Shift',
  },
  {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    attack: 'ShiftRight', charge: 'Slash', use: 'Enter', block: 'Period', sprint: 'ControlRight',
    move: 'Arrows', attackName: 'Right Shift', chargeName: '/', useName: 'Enter', blockName: '.', sprintName: 'Right Ctrl',
  },
  {
    up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL',
    attack: 'KeyU', charge: 'KeyO', use: 'KeyP', block: 'KeyY', sprint: 'KeyH',
    move: 'IJKL', attackName: 'U', chargeName: 'O', useName: 'P', blockName: 'Y', sprintName: 'H',
  },
  {
    up: 'Numpad8', down: 'Numpad2', left: 'Numpad4', right: 'Numpad6',
    attack: 'Numpad0', charge: 'Numpad1', use: 'NumpadEnter', block: 'Numpad5', sprint: 'Numpad3',
    move: 'Numpad', attackName: 'Num 0', chargeName: 'Num 1', useName: 'Num Enter', blockName: 'Num 5', sprintName: 'Num 3',
  },
];

export function tileCenter(c, r) {
  return [(c + 0.5) * TILE, (r + 0.5) * TILE];
}

export function tileOf(x, y) {
  return [Math.floor(x / TILE), Math.floor(y / TILE)];
}
