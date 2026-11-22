/**
 * Guns and the nodes that upgrade them.
 *
 * A gun opens at its level and is then bought with coins. A node costs coins,
 * and needs its gun and the node to its left. The same prices are copied in
 * supabase/schema.sql (loadout_price).
 *
 * Blaster rank 0 is the original gun: one pellet, 0.45s cooldown.
*/

export const GUN_ORDER = ['blaster', 'beam', 'pods'];
export const STAT_ORDER = ['rate', 'shot', 'pierce'];

/** Coins for each rank, left to right, on every gun. The length is the cap. */
export const NODE_PRICES = { rate: [8, 16], shot: [12], pierce: [24] };

export const GUNS = {
  blaster: { id: 'blaster', name: 'Blaster', unlockLevel: 0, price: 0 },
  beam: { id: 'beam', name: 'Beam', unlockLevel: 5, price: 50 },
  pods: { id: 'pods', name: 'Pods', unlockLevel: 10, price: 120 },
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

export function nodePrice(statId, index) {
  const price = NODE_PRICES[statId]?.[index];
  return Number.isInteger(price) ? price : Infinity;
}

export function statCap(gunId, statId) {
  return GUNS[gunId] ? (NODE_PRICES[statId]?.length ?? 0) : 0;
}

function emptyRanks() {
  return { rate: 0, shot: 0, pierce: 0 };
}

export function defaultLoadout() {
  return {
    gun: 'blaster',
    owned: ['blaster'],
    ranks: { blaster: emptyRanks(), beam: emptyRanks(), pods: emptyRanks() },
  };
}

/** A loadout the game can fire. Missing or wild values fall back to the defaults. */
export function cloneLoadout(loadout) {
  const next = defaultLoadout();
  if (!loadout || typeof loadout !== 'object') return next;
  for (const gun of GUN_ORDER) {
    for (const stat of STAT_ORDER) {
      const value = loadout.ranks?.[gun]?.[stat];
      if (!Number.isInteger(value)) continue;
      next.ranks[gun][stat] = Math.min(statCap(gun, stat), Math.max(0, value));
    }
  }
  // A loadout saved before guns were bought has no list: it keeps the gun it mounted or upgraded.
  const kept = (gun) => loadout.gun === gun || STAT_ORDER.some((stat) => next.ranks[gun][stat] > 0);
  const owns = Array.isArray(loadout.owned) ? (gun) => loadout.owned.includes(gun) : kept;
  next.owned = GUN_ORDER.filter((gun) => gun === 'blaster' || owns(gun));
  if (next.owned.includes(loadout.gun)) next.gun = loadout.gun;
  return next;
}

export function isUnlocked(gunId, level) {
  return Boolean(GUNS[gunId]) && level >= GUNS[gunId].unlockLevel;
}

export function isOwned(loadout, gunId) {
  return Boolean(loadout?.owned?.includes(gunId));
}

/** Coins a loadout holds: its guns and every node bought on them. */
export function loadoutPrice(loadout) {
  let total = 0;
  for (const gun of GUN_ORDER) {
    if (isOwned(loadout, gun)) total += GUNS[gun].price;
    for (const stat of STAT_ORDER) {
      for (let i = 0; i < loadout.ranks[gun][stat]; i += 1) total += nodePrice(stat, i);
    }
  }
  return total;
}

/** `coins` is the balance held with `previous`. What `next` adds is paid from it. */
export function loadoutError(previous, next, level, coins) {
  if (!next || typeof next !== 'object' || !GUNS[next.gun]) return 'That loadout is not allowed';
  if (!next.ranks || typeof next.ranks !== 'object') return 'That loadout is not allowed';
  if (!Number.isInteger(level) || level < 0) return 'That loadout is not allowed';
  if (!Number.isInteger(coins) || coins < 0) return 'That loadout is not allowed';
  if (!Array.isArray(next.owned) || !next.owned.includes('blaster')) return 'That loadout is not allowed';
  if (!next.owned.every((gun) => isUnlocked(gun, level))) return 'That gun is locked';
  if (!isOwned(next, next.gun)) return 'That gun is locked';

  const prev = cloneLoadout(previous);
  if (!prev.owned.every((gun) => isOwned(next, gun))) return 'A gun cannot be sold';
  for (const gun of GUN_ORDER) {
    const ranks = next.ranks[gun];
    if (!ranks || typeof ranks !== 'object') return 'That loadout is not allowed';
    for (const stat of STAT_ORDER) {
      const value = ranks[stat];
      const cap = statCap(gun, stat);
      if (!Number.isInteger(value) || value < 0 || value > cap) return 'That loadout is not allowed';
      if (value < prev.ranks[gun][stat]) return 'A rank cannot go down';
      if (value > 0 && !isOwned(next, gun)) return 'That loadout is not allowed';
    }
  }
  if (loadoutPrice(next) - loadoutPrice(prev) > coins) return 'Not enough coins';
  return null;
}

/**
 * Buys the next node on one row. `reason` is "locked", "capped", "poor", or "unknown".
 * The returned loadout is a new object.
 */
export function claim(loadout, coins, gunId, statId) {
  if (!STAT_ORDER.includes(statId) || !GUNS[gunId]) return { ok: false, reason: 'unknown' };
  if (!isOwned(loadout, gunId)) return { ok: false, reason: 'locked' };
  const rank = loadout.ranks[gunId]?.[statId] ?? 0;
  if (rank >= statCap(gunId, statId)) return { ok: false, reason: 'capped' };
  if (coins < nodePrice(statId, rank)) return { ok: false, reason: 'poor' };
  const next = cloneLoadout(loadout);
  next.ranks[gunId][statId] = rank + 1;
  return { ok: true, loadout: next };
}

/** Buys a gun whose level is reached. `reason` is "locked", "owned", "poor", or "unknown". */
export function buyGun(loadout, level, coins, gunId) {
  if (!GUNS[gunId]) return { ok: false, reason: 'unknown' };
  if (isOwned(loadout, gunId)) return { ok: false, reason: 'owned' };
  if (!isUnlocked(gunId, level)) return { ok: false, reason: 'locked' };
  if (coins < GUNS[gunId].price) return { ok: false, reason: 'poor' };
  const next = cloneLoadout(loadout);
  next.owned = GUN_ORDER.filter((gun) => gun === gunId || next.owned.includes(gun));
  return { ok: true, loadout: next };
}

/** Mounts a bought gun. */
export function equip(loadout, gunId) {
  if (!GUNS[gunId]) return { ok: false, reason: 'unknown' };
  if (!isOwned(loadout, gunId)) return { ok: false, reason: 'locked' };
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
export function nodeStatus(statId, index, rank) {
  if (index < rank) return 'OWNED';
  if (index > rank) return 'BUY THE NODE ON THE LEFT';
  return `COSTS ${nodePrice(statId, index)}`;
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
