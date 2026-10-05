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
| `npm run test:ui` | Playwright interactive UI mode |
| `npm run test:report` | Open the last HTML test report |

## Project structure

```
.
├── index.html                 # Page entry (Vite injects the built JS/CSS)
├── public/                    # Static files copied as-is (images, sounds, favicon)
├── src/
│   ├── main.js                # Wires the page to the game
│   ├── styles/main.css
│   ├── engine/                # Reusable game engine
│   │   ├── GameLoop.js        # Fixed-timestep update + render loop
│   │   ├── Input.js           # Keyboard state
│   │   └── math.js            # clamp, random, collision helpers
│   ├── games/
│   │   └── dodge/DodgeGame.js # Example game built on the engine
│   └── services/
│       └── leaderboard.js     # Supabase leaderboard (not used by the page yet)
├── supabase/schema.sql        # Database table + access rules (run in Supabase)
├── tests/e2e/                 # Playwright browser tests
├── tests/unit/                # Playwright tests for plain JS modules (no browser)
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
