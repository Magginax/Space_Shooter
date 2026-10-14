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
