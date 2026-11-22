import { test, expect } from '@playwright/test';
import {
  GUNS,
  buyGun,
  claim,
  cloneLoadout,
  cooldownFor,
  defaultLoadout,
  equip,
  loadoutError,
  loadoutPrice,
  nodeBlurb,
  nodePrice,
  nodeStatus,
  spawnShots,
} from '../../src/games/space-shooter/weapons.js';

test.describe('gun nodes', () => {
  test('a new player owns the blaster and nothing else', () => {
    const loadout = defaultLoadout();
    expect(loadout.owned).toEqual(['blaster']);
    expect(equip(loadout, 'beam')).toMatchObject({ ok: false, reason: 'locked' });
    expect(equip(loadout, 'pods')).toMatchObject({ ok: false, reason: 'locked' });
    expect(claim(loadout, 999, 'beam', 'rate')).toMatchObject({ ok: false, reason: 'locked' });
    expect(loadoutPrice(loadout)).toBe(0);
  });

  test('a node costs coins at any level, and the one after it needs the one on its left', () => {
    expect(nodePrice('rate', 0)).toBe(8);
    expect(nodePrice('rate', 1)).toBe(16);
    expect(nodePrice('shot', 0)).toBe(12);
    expect(nodePrice('pierce', 0)).toBe(24);

    expect(claim(defaultLoadout(), 7, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'poor' });
    const first = claim(defaultLoadout(), 8, 'blaster', 'rate');
    expect(first.ok).toBe(true);
    expect(first.loadout.ranks.blaster.rate).toBe(1);
    expect(loadoutPrice(first.loadout)).toBe(8);

    // The second node costs its own price, after the first is owned.
    expect(claim(first.loadout, 15, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'poor' });
    const full = claim(first.loadout, 16, 'blaster', 'rate').loadout;
    expect(full.ranks.blaster.rate).toBe(2);
    expect(loadoutPrice(full)).toBe(24);
    expect(claim(full, 999, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'capped' });
  });

  test('the beam is bought at level 5 for 50 coins, then mounted and upgraded', () => {
    expect(GUNS.beam).toMatchObject({ unlockLevel: 5, price: 50 });
    expect(GUNS.pods).toMatchObject({ unlockLevel: 10, price: 120 });
    expect(buyGun(defaultLoadout(), 4, 999, 'beam')).toMatchObject({ ok: false, reason: 'locked' });
    expect(buyGun(defaultLoadout(), 5, 49, 'beam')).toMatchObject({ ok: false, reason: 'poor' });
    expect(buyGun(defaultLoadout(), 9, 999, 'pods')).toMatchObject({ ok: false, reason: 'locked' });

    const bought = buyGun(defaultLoadout(), 5, 50, 'beam');
    expect(bought.ok).toBe(true);
    expect(bought.loadout).toMatchObject({ gun: 'blaster', owned: ['blaster', 'beam'] });
    expect(bought.loadout.ranks.beam).toEqual({ rate: 0, shot: 0, pierce: 0 });
    expect(loadoutPrice(bought.loadout)).toBe(50);
    expect(buyGun(bought.loadout, 5, 999, 'beam')).toMatchObject({ ok: false, reason: 'owned' });

    expect(equip(bought.loadout, 'beam').loadout.gun).toBe('beam');
    expect(claim(bought.loadout, 8, 'beam', 'rate').ok).toBe(true);
  });

  test('a saved loadout must be paid for, and nothing bought can be taken back', () => {
    const raised = claim(defaultLoadout(), 8, 'blaster', 'rate').loadout;
    expect(loadoutError(defaultLoadout(), raised, 0, 7)).toBe('Not enough coins');
    expect(loadoutError(defaultLoadout(), raised, 0, 8)).toBeNull();
    // What is already owned is not charged again.
    expect(loadoutError(raised, raised, 0, 0)).toBeNull();

    const dropped = cloneLoadout(raised);
    dropped.ranks.blaster.rate = 0;
    expect(loadoutError(raised, dropped, 0, 99)).toBe('A rank cannot go down');

    const beam = buyGun(defaultLoadout(), 5, 50, 'beam').loadout;
    expect(loadoutError(defaultLoadout(), beam, 4, 999)).toBe('That gun is locked');
    expect(loadoutError(defaultLoadout(), beam, 5, 49)).toBe('Not enough coins');
    expect(loadoutError(defaultLoadout(), beam, 5, 50)).toBeNull();
    expect(loadoutError(beam, defaultLoadout(), 5, 999)).toBe('A gun cannot be sold');

    // Mounting or upgrading a gun that was never bought.
    const mounted = { ...defaultLoadout(), gun: 'beam' };
    expect(loadoutError(defaultLoadout(), mounted, 5, 999)).toBe('That gun is locked');
    const ranked = defaultLoadout();
    ranked.ranks.beam.shot = 1;
    expect(loadoutError(defaultLoadout(), ranked, 5, 999)).toBe('That loadout is not allowed');
  });

  test('a loadout saved before guns were bought keeps the gun it mounted or upgraded', () => {
    const ranks = defaultLoadout().ranks;
    expect(cloneLoadout({ gun: 'beam', ranks }).owned).toEqual(['blaster', 'beam']);
    expect(cloneLoadout({ gun: 'blaster', ranks: { ...ranks, pods: { rate: 1, shot: 0, pierce: 0 } } }).owned).toEqual([
      'blaster',
      'pods',
    ]);
    expect(cloneLoadout({ gun: 'blaster', ranks }).owned).toEqual(['blaster']);
    // With a list, a gun outside it is not mounted.
    expect(cloneLoadout({ gun: 'beam', owned: ['blaster'], ranks })).toMatchObject({ gun: 'blaster', owned: ['blaster'] });
  });

  test('rank 0 blaster is one pellet on a 0.45s cycle', () => {
    const ranks = defaultLoadout().ranks.blaster;
    expect(cooldownFor('blaster', ranks)).toBe(0.45);
    expect(spawnShots('blaster', ranks, { x: 10, y: 20 })).toEqual([
      { x: 10, y: 20, w: 3, h: 1, pierce: 0, speed: 130, kind: 'pellet' },
    ]);
  });

  test('shot adds a pellet 8px up, and pierce stays on the first pellet', () => {
    const ranks = { rate: 2, shot: 1, pierce: 1 };
    expect(cooldownFor('blaster', ranks)).toBe(0.22);
    const shots = spawnShots('blaster', ranks, { x: 10, y: 20 });
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ y: 20, pierce: 1 });
    expect(shots[1]).toMatchObject({ y: 12, pierce: 0 });
  });

  test('a node says what it changes and what it costs', () => {
    expect(nodeBlurb('blaster', 'rate', 0)).toBe('COOLDOWN 0.45S TO 0.32S.');
    expect(nodeBlurb('blaster', 'shot', 0)).toBe('ADDS A SECOND PELLET ABOVE.');
    expect(nodeStatus('rate', 0, 0)).toBe('COSTS 8');
    expect(nodeStatus('rate', 0, 1)).toBe('OWNED');
    expect(nodeStatus('rate', 1, 0)).toBe('BUY THE NODE ON THE LEFT');
    expect(nodeStatus('pierce', 0, 0)).toBe('COSTS 24');
  });

  test('pod pierce is carried on the pod itself', () => {
    const plain = spawnShots('pods', { rate: 0, shot: 0, pierce: 0 }, { x: 4, y: 8 });
    const pierced = spawnShots('pods', { rate: 0, shot: 1, pierce: 1 }, { x: 4, y: 8 });
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatchObject({ kind: 'pod', pierce: 0, w: 5, h: 3 });
    expect(pierced).toHaveLength(2);
    expect(pierced.every((shot) => shot.pierce === 1)).toBe(true);
  });
});
