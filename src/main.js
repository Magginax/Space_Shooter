import './styles/main.css';
import { SpaceShooterGame } from './games/space-shooter/SpaceShooterGame.js';
import { currentPlayer, isAuthConfigured } from './services/account.js';
import { saveScore } from './services/scores.js';
import { loginUrl } from './services/redirect.js';

const section = document.querySelector('[data-testid="game-section"]');
const lock = document.querySelector('[data-testid="game-lock"]');
const lockMessage = document.querySelector('[data-testid="game-lock-message"]');
const loginLink = document.querySelector('[data-testid="login-to-play"]');
const gameArea = document.querySelector('[data-testid="game-area"]');
const playerName = document.querySelector('[data-testid="player-name"]');
const guestNote = document.querySelector('[data-testid="guest-note"]');
const canvas = document.querySelector('#game-canvas');

// After logging in, come back straight to the game.
const loginToGame = loginUrl(import.meta.env.BASE_URL, `${location.pathname}#game`);

/** Only logged-in players get their score saved; guests just play. */
async function saveFinalScore(player, score) {
  if (player.isGuest) return;
  try {
    await saveScore(player.displayName, score);
  } catch (error) {
    console.error(error); // the game goes on even if the leaderboard is down
  }
}

function startGame(player) {
  playerName.textContent = player.displayName;
  guestNote.hidden = !player.isGuest;
  gameArea.hidden = false;
  section.dataset.access = 'granted';

  const startButton = document.querySelector('[data-testid="start-game"]');
  const game = new SpaceShooterGame(canvas, {
    onGameOver: (score) => {
      startButton.hidden = false;
      saveFinalScore(player, score);
    },
  });

  startButton.addEventListener('click', () => {
    game.start();
    startButton.hidden = true;
    startButton.blur();
  });

  window.addEventListener('keydown', (e) => {
    if (game.state === 'running' && (e.key.startsWith('Arrow') || e.key === ' ')) e.preventDefault();
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
