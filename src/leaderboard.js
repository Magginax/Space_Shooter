import './styles/leaderboard.css';
import { loadTopScores, isLeaderboardConfigured } from './services/scores.js';
import { SpaceBackground } from './effects/SpaceBackground.js';
import { errorUrl } from './services/redirect.js';

const board = document.querySelector('[data-testid="leaderboard"]');
const table = document.querySelector('[data-testid="leaderboard-table"]');
const rows = document.querySelector('[data-testid="leaderboard-rows"]');
const status = document.querySelector('[data-testid="leaderboard-status"]');

const PODIUM = ['first', 'second', 'third'];
const rankLabel = (index) => ['1ST', '2ND', '3RD'][index] ?? `${index + 1}TH`;

/** `state` goes to data-state ("loading" | "ready" | "empty" | "offline") for tests. */
function showMessage(state, text) {
  board.dataset.state = state;
  table.hidden = true;
  status.hidden = false;
  status.textContent = text;
}

function showScores(scores) {
  rows.replaceChildren(
    ...scores.map((entry, index) => {
      const row = document.createElement('tr');
      if (index < PODIUM.length) row.className = PODIUM[index];
      row.style.setProperty('--i', index); // staggers the row "insert" animation in CSS
      // textContent, never innerHTML: nicknames come from strangers and may contain HTML.
      for (const text of [rankLabel(index), entry.nickname, String(entry.score).padStart(6, '0')]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    }),
  );
  board.dataset.state = 'ready';
  status.hidden = true;
  table.hidden = false;
}

async function refresh() {
  if (!isLeaderboardConfigured) {
    showMessage('offline', 'LEADERBOARD OFFLINE');
    return;
  }
  showMessage('loading', 'LOADING...');
  try {
    const scores = await loadTopScores();
    if (scores.length === 0) showMessage('empty', 'NO SCORES YET. BE THE FIRST!');
    else showScores(scores);
  } catch (error) {
    console.error(error);
    location.assign(errorUrl(import.meta.env.BASE_URL, error.status ?? 0, 'leaderboardOffline'));
  }
}

refresh();

new SpaceBackground(document.querySelector('[data-testid="space-canvas"]')).start();
