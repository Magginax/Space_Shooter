import { GameLoop, Input } from '../../engine/index.js';

/**
 * Space Shooter: skeleton only, ready for the game logic.
 *
 * What is already here:
 * - the game loop (fixed-step update + render, see engine/GameLoop.js)
 * - keyboard input (this.input.isDown('ArrowLeft', 'a', ...))
 * - states "idle" -> "running" -> "over", mirrored in data-state on the
 *   canvas so Playwright tests can check them without reading pixels
 * - onScore(score) while playing and onGameOver(score) at the end; main.js
 *   saves the final score for logged-in players
 *
 * What to add: everything in reset(), update() and render() marked TODO.
 */
export class SpaceShooterGame {
  constructor(canvas, { onScore = () => {}, onGameOver = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onScore = onScore;
    this.onGameOver = onGameOver;
    this.input = new Input();
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.reset();
    this.setState('idle');
    this.render();
  }

  /** Everything a new round starts with. */
  reset() {
    this.score = 0;
    // TODO: player ship, bullets, enemies...
    this.onScore(this.score);
  }

  setState(state) {
    this.state = state;
    this.canvas.dataset.state = state;
  }

  start() {
    this.reset();
    this.setState('running');
    this.loop.start();
  }

  /** Call when the player loses; reports the final score once. */
  gameOver() {
    if (this.state !== 'running') return;
    this.loop.stop();
    this.setState('over');
    this.render();
    this.onGameOver(this.score);
  }

  addScore(points) {
    this.score += points;
    this.onScore(this.score);
  }

  /** Game logic, called 60 times per second with dt = 1/60 s. */
  update(dt) {
    // TODO: move the player (this.input), spawn and move enemies, check hits,
    // call this.addScore(...) and this.gameOver() when needed.
  }

  /** Drawing only, no game logic here. */
  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // TODO: draw the player, enemies, bullets...
  }

  /** Stops the loop and the keyboard listeners, e.g. when leaving the page. */
  destroy() {
    this.loop.stop();
    this.input.destroy();
  }
}
