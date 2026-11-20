import { createAuth } from './auth.js';
import { defaultLoadout, loadoutError } from '../games/space-shooter/weapons.js';

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

export const GUEST = Object.freeze({
  id: null,
  username: 'guest',
  displayName: 'guest',
  role: 'guest',
  isGuest: true,
  level: 0,
  xp: 0,
  coinsEarned: 0,
  coinsSpent: 0,
  loadout: defaultLoadout(),
});

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

/**
 * Saves the logged-in player's lifetime XP. Guests are not sent here: the
 * database only accepts the logged-in player, same as a score.
 */
export async function saveProgress(xp) {
  if (!Number.isInteger(xp) || xp < 0) throw new Error('Experience must be zero or more');
  if (!auth) {
    throw new Error(
      'Accounts are not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
    );
  }
  await auth.setXp(xp);
}

/**
 * Saves the logged-in player's lifetime total of coins earned. Guests are
 * not sent here, same as saveProgress.
 */
export async function saveCoins(earned) {
  if (!Number.isInteger(earned) || earned < 0) throw new Error('Coins must be zero or more');
  if (!auth) {
    throw new Error(
      'Accounts are not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
    );
  }
  await auth.setCoinsEarned(earned);
}

/**
 * Saves the logged-in player's guns. Guests are not sent here.
 * The same rules run here and in set_loadout: caps, a gun that is not
 * bought or not open yet, a rank that would go down, and a price past the
 * balance. `spent` is the total already paid for `previous`.
 */
export async function saveLoadout(previous, next, level, earned, spent) {
  const error = loadoutError(previous, next, level, earned - spent);
  if (error) throw new Error(error);
  if (!auth) {
    throw new Error(
      'Accounts are not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
    );
  }
  await auth.setLoadout(next, earned);
}
