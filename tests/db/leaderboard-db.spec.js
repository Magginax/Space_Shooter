import { test, expect } from '@playwright/test';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { createLeaderboard } from '../../src/services/leaderboard.js';

/**
 * Talks to the REAL Supabase database from .env. Run with `npm run test:db`.
 *
 * Rows are written to the same table and through the same code as players'
 * scores, but under their own game name, so they never show up on the Dodge
 * leaderboard. afterAll deletes them again (allowed only for this game, see
 * the "Tests can delete their own rows" policy in supabase/schema.sql).
 */
const TEST_GAME = 'e2e-test';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = loadEnv('development', process.cwd(), 'VITE_');
test.skip(!url || !key, 'Needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');

const leaderboard = createLeaderboard({ url, key });
// Raw client for what the app never does: invalid rows, updates, deletes.
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

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

test('the public key cannot change a saved score', async () => {
  await leaderboard.submitScore({ game: TEST_GAME, nickname, score: 10 });

  // There is no update permission. Whether the server answers with an error or
  // silently changes 0 rows, the score must stay the same.
  await db.from('scores').update({ score: 123456 }).eq('game', TEST_GAME).eq('nickname', nickname);

  expect(await testRows()).not.toContainEqual(expect.objectContaining({ score: 123456 }));
});
