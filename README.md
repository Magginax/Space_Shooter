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
| `npm run test:db` | Tests against the real Supabase from `.env` (writes and deletes `e2e-test` rows) |
| `npm run test:ui` | Playwright interactive UI mode |
| `npm run test:report` | Open the last HTML test report |

## Project structure

```
.
├── index.html                 # Page entry (Vite injects the built JS/CSS)
├── leaderboard.html           # High-score page (listed in vite.config.js)
├── public/                    # Static files copied as-is (images, sounds, favicon)
├── src/
│   ├── main.js                # Wires the page to the game
│   ├── leaderboard.js         # Loads and shows the high scores
│   ├── styles/                # main.css, leaderboard.css
│   ├── effects/
│   │   └── SpaceBackground.js # Starfield + ship behind the leaderboard
│   ├── engine/                # Reusable game engine
│   │   ├── GameLoop.js        # Fixed-timestep update + render loop
│   │   ├── Input.js           # Keyboard state
│   │   └── math.js            # clamp, random, collision helpers
│   ├── games/
│   │   └── dodge/DodgeGame.js # Example game built on the engine
│   └── services/
│       ├── leaderboard.js     # Supabase client + input checks
│       └── scores.js          # saveScore() / loadTopScores(), configured from .env
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

## GitHub Pages

1. Push the repo to GitHub with a `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs the tests, then builds with
   `BASE_PATH=/<repo-name>/` and deploys `dist/`.

## Jenkins

The `Jenkinsfile` runs inside the official Playwright Docker image, so the
agent needs Docker plus the **Docker Pipeline** and **JUnit** plugins. Create a
Pipeline (or Multibranch Pipeline) job pointing at this repo. Test results are
published as JUnit and the HTML report is archived.

When upgrading `@playwright/test`, update the image tag in the `Jenkinsfile`
to the same version.
