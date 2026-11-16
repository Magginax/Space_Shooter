/**
 * Guns and the nodes that upgrade them.
 *
 * Each node has its own level. Buying it requires that level, and the node to its left.
 * The same levels are copied in supabase/schema.sql (loadout_valid).
 *
 * Blaster rank 0 is the original gun: one pellet, 0.45s cooldown.
*/

export const GUN_ORDER = ['blaster', 'beam', 'pods'];
export const STAT_ORDER = ['rate', 'shot', 'pierce'];

/** Level required for each rank, left to right. The length is the cap. */
export const NODE_LEVELS = {
  blaster: { rate: [2, 4], shot: [3], pierce: [6] },
  beam: { rate: [7, 9], shot: [8], pierce: [11] },
  pods: { rate: [12, 14], shot: [13], pierce: [16] },
};

export const GUNS = {
  blaster: { id: 'blaster', name: 'Blaster', unlockLevel: 0 },
  beam: { id: 'beam', name: 'Beam', unlockLevel: 5 },
  pods: { id: 'pods', name: 'Pods', unlockLevel: 10 },
};

export const GUN_BLURB = {
  blaster: 'ONE PELLET. A STEADY GUN.',
  beam: 'HOLD FIRE. A LINE ON THAT ROW.',
  pods: 'A SLOW SHOT THAT CLEARS A PACK.',
};

const RATE_TIME = {
  blaster: ['0.45S', '0.32S', '0.22S'],
  beam: ['0.35S', '0.24S', '0.16S'],
  pods: ['0.90S', '0.65S', '0.45S'],
};

const NODE_BLURB = {
  blaster: {
    shot: 'ADDS A SECOND PELLET ABOVE.',
    pierce: 'THE LOWER PELLET HITS ONE MORE.',
  },
  beam: {
    shot: 'THE LINE ALSO HITS THE ROW ABOVE.',
    pierce: 'THE LINE KEEPS GOING THROUGH.',
  },
  pods: {
    shot: 'FIRES A SECOND POD BEHIND.',
    pierce: 'BURSTS AGAIN ON THE NEXT SHIP.',
  },
};

const COOLDOWNS = {
  blaster: [0.45, 0.32, 0.22],
  beam: [0.35, 0.24, 0.16],
  pods: [0.9, 0.65, 0.45],
};

export const PELLET_SPEED = 130;
export const POD_SPEED = 70;
export const SHOT_OFFSET = 8;
export const POD_STAGGER = 8;

export function nodeLevel(gunId, statId, index) {
  const level = NODE_LEVELS[gunId]?.[statId]?.[index];
  return Number.isInteger(level) ? level : Infinity;
}

export function statCap(gunId, statId) {
  return NODE_LEVELS[gunId]?.[statId]?.length ?? 0;
}

function emptyRanks() {
  return { rate: 0, shot: 0, pierce: 0 };
}

export function defaultLoadout() {
  return {
    gun: 'blaster',
    ranks: { blaster: emptyRanks(), beam: emptyRanks(), pods: emptyRanks() },
  };
}

/** A loadout the game can fire. Missing or wild values fall back to the defaults. */
export function cloneLoadout(loadout) {
  const next = defaultLoadout();
  if (!loadout || typeof loadout !== 'object') return next;
  if (GUNS[loadout.gun]) next.gun = loadout.gun;
  for (const gun of GUN_ORDER) {
    for (const stat of STAT_ORDER) {
      const value = loadout.ranks?.[gun]?.[stat];
      if (!Number.isInteger(value)) continue;
      next.ranks[gun][stat] = Math.min(statCap(gun, stat), Math.max(0, value));
    }
  }
  return next;
}

export function isUnlocked(gunId, level) {
  return Boolean(GUNS[gunId]) && level >= GUNS[gunId].unlockLevel;
}

export function loadoutError(previous, next, level) {
  if (!next || typeof next !== 'object' || !GUNS[next.gun]) return 'That loadout is not allowed';
  if (!next.ranks || typeof next.ranks !== 'object') return 'That loadout is not allowed';
  if (!Number.isInteger(level) || level < 0) return 'That loadout is not allowed';
  if (!isUnlocked(next.gun, level)) return 'That gun is locked';

  const prev = cloneLoadout(previous);
  for (const gun of GUN_ORDER) {
    const ranks = next.ranks[gun];
    if (!ranks || typeof ranks !== 'object') return 'That loadout is not allowed';
    for (const stat of STAT_ORDER) {
      const value = ranks[stat];
      const cap = statCap(gun, stat);
      if (!Number.isInteger(value) || value < 0 || value > cap) return 'That loadout is not allowed';
      if (value < prev.ranks[gun][stat]) return 'A rank cannot go down';
      if (value > 0 && level < nodeLevel(gun, stat, value - 1)) return 'That loadout is not allowed';
    }
  }
  return null;
}

/**
 * Buys the next node on one row. `reason` is "locked", "capped", or "unknown".
 * The returned loadout is a new object.
 */
export function claim(loadout, level, gunId, statId) {
  if (!STAT_ORDER.includes(statId) || !GUNS[gunId]) return { ok: false, reason: 'unknown' };
  if (!isUnlocked(gunId, level)) return { ok: false, reason: 'locked' };
  const rank = loadout.ranks[gunId]?.[statId] ?? 0;
  if (rank >= statCap(gunId, statId)) return { ok: false, reason: 'capped' };
  if (level < nodeLevel(gunId, statId, rank)) return { ok: false, reason: 'locked' };
  const next = cloneLoadout(loadout);
  next.ranks[gunId][statId] = rank + 1;
  return { ok: true, loadout: next };
}

export function equip(loadout, level, gunId) {
  if (!GUNS[gunId]) return { ok: false, reason: 'unknown' };
  if (!isUnlocked(gunId, level)) return { ok: false, reason: 'locked' };
  if (loadout.gun === gunId) return { ok: true, loadout };
  const next = cloneLoadout(loadout);
  next.gun = gunId;
  return { ok: true, loadout: next };
}

export function nodeBlurb(gunId, statId, index) {
  if (statId === 'rate') {
    const times = RATE_TIME[gunId] ?? [];
    const from = times[index];
    const to = times[index + 1];
    if (!from || !to) return 'SHOTS ARE AT FULL SPEED.';
    return `COOLDOWN ${from} TO ${to}.`;
  }
  return NODE_BLURB[gunId]?.[statId] ?? '';
}

/**
 * Whether that node can be bought. `rank` is how many nodes on the row are owned.
 */
export function nodeStatus(gunId, statId, index, rank, level) {
  if (index < rank) return 'OWNED';
  if (index > rank) return 'BUY THE NODE ON THE LEFT';
  const need = nodeLevel(gunId, statId, index);
  if (level < need) return `NEEDS LEVEL ${need}`;
  return 'PRESS SPACE OR ENTER';
}

export function cooldownFor(gunId, ranks) {
  const table = COOLDOWNS[gunId] ?? COOLDOWNS.blaster;
  const rate = ranks?.rate ?? 0;
  return table[Math.min(Math.max(rate, 0), table.length - 1)];
}

/** Pellets or pods leaving `muzzle` ({ x, y }). The beam is not a shot. */
export function spawnShots(gunId, ranks, muzzle) {
  if (gunId === 'pods') {
    const pierce = ranks.pierce > 0 ? 1 : 0;
    const shots = [pod(muzzle.x, muzzle.y, pierce)];
    if (ranks.shot > 0) shots.push(pod(muzzle.x - POD_STAGGER, muzzle.y, pierce));
    return shots;
  }
  const shots = [pellet(muzzle.x, muzzle.y, ranks.pierce > 0 ? 1 : 0)];
  if (ranks.shot > 0) shots.push(pellet(muzzle.x, muzzle.y - SHOT_OFFSET, 0));
  return shots;
}

function pellet(x, y, pierce) {
  return { x, y, w: 3, h: 1, pierce, speed: PELLET_SPEED, kind: 'pellet' };
}

function pod(x, y, pierce) {
  return { x, y, w: 5, h: 3, pierce, speed: POD_SPEED, kind: 'pod' };
}

export function burstBox(bullet) {
  const padX = 12;
  const padY = 10;
  return {
    x: bullet.x - padX,
    y: bullet.y - padY,
    w: bullet.w + padX * 2,
    h: bullet.h + padY * 2,
  };
}
