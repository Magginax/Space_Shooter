import './styles/main.css';
import { SpaceShooterGame } from './games/space-shooter/SpaceShooterGame.js';
import { currentPlayer, isAuthConfigured, saveLoadout, saveProgress } from './services/account.js';
import { saveScore } from './services/scores.js';
import { errorUrl, loginUrl } from './services/redirect.js';

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
    console.error(error);
    // The run is over, so leaving for the error page loses nothing. No status = refused before sending.
    location.assign(errorUrl(import.meta.env.BASE_URL, error.status ?? 400, 'leaderboardOffline'));
  }
}
