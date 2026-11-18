/**
 * Where to go back after logging in. Plain functions without browser globals,
 * so they can be unit-tested in Node.
 */

/**
 * Returns `next` as a path on this site ("/repo/#game"), or null.
 *
 * Only addresses on the same site (`origin`) are allowed. Otherwise a link like
 * login.html?next=https://evil.example would send freshly logged-in players to
 * a fake page ("open redirect").
 */
export function safeReturnPath(next, origin) {
  if (typeof next !== 'string' || next === '') return null;
  let url;
  try {
    url = new URL(next, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}

/** Address of the login page that comes back to `returnPath` afterwards. */
export function loginUrl(basePath, returnPath) {
  return `${basePath}views/login.html?next=${encodeURIComponent(returnPath)}`;
}

// HTTP status from Supabase -> error type in views/error.html (src/error.js).
const ERROR_TYPE_FOR_STATUS = {
  400: 'scoreRejected',
  401: 'sessionExpired',
  403: 'forbidden',
  404: 'notFound',
  409: 'scoreConflict',
  429: 'rateLimited',
};

/**
 * Address of the error page for an HTTP status. Status 0 (request never got
 * an answer) and 5xx show `offlineType`; anything else unknown shows "generic".
 */
export function errorUrl(basePath, status, offlineType = 'offline') {
  const type = status === 0 || status >= 500 ? offlineType : (ERROR_TYPE_FOR_STATUS[status] ?? 'generic');
  return `${basePath}views/error.html?type=${type}`;
}
