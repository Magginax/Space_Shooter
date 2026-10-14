import { test, expect } from '@playwright/test';
import { safeReturnPath, loginUrl } from '../../src/services/redirect.js';

const origin = 'https://jakub.github.io';

test.describe('redirect after login', () => {
  test('paths on this site are kept, with query and #hash', () => {
    expect(safeReturnPath('/space/#game', origin)).toBe('/space/#game');
    expect(safeReturnPath('/space/index.html?x=1#game', origin)).toBe('/space/index.html?x=1#game');
    expect(safeReturnPath(`${origin}/space/#game`, origin)).toBe('/space/#game');
  });

  test('other sites are refused (no open redirect)', () => {
    for (const next of ['https://evil.example/', '//evil.example/#game', 'http://jakub.github.io/', 'javascript:alert(1)']) {
      expect(safeReturnPath(next, origin), next).toBeNull();
    }
  });

  test('missing or empty values give null', () => {
    expect(safeReturnPath(null, origin)).toBeNull();
    expect(safeReturnPath('', origin)).toBeNull();
  });

  test('loginUrl works under a sub-path and encodes the return address', () => {
    expect(loginUrl('/space/', '/space/#game')).toBe('/space/views/login.html?next=%2Fspace%2F%23game');
    expect(loginUrl('/', '/#game')).toBe('/views/login.html?next=%2F%23game');
  });
});
