import { createLeaderboard } from './leaderboard.js';

/**
 * The one place the site talks to the leaderboard. Games only need:
 *
 *   import { saveScore } from '../../services/scores.js';
 *   await saveScore('ACE', 1200);
 *
 * URL and key come from .env. Vite copies VITE_* variables into the code at
 * build time, so they must be set before `npm run build`.
 */
const leaderboard = createLeaderboard({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export const DEFAULT_GAME = 'dodge';

/** False when .env is missing, so pages can show "offline" instead of an error. */
export const isLeaderboardConfigured = leaderboard !== null;

function requireLeaderboard() {
  if (!leaderboard) {
    throw new Error(
      'Leaderboard is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
    );
  }
  return leaderboard;
}

/** Saves one score. Rejects with a readable error if the input or the server says no. */
export async function saveScore(nickname, score, game = DEFAULT_GAME) {
  await requireLeaderboard().submitScore({ game, nickname, score });
}

/** Best scores for one game, highest first: [{ nickname, score, created_at }]. */
export async function loadTopScores(game = DEFAULT_GAME, limit = 10) {
  return requireLeaderboard().getTopScores(game, limit);
}
