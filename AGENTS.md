# Space_Shooter

Vanilla JavaScript site (Vite, ESM) with a canvas game engine, Supabase
accounts and scores, and Playwright tests. Setup, pages, and the database
are documented in `README.md`. Follow the patterns already in the code.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | Build, then Playwright (unit + Chromium, Firefox, WebKit) against `preview` on port 4173 |
| `npm run test:db` | Hits the **real** Supabase from `.env`. Writes and deletes rows. Never run this from CI. |
| `npm run build` | Production build into `dist/` |

`npm test` bakes a fake Supabase URL into the build (`playwright.config.js`),
so it does not touch the database even when `.env` exists. Port 4173 must be free.

## Where code goes

- `src/engine/` is shared. Games import `GameLoop`, `Input`, and `math.js` from `src/engine/index.js`.
- One game lives in `src/games/<name>/<Name>Game.js`. Logic goes in `update(dt)` (`dt` is always `1/60`); `render()` only draws.
- Pages talk to the backend only through `src/services/scores.js` and `src/services/account.js`.
- A new HTML page must be added to `build.rolldownOptions.input` in `vite.config.js` or it will not be deployed.
- Imports are ESM with a `.js` extension. There is no framework, bundler alias, or TypeScript.

## Game and UI hooks

Mirror game state on the canvas as `data-state` (`idle`, `running`, `over`).
Mark interactive elements with `data-testid`. Tests assert these attributes;
they do not read pixels.

Guests may play. Only a logged-in player may save a score. The browser check
is a convenience; the real rule is Row Level Security in `supabase/schema.sql`.
Keep the same validation in the service and in a database constraint.

## Tests

- Browser specs live in `tests/e2e/` and import `test` from `tests/e2e/fixtures.js`, not from `@playwright/test`.
- Specs call page-object methods only. Selectors and assertions stay in `tests/e2e/pages/`.
- `tests/e2e/support/FakeSupabase.js` answers every Supabase request. Extend it when a flow needs a new response.
- Module tests live in `tests/unit/` and import the source file directly. They use a fake `fetch`, not the browser.
- `tests/db/` is the only suite allowed to use real credentials.

## Do not

- Commit `.env`, the Supabase secret key, or the Discord webhook. The publishable key is public; access is decided by RLS.
- Change `playwright.config.js` so `npm test` uses `.env` or the real database.
- Put game rules only in the browser. Anyone can call the API with the publishable key.
- Edit `dist/`, `node_modules/`, or Playwright report folders.
