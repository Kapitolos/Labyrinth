const bank = new Map();

function bake(w, h, draw, scale = 2) {
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sg = src.getContext('2d');
  draw(sg);
  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = h * scale;
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

function px(g, x, y, color, w = 1, h = 1) {
  if (!color || w <= 0 || h <= 0) return;
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function tone(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (c) => {
    if (amount <= 1) return Math.max(0, Math.round(c * amount));
    return Math.min(255, Math.round(c + (255 - c) * (amount - 1)));
  };
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function tile(name) {
  if (bank.has(name)) return bank.get(name);
  const made = makeTile(name);
  bank.set(name, made);
  return made;
}

function makeTile(name) {
  if (name === 'wall') return bake(16, 16, paintWall);
  if (name === 'lip') return bake(16, 16, paintLip);
  if (name.startsWith('lair')) return bake(16, 16, (g) => paintFloor(g, Number(name.slice(4)), true));
  return bake(16, 16, (g) => paintFloor(g, Number(name.slice(5)) || 0, false));
}

function paintFloor(g, variant, lair) {
  const base = lair ? (variant ? '#321c1c' : '#3a2422') : (variant === 1 ? '#2c2720' : variant === 2 ? '#383228' : '#312c24');
  const stone = lair ? '#4a302c' : '#463e34';
  const mortar = lair ? '#1c100e' : '#16130f';
  const grit = lair ? '#6a4038' : '#5a4e42';
  px(g, 0, 0, base, 16, 16);
  const shift = variant === 1 ? 1 : variant === 2 ? 2 : 0;
  px(g, 1, 1, stone, 6, 5);
  px(g, 8, 1 + shift, tone(stone, 1.08), 7, 5);
  px(g, 1, 8, tone(stone, 0.92), 5, 6);
  px(g, 7, 7, stone, 8, 4);
  px(g, 7, 12, tone(stone, 1.05), 8, 3);
  px(g, 0, 0, mortar, 16, 1);
  px(g, 0, 15, mortar, 16, 1);
  px(g, 0, 0, mortar, 1, 16);
  px(g, 15, 0, mortar, 1, 16);
  px(g, 0, 7, mortar, 16, 1);
  px(g, 7, 1, mortar, 1, 7);
  px(g, 6, 8, mortar, 1, 7);
  if (variant !== 1) px(g, 3, 3, grit, 2, 1);
  if (variant === 2) px(g, 10, 9, mortar, 3, 1);
  if (lair && variant === 0) {
    px(g, 10, 10, '#cbb89a', 3, 1);
    px(g, 12, 9, '#cbb89a', 1, 2);
  }
  if (lair && variant === 1) px(g, 3, 11, '#8a4038', 2, 2);
}

function paintWall(g) {
  px(g, 0, 0, '#0c0a09', 16, 16);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const off = row % 2 ? 4 : 0;
    px(g, 0, y, '#070605', 16, 1);
    for (let x = -8; x < 16; x += 8) {
      const bx = x + off;
      const x0 = Math.max(0, bx);
      const x1 = Math.min(16, bx + 7);
      if (x1 <= x0) continue;
      const brick = (row + bx) % 3 === 0 ? '#241f1a' : '#1c1814';
      px(g, x0, y + 1, brick, x1 - x0, 3);
      if (x0 < 16) px(g, Math.min(15, Math.max(0, bx + 7)), y + 1, '#070605', 1, 3);
      px(g, x0, y + 1, '#3a3228', Math.min(2, x1 - x0), 1);
    }
  }
}

function paintLip(g) {
  px(g, 0, 12, '#4a4036', 16, 2);
  px(g, 0, 14, '#1a1612', 16, 2);
}

const INK = '#1a120e';
const SKIN = '#f0d0b0';
const SKIN2 = '#c89870';
const STEEL = '#9a948a';
const STEEL2 = '#4a453e';
const GOLD = '#c4a15a';
const GOLD2 = '#6a4520';
const BOOT = '#100e0c';
const WOOD = '#6b4424';
const WOOD2 = '#3a2414';

function actor(kind, color, dir, frame) {
  const d = dir === 'w' ? 'e' : dir;
  const key = `${kind}|${color || ''}|${d}|${frame}`;
  if (!bank.has(key)) bank.set(key, bakeActor(kind, color, d, frame));
  return bank.get(key);
}

function bakeActor(kind, color, dir, frame) {
  if (kind === 'goblin') return bake(16, 18, (g) => paintGoblin(g, dir, frame));
  if (kind === 'cultist') return bake(16, 18, (g) => paintCultist(g, dir, frame));
  if (kind === 'minotaur') return bake(20, 22, (g) => paintMinotaur(g, dir, frame));
  return bake(16, 18, (g) => paintHunter(g, kind, color || '#e23d3d', dir, frame));
}

function paintHunter(g, cls, color, dir, frame) {
  const cloth = color;
  const dark = tone(color, 0.55);
  const light = tone(color, 1.25);
  const walk = frame === 'walk';
  const swing = frame === 'swing';
  const block = frame === 'block';
  const side = dir === 'e';
  const back = dir === 'n';
  if (back) paintHunterBack(g, cls, cloth, dark, light, walk, swing);
  else if (side) paintHunterSide(g, cls, cloth, dark, light, walk, swing, block);
  else paintHunterFront(g, cls, cloth, dark, light, walk, swing, block);
}

function paintHunterFront(g, cls, cloth, dark, light, walk, swing, block) {
  const leg = walk ? 1 : 0;
  px(g, 4, 15 + leg, BOOT, 3, 2);
  px(g, 9, 15 - leg, BOOT, 3, 2);
  px(g, 5, 12, dark, 2, 3);
  px(g, 9, 12, dark, 2, 3);
  px(g, 3, 7, dark, 10, 6);
  px(g, 4, 8, cloth, 8, 4);
  px(g, 4, 11, GOLD2, 8, 1);
  if (cls === 'wizard') {
    px(g, 2, 8, dark, 12, 7);
    px(g, 4, 8, cloth, 8, 5);
    px(g, 7, 4, cloth, 2, 4);
    px(g, 6, 1, dark, 4, 3);
    px(g, 7, 0, GOLD, 2, 1);
  } else if (cls === 'knight') {
    px(g, 5, 2, STEEL2, 6, 5);
    px(g, 6, 3, STEEL, 4, 3);
    px(g, 6, 1, cloth, 4, 2);
    px(g, 6, 5, INK, 4, 1);
    px(g, 6, 8, STEEL, 4, 3);
  } else if (cls === 'archer') {
    px(g, 5, 3, SKIN, 6, 4);
    px(g, 6, 4, INK, 1, 1);
    px(g, 9, 4, INK, 1, 1);
    px(g, 5, 2, dark, 6, 2);
    px(g, 7, 1, light, 2, 2);
  } else {
    px(g, 5, 3, SKIN, 6, 4);
    px(g, 6, 4, INK, 1, 1);
    px(g, 9, 4, INK, 1, 1);
    px(g, 5, 2, INK, 6, 2);
    px(g, 4, 8, INK, 1, 4);
    px(g, 11, 8, INK, 1, 4);
  }
  if (cls === 'knight') {
    if (block) {
      px(g, 0, 6, STEEL, 5, 8);
      px(g, 1, 7, light, 3, 4);
      px(g, 2, 8, GOLD, 1, 2);
      px(g, 11, 8, GOLD, 1, 5);
    } else {
      px(g, 0, 8, STEEL2, 3, 5);
      px(g, 1, 9, STEEL, 1, 3);
      const sy = swing ? 5 : 8;
      px(g, 12, sy, STEEL, 1, swing ? 8 : 5);
      px(g, 11, sy + (swing ? 6 : 0), GOLD2, 3, 1);
      px(g, 12, sy, GOLD, 1, 2);
    }
  } else if (cls === 'archer') {
    px(g, 12, 4, WOOD, 1, 8);
    px(g, 11, 4, STEEL, 3, 1);
    px(g, 11, 11, STEEL, 3, 1);
    if (swing) px(g, 13, 7, GOLD, 3, 1);
    px(g, 1, 8, WOOD2, 2, 4);
  } else if (cls === 'wizard') {
    px(g, 12, swing ? 3 : 6, WOOD, 1, 8);
    px(g, 11, swing ? 3 : 6, light, 3, 3);
  } else {
    px(g, 12, swing ? 6 : 9, STEEL, 3, 1);
    px(g, 1, swing ? 6 : 9, STEEL, 3, 1);
    px(g, 13, swing ? 5 : 8, GOLD, 1, 1);
    px(g, 1, swing ? 5 : 8, GOLD, 1, 1);
  }
}

function paintHunterSide(g, cls, cloth, dark, light, walk, swing, block) {
  const step = walk ? 1 : 0;
  px(g, 3, 15 + step, BOOT, 3, 2);
  px(g, 8, 15 - step, BOOT, 3, 2);
  px(g, 4, 12, dark, 2, 3);
  px(g, 8, 12, dark, 2, 3);
  px(g, 3, 7, dark, 8, 6);
  px(g, 4, 8, cloth, 6, 4);
  px(g, 4, 11, GOLD2, 6, 1);
  if (cls === 'wizard') {
    px(g, 2, 7, dark, 9, 8);
    px(g, 3, 8, cloth, 7, 5);
    px(g, 8, 4, SKIN, 3, 3);
    px(g, 10, 5, INK, 1, 1);
    px(g, 8, 1, dark, 3, 3);
    px(g, 9, 0, GOLD, 1, 1);
  } else if (cls === 'knight') {
    px(g, 7, 3, STEEL2, 5, 4);
    px(g, 8, 4, STEEL, 3, 2);
    px(g, 8, 2, cloth, 3, 2);
    px(g, 10, 5, INK, 2, 1);
    px(g, 8, 6, SKIN2, 2, 1);
  } else if (cls === 'archer') {
    px(g, 8, 3, SKIN, 4, 4);
    px(g, 11, 4, INK, 1, 1);
    px(g, 8, 2, dark, 4, 2);
  } else {
    px(g, 8, 3, SKIN, 4, 4);
    px(g, 11, 4, INK, 1, 1);
    px(g, 8, 2, INK, 4, 2);
  }
  if (cls === 'knight') {
    if (block) {
      px(g, 11, 6, STEEL, 4, 7);
      px(g, 12, 7, light, 2, 4);
      px(g, 4, 9, GOLD, 1, 4);
    } else {
      const len = swing ? 5 : 3;
      px(g, 11, swing ? 6 : 8, STEEL, len, 1);
      px(g, 11 + len - 1, swing ? 5 : 7, GOLD, 1, 1);
      px(g, 2, 8, STEEL2, 2, 4);
    }
  } else if (cls === 'archer') {
    px(g, 6, 6, WOOD, 1, 7);
    px(g, 5, 6, STEEL, 1, 1);
    px(g, 5, 12, STEEL, 1, 1);
    if (swing) {
      px(g, 12, 8, WOOD, 3, 1);
      px(g, 15, 7, GOLD, 1, 3);
    }
  } else if (cls === 'wizard') {
    px(g, 11, swing ? 4 : 8, WOOD, 1, 7);
    px(g, 10, swing ? 4 : 8, light, 3, 2);
  } else {
    px(g, 11, swing ? 7 : 9, STEEL, swing ? 4 : 3, 1);
    px(g, 3, 9, STEEL, 2, 1);
  }
}

function paintHunterBack(g, cls, cloth, dark, light, walk, swing) {
  const leg = walk ? 1 : 0;
  px(g, 4, 15 + leg, BOOT, 3, 2);
  px(g, 9, 15 - leg, BOOT, 3, 2);
  px(g, 5, 12, dark, 2, 3);
  px(g, 9, 12, dark, 2, 3);
  px(g, 3, 7, dark, 10, 6);
  px(g, 4, 8, cloth, 8, 4);
  if (cls === 'knight') {
    px(g, 5, 2, STEEL2, 6, 5);
    px(g, 6, 1, cloth, 4, 2);
    px(g, 1, 8, STEEL2, 2, 4);
    px(g, 12, swing ? 5 : 8, STEEL, 1, swing ? 7 : 4);
  } else if (cls === 'wizard') {
    px(g, 6, 1, dark, 4, 5);
    px(g, 7, 0, GOLD, 2, 1);
    px(g, 12, swing ? 4 : 7, WOOD, 1, 6);
  } else if (cls === 'archer') {
    px(g, 5, 2, dark, 6, 4);
    px(g, 2, 7, WOOD2, 2, 5);
    if (swing) px(g, 12, 8, WOOD, 3, 1);
  } else {
    px(g, 5, 2, INK, 6, 4);
    px(g, 12, swing ? 6 : 9, STEEL, 3, 1);
  }
  px(g, 6, 9, light, 4, 1);
}

function paintGoblin(g, dir, frame) {
  const walk = frame === 'walk';
  const wind = frame === 'windup';
  const guard = frame === 'guard';
  const side = dir === 'e';
  const back = dir === 'n';
  const skin = '#3f6a38';
  const skin2 = '#1d3a22';
  const rag = '#24160f';
  const leg = walk ? 1 : 0;
  if (back) {
    px(g, 4, 14 + leg, BOOT, 2, 2);
    px(g, 9, 14 - leg, BOOT, 2, 2);
    px(g, 4, 8, rag, 8, 6);
    px(g, 5, 3, skin2, 6, 5);
    px(g, 3, 2, skin2, 2, 3);
    px(g, 11, 2, skin2, 2, 3);
    px(g, 12, wind ? 4 : 8, STEEL, 1, wind ? 6 : 4);
    return;
  }
  if (side) {
    px(g, 3, 14 + leg, BOOT, 2, 2);
    px(g, 8, 14 - leg, BOOT, 2, 2);
    px(g, 4, 8, rag, 6, 6);
    px(g, 8, 4, skin, 4, 4);
    px(g, 11, 5, '#ff5a4a', 1, 1);
    px(g, 8, 2, skin2, 3, 2);
    px(g, 7, 1, skin2, 2, 2);
    const sy = wind ? 4 : guard ? 7 : 8;
    px(g, wind ? 3 : 11, sy, STEEL, wind ? 3 : 3, 1);
    px(g, 2, 8, guard ? STEEL : STEEL2, 2, 4);
    return;
  }
  px(g, 4, 14 + leg, BOOT, 2, 2);
  px(g, 9, 14 - leg, BOOT, 2, 2);
  px(g, 4, 8, rag, 8, 6);
  px(g, 5, 9, skin2, 6, 3);
  px(g, 5, 3, skin, 6, 5);
  px(g, 3, 2, skin2, 2, 3);
  px(g, 11, 2, skin2, 2, 3);
  px(g, 6, 5, '#ff5a4a', 1, 1);
  px(g, 9, 5, '#ff5a4a', 1, 1);
  px(g, 7, 6, skin2, 2, 1);
  if (guard) {
    px(g, 0, 6, STEEL, 4, 6);
    px(g, 1, 7, '#c5ccd6', 2, 3);
  } else {
    px(g, 0, 8, STEEL2, 3, 4);
  }
  if (wind) px(g, 11, 2, STEEL, 1, 5);
  else px(g, 12, 7, STEEL, 3, 1);
  px(g, 13, wind ? 2 : 6, GOLD, 1, 1);
}

function paintMinotaur(g, dir, frame) {
  const charge = frame === 'charge';
  const side = dir === 'e';
  const back = dir === 'n';
  const fur = '#4a2416';
  const fur2 = '#24110c';
  const horn = '#d2c2a4';
  if (back) {
    px(g, 4, 16, BOOT, 3, 3);
    px(g, 12, 16, BOOT, 3, 3);
    px(g, 3, 8, fur2, 14, 8);
    px(g, 4, 9, fur, 12, 6);
    px(g, 6, 3, fur2, 8, 6);
    px(g, 4, 1, horn, 2, 4);
    px(g, 14, 1, horn, 2, 4);
    return;
  }
  if (side) {
    px(g, 2, 17, BOOT, 3, 2);
    px(g, 8, 17, BOOT, 3, 2);
    px(g, 2, 9, fur2, 10, 8);
    px(g, 3, 10, fur, 8, 6);
    px(g, charge ? 10 : 8, 5, fur2, 6, 6);
    px(g, charge ? 14 : 12, 6, fur, 4, 3);
    px(g, charge ? 12 : 10, 1, horn, 2, 5);
    px(g, charge ? 16 : 14, 2, GOLD, 2, 2);
    px(g, charge ? 15 : 13, 6, '#ffb15a', 1, 1);
    return;
  }
  px(g, 3, 18, BOOT, 4, 2);
  px(g, 13, 18, BOOT, 4, 2);
  px(g, 2, 10, fur2, 16, 8);
  px(g, 4, 11, fur, 12, 6);
  px(g, 6, charge ? 6 : 4, fur2, 8, 7);
  px(g, 7, charge ? 7 : 5, fur, 6, 4);
  px(g, 4, charge ? 4 : 1, horn, 2, 5);
  px(g, 14, charge ? 4 : 1, horn, 2, 5);
  px(g, 9, charge ? 9 : 7, GOLD, 2, 2);
  px(g, 7, charge ? 7 : 5, '#ffb15a', 1, 1);
  px(g, 12, charge ? 7 : 5, '#ffb15a', 1, 1);
}

function prop(name) {
  if (bank.has(name)) return bank.get(name);
  const made = makeProp(name);
  bank.set(name, made);
  return made;
}

function makeProp(name) {
  if (name === 'sword') return bake(16, 16, paintSword);
  if (name === 'chest') return bake(16, 16, (g) => paintChest(g, false));
  if (name === 'chest-open') return bake(16, 16, (g) => paintChest(g, true));
  if (name === 'gate') return bake(16, 16, (g) => paintGate(g, true));
  if (name === 'gate-sleep') return bake(16, 16, (g) => paintGate(g, false));
  if (name === 'lever') return bake(16, 16, (g) => paintLever(g, false));
  if (name === 'lever-down') return bake(16, 16, (g) => paintLever(g, true));
  if (name === 'arrow') return bake(12, 4, paintArrow, 2);
  if (name === 'bolt') return bake(12, 4, paintBolt, 2);
  if (name === 'flame') return bake(12, 12, paintFlame);
  return bake(12, 12, (g) => paintGem(g, name));
}

function paintCultist(g, dir, frame) {
  const wind = frame === 'windup';
  const walk = frame === 'walk';
  const side = dir === 'e';
  const back = dir === 'n';
  const robe = '#1a1020';
  const robe2 = '#2c1840';
  const bone = '#d9cbb6';
  const ember = wind ? '#ffb15a' : '#ff5a2a';
  const leg = walk ? 1 : 0;
  if (back) {
    px(g, 5, 15 + leg, BOOT, 2, 2);
    px(g, 9, 15 - leg, BOOT, 2, 2);
    px(g, 4, 7, robe, 8, 8);
    px(g, 5, 2, robe2, 6, 6);
    px(g, 6, 1, robe, 4, 2);
    px(g, 12, wind ? 4 : 8, WOOD, 1, 6);
    px(g, 11, wind ? 3 : 7, ember, 3, 3);
    return;
  }
  if (side) {
    px(g, 4, 15 + leg, BOOT, 2, 2);
    px(g, 8, 15 - leg, BOOT, 2, 2);
    px(g, 3, 7, robe, 8, 8);
    px(g, 4, 8, robe2, 6, 5);
    px(g, 8, 3, bone, 4, 4);
    px(g, 11, 4, '#ff2a22', 1, 1);
    px(g, 8, 1, robe, 4, 3);
    px(g, 11, wind ? 5 : 8, WOOD, 1, 7);
    px(g, 10, wind ? 4 : 7, ember, 3, 3);
    return;
  }
  px(g, 5, 15 + leg, BOOT, 2, 2);
  px(g, 9, 15 - leg, BOOT, 2, 2);
  px(g, 3, 7, robe, 10, 8);
  px(g, 4, 8, robe2, 8, 5);
  px(g, 6, 10, '#0c0810', 4, 2);
  px(g, 5, 3, bone, 6, 4);
  px(g, 6, 4, '#ff2a22', 1, 1);
  px(g, 9, 4, '#ff2a22', 1, 1);
  px(g, 7, 6, '#8a7060', 2, 1);
  px(g, 5, 1, robe, 6, 3);
  px(g, 6, 0, robe2, 4, 2);
  px(g, 12, wind ? 3 : 7, WOOD, 1, 7);
  px(g, 11, wind ? 2 : 6, ember, 3, 3);
  px(g, 12, wind ? 3 : 7, '#fff1c9', 1, 1);
}

function paintFlame(g) {
  px(g, 5, 1, '#fff1c9', 2, 2);
  px(g, 4, 3, '#ffb15a', 4, 3);
  px(g, 3, 5, '#ff5a2a', 6, 4);
  px(g, 5, 8, '#a32020', 2, 2);
  px(g, 2, 6, '#ff9a3c', 2, 2);
  px(g, 8, 6, '#ff9a3c', 2, 2);
}

function paintSword(g) {
  px(g, 7, 11, WOOD, 2, 4);
  px(g, 6, 14, WOOD2, 4, 1);
  px(g, 4, 10, GOLD2, 8, 2);
  px(g, 7, 1, STEEL, 2, 9);
  px(g, 8, 2, '#ffffff', 1, 7);
  px(g, 6, 1, GOLD, 4, 2);
}

function paintChest(g, open) {
  px(g, 2, 6, WOOD2, 12, 8);
  px(g, 2, 8, WOOD, 12, 1);
  px(g, 2, 11, WOOD, 12, 1);
  px(g, 2, 5, GOLD2, 12, 2);
  px(g, 2, 12, GOLD2, 12, 2);
  px(g, 7, 8, GOLD, 2, 3);
  if (open) px(g, 4, 7, '#24180f', 8, 4);
  else px(g, 3, 4, WOOD, 10, 2);
}

function paintGate(g, ready) {
  const ring = ready ? '#7ee0d2' : '#3e5854';
  const core = ready ? '#14302c' : '#121816';
  px(g, 2, 2, core, 12, 12);
  px(g, 2, 2, ring, 12, 1);
  px(g, 2, 13, ring, 12, 1);
  px(g, 2, 2, ring, 1, 12);
  px(g, 13, 2, ring, 1, 12);
  px(g, 6, 6, ring, 4, 1);
  px(g, 6, 9, ring, 4, 1);
  px(g, 6, 6, ring, 1, 4);
  px(g, 9, 6, ring, 1, 4);
}

function paintLever(g, down) {
  px(g, 2, 10, '#3a3228', 12, 4);
  px(g, 4, 8, '#2a241c', 8, 3);
  px(g, 7, 9, INK, 2, 2);
  if (down) {
    px(g, 8, 10, '#d7c4a2', 6, 2);
    px(g, 13, 9, GOLD2, 2, 3);
  } else {
    px(g, 6, 2, '#d7c4a2', 2, 7);
    px(g, 5, 2, GOLD, 4, 2);
  }
}

function paintGem(g, kind) {
  if (kind === 'charge') {
    px(g, 5, 1, GOLD2, 2, 2);
    px(g, 3, 3, GOLD2, 6, 3);
    px(g, 4, 3, GOLD, 4, 2);
    px(g, 5, 6, GOLD2, 2, 4);
    px(g, 5, 4, '#fff6d4', 1, 2);
  } else if (kind === 'fire' || kind === 'wildfire') {
    const hot = kind === 'wildfire' ? '#ff5a2a' : '#ff9a3c';
    px(g, 5, 1, '#fff1c9', 2, 2);
    px(g, 4, 3, hot, 4, 4);
    px(g, 3, 5, hot, 6, 3);
    px(g, 5, 8, GOLD2, 2, 2);
  } else if (kind === 'boon') {
    px(g, 5, 1, '#efe6ff', 2, 2);
    px(g, 3, 3, '#c4b2ff', 6, 6);
    px(g, 5, 4, '#efe6ff', 2, 3);
  } else {
    px(g, 2, 4, '#a32020', 8, 4);
    px(g, 4, 2, '#e23d3d', 4, 8);
    px(g, 5, 5, '#fff4f4', 2, 2);
  }
}

function paintArrow(g) {
  px(g, 0, 1, WOOD, 8, 2);
  px(g, 8, 0, STEEL, 4, 1);
  px(g, 8, 3, STEEL, 4, 1);
  px(g, 10, 1, STEEL, 2, 2);
}

function paintBolt(g) {
  px(g, 0, 1, '#8d7ad4', 8, 2);
  px(g, 8, 0, '#efe6ff', 4, 4);
}

export function tileCanvas(name) {
  return tile(name);
}

const HUNTER_IDS = ['knight', 'archer', 'wizard', 'thief'];

export function hunterPortrait(classId) {
  const id = HUNTER_IDS.includes(classId) ? classId : 'knight';
  return `art/hunters/${id}/idle_0.png`;
}

function ensureHunters() {
  if (bank.has('hunters-ready') || typeof document === 'undefined' || typeof Image === 'undefined') return;
  bank.set('hunters-ready', true);
  for (const id of HUNTER_IDS) {
    for (let i = 0; i < 4; i++) queueHunter(id, `idle_${i}`);
    for (let i = 0; i < 4; i++) queueHunter(id, `run_${i}`);
    queueHunter(id, 'hit');
  }
}

function queueHunter(id, frame) {
  const key = `hunter|${id}|${frame}`;
  const img = new Image();
  img.onload = () => {
    const out = document.createElement('canvas');
    out.width = img.naturalWidth * 2;
    out.height = img.naturalHeight * 2;
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, out.width, out.height);
    bank.set(key, out);
  };
  img.src = hunterPortrait(id).replace('idle_0.png', `${frame}.png`);
}

export function hunterCanvas(classId, color, dir, frame) {
  ensureHunters();
  const packed = bank.get(`hunter|${classId}|${frame}`);
  if (packed) return packed;
  const posed = frame === 'hit' ? 'swing' : String(frame).startsWith('run') ? 'walk' : frame === 'block' ? 'block' : 'idle';
  return actor(classId, color, dir, posed);
}

export function monsterCanvas(kind, dir, frame) {
  return actor(kind, '', dir, frame);
}

export function propCanvas(name) {
  return prop(name);
}

export function facingDir(fx, fy) {
  if (Math.abs(fx || 0) > Math.abs(fy || 0)) return (fx || 0) < 0 ? 'w' : 'e';
  return (fy || 0) < 0 ? 'n' : 's';
}

export function blit(ctx, image, x, y, opts = {}) {
  if (!image) return;
  const w = image.width;
  const h = image.height;
  ctx.save();
  ctx.translate(x, y);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, Math.round(-w / 2 + (opts.ox || 0)), Math.round(-h / 2 + (opts.oy || 0)));
  ctx.restore();
}
