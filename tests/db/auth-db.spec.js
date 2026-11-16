import { test, expect } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { createAuth, usernameToEmail } from '../../src/services/auth.js';
import { progressFromXp } from '../../src/games/space-shooter/experience.js';

/**
 * Checks the account rules in the REAL Supabase database from .env.
 * Run with `npm run test:db`.
 *
 * Logs in as the test account (role 'test', see supabase/schema.sql and the
 * setup guide). Its username and password are in .env WITHOUT the VITE_
 * prefix, so they are never built into the website. Password and display-name
 * changes are written and then put back. Experience only goes up (a lower
 * total is refused), so that test leaves the new total in place. Every other
 * change must be refused by the database.
 */
const env = loadEnv('development', process.cwd(), ''); // '' = all variables, not only VITE_*
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const username = env.TEST_USERNAME;
const password = env.TEST_PASSWORD;
test.skip(!url || !key || !username || !password, 'Needs VITE_SUPABASE_* and TEST_USERNAME / TEST_PASSWORD in .env');

/** A fresh client per test; the login is kept in memory (Node has no localStorage). */
function newAuth() {
  const items = new Map();
  const storage = {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => items.set(k, v),
    removeItem: (k) => items.delete(k),
  };
  return createAuth({ url, key, storage });
}

async function logInAsTester() {
  const auth = newAuth();
  const player = await auth.signIn({ username, password });
  return { auth, player };
}

test('the test account logs in and has the role "test"', async () => {
  const { auth, player } = await logInAsTester();
  expect(player.username).toBe(username.toLowerCase());
  expect(player.role).toBe('test');
  await expect(auth.getCurrentPlayer()).resolves.toEqual(player);
  await auth.signOut();
});

test('a wrong password is refused', async () => {
  const error = await newAuth()
    .signIn({ username, password: `${password}-wrong` })
    .catch((e) => e);
  expect(error.code).toBe('invalid_credentials');
});

test('a non-admin sees only their own profile', async () => {
  const { auth, player } = await logInAsTester();
  const players = await auth.listPlayers();
  expect(players.map((p) => p.id)).toEqual([player.id]);
  await auth.signOut();
});

test('a non-admin cannot make themselves admin', async () => {
  const { auth, player } = await logInAsTester();
  await expect(auth.setRole(player.id, 'admin')).rejects.toThrow('Only admins can change roles');
  await expect(auth.getCurrentPlayer()).resolves.toMatchObject({ role: 'test' });
  await auth.signOut();
});

test('the username cannot be changed directly (the account is filed under it)', async () => {
  // Raw client, logged in as the tester, for what the app never does.
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error: loginError } = await db.auth.signInWithPassword({ email: usernameToEmail(username), password });
  expect(loginError).toBeNull();

  const { error } = await db.from('profiles').update({ username: 'hacker' }).eq('id', data.user.id);
  expect(error?.message).toMatch(/permission denied/);
  await db.auth.signOut();
});

test('visitors who are not logged in cannot read profiles', async () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await anon.from('profiles').select('username, role');
  // Either refused outright or an empty answer; never someone's profile.
  expect(error ? [] : data).toEqual([]);
});

// The test below changes the test account and always changes it back
// (finally), so the next run can log in again.

test('changing the password needs the current one and takes effect', async () => {
  const { auth } = await logInAsTester();
  const temporary = `${password}-tmp`;
  await expect(auth.changePassword({ currentPassword: 'wrong-guess', newPassword: temporary })).rejects.toThrow(
    'Current password is wrong',
  );
  try {
    await auth.changePassword({ currentPassword: password, newPassword: temporary });
    await expect(newAuth().signIn({ username, password: temporary })).resolves.toMatchObject({ role: 'test' });
  } finally {
    await auth.changePassword({ currentPassword: temporary, newPassword: password });
  }
});

test('a logged-in player can raise experience, and a lower total is refused', async () => {
  const { auth, player } = await logInAsTester();
  const next = player.xp + 50;
  try {
    await expect(auth.setXp(next)).resolves.toBe(next);
    await expect(auth.getCurrentPlayer()).resolves.toMatchObject({
      xp: next,
      level: progressFromXp(next).level,
    });

    const db = createClient(url, key, { auth: { persistSession: false } });
    const { error: loginError } = await db.auth.signInWithPassword({ email: usernameToEmail(username), password });
    expect(loginError).toBeNull();
    const lower = await db.rpc('set_xp', { new_xp: next - 1 });
    expect(lower.error?.message).toMatch(/cannot go down/);
    const { error: writeError } = await db.from('profiles').update({ xp: next + 50, level: 9 }).eq('id', player.id);
    expect(writeError?.message).toMatch(/permission denied/);
    const other = await db
      .from('profiles')
      .update({ xp: next + 50, level: 9 })
      .eq('id', '00000000-0000-4000-8000-000000000099');
    expect(other.error?.message).toMatch(/permission denied/);
    await db.auth.signOut();
  } finally {
    await auth.signOut();
  }
});

test('a visitor cannot set experience', async () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const result = await anon.rpc('set_xp', { new_xp: 50 });
  expect(result.error).not.toBeNull();
});

test('a loadout past a cap is refused, and the column cannot be written directly', async () => {
  const { auth, player } = await logInAsTester();
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    await expect(auth.setLoadout(player.loadout)).resolves.toEqual(player.loadout);
    const illegal = structuredClone(player.loadout);
    illegal.ranks.blaster.rate = 3;
    await expect(auth.setLoadout(illegal)).rejects.toThrow(/not allowed/);
    if (player.loadout.ranks.blaster.rate > 0) {
      const dropped = structuredClone(player.loadout);
      dropped.ranks.blaster.rate -= 1;
      await expect(auth.setLoadout(dropped)).rejects.toThrow(/cannot go down/);
    }

    const { error: loginError } = await db.auth.signInWithPassword({ email: usernameToEmail(username), password });
    expect(loginError).toBeNull();
    const { error: writeError } = await db.from('profiles').update({ loadout: player.loadout }).eq('id', player.id);
    expect(writeError?.message).toMatch(/permission denied/);
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const result = await anon.rpc('set_loadout', { new_loadout: player.loadout });
    expect(result.error).not.toBeNull();
  } finally {
    await db.auth.signOut();
    await auth.signOut();
  }
});

test('visitors can look up which account a login name belongs to, nothing more', async () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc('login_name_for', { name: username });
  expect(error).toBeNull();
  expect(data).toBe(username.toLowerCase());
  // Visitors cannot rename anyone.
  const rename = await anon.rpc('set_display_name', { new_name: 'hacker' });
  expect(rename.error).not.toBeNull();
});

// Changes the test account's display name and always changes it back
// (finally), so the next run can log in again.
test('after a rename the account logs in with the new name; the username stays', async () => {
  const { auth, player } = await logInAsTester();
  const original = player.displayName;
  const temporary = `${original}_r`.slice(0, 16);
  try {
    await expect(auth.changeDisplayName(temporary)).resolves.toMatchObject({
      username: player.username, // the account is still filed under the original name
      displayName: temporary,
      role: 'test', // renaming cannot touch the role
    });
    await expect(newAuth().signIn({ username: temporary, password })).resolves.toMatchObject({ role: 'test' });
    const oldName = await newAuth()
      .signIn({ username: original, password })
      .catch((e) => e);
    expect(oldName.code).toBe('invalid_credentials');
  } finally {
    await auth.changeDisplayName(original);
  }
});
