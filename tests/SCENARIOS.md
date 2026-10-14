# Test scenarios (to implement later)

Planned tests for the leaderboard. They will be written once the project is
close to done, so they don't need rewriting while things still change.
Status: `[ ]` = not written yet, `[x]` = done.

## How to test without the real database

- **Unit tests** (`tests/unit/`, Playwright `unit` project, Node): pass a fake
  `fetch` to `createLeaderboard()`, as `tests/unit/leaderboard.spec.js` does.
- **E2E tests** (`tests/e2e/`): fake the server with
  `page.route('**/rest/v1/scores**', route => route.fulfill({ json: [...] }))`.
- The client is only created when `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` are set at build time. The test build gets
  the fake `https://supabase.test` from `webServer.env` in
  `playwright.config.js` (done). Environment variables override `.env`,
  so tests never reach the real database.
- The "offline" scenarios need a build **without** these variables
  (a separate build or project).

## Unit: input checks (`validateScore` in `src/services/leaderboard.js`)

- [ ] Valid input passes: `{ game: 'space-shooter', nickname: 'ACE', score: 1200 }`.
- [ ] Spaces around the nickname are trimmed (`'  ACE  '` -> `'ACE'`).
- [ ] Nickname that is empty or only spaces is rejected.
- [ ] Nickname with 20 characters passes, 21 is rejected.
- [ ] 20 emoji pass (characters are counted, not UTF-16 units).
- [ ] Nickname that is not a string (`null`, `123`) is rejected.
- [ ] Score `0` passes; `-1`, `1.5`, `'100'`, `NaN`, `Infinity` are rejected.
- [ ] Empty or missing `game` is rejected.
- [ ] `submitScore` with invalid input makes **no** network request.
- [ ] `submitScore` sends the trimmed nickname.

## Unit: `src/services/scores.js`

Needs `import.meta.env`, so it is easiest to test through the page (E2E) or
by moving the "configured?" logic into a function that takes the env object.

- [ ] `saveScore(nickname, score)` uses game `'space-shooter'` by default.
- [ ] `saveScore(nickname, score, 'other')` sends the given game.
- [ ] `loadTopScores()` asks for 10 rows of `'space-shooter'` by default.
- [ ] Without configuration both functions reject with
      "Leaderboard is not configured...".

## E2E: leaderboard page (`views/leaderboard.html`)

State is in `data-state` on `[data-testid="leaderboard"]`:
`loading` | `ready` | `empty` | `error` | `offline`.

- [ ] Title is "Leaderboard - Space_Shooter".
- [ ] With scores: state `ready`, rows in server order, ranks `1ST 2ND 3RD 4TH...`,
      scores padded to 6 digits (`42` -> `000042`).
- [ ] Top three rows have classes `first`, `second`, `third`.
- [ ] The request asks for `game=eq.space-shooter`, `limit=10`, sorted by score desc.
- [ ] No scores: state `empty`, text "NO SCORES YET. BE THE FIRST!", table hidden.
- [ ] Server error (HTTP 500): state `error`, text "CONNECTION LOST", RETRY visible.
- [ ] RETRY after the server recovers: state `ready`, RETRY hidden.
- [ ] Nickname `<img src=x onerror=alert(1)>` is shown as text; no `<img>` in the table.
- [ ] Without configuration: state `offline`, text "LEADERBOARD OFFLINE", no request sent.

## E2E: background (`src/effects/SpaceBackground.js`)

Decoration only, so check behaviour, not pixels.

- [ ] Canvas `[data-testid="space-canvas"]` has `data-state="animated"`.
- [ ] With `reducedMotion: 'reduce'`: `data-state="static"`.
- [ ] The canvas does not block clicks (RETRY and links still work).
- [ ] No page errors (`page.on('pageerror')`) after a few seconds of animation,
      after resizing the window, and while holding arrow keys.

## E2E: navigation

- [ ] Home page nav link "Leaderboard" opens `views/leaderboard.html`.
- [ ] "< BACK" returns to the home page.
- [ ] Under a sub-path (`BASE_PATH=/<repo>/` build) all links and assets load.

## Database (`tests/db/`, real Supabase, `npm run test:db`)

Rows use game `'e2e-test'` and are deleted in `afterAll`.

- [x] A saved score (nickname with spaces around) can be read back trimmed.
- [x] Saving a test score does not change the Space Shooter top 10.
- [x] Insert with score `-1`, nickname `' ACE'` or 21 characters fails (check constraints).
- [x] The publishable key cannot update a score.
- [x] Clean-up deletes all `'e2e-test'` rows.
- [ ] Insert with nickname `''` or `'   '` fails (`scores_nickname_length`).
- [ ] The publishable key cannot delete a Space Shooter score. Needs a safe way to
      check it without risking real rows, e.g. a separate test project.

## Accounts

Unit (`tests/unit/auth.spec.js`), E2E (`tests/e2e/login.spec.js`) and
database (`tests/db/auth-db.spec.js`, needs the test account in `.env`).

- [x] Username is trimmed + lower-cased; bad usernames and short passwords are rejected without a request.
- [x] Login / sign-up send `<username>@players.space-shooter.local`; the role is never sent.
- [x] Supabase errors become readable messages (wrong password, taken username, "Confirm email" on).
- [x] `setRole` fails when the database changes nothing; unknown roles are refused.
- [x] Login page: success shows pilot + rank, wrong password costs a heart, 3 = GAME OVER, hearts refill.
- [x] Login survives a reload; LOGOUT shows the form again.
- [x] Reduced motion = static LCD; no page errors.
- [x] DB: test account has role `test`, sees only itself, cannot become admin or change its username directly.
- [x] DB: visitors without login cannot read profiles.
- [ ] DB: an admin can list everyone and change roles (needs an admin test account).
- [ ] Session expired / refresh token invalid: page shows the form again.

## Live check (manual, before a release)

- [ ] Registering on the live site works (Supabase accepts the `.local` login address).

- [ ] Built with the real `.env`, the page loads scores from Supabase (state `ready` or `empty`).
- [ ] `saveScore()` from the game makes the new score appear on the leaderboard.
- [ ] On GitHub Pages the leaderboard is not `offline`
      (needs the GitHub secrets passed to the build in `deploy.yml`).

## Removed for now (will come back)

- Dodge game tests: the game was removed; Space Shooter gets its own tests
  once it has game logic (`src/games/space-shooter/`).
- Rename tests (unit, e2e, DB): renaming will change (separate nickname or a
  real rename), so its tests come back with the final version.
- [ ] Space Shooter: game over of a logged-in player saves the score; a guest's does not.
