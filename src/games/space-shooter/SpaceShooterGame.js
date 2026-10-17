import { GameLoop, Input, clamp, randomBetween, rectsOverlap } from '../../engine/index.js';
import { DART, GHOST_ALPHA, HEART, SHIP, drawNumber, drawSprite, spriteBox } from '../../effects/lcdArt.js';

// Same LCD scale and speeds as the login scene
const TARGET_WIDTH = 170;
const INK = '#13280b';
const FADE_PER_FRAME = 0.5;
const MAX_LIVES = 3;
const HUD_HEIGHT = 12;
const GROUND_SPEED = 18;
const BULLET_SPEED = 130;
const MAX_BULLETS = 8;
const SHIP_SPEED = 55;
const FIRE_COOLDOWN = 0.45;
const DART_SPEED = 26;
const DART_POINTS = 50;
const BLINK_TIME = 1.2;

/**
 * Playable game on the home page.
 *
 * States "idle" -> "running" -> "over" are mirrored on the canvas as
 * data-state, with data-lives and data-score, so tests never read pixels.
 */
export class SpaceShooterGame {
  constructor(canvas, { onScore = () => {}, onGameOver = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrapper = canvas.parentElement;
    this.screen = this.wrapper.parentElement;
    this.onScore = onScore;
    this.onGameOver = onGameOver;
    this.input = new Input();
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dust = [];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.screen);
    this.resize();
    this.reset();
    this.setState('idle');
    this.render();
  }

  reset() {
    this.score = 0;
    this.lives = MAX_LIVES;
    this.time = 0;
    this.groundOffset = 0;
    this.spawnTimer = 2.5;
    this.bullets = [];
    this.enemies = [];
    const span = this.bottom() - this.top() - SHIP.length;
    this.ship = {
      y: this.top() + Math.max(0, span) / 2,
      cooldown: 0,
      blink: 0,
    };
    this.syncHud();
    this.onScore(this.score);
  }

  setState(state) {
    this.state = state;
    this.canvas.dataset.state = state;
  }

  syncHud() {
    this.canvas.dataset.lives = String(this.lives);
    this.canvas.dataset.score = String(this.score);
  }

  start() {
    if (this.state === 'running') return;
    this.reset();
    const box = this.shipBox();
    this.spawnWave({ startX: box.x + box.w + 80, y: box.y, aimed: true });
    this.setState('running');
    this.loop.start();
  }

  gameOver() {
    if (this.state !== 'running') return;
    this.loop.stop();
    this.setState('over');
    this.render();
    this.onGameOver(this.score);
  }

  addScore(points) {
    this.score += points;
    this.syncHud();
    this.onScore(this.score);
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.resizeObserver.disconnect();
  }

  // --- Layout ----------------------------------------------------------------

  resize() {
    const { clientWidth, clientHeight } = this.screen;
    if (!clientWidth || !clientHeight) return;
    const scale = Math.max(2, Math.round(clientWidth / TARGET_WIDTH));
    const width = Math.floor(clientWidth / scale);
    const height = Math.floor(clientHeight / scale);
    if (width === this.canvas.width && height === this.canvas.height && this.dust.length) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.wrapper.style.width = `${width * scale}px`;
    this.wrapper.style.height = `${height * scale}px`;
    this.screen.style.setProperty('--px', `${scale}px`);
    if (this.ship) this.ship.y = clamp(this.ship.y, this.top(), this.bottom() - SHIP.length);

    this.dust = Array.from({ length: Math.round((width * height) / 450) }, () => ({
      x: randomBetween(0, width),
      y: randomBetween(this.top(), this.bottom()),
      far: Math.random() < 0.6,
    }));
    if (this.state && this.state !== 'running') this.render();
  }

  top() {
    return HUD_HEIGHT + 2;
  }

  groundY() {
    return this.canvas.height - 4;
  }

  bottom() {
    return this.groundY() - 2;
  }

  shipBox() {
    const drift = Math.round((Math.sin(this.time * 0.9) + 1) * 1.5);
    return spriteBox(SHIP, 3 + drift, Math.round(this.ship.y));
  }

  spawnWave({ startX = this.canvas.width + 4, y = null, aimed = false } = {}) {
    const top = this.top() + 10;
    const bottom = Math.max(top, this.bottom() - 18);
    const base = y ?? randomBetween(top, bottom);
    for (const [dx, dy] of [[0, 0], [11, -9], [11, 9]]) {
      this.enemies.push({
        kind: DART,
        x: startX + dx,
        baseY: base + dy,
        y: base + dy,
        speed: DART_SPEED,
        amp: aimed ? 0 : 5,
        phase: aimed ? 0 : Math.random() * 6,
        points: DART_POINTS,
      });
    }
    this.spawnTimer = randomBetween(2.5, 4.5);
  }

  // --- Game logic ------------------------------------------------------------

  update(dt) {
    const { width } = this.canvas;
    this.time += dt;

    for (const speck of this.dust) {
      speck.x -= (speck.far ? 5 : 12) * dt;
      if (speck.x < 0) speck.x += width;
    }
    this.groundOffset += GROUND_SPEED * dt;

    let dir = 0;
    if (this.input.isDown('ArrowUp', 'w', 'W')) dir -= 1;
    if (this.input.isDown('ArrowDown', 's', 'S')) dir += 1;
    this.ship.y = clamp(this.ship.y + dir * SHIP_SPEED * dt, this.top(), this.bottom() - SHIP.length);
    this.ship.blink = Math.max(0, this.ship.blink - dt);
    this.ship.cooldown -= dt;
    if (this.ship.cooldown <= 0 && this.input.isDown(' ') && this.bullets.length < MAX_BULLETS) {
      const box = this.shipBox();
      this.bullets.push({ x: box.x + box.w, y: box.y + 3 });
      this.ship.cooldown = FIRE_COOLDOWN;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnWave();

    for (const enemy of this.enemies) {
      enemy.x -= enemy.speed * dt;
      enemy.y = enemy.baseY + Math.sin(this.time * 2 + enemy.phase) * enemy.amp;
    }
    this.enemies = this.enemies.filter((enemy) => enemy.x > -10 && enemy.y > this.top() - 4 && enemy.y < this.groundY());

    this.bullets = this.bullets.filter((bullet) => {
      bullet.x += BULLET_SPEED * dt;
      const box = { x: bullet.x, y: bullet.y, w: 3, h: 1 };
      const index = this.enemies.findIndex((enemy) => rectsOverlap(box, spriteBox(enemy.kind[0], enemy.x, enemy.y)));
      if (index === -1) return bullet.x < width;
      this.addScore(this.enemies[index].points);
      this.enemies.splice(index, 1);
      return false;
    });

    if (this.state !== 'running') return;
    if (this.ship.blink > 0) return;
    const ship = this.shipBox();
    const hit = this.enemies.findIndex((enemy) => rectsOverlap(ship, spriteBox(enemy.kind[0], enemy.x, enemy.y)));
    if (hit === -1) return;
    this.enemies.splice(hit, 1);
    this.lives -= 1;
    this.ship.blink = BLINK_TIME;
    this.syncHud();
    if (this.lives <= 0) this.gameOver();
  }

  // --- Drawing ---------------------------------------------------------------

  render() {
    const { ctx, canvas } = this;
    const { width, height } = canvas;
    if (!width || !height) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = this.reducedMotion ? 1 : FADE_PER_FRAME;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;

    for (const speck of this.dust) {
      ctx.globalAlpha = speck.far ? 0.25 : 0.6;
      ctx.fillRect(Math.round(speck.x), Math.round(speck.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    this.renderGround();
    for (const enemy of this.enemies) drawSprite(ctx, this.frame(enemy.kind), enemy.x, enemy.y);
    for (const bullet of this.bullets) ctx.fillRect(Math.round(bullet.x), bullet.y, 3, 1);
    this.renderShip();
    this.renderHud();
  }

  frame(frames, seconds = 0.25) {
    return frames[Math.floor(this.time / seconds) % frames.length];
  }

  renderGround() {
    const y = this.groundY();
    const offset = Math.floor(this.groundOffset) % 3;
    for (let x = -offset; x < this.canvas.width; x += 3) this.ctx.fillRect(x, y, 2, 1);
  }

  renderShip() {
    const ship = this.shipBox();
    if (this.ship.blink > 0 && Math.floor(this.ship.blink * 12) % 2 === 0) return;
    drawSprite(this.ctx, SHIP, ship.x, ship.y);
    const flame = this.reducedMotion ? 2 : 1 + Math.floor(Math.random() * 3);
    this.ctx.fillRect(ship.x - flame, ship.y + 3, flame, 1);
  }

  renderHud() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, HUD_HEIGHT);
    for (let i = 0; i < MAX_LIVES; i++) {
      ctx.globalAlpha = i < this.lives ? 1 : GHOST_ALPHA * 2;
      drawSprite(ctx, HEART, 2 + i * 11, 2);
    }
    ctx.globalAlpha = 1;
    drawNumber(ctx, this.score, 5, canvas.width - 2, 1);
  }
}
