import './styles/main.css';
import { DodgeGame } from './games/dodge/DodgeGame.js';

const canvas = document.querySelector('#game-canvas');
const scoreEl = document.querySelector('[data-testid="score"]');
const startBtn = document.querySelector('[data-testid="start-button"]');

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
