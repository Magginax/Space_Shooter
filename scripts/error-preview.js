// Opens the running dev site in a real browser where one Supabase answer is
// replaced by an HTTP error, so each error page can be checked by hand.
//
//   npm run dev                                   (in another terminal)
//   npm run error-preview -- <status> [where]
//
//   <status>  400 401 403 404 409 418 429 500 503, or 0 = no answer at all
//   [where]   leaderboard (default)  loading the scores fails at once
//             game                   saving the score fails: log in, play, die
//             login                  the login fails: only 0, 429, 5xx leave the form
//
// Everything else talks to the real Supabase from .env. Close the browser to stop.
import { chromium } from '@playwright/test';

const SITE = process.env.SITE ?? 'http://localhost:5173';
const [status = '503', where = 'leaderboard'] = process.argv.slice(2);

const TARGETS = {
  leaderboard: { open: '/views/leaderboard.html', url: '**/rest/v1/scores**' },
  game: { open: '/views/login.html?next=%2F%23game', url: '**/rest/v1/scores**', method: 'POST' },
  login: { open: '/views/login.html', url: '**/auth/v1/token**' },
};
const target = TARGETS[where];
if (!target || !/^\d+$/.test(status)) {
  console.error('Usage: npm run error-preview -- <status> [leaderboard|game|login]');
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.route(target.url, (route) => {
  if (target.method && route.request().method() !== target.method) return route.continue();
  console.log(`${route.request().method()} ${route.request().url()} -> ${status === '0' ? 'no answer' : status}`);
  if (status === '0') return route.abort('internetdisconnected');
  return route.fulfill({
    status: Number(status),
    // supabase-js retries a 503 after Retry-After seconds; 0 = show the error page at once.
    headers: { 'Retry-After': '0' },
    json: { message: `Simulated ${status}`, code: `SIMULATED_${status}` },
  });
});

await page.goto(SITE + target.open);
console.log(`Opened ${SITE + target.open}. Close the browser window to stop.`);
await new Promise((resolve) => browser.on('disconnected', resolve));
