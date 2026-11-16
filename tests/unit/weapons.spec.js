import { test, expect } from '@playwright/test';
import {
  GUNS,
  claim,
  cloneLoadout,
  cooldownFor,
  defaultLoadout,
  equip,
  loadoutError,
  nodeBlurb,
  nodeLevel,
  nodeStatus,
  spawnShots,
} from '../../src/games/space-shooter/weapons.js';

test.describe('gun nodes', () => {
  test('level 0 can mount the blaster and nothing else', () => {
    const loadout = defaultLoadout();
    expect(claim(loadout, 0, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'locked' });
    expect(claim(loadout, 1, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'locked' });
    expect(equip(loadout, 4, 'beam')).toMatchObject({ ok: false, reason: 'locked' });
    expect(equip(loadout, 9, 'pods')).toMatchObject({ ok: false, reason: 'locked' });
    expect(loadout.ranks.blaster.rate).toBe(0);
  });

  test('a node opens at its own level, and the one after it stays shut', () => {
    expect(nodeLevel('blaster', 'rate', 0)).toBe(2);
    expect(nodeLevel('blaster', 'rate', 1)).toBe(4);
    expect(nodeLevel('blaster', 'shot', 0)).toBe(3);
    expect(nodeLevel('beam', 'rate', 0)).toBe(7);
    expect(GUNS.beam.unlockLevel).toBe(5);
    expect(GUNS.pods.unlockLevel).toBe(10);

    const first = claim(defaultLoadout(), 2, 'blaster', 'rate');
    expect(first.ok).toBe(true);
    expect(first.loadout.ranks.blaster.rate).toBe(1);
    expect(claim(first.loadout, 2, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'locked' });
    expect(claim(first.loadout, 4, 'blaster', 'rate').loadout.ranks.blaster.rate).toBe(2);
    expect(claim(first.loadout, 4, 'blaster', 'rate').ok).toBe(true);
    const full = claim(claim(defaultLoadout(), 4, 'blaster', 'rate').loadout, 4, 'blaster', 'rate').loadout;
    expect(claim(full, 4, 'blaster', 'rate')).toMatchObject({ ok: false, reason: 'capped' });
  });

  test('mounting the beam at level 5 does not buy its nodes', () => {
    const mounted = equip(defaultLoadout(), 5, 'beam');
    expect(mounted.loadout.gun).toBe('beam');
    expect(mounted.loadout.ranks.beam).toEqual({ rate: 0, shot: 0, pierce: 0 });
    expect(claim(mounted.loadout, 5, 'beam', 'rate')).toMatchObject({ ok: false, reason: 'locked' });
    expect(claim(mounted.loadout, 7, 'beam', 'rate').ok).toBe(true);
  });

  test('a rank cannot go back down, and a node cannot be stored early', () => {
    const raised = claim(defaultLoadout(), 2, 'blaster', 'rate').loadout;
    const dropped = cloneLoadout(raised);
    dropped.ranks.blaster.rate = 0;
    expect(loadoutError(raised, dropped, 2)).toBe('A rank cannot go down');

    const early = cloneLoadout(defaultLoadout());
    early.ranks.blaster.shot = 1;
    expect(loadoutError(defaultLoadout(), early, 2)).toBe('That loadout is not allowed');
    expect(loadoutError(defaultLoadout(), early, 3)).toBeNull();
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

  test('a node says what it changes and which level it needs', () => {
    expect(nodeBlurb('blaster', 'rate', 0)).toBe('COOLDOWN 0.45S TO 0.32S.');
    expect(nodeBlurb('blaster', 'shot', 0)).toBe('ADDS A SECOND PELLET ABOVE.');
    expect(nodeStatus('blaster', 'rate', 0, 0, 0)).toBe('NEEDS LEVEL 2');
    expect(nodeStatus('blaster', 'rate', 0, 1, 2)).toBe('OWNED');
    expect(nodeStatus('beam', 'rate', 0, 0, 5)).toBe('NEEDS LEVEL 7');
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
