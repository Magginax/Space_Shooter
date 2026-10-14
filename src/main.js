import './styles/main.css';
import { DodgeGame } from './games/dodge/DodgeGame.js';
import { currentPlayer, isAuthConfigured } from './services/account.js';
import { loginUrl } from './services/redirect.js';

const section = document.querySelector('[data-testid="game-section"]');
const lock = document.querySelector('[data-testid="game-lock"]');
const lockMessage = document.querySelector('[data-testid="game-lock-message"]');
const loginLink = document.querySelector('[data-testid="login-to-play"]');
const gameArea = document.querySelector('[data-testid="game-area"]');
const playerName = document.querySelector('[data-testid="player-name"]');
const guestNote = document.querySelector('[data-testid="guest-note"]');
const canvas = document.querySelector('#game-canvas');
const scoreEl = document.querySelector('[data-testid="score"]');
const startBtn = document.querySelector('[data-testid="start-button"]');

// After logging in, come back straight to the game.
const loginToGame = loginUrl(import.meta.env.BASE_URL, `${location.pathname}#game`);

function startGame(player) {
  playerName.textContent = player.username;
  guestNote.hidden = !player.isGuest;
  gameArea.hidden = false;
  section.dataset.access = 'granted';

  // The game only exists for players: without login there is nothing to start.
  const game = new DodgeGame(canvas, {
    onScore: (score) => {
      scoreEl.textContent = String(score);
    },
  });

  startBtn.addEventListener('click', () => {
    game.start();
    startBtn.blur(); // so Space/Enter while playing doesn't click the button again
  });

  // Stop arrow keys from scrolling the page while playing.
  window.addEventListener('keydown', (e) => {
    if (game.state === 'running' && e.key.startsWith('Arrow')) e.preventDefault();
  });
}

function lockGame() {
  section.dataset.access = 'locked';
  loginLink.href = loginToGame;
  if (!isAuthConfigured) lockMessage.textContent = 'Login is offline. You can still play as a guest.';
  lock.hidden = false;
}

async function init() {
  const player = await currentPlayer();
  if (player) {
    startGame(player);
  } else if (location.hash === '#game') {
    // A direct link to the game: go to the login page and come back afterwards.
    // replace() keeps the locked page out of the history, so Back does not loop.
    location.replace(loginToGame);
  } else {
    lockGame();
  }
}

init();
