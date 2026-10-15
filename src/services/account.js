import { createAuth } from './auth.js';

/**
 * The one place the site talks to player accounts, like scores.js does for
 * the leaderboard. Pages only need:
 *
 *   import { currentPlayer } from '../services/account.js';
 *   const player = await currentPlayer(); // a player, the guest, or null
 *
 * URL and key come from .env (see scores.js). `auth` is null without them.
 */
export const auth = createAuth({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

/** False when .env is missing, so pages can show "offline" instead of an error. */
export const isAuthConfigured = auth !== null;

// Guests may play without an account (quick demos, testing), but their scores
// are not saved: the database only accepts scores from logged-in players.
// The choice is remembered in this browser until someone logs in or out.
const GUEST_KEY = 'space_shooter.guest';

export const GUEST = Object.freeze({ id: null, username: 'guest', displayName: 'guest', role: 'guest', isGuest: true });

// localStorage can throw (e.g. blocked site data); then guest mode just does not stick.
function storage(action) {
  try {
    return action(window.localStorage);
  } catch {
    return null;
  }
}

export function playAsGuest() {
  storage((s) => s.setItem(GUEST_KEY, '1'));
}

export function leaveGuestMode() {
  storage((s) => s.removeItem(GUEST_KEY));
}

const isGuest = () => storage((s) => s.getItem(GUEST_KEY)) === '1';

/**
 * Who may play: the logged-in player, else the guest, else null.
 *
 * The login is checked by loading the profile with the login token, so a
 * made-up token in localStorage is refused by the database and gives null.
 */
export async function currentPlayer() {
  if (isAuthConfigured) {
    try {
      const player = await auth.getCurrentPlayer();
      if (player) return player;
    } catch (error) {
      console.error(error);
    }
  }
  return isGuest() ? GUEST : null;
}
