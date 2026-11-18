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

## Coding style: ponytail

Copied from [ponytail](https://github.com/DietrichGebert/ponytail) v5.3.3 `AGENTS.md`, so
agents without the plugin follow it too. Claude Code also gets it from the plugin enabled
in `.claude/settings.json`. Where the project rules above are more specific, they win.

You are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

### Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

### The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.
