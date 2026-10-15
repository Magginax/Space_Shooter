import { createClient } from '@supabase/supabase-js';

/** Same values as the app_role enum in supabase/schema.sql. */
export const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user', TEST: 'test' });

// Same rule as the profiles_username_format constraint in supabase/schema.sql.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,16}$/;
export const PASSWORD_MIN_LENGTH = 8;

// Supabase Auth only knows e-mail logins, but players only have a username.
// So "pilot42" logs in as "pilot42@players.space-shooter.local". Nothing is
// ever sent to that address ("Confirm email" is off in Supabase).
export const LOGIN_EMAIL_DOMAIN = 'players.space-shooter.local';

// Readable messages for the Supabase error codes a player can run into.
const ERROR_MESSAGES = {
  invalid_credentials: 'Wrong username or password',
  user_already_exists: 'That username is taken',
  email_exists: 'That username is taken',
  weak_password: 'That password is too weak',
  over_request_rate_limit: 'Too many attempts, try again later',
  signup_disabled: 'Registration is closed',
  same_password: 'The new password must be different',
};

/** Usernames are not case-sensitive: "Pilot" and "pilot" are one account. */
export function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

export function usernameToEmail(username) {
  return `${normalizeUsername(username)}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Returns the cleaned-up username or throws a readable error. */
export function validateUsername(username) {
  const name = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error('Username must be 3-16 characters: letters, numbers or _');
  }
  return name;
}

/** Returns the password or throws a readable error. */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  return password;
}

/**
 * Checks the form input before anything is sent and returns it cleaned up.
 * Throws a readable error, like validateScore() in leaderboard.js.
 */
export function validateCredentials({ username, password }) {
  return { username: validateUsername(username), password: validatePassword(password) };
}

/** Turns a Supabase error into an Error with a readable message; `code` is kept for the page. */
function authError(action, error) {
  const result = new Error(ERROR_MESSAGES[error.code] ?? `Could not ${action}: ${error.message}`);
  result.code = error.code;
  return result;
}

/**
 * Player accounts backed by Supabase Auth and the "profiles" table
 * (see supabase/schema.sql).
 *
 * Returns null when the URL or key is missing, like createLeaderboard().
 * `fetch` and `storage` are optional: tests pass fakes so they never talk to
 * the real database or need a browser.
 *
 * A player is { id, username, displayName, role }:
 * - username: the name they registered with; never changes (the account is
 *   filed under it)
 * - displayName: the name they are shown with AND log in with; starts equal
 *   to username and can be changed in the profile (changeDisplayName)
 *
 * What a player may do is decided by the database rules, not here: e.g.
 * setRole() simply fails for non-admins.
 */
export function createAuth({ url, key, fetch, storage } = {}) {
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    // The login is remembered (in localStorage by default), so it survives a
    // reload and every page of the site sees it.
    auth: { persistSession: true, ...(storage && { storage }) },
    ...(fetch && { global: { fetch } }),
  });

  async function loadPlayer(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, display_name, role')
      .eq('id', userId)
      .single();
    if (error) throw new Error(`Could not load the profile: ${error.message}`);
    return { id: userId, username: data.username, displayName: data.display_name, role: data.role };
  }

  /** The original username of the account with this login name, or null (database function). */
  async function loginNameFor(name) {
    const { data, error } = await supabase.rpc('login_name_for', { name });
    if (error) throw new Error(`Could not look up the name: ${error.message}`);
    return data;
  }

  async function requireSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw authError('read the login', error);
    if (!data.session) throw new Error('You are not logged in');
    return data.session;
  }

  return {
    /**
     * The Supabase client with the player's login. Shared with the leaderboard
     * (see scores.js), so scores are saved as the logged-in player.
     */
    client: supabase,

    /** Creates an account (role 'user') and logs it in. */
    async signUp(credentials) {
      const { username, password } = validateCredentials(credentials);
      // Someone may already log in with this name (their display name).
      if (await loginNameFor(username)) throw authError('sign up', { code: 'user_already_exists' });
      const { data, error } = await supabase.auth.signUp({ email: usernameToEmail(username), password });
      if (error) throw authError('sign up', error);
      // No session = Supabase waits for an e-mail confirmation that can never arrive.
      if (!data.session) {
        throw new Error('Account created, but "Confirm email" is on in Supabase (see supabase/schema.sql)');
      }
      return loadPlayer(data.user.id);
    },

    /** `username` is the login name, i.e. the player's current display name. */
    async signIn(credentials) {
      const { username, password } = validateCredentials(credentials);
      // Find the account first: it may be filed under an older name.
      const accountName = await loginNameFor(username);
      // Unknown name: the same answer as a wrong password, like most logins.
      if (!accountName) throw authError('log in', { code: 'invalid_credentials' });
      const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(accountName), password });
      if (error) throw authError('log in', error);
      return loadPlayer(data.user.id);
    },

    /** Logs out in this browser only (other devices stay logged in). */
    async signOut() {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw authError('log out', error);
    },

    /** The logged-in player, or null. */
    async getCurrentPlayer() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw authError('read the login', error);
      if (!data.session) return null;
      return loadPlayer(data.session.user.id);
    },

    /**
     * Asks for the current password again first, so someone at an unlocked
     * computer cannot change it.
     */
    async changePassword({ currentPassword, newPassword }) {
      validatePassword(newPassword);
      const session = await requireSession();
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword ?? '',
      });
      if (checkError?.code === 'invalid_credentials') {
        const wrong = new Error('Current password is wrong');
        wrong.code = checkError.code;
        throw wrong;
      }
      if (checkError) throw authError('check the password', checkError);

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw authError('change the password', error);
    },

    /**
     * Changes the name the player is shown with and logs in with. The account
     * itself stays filed under the original username. Returns the player.
     */
    async changeDisplayName(newName) {
      const name = validateUsername(newName);
      const session = await requireSession();
      const { error } = await supabase.rpc('set_display_name', { new_name: name });
      // The database function already gives readable messages ("That username is taken").
      if (error) throw new Error(error.message);
      return loadPlayer(session.user.id);
    },

    /** Admins get every player; anyone else only themselves (database rule). */
    async listPlayers() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, role, created_at')
        .order('username');
      if (error) throw new Error(`Could not load players: ${error.message}`);
      return data;
    },

    /** Admins only. Changes the role of one player. */
    async setRole(playerId, role) {
      if (!Object.values(ROLES).includes(role)) throw new Error(`Unknown role: ${role}`);
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', playerId)
        .select('id');
      if (error) throw new Error(`Could not change the role: ${error.message}`);
      // The database does not report an error when a rule blocks the change;
      // it just changes nothing. No changed row = not allowed (or no such player).
      if (data.length === 0) throw new Error('Only admins can change roles');
    },
  };
}
