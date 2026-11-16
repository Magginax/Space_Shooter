import { test, expect } from '@playwright/test';
import { grantXp, xpForLevel, xpToNext } from '../../src/games/space-shooter/experience.js';

test.describe('experience curve', () => {
  test('the first level costs 200, then each level costs x1.5 rounded down', () => {
    expect(xpToNext(0)).toBe(200);
    expect(xpToNext(1)).toBe(300);
    expect(xpToNext(2)).toBe(450);
    expect(xpToNext(3)).toBe(675);
    expect(xpToNext(4)).toBe(1012);
  });

  test('199 XP stays level 0 and 200 reaches level 1 with an empty bar', () => {
    expect(grantXp(0, 199)).toEqual({ xp: 199, level: 0, intoLevel: 199, xpToNext: 200 });
    expect(grantXp(0, 200)).toEqual({ xp: 200, level: 1, intoLevel: 0, xpToNext: 300 });
  });

  test('250 XP is level 1 with 50 toward the next level', () => {
    expect(grantXp(200, 50)).toEqual({ xp: 250, level: 1, intoLevel: 50, xpToNext: 300 });
  });

  test('one grant can cross more than one level', () => {
    expect(grantXp(0, 500)).toEqual({ xp: 500, level: 2, intoLevel: 0, xpToNext: 450 });
  });
});
