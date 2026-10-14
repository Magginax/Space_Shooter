import { test, expect } from '@playwright/test';
import { createAuth, validateCredentials, usernameToEmail } from '../../src/services/auth.js';

const config = { url: 'https://test.supabase.co', key: 'test-key' };
const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

/** The login is kept here instead of localStorage, which Node does not have. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
}

/** What Supabase Auth answers to a successful login or sign-up. */
function sessionBody(id = PLAYER_ID) {
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'x@y.z' },
  };
}

/**
 * A stand-in for the network, like fakeFetch() in leaderboard.spec.js, but it
 * answers by route ("POST /auth/v1/token") because one login makes several
 * requests. Unknown routes get an empty 200.
 */
function fakeServer(routes = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const request = {
      url: new URL(url),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    // A route is a fixed answer or a function that picks one from the request.
    const route = routes[`${request.method} ${request.url.pathname}`];
    const { status = 200, body = {} } = (typeof route === 'function' ? route(request) : route) ?? {};
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, requests };
}

const loggedInRoutes = {
  'POST /auth/v1/token': { body: sessionBody() },
  'GET /rest/v1/profiles': { body: { username: 'pilot_42', role: 'user' } },
};

const newAuth = (fetch) => createAuth({ ...config, fetch, storage: memoryStorage() });

test.describe('auth: input checks', () => {
  test('username is trimmed and lower-cased', () => {
    expect(validateCredentials({ username: '  Pilot_42 ', password: 'secret123' })).toEqual({
      username: 'pilot_42',
      password: 'secret123',
    });
  });

  test('bad usernames are rejected', () => {
    for (const username of ['ab', 'a'.repeat(17), 'pilot 42', 'pilot-42', 'pílot', '', undefined]) {
      expect(() => validateCredentials({ username, password: 'secret123' }), String(username)).toThrow(
        'Username must be 3-16 characters',
      );
    }
  });

  test('short passwords are rejected', () => {
    expect(() => validateCredentials({ username: 'pilot', password: '1234567' })).toThrow(
      'Password must be at least 8 characters long',
    );
  });

  test('username becomes the login e-mail', () => {
    expect(usernameToEmail('Pilot_42')).toBe('pilot_42@players.space-shooter.local');
  });
});

test.describe('auth service', () => {
  test('is disabled when URL or key is missing', () => {
    expect(createAuth({})).toBeNull();
    expect(createAuth({ url: config.url })).toBeNull();
    expect(createAuth({ key: config.key })).toBeNull();
  });

  test('signIn logs in with the username e-mail and returns the player with the role', async () => {
    const { fetch, requests } = fakeServer(loggedInRoutes);
    const auth = newAuth(fetch);

    await expect(auth.signIn({ username: 'Pilot_42', password: 'secret123' })).resolves.toEqual({
      id: PLAYER_ID,
      username: 'pilot_42',
      role: 'user',
    });

    const login = requests.find((r) => r.url.pathname === '/auth/v1/token');
    expect(login.url.searchParams.get('grant_type')).toBe('password');
    expect(login.body).toMatchObject({ email: 'pilot_42@players.space-shooter.local', password: 'secret123' });

    // The profile is read as the logged-in player, so the database rules apply.
    const profile = requests.find((r) => r.url.pathname === '/rest/v1/profiles');
    expect(profile.url.searchParams.get('id')).toBe(`eq.${PLAYER_ID}`);
    expect(profile.headers.get('Authorization')).toBe('Bearer fake-access-token');
  });

  test('invalid input is rejected before anything is sent', async () => {
    const { fetch, requests } = fakeServer();
    const auth = newAuth(fetch);

    await expect(auth.signIn({ username: 'x', password: 'secret123' })).rejects.toThrow('Username must be');
    expect(requests.filter((r) => r.url.pathname.startsWith('/auth/v1/token'))).toHaveLength(0);
  });

  test('wrong password gives a readable error with the code', async () => {
    const { fetch } = fakeServer({
      'POST /auth/v1/token': {
        status: 400,
        body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
      },
    });
    const auth = newAuth(fetch);

    const error = await auth.signIn({ username: 'pilot', password: 'wrong-pass' }).catch((e) => e);
    expect(error.message).toBe('Wrong username or password');
    expect(error.code).toBe('invalid_credentials');
  });

  test('signUp creates the account and logs it in', async () => {
    const { fetch, requests } = fakeServer({
      'POST /auth/v1/signup': { body: sessionBody() },
      'GET /rest/v1/profiles': { body: { username: 'new_pilot', role: 'user' } },
    });
    const auth = newAuth(fetch);

    await expect(auth.signUp({ username: 'New_Pilot', password: 'secret123' })).resolves.toMatchObject({
      username: 'new_pilot',
      role: 'user',
    });
    const signup = requests.find((r) => r.url.pathname === '/auth/v1/signup');
    expect(signup.body).toMatchObject({ email: 'new_pilot@players.space-shooter.local', password: 'secret123' });
    // The role is never sent: the database always starts new players as 'user'.
    expect(JSON.stringify(signup.body)).not.toContain('admin');
  });

  test('signUp with a taken username', async () => {
    const { fetch } = fakeServer({
      'POST /auth/v1/signup': {
        status: 422,
        body: { error_code: 'user_already_exists', msg: 'User already registered' },
      },
    });
    await expect(newAuth(fetch).signUp({ username: 'pilot', password: 'secret123' })).rejects.toThrow(
      'That username is taken',
    );
  });

  test('signUp explains when "Confirm email" is still on in Supabase', async () => {
    // With confirmation on, Supabase returns a user but no session.
    const { fetch } = fakeServer({ 'POST /auth/v1/signup': { body: { id: PLAYER_ID, aud: 'authenticated' } } });
    await expect(newAuth(fetch).signUp({ username: 'pilot', password: 'secret123' })).rejects.toThrow(
      '"Confirm email" is on',
    );
  });

  test('getCurrentPlayer is null before login and the player after it, null again after logout', async () => {
    const { fetch } = fakeServer(loggedInRoutes);
    const auth = newAuth(fetch);

    await expect(auth.getCurrentPlayer()).resolves.toBeNull();
    await auth.signIn({ username: 'pilot_42', password: 'secret123' });
    await expect(auth.getCurrentPlayer()).resolves.toMatchObject({ username: 'pilot_42', role: 'user' });
    await auth.signOut();
    await expect(auth.getCurrentPlayer()).resolves.toBeNull();
  });

  test('changePassword checks the current password, then sends the new one', async () => {
    const { fetch, requests } = fakeServer({ ...loggedInRoutes, 'PUT /auth/v1/user': { body: { id: PLAYER_ID } } });
    const auth = newAuth(fetch);
    await auth.signIn({ username: 'pilot_42', password: 'secret123' });

    await auth.changePassword({ currentPassword: 'secret123', newPassword: 'better-secret' });

    const logins = requests.filter((r) => r.url.pathname === '/auth/v1/token');
    expect(logins).toHaveLength(2); // the login + the check of the current password
    expect(logins[1].body).toMatchObject({ email: 'x@y.z', password: 'secret123' });
    const update = requests.find((r) => r.method === 'PUT');
    expect(update.body).toMatchObject({ password: 'better-secret' });
    expect(update.body).not.toHaveProperty('email');
  });

  test('changePassword with a wrong current password changes nothing', async () => {
    const { fetch, requests } = fakeServer({
      ...loggedInRoutes,
      // Only the right password logs in.
      'POST /auth/v1/token': (request) =>
        request.body.password === 'secret123'
          ? { body: sessionBody() }
          : { status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } },
    });
    const auth = newAuth(fetch);
    await auth.signIn({ username: 'pilot_42', password: 'secret123' });

    const error = await auth.changePassword({ currentPassword: 'guess-1234', newPassword: 'better-secret' }).catch((e) => e);
    expect(error.message).toBe('Current password is wrong');
    expect(error.code).toBe('invalid_credentials');
    expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  test('changePassword refuses a short new password and needs a login', async () => {
    const { fetch } = fakeServer();
    const auth = newAuth(fetch);
    await expect(auth.changePassword({ currentPassword: 'secret123', newPassword: 'short' })).rejects.toThrow(
      'at least 8 characters',
    );
    await expect(auth.changePassword({ currentPassword: 'secret123', newPassword: 'long-enough' })).rejects.toThrow(
      'You are not logged in',
    );
  });

  test('setRole sends only the role for one player', async () => {
    const { fetch, requests } = fakeServer({ 'PATCH /rest/v1/profiles': { body: [{ id: PLAYER_ID }] } });
    await newAuth(fetch).setRole(PLAYER_ID, 'admin');

    const update = requests.find((r) => r.method === 'PATCH');
    expect(update.url.searchParams.get('id')).toBe(`eq.${PLAYER_ID}`);
    expect(update.body).toEqual({ role: 'admin' });
  });

  test('setRole fails when the database changed nothing (not an admin)', async () => {
    const { fetch } = fakeServer({ 'PATCH /rest/v1/profiles': { body: [] } });
    await expect(newAuth(fetch).setRole(PLAYER_ID, 'admin')).rejects.toThrow('Only admins can change roles');
  });

  test('setRole refuses unknown roles without asking the server', async () => {
    const { fetch, requests } = fakeServer();
    await expect(newAuth(fetch).setRole(PLAYER_ID, 'superuser')).rejects.toThrow('Unknown role: superuser');
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });
});
