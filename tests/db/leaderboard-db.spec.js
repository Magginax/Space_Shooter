import { test, expect } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { createLeaderboard } from '../../src/services/leaderboard.js';
import { usernameToEmail } from '../../src/services/auth.js';

/**
 * Talks to the REAL Supabase database from .env. Run with `npm run test:db`.
 *
 * Only logged-in players may save scores, so the tests log in as the test
 * account (role 'test', TEST_USERNAME / TEST_PASSWORD in .env).
 * Rows are written to the same table and through the same code as players'
 * scores, but under their own game name, so they never show up on the Dodge
 * leaderboard. afterAll deletes them again (allowed only for test accounts and
 * this game, see the "Test accounts can delete test rows" policy in supabase/schema.sql).
 */
const TEST_GAME = 'e2e-test';

const env = loadEnv('development', process.cwd(), ''); // '' = all variables, not only VITE_*
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(url && key && env.TEST_USERNAME && env.TEST_PASSWORD);
test.skip(!configured, 'Needs VITE_SUPABASE_* and TEST_USERNAME / TEST_PASSWORD in .env');

// Raw client, logged in as the test account in beforeAll. The leaderboard uses
// it too, like the site shares the login client (see scores.js).
const db = configured ? createClient(url, key, { auth: { persistSession: false } }) : null;
const leaderboard = configured ? createLeaderboard({ client: db }) : null;
// Not logged in: what any visitor with the public key can do.
const visitor = configured ? createClient(url, key, { auth: { persistSession: false } }) : null;

test.beforeAll(async () => {
  if (!db) return;
  const { error } = await db.auth.signInWithPassword({
    email: usernameToEmail(env.TEST_USERNAME),
    password: env.TEST_PASSWORD,
  });
  expect(error, 'test account login failed - see the setup guide in README.md').toBeNull();
});

// Unique per run, so we know which row is ours (12 of the 20 allowed characters).
const nickname = `E2E-${Date.now().toString(36)}`;

const testRows = () => leaderboard.getTopScores(TEST_GAME, 100);

test.afterAll(async () => {
  if (!db) return;
  // Deletes this run's rows and any left over from earlier failed runs.
  const { error } = await db.from('scores').delete().eq('game', TEST_GAME);
  expect(error, 'clean-up failed - was the delete policy from schema.sql run?').toBeNull();
  expect(await testRows(), 'clean-up ran but test rows are still there - was the delete policy from schema.sql run?').toEqual([]);
});

test('a saved score can be read back', async () => {
  // Spaces around the nickname must be trimmed before saving.
  await leaderboard.submitScore({ game: TEST_GAME, nickname: `  ${nickname}  `, score: 4242 });

  const rows = await testRows();
  expect(rows).toContainEqual(expect.objectContaining({ nickname, score: 4242 }));
});

test('test scores do not change the Dodge leaderboard', async () => {
  const before = await leaderboard.getTopScores('dodge');
  await leaderboard.submitScore({ game: TEST_GAME, nickname, score: 999999 });
  const after = await leaderboard.getTopScores('dodge');

  expect(after).toEqual(before);
});

test('the database rejects invalid rows that skip the app check', async () => {
  const invalid = [
    [{ nickname, score: -1 }, 'scores_score_not_negative'],
    [{ nickname: ` ${nickname}`, score: 1 }, 'scores_nickname_length'],
    [{ nickname: 'X'.repeat(21), score: 1 }, 'scores_nickname_length'],
  ];
  for (const [row, rule] of invalid) {
    const { error } = await db.from('scores').insert({ game: TEST_GAME, ...row });
    expect(error?.message, JSON.stringify(row)).toContain(rule);
  }
  expect(await testRows()).not.toContainEqual(expect.objectContaining({ score: -1 }));
});

test('a saved score cannot be changed, not even by a logged-in account', async () => {
  await leaderboard.submitScore({ game: TEST_GAME, nickname, score: 10 });

  // There is no update permission. Whether the server answers with an error or
  // silently changes 0 rows, the score must stay the same.
  await db.from('scores').update({ score: 123456 }).eq('game', TEST_GAME).eq('nickname', nickname);

  expect(await testRows()).not.toContainEqual(expect.objectContaining({ score: 123456 }));
});

test('visitors who are not logged in cannot save a score', async () => {
  const { error } = await visitor.from('scores').insert({ game: TEST_GAME, nickname, score: 777 });
  expect(error).not.toBeNull();
  expect(await testRows()).not.toContainEqual(expect.objectContaining({ score: 777 }));
});

test('visitors who are not logged in cannot delete test rows', async () => {
  await leaderboard.submitScore({ game: TEST_GAME, nickname, score: 31 });
  // Refused outright or 0 rows deleted; either way the row must still be there.
  await visitor.from('scores').delete().eq('game', TEST_GAME);
  expect(await testRows()).toContainEqual(expect.objectContaining({ nickname, score: 31 }));
});
