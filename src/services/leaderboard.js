import { createClient } from '@supabase/supabase-js';

export const NICKNAME_MAX_LENGTH = 20;

/**
 * Checks a score before it is sent and returns the row to insert.
 * Throws a readable error instead of letting the server reject it.
 *
 * The database has the same rules (see supabase/schema.sql), because anyone
 * can call the API directly with the public key and skip this check.
 */
export function validateScore({ game, nickname, score }) {
  if (typeof game !== 'string' || game.trim() === '') {
    throw new Error('Game must be a non-empty string');
  }

  const name = typeof nickname === 'string' ? nickname.trim() : '';
  // [...name] counts characters the way the database does, so an emoji is 1, not 2.
  const length = [...name].length;
  if (length < 1 || length > NICKNAME_MAX_LENGTH) {
    throw new Error(`Nickname must be 1-${NICKNAME_MAX_LENGTH} characters long`);
  }

  if (!Number.isInteger(score) || score < 0) {
    throw new Error('Score must be a whole number, 0 or more');
  }

  return { game, nickname: name, score };
}

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
      const row = validateScore({ game, nickname, score });
      const { error } = await supabase.from('scores').insert(row);
      if (error) throw new Error(`Could not submit score: ${error.message}`);
    },
  };
}
