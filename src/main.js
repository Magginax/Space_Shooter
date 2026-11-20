import './styles/main.css';
import { SpaceShooterGame } from './games/space-shooter/SpaceShooterGame.js';
import { currentPlayer, isAuthConfigured, saveCoins, saveLoadout, saveProgress } from './services/account.js';
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

function startGame(player) {
  playerName.textContent = player.displayName;
  guestNote.hidden = !player.isGuest;
  gameArea.hidden = false;
  section.dataset.access = 'granted';

  const startButton = document.querySelector('[data-testid="start-game"]');
  const abandonPrompt = document.querySelector('[data-testid="abandon-prompt"]');
  const backButton = document.querySelector('[data-testid="upgrade-back"]');
  const game = new SpaceShooterGame(canvas, {
    level: player.level,
    xp: player.xp,
    coinsEarned: player.coinsEarned,
    coinsSpent: player.coinsSpent,
    loadout: player.loadout,
    prompt: abandonPrompt,
    backButton,
    onGameOver: (score) => {
      startButton.hidden = false;
      saveFinalScore(player, score);
    },
    onProgress: (xp) => {
      if (player.isGuest) return;
      saveProgress(xp).catch((error) => console.error(error));
    },
    onCoins: (earned) => {
      if (player.isGuest) return;
      saveCoins(earned).catch((error) => console.error(error));
    },
    onLoadout: (loadout) => {
      if (player.isGuest) return;
      // `player` holds the last loadout the database accepted, and what was paid for it.
      const spent = game.coinsSpent;
      saveLoadout(player.loadout, loadout, game.level, game.coinsEarned, player.coinsSpent)
        .then(() => {
          player.loadout = loadout;
          player.coinsSpent = spent;
        })
        .catch((error) => {
          console.error(error);
          // Back to the accepted loadout. The game hands the coins back with it.
          game.setLoadout(player.loadout);
        });
    },
  });

  startButton.addEventListener('click', () => {
    game.openMap();
    startButton.hidden = true;
    startButton.blur();
  });

  backButton.addEventListener('click', () => {
    game.back();
    backButton.blur();
  });

  window.addEventListener('keydown', (e) => {
    const playing = game.state === 'map' || game.state === 'running' || game.state === 'paused' || game.state === 'upgrades' || game.state === 'weapon' || game.state === 'debug';
    if (playing && (e.key.startsWith('Arrow') || e.key === ' ' || e.key === 'Enter')) e.preventDefault();
    if ((e.key === 'u' || e.key === 'U') && game.state === 'idle') {
      e.preventDefault();
      game.openUpgrades();
    }
    if ((e.key === '`' || e.key === '~' || e.code === 'Backquote') && game.state === 'idle') {
      e.preventDefault();
      game.toggleDebug();
    }
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
