import { expect } from '@playwright/test';

// The test build points at this fake address (webServer.env in playwright.config.js).
const SUPABASE = 'https://supabase.test';
const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
export const PASSWORD = 'secret123';

// Where supabase-js keeps the login in localStorage: "sb-<first part of the host>-auth-token".
const SESSION_KEY = 'sb-supabase-auth-token';
const GUEST_KEY = 'space_shooter.guest'; // same as in src/services/account.js

const emailOf = (username) => `${username}@players.space-shooter.local`;

function sessionFor(username) {
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user: { id: PLAYER_ID, aud: 'authenticated', email: emailOf(username) },
  };
}

/**
 * Stands in for the Supabase server, so browser tests never touch a real
 * database. It keeps a small list of accounts ("ace_pilot" exists from the
 * start) and answers like the real server and database functions would:
 * accounts are filed under their original username, players log in with
 * their display name, and both the display name and the password can change.
 * Set up by the `supabase` fixture (fixtures.js) for every e2e test.
 *
 * Settings (withRole, ...) can be changed before or after the page opens:
 * they are read when a request arrives.
 */
export class FakeSupabase {
  constructor(page) {
    this.page = page;
    this.requests = [];
    this.role = 'user';
    this.profileStatus = 200;
    this.accounts = [{ username: 'ace_pilot', displayName: 'ace_pilot', password: PASSWORD }];
    this.current = null; // the account that is logged in
  }

  async install() {
    await this.page.route(`${SUPABASE}/**`, (route) => this.answer(route));
  }

  // --- Settings ---------------------------------------------------------------

  /** The role the logged-in player gets ("user", "admin", "test"). */
  withRole(role) {
    this.role = role;
  }

  /** Another player logs in with this name: sign-up and rename to it are refused. */
  withTakenUsername(name) {
    this.accounts.push({ username: 'someone_else', displayName: name, password: 'other-password' });
  }

  /** The database refuses the login token, like for a made-up one. */
  refuseLoginToken() {
    this.profileStatus = 401;
  }

  /** Starts the page already logged in, as after a login on an earlier visit. */
  async loginBeforeLoad(username = 'ace_pilot') {
    this.current = this.accountNamed(username) ?? this.addAccount(username, PASSWORD);
    await this.page.addInitScript(
      ([key, session]) => window.localStorage.setItem(key, JSON.stringify(session)),
      [SESSION_KEY, sessionFor(username)],
    );
  }

  /** Starts the page in guest mode, as after clicking PLAY AS GUEST earlier. */
  async guestBeforeLoad() {
    await this.page.addInitScript((key) => window.localStorage.setItem(key, '1'), GUEST_KEY);
  }

  // --- Checks -------------------------------------------------------------------

  expectNoRequests() {
    expect(this.requests).toEqual([]);
  }

  expectNoLoginRequest() {
    expect(this.requests.filter((r) => r.path === '/auth/v1/token')).toEqual([]);
  }

  expectLoginEmail(email) {
    expect(this.requests.find((r) => r.path === '/auth/v1/token')?.body.email).toBe(email);
  }

  expectSignUpEmail(email) {
    expect(this.requests.find((r) => r.path === '/auth/v1/signup')?.body.email).toBe(email);
  }

  /** Guest mode is stored in the browser, so this reads it from there. */
  async expectGuestModeOff() {
    expect(await this.page.evaluate((key) => window.localStorage.getItem(key), GUEST_KEY)).toBeNull();
  }

  // --- The fake server ----------------------------------------------------------

  accountNamed(displayName) {
    return this.accounts.find((account) => account.displayName === displayName);
  }

  addAccount(username, password) {
    const account = { username, displayName: username, password };
    this.accounts.push(account);
    return account;
  }

  async answer(route) {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();
    this.requests.push({ method: request.method(), path: url.pathname, body });
    const usernameIn = (email) => email.split('@')[0];

    // Database function: which account logs in with this name.
    if (url.pathname === '/rest/v1/rpc/login_name_for') {
      return route.fulfill({ json: this.accountNamed(body.name)?.username ?? null });
    }
    // Database function: change the display name of the logged-in player.
    if (url.pathname === '/rest/v1/rpc/set_display_name') {
      const taken = this.accounts.some((a) => a !== this.current && a.displayName === body.new_name);
      if (taken) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'That username is taken' } });
      this.current.displayName = body.new_name;
      return route.fulfill({ json: body.new_name });
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const account = this.accounts.find((a) => a.username === usernameIn(body.email));
        if (!account || body.password !== account.password) {
          return route.fulfill({ status: 400, json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
        }
        this.current = account;
      }
      return route.fulfill({ json: sessionFor(this.current.username) });
    }
    if (url.pathname === '/auth/v1/signup') {
      this.current = this.addAccount(usernameIn(body.email), body.password);
      return route.fulfill({ json: sessionFor(this.current.username) });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      if (body.password) this.current.password = body.password;
      return route.fulfill({ json: sessionFor(this.current.username).user });
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (this.profileStatus !== 200) {
        return route.fulfill({ status: this.profileStatus, json: { message: 'JWT invalid' } });
      }
      const { username, displayName } = this.current;
      return route.fulfill({ json: { username, display_name: displayName, role: this.role } });
    }
    return route.fulfill({ status: 204 }); // e.g. /auth/v1/logout
  }
}
