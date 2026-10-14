# Space_Shooter

Static website template with a small canvas game engine, Playwright end-to-end
tests, a Jenkins pipeline and GitHub Pages deployment.

## Quick start

```bash
npm install
npx playwright install   # downloads test browsers (once)
npm run dev              # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm test` | Build + run Playwright tests (Chromium, Firefox, WebKit) |
| `npm run test:db` | Tests against the real Supabase from `.env` (writes and deletes `e2e-test` rows, checks account rules) |
| `npm run test:ui` | Playwright interactive UI mode |
| `npm run test:report` | Open the last HTML test report |

## Project structure

```
.
├── index.html                 # Page entry (Vite injects the built JS/CSS)
├── views/
│   ├── leaderboard.html       # High-score page (listed in vite.config.js)
│   └── login.html             # Login / registration on a handheld-LCD screen
├── public/                    # Static files copied as-is (images, sounds, favicon)
├── src/
│   ├── main.js                # Wires the page to the game
│   ├── leaderboard.js         # Loads and shows the high scores
│   ├── login.js               # Login form <-> auth service <-> LCD scene
│   ├── styles/                # main.css, leaderboard.css, login.css
│   ├── effects/
│   │   ├── SpaceBackground.js # Starfield + ship behind the leaderboard
│   │   └── LcdScene.js        # Phone-LCD shoot 'em up behind the login form
│   ├── engine/                # Reusable game engine
│   │   ├── GameLoop.js        # Fixed-timestep update + render loop
│   │   ├── Input.js           # Keyboard state
│   │   └── math.js            # clamp, random, collision helpers
│   ├── games/
│   │   └── dodge/DodgeGame.js # Example game built on the engine
│   └── services/
│       ├── leaderboard.js     # Supabase client + input checks
│       ├── scores.js          # saveScore() / loadTopScores(), configured from .env
│       ├── auth.js            # Accounts: sign up / in / out, roles, input checks
│       └── account.js         # The site's auth instance, configured from .env
├── supabase/schema.sql        # Database table + access rules (run in Supabase)
├── tests/e2e/                 # Playwright browser tests
├── tests/unit/                # Playwright tests for plain JS modules (no browser)
├── tests/SCENARIOS.md         # Planned test scenarios not written yet
├── playwright.config.js
├── vite.config.js
├── Jenkinsfile                # Jenkins CI pipeline
└── .github/workflows/deploy.yml  # GitHub Actions: test + deploy to Pages
```

## Adding a game

1. Create `src/games/<name>/<Name>Game.js` using `GameLoop` and `Input` from `src/engine`.
2. Add a `<canvas>` for it in `index.html` and start it from `src/main.js`.
3. Mirror the game state on the canvas (`data-state`) so tests can check it.
4. Add a spec in `tests/e2e/`.

## Leaderboard

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Copy `.env.example` to `.env` and fill in the project URL
   (`https://<project-id>.supabase.co`) and the publishable key.
3. Save a score from any game:

   ```js
   import { saveScore } from '../../services/scores.js';
   await saveScore('ACE', 1200); // game defaults to 'dodge'
   ```

   It rejects with a readable error if the nickname (1-20 characters) or
   score (whole number, 0 or more) is invalid, or the server refuses it.

## Accounts (login)

Players log in on `views/login.html` with a **username and password only**.
Passwords are kept by Supabase Auth as bcrypt hashes; our `profiles` table
holds only the username and the role (`admin`, `user`, `test`). The database
rules (RLS) decide what each role may do, see `supabase/schema.sql`.

One-time setup in the Supabase dashboard:

1. **SQL Editor**: run the blocks added on 2026-10-14 and 2026-10-15 from
   `supabase/schema.sql`, in order (or the whole file on a new project).
2. **Authentication → Sign In / Providers → Email**: turn **off**
   "Confirm email" (logins use `<username>@players.space-shooter.local`,
   an address that never receives mail). Set the minimum password length to 8.
3. Register on the login page, then make yourself admin in the SQL Editor:
   `update public.profiles set role = 'admin' where username = 'your_name';`
4. Test account for `npm run test:db`: register `e2e_tester` on the login page,
   run `update public.profiles set role = 'test' where username = 'e2e_tester';`
   and put `TEST_USERNAME` / `TEST_PASSWORD` into `.env` (see `.env.example`).

There is no "forgot password" (no real e-mail): an admin resets it in
**Authentication → Users**. Logged-in players change their password under
**PROFILE** on the login page.

The game only starts for logged-in players or guests (**PLAY AS GUEST**).
Guests can play, but only logged-in players may save scores: that rule is in
the database, because the check in the browser can be bypassed. A direct link
to `#game` sends visitors to the login page and back to the game afterwards.

```js
import { auth } from '../services/account.js';
const player = await auth.getCurrentPlayer(); // { id, username, role } or null
```

## GitHub Pages

1. Push the repo to GitHub with a `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs the tests, then builds with
   `BASE_PATH=/<repo-name>/` and deploys `dist/`.

## Jenkins

The `Jenkinsfile` runs on a **Windows** agent without Docker. The agent needs:

1. **Git for Windows** and **Node.js 24** on PATH (restart the Jenkins service
   after installing them).
2. The **Pipeline**, **Git** and **JUnit** plugins.
3. A **Pipeline** job: *Pipeline script from SCM* -> Git -> this repo, branch
   `*/main`, script path `Jenkinsfile`. Without a public URL for GitHub
   webhooks, use **Poll SCM** (e.g. `H/5 * * * *`).

The first run downloads Chromium, Firefox and WebKit into the workspace
(`.ms-playwright`), later runs reuse them. Test results are published as
JUnit and the HTML report is archived. Port 4173 must be free on the agent.

### Discord notifications

After every build `scripts/notify-discord.ps1` posts the result (commit, test
counts, failed tests) with the zipped Playwright report to a Discord channel.

1. Discord: *Server Settings -> Integrations -> Webhooks -> New Webhook*, pick
   the channel, *Copy Webhook URL*.
2. Jenkins: *Manage Jenkins -> Credentials -> System -> Global -> Add
   Credentials*, kind **Secret text**, secret = the webhook URL, ID
   **`discord-webhook`**. Needs the **Credentials Binding** plugin.

Never commit the webhook URL: anyone who has it can post to the channel.
Preview the message without sending it (after `npm test`):
`powershell -ExecutionPolicy Bypass -File scripts\notify-discord.ps1 -Status SUCCESS -Build 1 -DryRun`
