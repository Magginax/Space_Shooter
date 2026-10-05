import { createClient } from '@supabase/supabase-js';

/**
 * Leaderboard backed by the Supabase "scores" table (see supabase/schema.sql).
 *
 * Returns null when the URL or key is missing, so the page can simply hide the
 * leaderboard. `fetch` is optional: tests pass a fake one so they never talk to
 * the real database.
 */
export function createLeaderboard({ url, key, fetch } = {}) {
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false }, // no logins yet, so there is no session to remember
    ...(fetch && { global: { fetch } }),
  });

  return {
    /** Best scores for one game, highest first. Ties: the earlier score wins. */
    async getTopScores(game, limit = 10) {
      const { data, error } = await supabase
        .from('scores')
        .select('nickname, score, created_at')
        .eq('game', game)
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Could not load scores: ${error.message}`);
      return data;
    },

    async submitScore({ game, nickname, score }) {
      const { error } = await supabase.from('scores').insert({ game, nickname, score });
      if (error) throw new Error(`Could not submit score: ${error.message}`);
    },
  };
}
