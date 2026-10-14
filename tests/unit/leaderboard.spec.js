import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createLeaderboard } from '../../src/services/leaderboard.js';

const config = { url: 'https://test.supabase.co', key: 'test-key' };

/**
 * A stand-in for the network: records every request the Supabase client makes
 * and answers with the given status/body instead of calling the real server.
 */
function fakeFetch({ status = 200, body = '' } = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({
      url: new URL(url),
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, requests };
}

test.describe('leaderboard service', () => {
  test('is disabled when URL or key is missing', () => {
    expect(createLeaderboard({})).toBeNull();
    expect(createLeaderboard({ url: config.url })).toBeNull();
    expect(createLeaderboard({ key: config.key })).toBeNull();
  });

  test('uses a shared client instead of URL and key', async () => {
    const { fetch, requests } = fakeFetch({ body: '[]' });
    const client = createClient(config.url, config.key, { auth: { persistSession: false }, global: { fetch } });
    const leaderboard = createLeaderboard({ client });

    await leaderboard.getTopScores('space-shooter');
    expect(requests[0].url.origin).toBe(config.url);
  });

  test('getTopScores asks for one game, sorted by score, limited', async () => {
    const rows = [
      { nickname: 'ana', score: 42, created_at: '2026-10-01T10:00:00Z' },
      { nickname: 'bob', score: 17, created_at: '2026-10-01T11:00:00Z' },
    ];
    const { fetch, requests } = fakeFetch({ body: JSON.stringify(rows) });
    const leaderboard = createLeaderboard({ ...config, fetch });

    await expect(leaderboard.getTopScores('space-shooter', 5)).resolves.toEqual(rows);

    const { url, method } = requests[0];
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/rest/v1/scores');
    expect(url.searchParams.get('game')).toBe('eq.space-shooter');
    expect(url.searchParams.get('order')).toBe('score.desc,created_at.asc');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  test('submitScore sends one row', async () => {
    const { fetch, requests } = fakeFetch({ status: 201 });
    const leaderboard = createLeaderboard({ ...config, fetch });

    await leaderboard.submitScore({ game: 'space-shooter', nickname: 'ana', score: 42 });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url.pathname).toBe('/rest/v1/scores');
    expect(requests[0].body).toEqual({ game: 'space-shooter', nickname: 'ana', score: 42 });
  });

  test('server errors become readable exceptions', async () => {
    const { fetch } = fakeFetch({
      status: 401,
      body: JSON.stringify({ message: 'Invalid API key' }),
    });
    const leaderboard = createLeaderboard({ ...config, fetch });

    await expect(leaderboard.getTopScores('space-shooter')).rejects.toThrow('Could not load scores: Invalid API key');
    await expect(leaderboard.submitScore({ game: 'space-shooter', nickname: 'x', score: 1 })).rejects.toThrow(
      'Could not submit score: Invalid API key',
    );
  });
});
