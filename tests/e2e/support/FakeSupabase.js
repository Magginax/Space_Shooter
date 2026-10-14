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
 * database: one account whose name and password can change, like the real one.
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
    this.takenUsername = null;
    this.profileStatus = 200;
    this.account = { username: null, password: PASSWORD };
  }

  async install() {
    await this.page.route(`${SUPABASE}/**`, (route) => this.answer(route));
  }

  // --- Settings ---------------------------------------------------------------

  /** The role the logged-in player gets ("user", "admin", "test"). */
  withRole(role) {
    this.role = role;
  }

  /** Someone already has this username: sign-up and rename are refused. */
  withTakenUsername(username) {
    this.takenUsername = username;
  }

  /** The database refuses the login token, like for a made-up one. */
  refuseLoginToken() {
    this.profileStatus = 401;
  }

  /** Starts the page already logged in, as after a login on an earlier visit. */
  async loginBeforeLoad(username = 'ace_pilot') {
    this.account.username = username;
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

  async answer(route) {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();
    const account = this.account;
    this.requests.push({ method: request.method(), path: url.pathname, body });

    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        if (body.password !== account.password) {
          return route.fulfill({ status: 400, json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
        }
        account.username = body.email.split('@')[0];
      }
      return route.fulfill({ json: sessionFor(account.username) });
    }
    if (url.pathname === '/auth/v1/signup') {
      const username = body.email.split('@')[0];
      if (username === this.takenUsername) {
        return route.fulfill({ status: 422, json: { error_code: 'user_already_exists', msg: 'User already registered' } });
      }
      account.username = username;
      return route.fulfill({ json: sessionFor(username) });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      if (body.email) {
        const username = body.email.split('@')[0];
        if (username === this.takenUsername) {
          return route.fulfill({ status: 422, json: { error_code: 'email_exists', msg: 'Email address already registered' } });
        }
        account.username = username; // what the database trigger does
      }
      if (body.password) account.password = body.password;
      return route.fulfill({ json: sessionFor(account.username).user });
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (this.profileStatus !== 200) {
        return route.fulfill({ status: this.profileStatus, json: { message: 'JWT invalid' } });
      }
      return route.fulfill({ json: { username: account.username, role: this.role } });
    }
    return route.fulfill({ status: 204 }); // e.g. /auth/v1/logout
  }
}
