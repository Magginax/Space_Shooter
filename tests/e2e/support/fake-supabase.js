/**
 * Shared helpers for browser tests that need logins, without a real database.
 * Not a spec file (no ".spec.js"), so Playwright does not run it as a test.
 */

// The test build points at this fake address (webServer.env in playwright.config.js).
export const SUPABASE = 'https://supabase.test';
export const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
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
 * Answers the page's Supabase requests like the real server would: one account
 * whose name and password can change. `profileStatus` other than 200 makes
 * the profile request fail, like for a made-up login token.
 * Returns `requests` (what was sent) and `loginBeforeLoad()`.
 */
export async function fakeSupabase(page, { role = 'user', takenUsername = null, profileStatus = 200 } = {}) {
  const requests = [];
  const account = { username: null, password: PASSWORD };

  await page.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();
    requests.push({ method: request.method(), path: url.pathname, body });

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
      if (username === takenUsername) {
        return route.fulfill({ status: 422, json: { error_code: 'user_already_exists', msg: 'User already registered' } });
      }
      account.username = username;
      return route.fulfill({ json: sessionFor(username) });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      if (body.email) {
        const username = body.email.split('@')[0];
        if (username === takenUsername) {
          return route.fulfill({ status: 422, json: { error_code: 'email_exists', msg: 'Email address already registered' } });
        }
        account.username = username; // what the database trigger does
      }
      if (body.password) account.password = body.password;
      return route.fulfill({ json: sessionFor(account.username).user });
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (profileStatus !== 200) return route.fulfill({ status: profileStatus, json: { message: 'JWT invalid' } });
      return route.fulfill({ json: { username: account.username, role } });
    }
    return route.fulfill({ status: 204 }); // e.g. /auth/v1/logout
  });

  /** Starts the page already logged in, as after a login on an earlier visit. */
  async function loginBeforeLoad(username = 'ace_pilot') {
    account.username = username;
    await page.addInitScript(
      ([key, session]) => window.localStorage.setItem(key, JSON.stringify(session)),
      [SESSION_KEY, sessionFor(username)],
    );
  }

  return { requests, loginBeforeLoad };
}

/** Starts the page in guest mode, as after clicking PLAY AS GUEST earlier. */
export async function guestBeforeLoad(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, '1'), GUEST_KEY);
}

export async function logIn(page, username = 'ace_pilot', password = PASSWORD) {
  await page.getByLabel('PILOT ID', { exact: true }).fill(username);
  await page.getByLabel('PASSCODE', { exact: true }).fill(password);
  await page.getByTestId('submit-button').click();
}
