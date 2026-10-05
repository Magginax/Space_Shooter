import { GameLoop, Input, clamp, randomBetween, rectsOverlap } from '../../engine/index.js';

/**
 * Example game: move the player left/right and avoid falling blocks.
 * The score goes up by 1 for every block that leaves the screen.
 *
 * The canvas `data-state` attribute ("idle" | "running" | "over") mirrors the
 * game state so Playwright tests can assert on it.
 */
export class DodgeGame {
  constructor(canvas, { onScore = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onScore = onScore;
    this.input = new Input();
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.reset();
    this.setState('idle');
    this.render();
  }

  reset() {
    const { width, height } = this.canvas;
    this.player = { x: width / 2 - 15, y: height - 30, w: 30, h: 20, speed: 260 };
    this.blocks = [];
    this.spawnTimer = 0;
    this.score = 0;
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

  update(dt) {
    const { width, height } = this.canvas;
    const p = this.player;

    // Player movement
    if (this.input.isDown('ArrowLeft', 'a', 'A')) p.x -= p.speed * dt;
    if (this.input.isDown('ArrowRight', 'd', 'D')) p.x += p.speed * dt;
    p.x = clamp(p.x, 0, width - p.w);

    // Spawn a new block every 0.6 s
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.6;
      const size = randomBetween(15, 35);
      this.blocks.push({
        x: randomBetween(0, width - size),
        y: -size,
        w: size,
        h: size,
        speed: randomBetween(120, 220),
      });
    }

    // Move blocks and check for a collision with the player
    for (const b of this.blocks) {
      b.y += b.speed * dt;
      if (rectsOverlap(p, b)) {
        this.setState('over');
        this.loop.stop();
        return;
      }
    }

    // Blocks that fell off the bottom count as dodged
    const before = this.blocks.length;
    this.blocks = this.blocks.filter((b) => b.y < height);
    const dodged = before - this.blocks.length;
    if (dodged > 0) {
      this.score += dodged;
      this.onScore(this.score);
    }
  }

  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fbbf24';
    for (const b of this.blocks) ctx.fillRect(b.x, b.y, b.w, b.h);

    const p = this.player;
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    if (this.state !== 'running') {
      ctx.fillStyle = '#fff';
      ctx.font = '20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const text = this.state === 'over' ? `Game over - score ${this.score}` : 'Press Start';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
  }
}
