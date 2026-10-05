import { GameLoop, Input, clamp, randomBetween } from '../engine/index.js';

// The canvas is drawn at 1/PIXEL_SCALE of the screen size and stretched back up
// by CSS (image-rendering: pixelated), which gives the chunky arcade pixels.
const PIXEL_SCALE = 3;

// Three star layers: far ones are small, dim and slow; near ones are bright,
// fast and drawn as streaks. `parallax` = how much a layer slides sideways when
// the ship moves (near layers more), which is what makes the ship feel like it flies.
const STAR_LAYERS = [
  { density: 1 / 1500, speed: 8, parallax: 0.08, streak: 1, colors: ['#2b2f55', '#3b3f6b'] },
  { density: 1 / 4000, speed: 24, parallax: 0.2, streak: 2, colors: ['#8a90c8', '#29f3ff', '#ff2bd6'] },
  { density: 1 / 12000, speed: 70, parallax: 0.5, streak: 6, colors: ['#ffffff'] },
];

// Pixel-art ship, one character per pixel ('.' = empty). Edit freely.
const SHIP_SPRITE = [
  '.....W.....',
  '....WWW....',
  '....WCW....',
  '...WWCWW...',
  '...WBBBW...',
  '..WWBBBWW..',
  '.MWBBBBBWM.',
  'MMWBBBBBWMM',
  'MWWWBBBWWWM',
  'M..WW.WW..M',
  '....D.D....',
];
const SHIP_COLORS = { W: '#e6e9f5', C: '#29f3ff', B: '#5a6390', M: '#ff2bd6', D: '#1a1d33' };
const SHIP_CELL = 3; // canvas pixels per sprite pixel
const SHIP_NOZZLES = [4, 6]; // sprite columns of the engine nozzles (the 'D' cells)
const FLAME_COLORS = ['#ffe14d', '#ff9a3c', '#ff4b3c'];

const SHIP_MAX_SPEED = 140; // canvas pixels per second
const MOUSE_IDLE_SECONDS = 3; // after this long without mouse movement, autopilot takes over

/**
 * Animated starfield with a ship that drifts on autopilot and can be steered
 * with the mouse or the arrow keys. Decoration only: nothing depends on it.
 *
 * `data-state` on the canvas is "animated", or "static" when the user asked the
 * system for reduced motion (then only one frame is drawn).
 */
export class SpaceBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.time = 0;
    this.mouseX = null;
    this.mouseIdle = Infinity;
    this.ship = { x: 0, vx: 0 };
    this.stars = [];
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });

    this.onResize = () => this.resize();
    this.onPointerMove = (e) => {
      this.mouseX = e.clientX / PIXEL_SCALE;
      this.mouseIdle = 0;
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
    this.resize();
  }

  start() {
    this.canvas.dataset.state = this.reducedMotion ? 'static' : 'animated';
    if (this.reducedMotion) this.render();
    else this.loop.start();
  }

  resize() {
    const width = Math.ceil(window.innerWidth / PIXEL_SCALE);
    const height = Math.ceil(window.innerHeight / PIXEL_SCALE);
    if (width === this.canvas.width && height === this.canvas.height && this.stars.length) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.ship.x = clamp(this.ship.x || width / 2, 0, width);

    // New size -> new set of stars, so the density stays the same on any screen.
    this.stars = [];
    for (const layer of STAR_LAYERS) {
      const count = Math.round(width * height * layer.density);
      for (let i = 0; i < count; i++) {
        this.stars.push({
          layer,
          x: randomBetween(0, width),
          y: randomBetween(0, height),
          color: layer.colors[Math.floor(Math.random() * layer.colors.length)],
        });
      }
    }
    if (this.reducedMotion) this.render();
  }

  /** Where the ship wants to be: keys win, then the mouse, then the autopilot. */
  targetX() {
    const { width } = this.canvas;
    if (this.input.isDown('ArrowLeft', 'a', 'A')) return -Infinity;
    if (this.input.isDown('ArrowRight', 'd', 'D')) return Infinity;
    if (this.mouseIdle < MOUSE_IDLE_SECONDS) return this.mouseX;
    // Autopilot: a slow, slightly uneven sway so it doesn't look mechanical.
    return width / 2 + Math.sin(this.time * 0.45) * width * 0.3 + Math.sin(this.time * 1.3) * width * 0.05;
  }

  update(dt) {
    const { width, height } = this.canvas;
    this.time += dt;
    this.mouseIdle += dt;

    // Ease towards the target: speed is proportional to the distance, capped.
    const ship = this.ship;
    ship.vx = clamp((this.targetX() - ship.x) * 2.5, -SHIP_MAX_SPEED, SHIP_MAX_SPEED);
    ship.x = clamp(ship.x + ship.vx * dt, 0, width);

    for (const star of this.stars) {
      star.y += star.layer.speed * dt;
      star.x -= ship.vx * star.layer.parallax * dt;
      // Wrap around the edges so the field never runs out.
      if (star.y >= height) {
        star.y -= height;
        star.x = randomBetween(0, width);
      }
      star.x = ((star.x % width) + width) % width;
    }
  }

  render() {
    const { ctx, canvas, ship } = this;
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const star of this.stars) {
      // A streak points back along the star's movement, so it tilts when the ship turns.
      const dx = -ship.vx * star.layer.parallax;
      const dy = star.layer.speed;
      const length = Math.hypot(dx, dy);
      // Round the start once; rounding every point separately makes straight streaks zigzag.
      const x = Math.round(star.x);
      const y = Math.round(star.y);
      ctx.fillStyle = star.color;
      for (let k = 0; k < star.layer.streak; k++) {
        ctx.fillRect(x - Math.round((dx / length) * k), y - Math.round((dy / length) * k), 1, 1);
      }
    }

    this.renderShip();
  }

  renderShip() {
    const { ctx, canvas } = this;
    const spriteWidth = SHIP_SPRITE[0].length * SHIP_CELL;
    const left = Math.round(this.ship.x - spriteWidth / 2);
    const top = canvas.height - SHIP_SPRITE.length * SHIP_CELL - 24;

    SHIP_SPRITE.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '.') return;
        ctx.fillStyle = SHIP_COLORS[cell];
        ctx.fillRect(left + x * SHIP_CELL, top + y * SHIP_CELL, SHIP_CELL, SHIP_CELL);
      });
    });

    // Engine flames: a random length every frame makes them flicker.
    const flameTop = top + SHIP_SPRITE.length * SHIP_CELL;
    for (const column of SHIP_NOZZLES) {
      const length = this.reducedMotion ? 2 : 1 + Math.floor(Math.random() * FLAME_COLORS.length);
      for (let i = 0; i < length; i++) {
        ctx.fillStyle = FLAME_COLORS[i];
        ctx.fillRect(left + column * SHIP_CELL, flameTop + i * SHIP_CELL, SHIP_CELL, SHIP_CELL);
      }
    }
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
  }
}
