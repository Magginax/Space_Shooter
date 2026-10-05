/**
 * Fixed-timestep game loop.
 *
 * `update(dt)` always receives the same step (default 1/60 s), so game logic
 * behaves identically on 60 Hz and 144 Hz screens. `render()` runs once per
 * browser frame (requestAnimationFrame).
 */
export class GameLoop {
  constructor({ update, render, step = 1 / 60 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.accumulator = 0;
    this.lastTime = 0;
    this.frameId = null;
    this.tick = this.tick.bind(this);
  }

  get running() {
    return this.frameId !== null;
  }

  start() {
    if (this.running) return;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  tick(now) {
    // Cap elapsed time so a backgrounded tab doesn't run hundreds of updates at once.
    const elapsed = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.accumulator += elapsed;

    while (this.accumulator >= this.step && this.running) {
      this.update(this.step);
      this.accumulator -= this.step;
    }

    this.render();
    // update() may have called stop() (e.g. game over); only continue if still running.
    if (this.running) this.frameId = requestAnimationFrame(this.tick);
  }
}
