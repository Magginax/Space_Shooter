import { clamp, randomBetween } from '../engine/index.js';
import { LcdScene, hash } from './LcdScene.js';
import { FONT_H, SHIP, SKULL, drawNumber, drawText, spriteBox, textWidth } from './lcdArt.js';

// Seconds into each scene's loop shown as the single still frame for reduced
// motion. The keys are also the error types that have a scene of their own.
const STILL = {
  notFound: 2,
  forbidden: 4.2,
  sessionExpired: 1,
  loginRequired: 3.4,
  scoreRejected: 3.4,
  scoreConflict: 2.5,
  rateLimited: 1,
  offline: 1.2,
  leaderboardOffline: 1,
  maintenance: 1,
};

// --- Helpers -------------------------------------------------------------------

/** The sprite turned 90° clockwise. */
const turn = (sprite) => [...sprite[0]].map((_, x) => sprite.map((row) => row[x]).reverse().join(''));
/** The sprite at 0°, 90°, 180° and 270°, for things that tumble. */
const turns = (sprite) => [sprite, turn(sprite), turn(turn(sprite)), turn(turn(turn(sprite)))];
const mix = (a, b, u) => a + (b - a) * u;
const mixPoint = (a, b, u) => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) });
/** 0 before `from`, 1 after `to`, a smooth ramp in between. */
const ease = (p, from, to) => {
  const u = clamp((p - from) / (to - from), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Point on a curve from `a` to `c` that bends towards `b` (quadratic Bézier). */
const bezier = (a, b, c, u) => ({
  x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * b.x + u ** 2 * c.x,
  y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * b.y + u ** 2 * c.y,
});

// --- Pixel art (lcdArt.js rules; 'o' = a cleared, light pixel) ------------------

const SHIP_TURNS = turns(SHIP);
const SHIP_UP = SHIP_TURNS[3];

// The 404 scene is drawn like the boss on the login screen: shapes are tested
// pixel by pixel, so they can turn slowly. These give the distance to a shape's
// edge: negative inside, about 1 per pixel, so -1..0 is a 1-pixel outline.

/** Maps a point from a shape's own coordinates to the screen: turned by `angle` around (cx, cy). */
const placer = (cx, cy, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (x, y) => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
};
/** Distance to a convex polygon given by its corners (any order around it): a fin. */
const polyDist = (x, y, corners) => {
  const mx = corners.reduce((sum, [px]) => sum + px, 0) / corners.length;
  const my = corners.reduce((sum, [, py]) => sum + py, 0) / corners.length;
  let d = -Infinity;
  corners.forEach(([px, py], i) => {
    const [qx, qy] = corners[(i + 1) % corners.length];
    let nx = qy - py;
    let ny = px - qx;
    // The edge's normal must point away from the middle.
    if (nx * (mx - px) + ny * (my - py) > 0) [nx, ny] = [-nx, -ny];
    d = Math.max(d, (nx * (x - px) + ny * (y - py)) / Math.hypot(nx, ny));
  });
  return d;
};
/** Roughly the distance to an ellipse, the same way (exact for a circle). */
const ellipseDist = (x, y, ex, ey, rx, ry) => (Math.hypot((x - ex) / rx, (y - ey) / ry) - 1) * Math.min(rx, ry);
/** Distance to a rounded stick from point a to point b, `r` thick: an arm or a leg. */
const segmentDist = (x, y, [ax, ay], [bx, by], r) => {
  const dx = bx - ax;
  const dy = by - ay;
  const u = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - dx * u, y - ay - dy * u) - r;
};

// 404 ground: an antenna post and alien plants with round buds.
const POST = ['#.#.#', '.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'];
const BUD = ['.###.', '##.##', '.###.', '..#..', '#.#.#', '.###.', '..#..', '..#..'];
const TALL_BUD = ['.###.', '##.##', '.###.', '..#..', '..#..', '#.#..', '.##.#', '..##.', '..#..', '..#..', '..#..', '..#..'];

// 401
// Helmet with the visor shut (asleep); body sitting, legs hanging over the crate.
const PILOT_HEAD = ['..###..', '.#...#.', '#.....#', '#..####', '#.....#', '.#####.'];
const PILOT_BODY = [
  '...#....',
  '.#####..',
  '#.###.#.',
  '#.###.#.',
  '..###...',
  '..######',
  '.......#',
  '.......#',
  '.......#',
  '.......#',
  '......##',
];
const SPIDER = [['#.#.#', '.###.', '#.#.#'], ['.#.#.', '#####', '.#.#.']];
const SNAIL = [
  ['..###...#', '.#...#.#.', '#.##.#.#.', '#..#.####', '#########'],
  ['..###..#.', '.#...#.#.', '#.##.#.#.', '#..#.####', '#########'],
];
const DRONE = [
  ['##.....##', '.#.###.#.', '..#####..', '...#.#...'],
  ['.##...##.', '.#.###.#.', '..#####..', '...#.#...'],
];

// 400
const PAGE_TURNS = turns(['#####..', '#...##.', '#...###', '#.....#', '#.###.#', '#.....#', '#.##..#', '#.....#', '#######']);

// 429
const ENVELOPE = ['#######', '##...##', '#.#.#.#', '#..#..#', '#######'];
const FLAKE = [['#.#', '.#.', '#.#'], ['.#.', '###', '.#.']];
const FAN = [['..#..', '..#..', '#####', '..#..', '..#..'], ['#...#', '.#.#.', '..#..', '.#.#.', '#...#']];

// 503 offline
const ANTENNA_ICON = ['#.#.#', '.###.', '..#..', '..#..', '..#..', '..#..'];
const PANEL_TURNS = turns(['#########', '#.#.#.#.#', '#########', '#.#.#.#.#', '#########']);

// 503 leaderboard
const TROPHY_DOWN = turn(['#######', '#.###.#', '#.###.#', '.#####.', '..###..', '...#...', '...#...', '..###..', '.#####.']);
const TUMBLEWEED_TURNS = turns(['..###..', '.#.#.#.', '#.#.#.#', '##.#.##', '#.#.#.#', '.#.#.#.', '..###..']);
const PLUG = ['#.##', '.###', '#.##'];

// 503 maintenance
const WORKER = ['.###..', '#..##.', '#..##.', '.###..', '..#...', '.###..', '.###..', '.#.#..', '.#.#..', '##.##.'];
const TOOLBOX = ['..####..', '..#..#..', '########', '#..##..#', '########'];
const CONE = ['..#..', '.#.#.', '.###.', '#...#', '#####'];

// 403: one loop of the boss swatting the ship (seconds).
const SWAT = { loop: 7, arrive: 2.6, windUp: 3.1, hit: 3.25 };

/**
 * The animated LCD behind the error page: one small scene per error type, in
 * the same two-colour style as the login screen. Types without a scene
 * (generic, unknown) keep the login's shoot 'em up.
 *
 * Like the login scene, positions come from `time`, so render() only draws;
 * update() moves the clock and spawns sparks. The middle of the screen sits
 * under the error window, so each scene plays on the left, the right and the
 * strips above and below it.
 *
 * `data-scene` on the canvas names the scene, so tests do not need to read pixels.
 */
export class ErrorScene extends LcdScene {
  constructor(canvas, type) {
    super(canvas);
    this.scene = Object.hasOwn(STILL, type) ? type : null;
    this.prevTime = 0;
    canvas.dataset.scene = this.scene ?? 'generic';
    if (this.scene && this.reducedMotion) this.time = STILL[this.scene];
  }

  // The scenes have no HUD, so they may use the whole height.
  top() {
    return this.scene ? 2 : super.top();
  }

  // In the 403 scene the login boss guards the right side and watches the intruder.
  bossCenter() {
    if (this.scene !== 'forbidden') return super.bossCenter();
    return { x: this.canvas.width - 20, y: Math.round(this.groundY() * 0.42) };
  }

  shipBox() {
    if (this.scene !== 'forbidden') return super.shipBox();
    const ship = this.intruder();
    return spriteBox(ship.sprite, ship.x, ship.y);
  }

  update(dt) {
    if (!this.scene) {
      super.update(dt);
      return;
    }
    this.prevTime = this.time;
    this.time += dt;
    this[`${this.scene}Tick`]?.();
    for (const p of this.particles) {
      p.vy += (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const wave of this.shockWaves) wave.life -= dt;
    this.shockWaves = this.shockWaves.filter((wave) => wave.life > 0);
  }

  render() {
    if (!this.scene) {
      super.render();
      return;
    }
    this.erase();
    this[this.scene]();
    for (const p of this.particles) this.px(p.x, p.y);
    this.renderShockWaves();
  }

  // --- Drawing helpers -----------------------------------------------------------

  /** True on the frame the clock passes `at` seconds into each `period`. */
  every(period, at = 0) {
    return Math.floor((this.prevTime - at) / period) !== Math.floor((this.time - at) / period);
  }

  /** Runs `draw` in "light": what it paints clears the ink (bright LCD) instead. */
  lit(draw, alpha = 1) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = alpha;
    draw();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** drawSprite with a cleared 1-pixel rim, so it reads in front of the dithered hills. */
  outlined(sprite, x, y) {
    const left = Math.round(x);
    const top = Math.round(y);
    sprite.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') this.ctx.clearRect(left + dx - 1, top + dy - 1, 3, 3);
    });
    this.drawSprite(sprite, left, top);
  }

  /**
   * Draws a shape defined in its own coordinates, turned by `angle` around (cx, cy),
   * the way the login boss head is drawn: `pixel(x, y, sx, sy)` gets the shape's own
   * point and the screen pixel and returns 'ink', 'clear' or nothing (leave as is).
   */
  shape(cx, cy, angle, reach, pixel) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const kind = pixel(dx * cos + dy * sin, -dx * sin + dy * cos, cx + dx, cy + dy);
        if (kind === 'ink') this.ctx.fillRect(cx + dx, cy + dy, 1, 1);
        else if (kind === 'clear') this.ctx.clearRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  frameRect(x, y, w, h) {
    const { ctx } = this;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  /** An outlined box that hides what is behind it. */
  box(x, y, w, h) {
    x = Math.round(x);
    y = Math.round(y);
    this.ctx.clearRect(x, y, w, h);
    this.frameRect(x, y, w, h);
  }

  disc(cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) this.px(cx + x, cy + y);
    }
  }

  /** Circle outline (or an arc from/to, radians); `dots` > 1 leaves gaps, for faint rings. */
  ring(cx, cy, r, dots = 1, from = 0, to = Math.PI * 2) {
    const steps = Math.max(8, Math.round(r * (to - from)));
    for (let i = 0; i <= steps; i += dots) {
      const a = from + ((to - from) * i) / steps;
      this.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }

  /** Fixed stars from `seed`; some twinkle. `light` = bright pixels for a dark sky. */
  stars(count, seed, light = false) {
    const { ctx, canvas } = this;
    const bottom = this.groundY() - 8;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash(seed + i * 1.37) * canvas.width);
      const y = Math.floor(hash(seed + i * 2.91) * bottom);
      const kind = hash(seed + i * 0.73);
      if (kind > 0.75 && (this.time + kind * 9) % 2.2 < 0.4) continue;
      const big = kind < 0.1;
      const dot = (dx, dy) => (light ? ctx.clearRect(x + dx, y + dy, 1, 1) : this.px(x + dx, y + dy));
      ctx.globalAlpha = big ? 0.8 : 0.4;
      dot(0, 0);
      if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(dx, dy);
    }
    ctx.globalAlpha = 1;
  }

  /** The hills and towers of the login screen, standing still, and the ground line. */
  horizon() {
    this.renderSkyline();
    const y = this.groundY();
    for (let x = 0; x < this.canvas.width; x += 3) this.ctx.fillRect(x, y, 2, 1);
  }

  /** Comic speech bubble; its tail starts at `tailX` and points down (or up) `tail` pixels. */
  bubble(text, x, y, tailX, tail = 3, up = false) {
    const { ctx } = this;
    x = Math.round(x);
    y = Math.round(y);
    const w = textWidth(text) + 4;
    const h = FONT_H + 4;
    ctx.clearRect(x, y, w, h);
    ctx.fillRect(x + 1, y, w - 2, 1);
    ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
    ctx.fillRect(x, y + 1, 1, h - 2);
    ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
    drawText(ctx, text, x + 2, y + 2);
    const edge = up ? y : y + h - 1;
    const dir = up ? -1 : 1;
    ctx.clearRect(tailX + 1, edge, 2, 1);
    for (let i = 1; i <= tail; i++) {
      const row = edge + dir * i;
      if (i === 1) ctx.clearRect(tailX + 1, row, 1, 1);
      this.px(tailX, row);
      if (i < 3) this.px(tailX + 3 - i, row);
    }
  }

  /** Light letters on an ink box, like a selected menu item. */
  tag(text, x, y) {
    x = Math.round(x);
    y = Math.round(y);
    this.ctx.fillRect(x, y, textWidth(text) + 4, FONT_H + 4);
    this.lit(() => drawText(this.ctx, text, x + 2, y + 2));
  }

  /** Engine flame behind a ship facing right, flickering like on the login screen. */
  flame(x, y) {
    const length = this.reducedMotion ? 2 : 1 + Math.floor(Math.random() * 3);
    this.ctx.fillRect(Math.round(x) - length, Math.round(y) + 3, length, 1);
  }

  sparks(x, y, count, speed, gravity) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: randomBetween(-speed, speed),
        vy: randomBetween(-speed, speed * 0.4),
        life: randomBetween(0.2, 0.5),
        gravity,
      });
    }
  }

  // --- 404 Not found: a wrecked ship smoking among asteroids, a galaxy far away -------

  /** Height of the hills above the ground line at x; they rise under the wreck. */
  ridge(x) {
    const W = this.canvas.width;
    return 7 + 2 * Math.sin(x * 0.09 + 0.5) + 1.5 * Math.sin(x * 0.23) + 8 * Math.exp(-(((x - W * 0.77) / 14) ** 2));
  }

  /** The wreck's centre and tilt: nose up to the right, tail in the hill. */
  wreckPose() {
    // 45°: at that angle the outline steps are clean diagonals.
    return { x: Math.round(this.canvas.width * 0.85), y: this.groundY() - 25, angle: -Math.PI / 4 };
  }

  notFound() {
    const { width: W, height: H } = this.canvas;
    const t = this.time;
    this.starField(46, 3);
    this.galaxy(Math.round(W * 0.18), Math.round(H * 0.28));

    // Rocks floating about, turning slowly.
    this.asteroid(W * 0.87, H * 0.17 + Math.sin(t * 0.5) * 1.5, 6.5, -t * 0.1, 2);
    this.pebble(W * 0.2, H * 0.6 + Math.sin(t * 0.7), 0.4 + Math.sin(t * 0.5) * 0.3);
    this.pebble(W * 0.75, H * 0.56 + Math.sin(t * 0.6 + 1), -0.5 + Math.sin(t * 0.4) * 0.3);
    for (const [fx, fy] of [[0.94, 0.3], [0.68, 0.42], [0.64, 0.8]]) {
      this.shape(W * fx, H * fy + Math.sin(t + fx * 9), 0, 3, (x, y) => {
        const d = Math.hypot(x, y) - 2.4;
        return d > 0 ? null : d > -1 ? 'ink' : 'clear';
      });
    }

    // Smoke rising behind the wreck, the hills burying its tail, the big rock in front of it all.
    const wreck = this.wreckPose();
    this.smoke(placer(wreck.x, wreck.y, wreck.angle)(6, -4.5));
    this.wreck(wreck);
    this.hills();
    this.asteroid(W * 0.13, H * 0.75 + Math.sin(t * 0.4) * 1.5, 9, t * 0.08, 5);
  }

  notFoundTick() {
    if (this.every(1.7)) {
      const wreck = this.wreckPose();
      const hole = placer(wreck.x, wreck.y, wreck.angle)(6, -3.5);
      this.sparks(hole.x, hole.y, 4, 14, 40);
    }
  }

  /** Plus-shaped stars, little hollow squares and dots; some twinkle. One big star pulses. */
  starField(count, seed) {
    const { ctx, canvas } = this;
    const bottom = this.groundY() - 16;
    for (let i = 0; i < count; i++) {
      const x = Math.round(hash(seed + i * 1.37) * canvas.width);
      const y = Math.round(hash(seed + i * 2.91) * bottom);
      const kind = hash(seed + i * 0.73);
      const twinkle = (this.time * 0.7 + kind * 11) % 3 < 0.25;
      if (kind < 0.45) {
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
        if (twinkle) {
          ctx.fillRect(x - 2, y, 5, 1);
          ctx.fillRect(x, y - 2, 1, 5);
        }
      } else if (kind < 0.7) {
        ctx.globalAlpha = 0.5;
        this.frameRect(x - 1, y - 1, 3, 3);
      } else {
        ctx.globalAlpha = twinkle ? 0.1 : 0.45;
        this.px(x, y);
      }
    }
    const bx = Math.round(canvas.width * 0.43);
    const by = Math.round(canvas.height * 0.1);
    const ray = 2 + Math.round(Math.sin(this.time * 2) + 1);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(bx - 1, by - 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillRect(bx - ray, by, ray * 2 + 1, 1);
    ctx.fillRect(bx, by - ray, 1, ray * 2 + 1);
  }

  /** A tilted spiral galaxy with a haze along its arms, turning very slowly. */
  galaxy(cx, cy) {
    const { ctx } = this;
    const cos = Math.cos(-0.35);
    const sin = Math.sin(-0.35);
    const dot = (x, y) => this.px(cx + x * cos - y * sin, cy + x * sin + y * cos);
    for (let i = 3; i < 70; i++) {
      for (const arm of [0, Math.PI]) {
        const a = arm + i * 0.18 + this.time * 0.04;
        const r = i * 0.19;
        ctx.globalAlpha = 0.75 - i / 100;
        dot(Math.cos(a) * r * 1.9, Math.sin(a) * r * 0.75);
        ctx.globalAlpha = 0.3 - i / 280;
        dot(Math.cos(a + 0.15) * (r + 1.2) * 1.9, Math.sin(a + 0.15) * (r + 1.2) * 0.75 + 0.6);
      }
    }
    ctx.globalAlpha = 0.35;
    ctx.fillRect(cx - 3, cy - 1, 7, 3);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(cx - 1, cy, 3, 1);
    ctx.fillRect(cx, cy - 1, 1, 3);
    ctx.globalAlpha = 1;
  }

  /** A lumpy, cratered asteroid. Its shade stays on the lower right while the craters turn. */
  asteroid(cx, cy, r, angle, seed) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    // Craters: [x, y, radius] as shares of r; dark pits with a light rim.
    const craters = [[0.15, 0.05, 0.25], [-0.4, -0.3, 0.14], [-0.35, 0.45, 0.1], [0.45, -0.45, 0.1], [0.5, 0.45, 0.08]];
    this.shape(cx, cy, angle, Math.ceil(r) + 2, (x, y, sx, sy) => {
      const a = Math.atan2(y, x);
      const d = Math.hypot(x, y) - r * (1 + Math.sin(a * 3 + seed) * 0.07 + Math.sin(a * 5 + seed * 2) * 0.05);
      if (d > 0) return null;
      if (d > -1) return 'ink';
      for (const [kx, ky, kr] of craters) {
        const c = Math.hypot(x - kx * r, y - ky * r) - Math.max(0.6, kr * r);
        if (c < 0) return 'ink';
        if (c < 0.8) return 'clear';
      }
      const shade = sx - cx + (sy - cy);
      if (shade > r * 0.9) return (sx + sy) % 2 || sx % 2 ? 'ink' : 'clear';
      return shade > r * 0.25 && (sx + sy) % 2 === 0 ? 'ink' : 'clear';
    });
  }

  /** A small long rock with two pits, rocking. */
  pebble(cx, cy, angle) {
    this.shape(cx, cy, angle, 6, (x, y, sx, sy) => {
      const d = ellipseDist(x, y, 0, 0, 4.5, 2.8);
      if (d > 0) return null;
      if (d > -1) return 'ink';
      if (Math.abs(y + 0.4) < 0.6 && (Math.abs(x + 1.5) < 0.6 || Math.abs(x - 1) < 0.6)) return 'ink';
      return y > 0.8 && (sx + sy) % 2 === 0 ? 'ink' : 'clear';
    });
  }

  /** The crashed ship: fins, a big porthole, seams, a smoking hole, a light still blinking. */
  wreck({ x: cx, y: cy, angle }) {
    this.shape(cx, cy, angle, 24, (x, y, sx, sy) => {
      const body = Math.min(
        segmentDist(x, y, [-20, 0], [10, 0], 5),
        ellipseDist(x, y, 10, 0, 10, 5),
        polyDist(x, y, [[-19, -4], [-11, -4], [-21, -10]]),
      );
      if (body > 0) return null;
      if (body > -1) return 'ink';
      // The hole the smoke comes out of: dark, with a ragged rim.
      const hole = ellipseDist(x, y, 6, -2.4, 2.2, 1.3) + hash(Math.round(x) * 2.1 + Math.round(y)) * 0.6;
      if (hole < 0) return sx % 2 || sy % 2 ? 'ink' : 'clear';
      if (hole < 0.6) return 'ink';
      // Big porthole: a ring, a gap, dark glass.
      const port = Math.hypot(x + 4, y);
      if (port < 3.4) return port > 2.4 || port < 1.3 ? 'ink' : 'clear';
      // Seams round the hull (the last one is the nose cone), the underside in shade.
      if (Math.abs(x - 1.5) < 0.5 || Math.abs(x + 11) < 0.5 || Math.abs(x - 12) < 0.5) return 'ink';
      return y > 2 && (sx + sy) % 2 === 0 ? 'ink' : 'clear';
    });
    if (this.time % 1.2 < 0.25) {
      const tip = placer(cx, cy, angle)(21.5, 0);
      this.ctx.fillRect(Math.round(tip.x) - 1, Math.round(tip.y), 3, 1);
      this.ctx.fillRect(Math.round(tip.x), Math.round(tip.y) - 1, 1, 3);
    }
  }

  /** Two columns of soft, dithered smoke curling up from the wreck. */
  smoke(base) {
    const { ctx } = this;
    const t = this.time;
    for (const [plume, drift] of [[0, 5], [1, 9]]) {
      for (let k = 0; k < 14; k++) {
        const u = (t * 0.2 + k / 14 + plume * 0.37) % 1;
        const x = base.x + plume * 2 + u * drift + Math.sin(u * 7 - t * 1.3 + plume * 2) * (0.8 + u * 2.5);
        const y = base.y - u * 34;
        const r = 1.2 + u * 2.2;
        ctx.globalAlpha = 0.4 * (1 - u);
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const px = Math.round(x + dx);
            const py = Math.round(y + dy);
            if ((px + py) % 2 === 0) this.px(px, py);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Rolling hills: a ridge, dithered ground with a darker vein, a crater, plants on top. */
  hills() {
    const { ctx, canvas } = this;
    const G = this.groundY();
    for (let x = 0; x < canvas.width; x++) {
      const top = Math.round(G - this.ridge(x));
      ctx.clearRect(x, top, 1, G - top);
      this.px(x, top);
      const vein = Math.round(top + 4 + Math.sin(x * 0.13) * 1.5);
      for (let y = top + 1; y < G; y++) {
        if (y === vein && x % 4) {
          this.px(x, y);
        } else if ((x + y) % 2 === 0) {
          ctx.globalAlpha = 0.55;
          this.px(x, y);
          ctx.globalAlpha = 1;
        }
      }
    }
    for (let x = 0; x < canvas.width; x += 3) ctx.fillRect(x, G, 2, 1);

    // A small crater in the ground: dark rim on top, light floor.
    const crater = { x: Math.round(canvas.width * 0.62), y: G - 3 };
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx / 4, dy / 1.4);
        if (d > 1) continue;
        if (dy < 0 || d > 0.8) this.px(crater.x + dx, crater.y + dy);
        else ctx.clearRect(crater.x + dx, crater.y + dy, 1, 1);
      }
    }

    for (const [fx, sprite] of [[0.03, POST], [0.24, BUD], [0.43, TALL_BUD], [0.7, BUD], [0.96, BUD]]) {
      const x = Math.round(canvas.width * fx);
      const top = Math.round(G - this.ridge(x + 2)) - sprite.length + 1;
      this.outlined(sprite, x, top);
      if (sprite === POST && this.time % 1.4 < 0.7) this.px(x + 2, top - 2);
    }
  }

  // --- 403 Forbidden: the boss swats the ship away from its door --------------------

  forbidden() {
    const p = this.time % SWAT.loop;
    this.renderPlanet();
    this.stars(26, 7);
    this.horizon();
    this.keepOut();
    this.renderBoss();
    this.swatArm(p);

    const ship = this.intruder();
    this.drawSprite(ship.sprite, ship.x, ship.y);
    if (ship.flying) this.flame(ship.x, ship.y);
    if (ship.dizzy) {
      // Stars circling over its head.
      for (let k = 0; k < 3; k++) {
        const a = this.time * 7 + k * 2.1;
        this.px(ship.x + 5 + Math.cos(a) * 7, ship.y - 2 + Math.sin(a) * 2);
      }
    }
    const hit = this.swatPoint();
    if (p >= SWAT.hit && p < SWAT.hit + 0.25) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        this.line(hit.x + Math.cos(a) * 3, hit.y + Math.sin(a) * 3, hit.x + Math.cos(a) * 6, hit.y + Math.sin(a) * 6);
      }
    }
    if (p >= SWAT.hit + 0.05 && p < 6.4) {
      const text = 'ACCESS DENIED';
      this.bubble(text, this.canvas.width - textWidth(text) - 6, 2, this.bossCenter().x - 6, 6);
    }
  }

  forbiddenTick() {
    this.boss.blink = this.time % 3.4 < 0.16 ? 1 : 0;
    if (this.every(SWAT.loop, SWAT.hit)) {
      const hit = this.swatPoint();
      this.explode(hit.x, hit.y, 12);
      this.shockWaves.push({ x: hit.x, y: hit.y, life: 0.35 });
    }
  }

  /** Where the ship stops in front of the boss (x of its left edge). */
  swatStop() {
    return Math.round(this.canvas.width * 0.56) - SHIP[0].length;
  }

  swatPoint() {
    return { x: this.swatStop() + 9, y: 14 };
  }

  /** The ship in the 403 loop: flies in, waits, gets swatted and tumbles away. */
  intruder() {
    const p = this.time % SWAT.loop;
    const stop = this.swatStop();
    const y = 11;
    if (p < SWAT.arrive) {
      return { sprite: SHIP, x: mix(-14, stop, ease(p, 0, SWAT.arrive)), y: y + Math.round(Math.sin(this.time * 3)), flying: true };
    }
    if (p < SWAT.hit) return { sprite: SHIP, x: stop, y };
    const u = (p - SWAT.hit) / 2.4;
    return {
      sprite: SHIP_TURNS[Math.floor(p * 10) % 4],
      x: stop - u * (stop + 40),
      y: y + 2 - Math.sin(Math.min(u, 1) * Math.PI) * 8,
      dizzy: true,
    };
  }

  /** The tentacle that guards the door: curls, winds up, strikes the ship, curls back. */
  swatArm(p) {
    const t = this.time;
    const { x: cx, y: cy } = this.bossCenter();
    const root = { x: cx - 10, y: cy - 8 };
    const idle = { x: root.x - 8 + Math.sin(t * 2) * 2, y: root.y - 9 + Math.cos(t * 1.7) * 2 };
    const wound = { x: root.x + 3, y: root.y - 17 };
    const hit = this.swatPoint();
    const after = { x: hit.x - 7, y: hit.y - 5 };
    let tip = idle;
    if (p >= SWAT.arrive && p < SWAT.windUp) tip = mixPoint(idle, wound, ease(p, SWAT.arrive, SWAT.windUp));
    else if (p >= SWAT.windUp && p < SWAT.hit) tip = mixPoint(wound, hit, (p - SWAT.windUp) / (SWAT.hit - SWAT.windUp));
    else if (p >= SWAT.hit && p < 3.6) tip = mixPoint(hit, after, ease(p, SWAT.hit, 3.6));
    else if (p >= 3.6 && p < 4.6) tip = mixPoint(after, idle, ease(p, 3.6, 4.6));

    // Thick at the root, suckers underneath, a club at the tip.
    const bend = { x: (root.x + tip.x) / 2 + 3, y: Math.min(root.y, tip.y) - 7 };
    let prev = root;
    for (let i = 1; i <= 24; i++) {
      const point = bezier(root, bend, tip, i / 24);
      this.line(prev.x, prev.y, point.x, point.y);
      if (i < 12) this.line(prev.x, prev.y + 1, point.x, point.y + 1);
      if (i % 4 === 0) this.px(point.x, point.y + 2);
      prev = point;
    }
    this.ctx.fillRect(Math.round(tip.x) - 1, Math.round(tip.y) - 1, 3, 3);
  }

  /** Barbed wire along the ground, a KEEP OUT sign and a skull on a pike. */
  keepOut() {
    const { ctx, canvas } = this;
    const G = this.groundY();
    ctx.globalAlpha = 0.7;
    for (let x = 3; x < canvas.width; x += 15) {
      ctx.fillRect(x, G - 9, 1, 9);
      ctx.fillRect(x - 1, G - 9, 3, 1);
    }
    for (const y of [G - 7, G - 3]) {
      ctx.fillRect(0, y, canvas.width, 1);
      for (let x = 6; x < canvas.width; x += 15) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.px(x + dx + (y % 2) * 4, y + dy);
      }
    }
    ctx.globalAlpha = 1;

    const sx = Math.round(canvas.width * 0.06);
    const sy = G - 22;
    ctx.fillRect(sx + 4, sy + 9, 1, G - sy - 9);
    ctx.fillRect(sx + 29, sy + 9, 1, G - sy - 9);
    this.box(sx, sy, textWidth('KEEP OUT') + 4, 9);
    drawText(ctx, 'KEEP OUT', sx + 2, sy + 2);
    const pike = sx + 42;
    ctx.fillRect(pike, G - 12, 1, 12);
    this.drawSprite(SKULL, pike - 2, G - 17);
  }

  // --- 401 Session expired: the pilot fell asleep and the time ran out ----------------

  sessionExpired() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const G = this.groundY();
    const t = this.time;
    this.moon(Math.round(W * 0.6), 10);
    this.stars(40, 11);
    this.cobweb();
    this.horizon();

    // The ship parked on its pad for so long that spiders moved in.
    const pad = Math.round(W * 0.03);
    this.box(pad, G - 5, 27, 3);
    for (let x = pad + 3; x < pad + 27; x += 7) ctx.fillRect(x, G - 2, 1, 2);
    this.px(pad + (t % 2 < 1 ? 1 : 25), G - 6);
    this.outlined(SHIP, pad + 8, G - 13);
    ctx.globalAlpha = 0.6;
    for (const [x, y] of [[pad + 3, G - 6], [pad + 6, G - 6], [pad + 2, G - 10]]) this.line(pad + 8, G - 7, x, y);
    ctx.globalAlpha = 1;

    // The pilot, asleep on a crate, snoring.
    const crate = pad + 31;
    this.box(crate - 1, G - 6, 8, 6);
    this.line(crate, G - 5, crate + 5, G - 1);
    const nod = Math.floor(t / 1.6) % 2;
    this.outlined(PILOT_BODY, crate, G - 11);
    this.outlined(PILOT_HEAD, crate + nod, G - 17 + nod);
    for (let k = 0; k < 3; k++) {
      const u = (t / 2.4 + k / 3) % 1;
      ctx.globalAlpha = 1 - u * 0.7;
      this.zee(crate + 8 + u * 12, G - 21 - u * 22, 2 + Math.floor(u * 4));
    }
    ctx.globalAlpha = 1;

    // A spider lowers itself on its thread and climbs back up.
    const spider = Math.round(W * 0.3);
    const drop = Math.round(16 + (Math.sin(t * 0.5) + 1) * 9);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(spider, 0, 1, drop);
    ctx.globalAlpha = 1;
    this.drawSprite(this.frame(SPIDER, 0.4), spider - 2, drop);

    // The sand has run out, and the clock blinks 00:00 like after a power cut.
    const glass = Math.round(W * 0.84);
    this.hourglass(glass, G);
    this.clock(glass, 3, t % 1 < 0.5);

    // A snail crossing the whole screen: nothing else is in a hurry.
    this.outlined(this.frame(SNAIL, 0.5), ((t * 2.5) % (W + 20)) - 10, G - 5);
  }

  zee(x, y, size) {
    x = Math.round(x);
    y = Math.round(y);
    this.ctx.fillRect(x, y, size, 1);
    this.line(x + size - 1, y, x, y + size - 1);
    this.ctx.fillRect(x, y + size - 1, size, 1);
  }

  /** Crescent moon: a disc with a second, shifted disc cut out of it. */
  moon(cx, cy) {
    const r = 6;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + 2 || (x - 3) ** 2 + (y + 1) ** 2 <= r * r) continue;
        const edge = x * x + y * y > (r - 1) ** 2;
        this.ctx.globalAlpha = edge ? 0.9 : 0.4;
        if (edge || (x + y) % 2 === 0) this.px(cx + x, cy + y);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  /** Cobweb in the top-left corner: spokes and threads between them. */
  cobweb() {
    const spokes = [0, 0.4, 0.8, 1.2, Math.PI / 2].map((a) => [Math.cos(a), Math.sin(a)]);
    this.ctx.globalAlpha = 0.55;
    for (const [dx, dy] of spokes) this.line(0, 0, dx * 17, dy * 17);
    for (const r of [5, 9, 13]) {
      for (let i = 1; i < spokes.length; i++) {
        this.line(spokes[i - 1][0] * r, spokes[i - 1][1] * r, spokes[i][0] * r, spokes[i][1] * r);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  hourglass(cx, base) {
    const { ctx } = this;
    const top = base - 25;
    ctx.fillRect(cx - 7, top, 15, 2);
    ctx.fillRect(cx - 7, base - 2, 15, 2);
    ctx.fillRect(cx - 6, top + 2, 1, 21);
    ctx.fillRect(cx + 6, top + 2, 1, 21);
    // Two glass bulbs meeting at a narrow neck; all the sand is in the bottom one.
    const glassTop = top + 2;
    const glassBottom = base - 3;
    const neck = (glassTop + glassBottom) / 2;
    for (let y = glassTop; y <= glassBottom; y++) {
      const half = Math.round(Math.abs(y - neck) * 0.42 + 0.6);
      this.px(cx - half, y);
      this.px(cx + half, y);
      const sand = glassBottom - y;
      if (sand < 6) {
        const width = sand < 4 ? half - 1 : Math.min(half - 1, 5 - sand);
        for (let x = -width; x <= width; x++) if (sand < 3 || (x + y) % 2 === 0) this.px(cx + x, y);
      }
    }
    // The very last grains, falling through the neck now and then.
    const fall = (this.time % 1.8) / 0.5;
    if (fall < 1) this.px(cx, mix(neck, glassBottom - 6, fall));
  }

  /** 7-segment clock stuck at 00:00; when blinking off, only the ghost segments stay. */
  clock(cx, y, on) {
    this.box(cx - 16, y, 33, 13);
    const value = on ? 0 : '  ';
    drawNumber(this.ctx, value, 2, cx - 1, y + 2);
    drawNumber(this.ctx, value, 2, cx + 14, y + 2);
    if (on) {
      this.px(cx, y + 4);
      this.px(cx, y + 8);
    }
  }

  // --- 401 Login required: a checkpoint scans the ship and finds no pilot -------------

  /** The ship at the laser fence: it waits, and now and then tries to slip through. */
  checkpoint() {
    const { width: W, height: H } = this.canvas;
    const p = this.time % 5;
    const fence = Math.round(W * 0.33);
    const touch = fence - 1 - SHIP[0].length;
    const push = p < 3.35 ? ease(p, 3, 3.35) : 1 - ease(p, 3.35, 4.2);
    const x = Math.round(mix(Math.round(W * 0.08), touch, push));
    return { p, fence, x, y: Math.round(H * 0.44 + Math.sin(this.time * 1.3) * 2) };
  }

  loginRequired() {
    const { ctx, canvas } = this;
    const G = this.groundY();
    const t = this.time;
    const { p, fence, x, y } = this.checkpoint();
    this.renderPlanet();
    this.stars(26, 5);
    this.horizon();

    // Laser fence between a floating emitter and a pylon; it flares when touched.
    ctx.fillRect(fence - 2, 3, 5, 3);
    this.px(fence, 6);
    ctx.fillRect(fence - 1, G - 9, 3, 2);
    ctx.fillRect(fence - 2, G - 7, 5, 7);
    const zap = p > 3.3 && p < 3.6;
    ctx.globalAlpha = zap ? 1 : 0.6;
    for (let yy = 7; yy < G - 9; yy++) {
      if ((yy + Math.floor(t * 20)) % 4) this.px(fence, yy);
      if (zap && yy % 3 === 0) this.px(fence + ((yy >> 1) % 2 ? 1 : -1), yy);
    }
    ctx.globalAlpha = 1;

    this.drawSprite(SHIP, x, y);
    this.flame(x, y);

    // Scanner drone over the ship: a sweeping beam, then "NO ID".
    const dx = x + 1;
    const dy = y - 20 + Math.round(Math.sin(t * 2));
    this.drawSprite(this.frame(DRONE, 0.08), dx, dy);
    if (p < 2.2) {
      ctx.globalAlpha = 0.3;
      this.line(dx + 4, dy + 4, x - 1, y + 7);
      this.line(dx + 4, dy + 4, x + 11, y + 7);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x - 1, Math.round(y - 1 + (Math.sin(t * 5) + 1) * 4), 13, 1);
      ctx.globalAlpha = 1;
      drawText(ctx, 'SCAN', dx - 3, dy - 8);
    } else if (t % 0.5 < 0.32) {
      this.tag('NO ID', dx - 6, dy - 11);
    }

    // The guard at its booth, stop sign up.
    const gx = Math.round(canvas.width * 0.78);
    const gy = G - 15;
    this.booth(Math.round(canvas.width * 0.86), G);
    this.guard(gx, gy);
    const ask = Math.floor(t / 2) % 2 ? 'LOG IN' : 'PILOT ID?';
    this.bubble(ask, gx - 4, gy - 24, gx + 3, 9);
  }

  loginRequiredTick() {
    const { fence, y } = this.checkpoint();
    if (this.every(5, 3.35)) this.sparks(fence, y + 3, 10, 30, 40);
  }

  booth(x, base) {
    const { ctx } = this;
    const top = base - 18;
    this.box(x, top, 18, 18);
    ctx.fillRect(x - 2, top - 1, 22, 1);
    ctx.fillRect(x - 1, top - 2, 20, 1);
    this.box(x + 3, top + 4, 8, 6);
    ctx.fillRect(x + 7, top + 4, 1, 6);
    ctx.fillRect(x + 3, top + 7, 8, 1);
    if (this.time % 2 < 1.6) this.px(x + 5, top + 6);
    this.frameRect(x + 13, top + 8, 4, 10);
    this.tag('ID', x + 4, top - 11);
  }

  /** Boxy guard robot facing left, holding up a round stop sign. */
  guard(x, y) {
    const { ctx } = this;
    const t = this.time;
    ctx.fillRect(x + 3, y - 2, 1, 2);
    if (t % 1 < 0.5) ctx.fillRect(x + 2, y - 3, 3, 1);
    this.box(x, y, 7, 5);
    this.px(x + 1, y + 2);
    this.px(x + 3, y + 2);
    ctx.fillRect(x + 1, y + 3, 2, 1);
    this.px(x + 3, y + 5);
    this.box(x, y + 6, 7, 6);
    for (let i = 0; i < 3; i++) if ((Math.floor(t * 3) + i) % 3) this.px(x + 2 + i, y + 8);
    ctx.fillRect(x + 1, y + 12, 2, 3);
    ctx.fillRect(x + 4, y + 12, 2, 3);
    const wave = Math.round(Math.sin(t * 3));
    this.line(x - 1, y + 7, x - 4 + wave, y + 2);
    ctx.fillRect(x - 4 + wave, y - 3, 1, 5);
    this.disc(x - 4 + wave, y - 6, 3);
    ctx.clearRect(x - 6 + wave, y - 6, 5, 1);
    this.line(x + 7, y + 7, x + 8, y + 11);
  }

  // --- 400 Score rejected: the record is checked, stamped and shredded ----------------

  machineBox() {
    return { x: Math.round(this.canvas.width * 0.71), y: this.groundY() - 24, w: 24, h: 24 };
  }

  scoreRejected() {
    const { ctx, canvas } = this;
    const { width: W, height: H } = canvas;
    const t = this.time;
    const p = t % 6;
    this.renderPlanet();
    this.stars(26, 9);
    this.horizon();

    const sx = Math.round(W * 0.06);
    const sy = Math.round(H * 0.42 + Math.sin(t * 1.1) * 2);
    this.drawSprite(SHIP, sx, sy);
    this.flame(sx, sy);

    const m = this.machineBox();
    if (p < 2.2) {
      // The flight record flies over to the machine, tumbling, a dotted trail behind it.
      const from = { x: sx + 11, y: sy };
      const bend = { x: W * 0.5, y: -16 };
      const to = { x: m.x + 7, y: m.y - 10 };
      const u = p / 2.2;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 30; i += 2) {
        const dot = bezier(from, bend, to, (i / 30) * u);
        this.px(dot.x, dot.y);
      }
      ctx.globalAlpha = 1;
      const at = bezier(from, bend, to, u);
      this.drawSprite(PAGE_TURNS[Math.floor(t * 6) % 4], at.x - 4, at.y - 4);
    }
    this.checker(m, p);
    if (p > 4 && p < 5.8) this.bubble('?', sx + 9, sy - 12, sx + 9);
  }

  scoreRejectedTick() {
    const p = this.time % 6;
    const m = this.machineBox();
    if (p >= 4.4 && p < 5.6 && Math.random() < 0.6) {
      this.particles.push({
        x: m.x + m.w + 2,
        y: m.y + m.h - 9 + randomBetween(0, 5),
        vx: randomBetween(5, 14),
        vy: randomBetween(-4, 2),
        life: randomBetween(0.3, 0.5),
        gravity: 60,
      });
    }
  }

  /** The machine that checks flight records: scans, stamps INVALID, shreds into a bin. */
  checker(m, p) {
    const { ctx } = this;
    const t = this.time;
    const G = this.groundY();
    const x = m.x + (p > 3.2 && p < 3.6 ? Math.round(Math.sin(t * 70)) : 0);
    const { y, w, h } = m;

    // Funnel that takes the record in.
    ctx.fillRect(x, y - 9, 16, 1);
    this.line(x, y - 8, x + 5, y - 1);
    this.line(x + 15, y - 8, x + 10, y - 1);
    this.box(x, y, w, h);
    ctx.clearRect(x + 6, y, 4, 1);
    for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) this.px(x + rx, y + ry);

    // Screen: a blinking cursor, then a scan line, then a big X.
    const s = { x: x + 4, y: y + 4, w: 13, h: 9 };
    this.box(s.x, s.y, s.w, s.h);
    if (p >= 2.2 && p < 3.2) {
      ctx.fillRect(s.x + 1, s.y + 1 + (Math.floor((p - 2.2) * 20) % (s.h - 2)), s.w - 2, 1);
    } else if (p >= 3.2 && p < 4.6) {
      if (t % 0.3 < 0.2) {
        this.line(s.x + 3, s.y + 2, s.x + s.w - 4, s.y + s.h - 3);
        this.line(s.x + s.w - 4, s.y + 2, s.x + 3, s.y + s.h - 3);
      }
    } else if (t % 1 < 0.5) {
      ctx.fillRect(s.x + 2, s.y + s.h - 3, 3, 1);
    }
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = (Math.floor(t * 4) + i) % 3 === 0 ? 1 : 0.2;
      ctx.fillRect(x + 19, y + 4 + i * 3, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 4, y + 16 + i * 2, 9, 1);

    // Shredder on the right side: its teeth chew while it works.
    const slot = y + h - 9;
    const shredding = p >= 4.4 && p < 5.6;
    ctx.fillRect(x + w, slot, 1, 6);
    for (let i = 0; i < 6; i++) if (!shredding || (i + Math.floor(t * 20)) % 2) this.px(x + w + 1, slot + i);

    // Bin with crumpled paper on top.
    const bin = x + w + 4;
    this.box(bin, G - 10, 9, 10);
    ctx.fillRect(bin + 3, G - 8, 1, 6);
    ctx.fillRect(bin + 5, G - 8, 1, 6);
    this.box(bin + 1, G - 13, 3, 3);
    this.box(bin + 4, G - 14, 4, 4);

    if (p >= 3.2 && p < 4.6 && t % 0.4 < 0.28) this.tag('INVALID', x + w / 2 - 15, y - 21);
  }

  // --- 409 Score conflict: a duplicate keeps bumping the ship already docked ----------

  dock() {
    const W = this.canvas.width;
    const x = Math.round(W * 0.75);
    const station = { x, y: 10, w: W - 3 - x, h: 20 };
    const lane = station.y + 7;
    const docked = station.x - 3 - SHIP[0].length;
    return { station, lane, docked, stop: docked - SHIP[0].length, copierX: Math.round(W * 0.04) };
  }

  /** The copy: rises out of the copier, flies in, bumps twice and is scrapped. */
  copyShip(p) {
    const { lane, stop, copierX } = this.dock();
    const hatch = { x: copierX + 8, y: this.groundY() - 16 };
    if (p < 1) return { sprite: SHIP_UP, x: hatch.x, y: mix(hatch.y, lane - 4, ease(p, 0, 1)) };
    if (p < 2.2) return { sprite: SHIP, x: mix(hatch.x, stop, ease(p, 1, 2.2)), y: lane, fast: true };
    if (p < 2.9) return { sprite: SHIP, x: stop - Math.sin((ease(p, 2.2, 2.9) * Math.PI) / 2) * 10, y: lane };
    if (p < 3.3) return { sprite: SHIP, x: mix(stop - 10, stop, (p - 2.9) / 0.4), y: lane, fast: true };
    return null;
  }

  scoreConflict() {
    const { ctx } = this;
    const t = this.time;
    const p = t % 5.4;
    const { station, lane, docked, copierX } = this.dock();
    this.stars(30, 13);
    this.horizon();
    this.station(station);

    // The original, docked; it flinches when the copy bumps into it.
    const bumped = (p > 2.2 && p < 2.45) || (p > 3.3 && p < 3.55);
    if (!bumped || t % 0.1 < 0.05) this.drawSprite(SHIP, docked, lane);

    const copy = this.copyShip(p);
    if (copy) {
      if (copy.fast) {
        for (const [back, alpha] of [[5, 0.3], [10, 0.12]]) {
          ctx.globalAlpha = alpha;
          this.drawSprite(copy.sprite, copy.x - back, copy.y);
        }
        ctx.globalAlpha = 1;
      }
      this.drawSprite(copy.sprite, copy.x, copy.y);
      if (copy.sprite === SHIP) this.flame(copy.x, copy.y);
    }
    this.copyMachine(copierX, this.groundY(), p);
    if (p > 2.2 && p < 4.9) this.bubble('DUPLICATE', station.x - 2, station.y + station.h + 5, station.x + 4, 4, true);
  }

  scoreConflictTick() {
    const { lane, stop } = this.dock();
    if (this.every(5.4, 2.2)) this.sparks(stop + 11, lane + 3, 8, 30, 0);
    if (this.every(5.4, 3.3)) {
      this.explode(stop + 5, lane + 3, 16);
      this.shockWaves.push({ x: stop + 5, y: lane + 3, life: 0.35 });
    }
  }

  /** Station module with a solar wing, windows, slot 01 and one docking port. */
  station({ x, y, w, h }) {
    const { ctx } = this;
    ctx.fillRect(x + w - 12, y - 3, 1, 3);
    for (let i = 0; i < 4; i++) this.box(x + w - 22 + i * 5, y - 8, 6, 5);
    this.box(x, y, w, h);
    for (let wx = x + 3; wx < x + w - 3; wx += 4) ctx.fillRect(wx, y + 3, 2, 2);
    ctx.fillRect(x + 1, y + 7, w - 2, 1);
    drawText(ctx, 'DOCK', x + 3, y + 11);
    drawNumber(ctx, 1, 2, x + w - 3, y + 9);
    this.box(x - 3, y + 6, 4, 9);
    if (this.time % 1 < 0.5) this.px(x - 2, y + 4);
  }

  /** The copier the duplicate comes out of. */
  copyMachine(x, base, p) {
    const { ctx } = this;
    const t = this.time;
    const top = base - 16;
    this.box(x, top, 22, 16);
    if (p < 1.1) {
      ctx.clearRect(x + 7, top, 9, 1);
      this.line(x + 7, top, x + 5, top - 3);
      this.line(x + 15, top, x + 17, top - 3);
    } else {
      ctx.fillRect(x + 7, top - 1, 9, 1);
    }
    drawText(ctx, 'COPY', x + 4, top + 4);
    for (const [i, lx] of [x + 3, x + 17].entries()) if ((Math.floor(t * 3) + i) % 2) ctx.fillRect(lx, top + 11, 2, 2);
  }

  // --- 429 Rate limited: a jam of messages at a red light, everything overheating ----

  rateLimited() {
    const { ctx, canvas } = this;
    const { width: W, height: H } = canvas;
    const G = this.groundY();
    const t = this.time;
    const p = t % 2.5;
    this.stars(24, 17);
    this.horizon();

    const tower = Math.round(W * 0.84);
    this.hotTower(tower, G);

    // The traffic light holds the queue; each green lets one message through.
    const light = Math.round(W * 0.7);
    this.trafficLight(light, G, p);
    const gap = 10;
    const shift = ease(p, 2, 2.4) * gap;
    for (let k = 0; ; k++) {
      let x = light - 4 - gap - k * gap + shift;
      if (x < -10) break;
      if (k === 0) x = mix(light - 4 - gap, tower - 8, ease(p, 2, 2.45));
      const y = G - 6 - (Math.sin(t * 7 + k * 1.7) > 0.6 ? 1 : 0);
      this.outlined(ENVELOPE, x, y);
      if (k % 3 === 1 && (t + k) % 2 < 1) drawText(ctx, '!', x + 2, y - 7);
    }

    this.iceShip(Math.round(W * 0.07), Math.round(H * 0.33), G);
  }

  /** Relay tower running hot: steam puffs, a racing fan, a thermometer at the top. */
  hotTower(tx, G) {
    const { ctx } = this;
    const t = this.time;
    const top = G - 34;
    this.line(tx - 7, G, tx - 2, top);
    this.line(tx + 7, G, tx + 2, top);
    for (let y = top + 4; y + 6 <= G; y += 6) {
      const a = 2 + ((y - top) * 5) / 34;
      const b = 2 + ((y + 6 - top) * 5) / 34;
      ctx.fillRect(Math.round(tx - a), y, Math.round(a * 2) + 1, 1);
      this.line(tx - a, y, tx + b, y + 6);
      this.line(tx + a, y, tx - b, y + 6);
    }
    this.ring(tx - 2, top - 2, 4, 1, Math.PI * 0.5, Math.PI * 1.25);
    ctx.fillRect(tx, top - 8, 1, 8);
    if (t % 0.4 < 0.2) ctx.fillRect(tx - 1, top - 10, 3, 2);
    this.drawSprite(this.frame(FAN, 0.05), tx - 2, G - 8);
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.7 + k / 3) % 1;
      ctx.globalAlpha = 1 - u;
      this.ring(tx + 3 + u * 6 + Math.sin(u * 6 + k) * 2, top - 6 - u * 16, 1 + u * 3, u > 0.5 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // Thermometer with the mercury pressing at the top.
    const th = this.canvas.width - 9;
    this.box(th, G - 30, 5, 26);
    ctx.fillRect(th + 2, G - 29 + (t % 0.6 < 0.3 ? 0 : 1), 1, 25);
    this.disc(th + 2, G - 3, 3);
    for (let y = G - 26; y < G - 6; y += 4) ctx.fillRect(th - 2, y, 2, 1);
    if (t % 0.6 < 0.3) drawText(ctx, 'HOT', th - 4, G - 37);
  }

  trafficLight(x, G, p) {
    const { ctx } = this;
    const top = G - 24;
    ctx.fillRect(x, top + 15, 1, G - top - 15);
    this.box(x - 3, top, 7, 15);
    const on = p < 1.7 ? 0 : p < 2 ? 1 : 2;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i === on ? 1 : 0.2;
      ctx.fillRect(x - 1, top + 2 + i * 4, 3, 3);
    }
    ctx.globalAlpha = 1;
    // Countdown to green, like at a pedestrian crossing.
    if (on === 0) drawNumber(ctx, Math.ceil((1.7 - p) / 0.57), 1, x + 6, top - 11);
  }

  /** The ship cooling down, frozen into a block of ice with snow falling round it. */
  iceShip(x, y, G) {
    const { ctx } = this;
    const t = this.time;
    const w = 21;
    const h = 15;
    // Snow behind the block first, so the block and the text stay clean.
    for (let i = 0; i < 8; i++) {
      const fx = x - 8 + hash(i + 0.5) * (w + 16) + Math.sin(t + i) * 2;
      const fy = y - 16 + ((t * 5 + hash(i + 0.9) * 50) % 50);
      this.drawSprite(FLAKE[i % 2], fx, fy);
    }
    // Ice: rounded corners, frost dither, a crack, shine on the top left.
    this.box(x, y, w, h);
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) ctx.clearRect(x + cx, y + cy, 1, 1);
    ctx.globalAlpha = 0.3;
    for (let dy = 1; dy < h - 1; dy++) for (let dx = 1; dx < w - 1; dx++) if ((dx * 3 + dy * 5) % 7 === 0) this.px(x + dx, y + dy);
    ctx.globalAlpha = 1;
    this.line(x + w - 1, y + 4, x + w - 4, y + 7);
    this.line(x + w - 4, y + 7, x + w - 3, y + 10);
    this.drawSprite(SHIP, x + 5, y + 4);
    this.lit(() => {
      this.line(x + 1, y + 4, x + 4, y + 1);
      this.line(x + 1, y + 7, x + 3, y + 5);
    });
    // Icicles and a drip falling to the ground.
    for (const [ix, len] of [[3, 2], [6, 1], [10, 3], [15, 2], [18, 1]]) ctx.fillRect(x + ix, y + h, 1, len);
    const drip = (t % 1.6) / 0.8;
    if (drip < 1) this.px(x + 10, mix(y + h + 3, G - 1, drip * drip));
    ctx.clearRect(x - 5, y + h + 4, 31, 7);
    drawText(ctx, 'COOLING', x - 4, y + h + 5);
    if (t % 1.2 < 0.8) this.px(x + 24, y + h + 9);
  }

  // --- 503 Offline: the relay satellite is broken and the signal fizzles out ---------

  satellite() {
    const { width: W, height: H } = this.canvas;
    return { x: Math.round(W * 0.8), y: Math.round(H * 0.2 + Math.sin(this.time * 0.8) * 2) };
  }

  offline() {
    const { ctx, canvas } = this;
    const { width: W, height: H } = canvas;
    const G = this.groundY();
    const t = this.time;
    this.stars(34, 19);
    this.horizon();
    this.groundDish(Math.round(W * 0.9), G);

    // Phone-style status: an antenna, five empty bars, a blinking X, NO SIGNAL.
    this.drawSprite(ANTENNA_ICON, 3, 3);
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 5; i++) ctx.fillRect(10 + i * 3, 8 - i, 2, i + 1);
    ctx.globalAlpha = 1;
    if (t % 1 < 0.6) {
      this.line(27, 3, 31, 7);
      this.line(31, 3, 27, 7);
    }
    drawText(ctx, 'NO SIGNAL', 3, 12);

    // The ship calls out; its radio waves break up and die away.
    const sx = Math.round(W * 0.05);
    const sy = Math.round(H * 0.46 + Math.sin(t * 1.2) * 2);
    this.drawSprite(SHIP, sx, sy);
    this.flame(sx, sy);
    for (let k = 0; k < 3; k++) {
      const r = ((t * 12 + k * 13) % 39) + 3;
      ctx.globalAlpha = Math.max(0, 1 - r / 42);
      this.ring(sx + 11, sy + 3, r, 1 + Math.floor(r / 8), -0.55, 0.55);
    }
    ctx.globalAlpha = 1;

    this.brokenSatellite();

    // Static on the screen, and now and then a torn line.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 16; i++) this.px(Math.random() * W, Math.random() * G);
    if (t % 3.1 < 0.12) {
      const y = Math.floor(hash(Math.floor(t / 3.1)) * G);
      for (let x = 0; x < W; x++) if (Math.random() < 0.5) this.px(x, y);
    }
    ctx.globalAlpha = 1;
  }

  offlineTick() {
    const { x, y } = this.satellite();
    if (this.every(0.9)) this.sparks(x - 1, y + 3, 4, 18, 0);
  }

  brokenSatellite() {
    const { ctx } = this;
    const t = this.time;
    const { x, y } = this.satellite();
    // The panel that is still there.
    ctx.fillRect(x + 10, y + 3, 3, 1);
    this.box(x + 13, y - 1, 13, 9);
    for (let i = 3; i < 13; i += 3) ctx.fillRect(x + 13 + i, y - 1, 1, 9);
    ctx.fillRect(x + 13, y + 3, 13, 1);
    // Body with a dead dish on top.
    this.box(x, y, 10, 8);
    ctx.fillRect(x + 2, y + 2, 2, 2);
    ctx.fillRect(x + 6, y + 5, 2, 1);
    this.ring(x + 5, y - 4, 4, 1, 0, Math.PI);
    ctx.fillRect(x + 5, y - 8, 1, 4);
    // The stump where the other panel was, with torn wires.
    this.px(x - 1, y + 2);
    this.px(x - 1, y + 4);
    this.px(x - 2, y + 3);
    for (const k of [0, 1]) {
      for (let i = 1; i <= 4; i++) this.px(x - 2 - i, y + 2 + k * 3 + Math.sin(t * 3 + i + k) * i * 0.4);
    }
    // That panel, tumbling away on a slow loop.
    const a = t * 0.3;
    this.drawSprite(PANEL_TURNS[Math.floor(t / 1.4) % 4], x - 14 + Math.cos(a) * 5, y + 20 + Math.sin(a) * 4);
  }

  /** Ground station dish aimed at the sky; its lamp is dark. */
  groundDish(cx, G) {
    const { ctx } = this;
    ctx.fillRect(cx - 5, G - 2, 11, 2);
    ctx.fillRect(cx - 1, G - 9, 3, 7);
    // The bowl: two arcs, so it looks solid, opening up to the left.
    for (const r of [7, 6]) this.ring(cx - 1, G - 14, r, 1, -Math.PI * 0.2, Math.PI * 0.8);
    this.line(cx - 1, G - 14, cx - 7, G - 20);
    ctx.fillRect(cx - 8, G - 21, 2, 2);
    ctx.globalAlpha = 0.2;
    ctx.fillRect(cx + 3, G - 6, 2, 2);
    ctx.globalAlpha = 1;
  }

  // --- 503 Leaderboard offline: an empty stadium and a dead scoreboard ---------------

  scoreboardBox() {
    const W = this.canvas.width;
    const x = Math.round(W * 0.68);
    const h = 26;
    return { x, y: this.groundY() - 14 - h, w: Math.min(48, W - 3 - x), h };
  }

  leaderboardOffline() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const G = this.groundY();
    const t = this.time;
    this.renderPlanet();
    this.stars(26, 23);
    this.horizon();

    // Empty winners' podium, the trophy knocked over beside it.
    const podium = Math.round(W * 0.05);
    for (const [i, h, place] of [[0, 11, '2'], [1, 15, '1'], [2, 9, '3']]) {
      this.box(podium + i * 10, G - h, 11, h);
      drawText(ctx, place, podium + i * 10 + 4, G - h + 2);
    }
    const rock = t % 4 < 1.2 && t % 0.4 < 0.2 ? 1 : 0;
    this.outlined(TROPHY_DOWN, podium + 34, G - 7 - rock);
    // A tumbleweed rolls across the empty stadium.
    const roll = ((t * 11) % (W + 20)) - 10;
    this.outlined(TUMBLEWEED_TURNS[Math.floor(t * 5) % 4], roll, G - 7 - Math.abs(Math.sin(t * 4)) * 3);

    this.scoreboard(this.scoreboardBox());
  }

  leaderboardOfflineTick() {
    const { x } = this.scoreboardBox();
    if (this.every(1.4)) this.sparks(x - 13, this.groundY() - 3, 5, 20, 60);
  }

  /** Dead bulbs, ghost digits, an OFFLINE sign, and its cable pulled out. */
  scoreboard({ x, y, w, h }) {
    const { ctx } = this;
    const t = this.time;
    const G = this.groundY();
    ctx.fillRect(x + 6, y + h, 2, G - y - h);
    ctx.fillRect(x + w - 8, y + h, 2, G - y - h);
    this.box(x, y, w, h);
    this.frameRect(x + 2, y + 2, w - 4, h - 4);
    for (let bx = x + 3, i = 0; bx < x + w - 3; bx += 5, i++) {
      ctx.globalAlpha = i === 4 && t % 0.7 < 0.1 ? 1 : 0.2;
      ctx.fillRect(bx, y - 2, 2, 2);
    }
    ctx.globalAlpha = 1;
    const title = 'HI SCORE';
    drawText(ctx, title, x + Math.round((w - textWidth(title)) / 2), y + 4);
    const glitch = t % 2.3 < 0.12;
    drawNumber(ctx, glitch ? Math.floor(hash(Math.floor(t * 20)) * 99999) : '     ', 5, x + Math.round(w / 2) + 16, y + 12);

    // OFFLINE sign hanging under the board, swinging a little.
    const sign = { x: x + Math.round((w - 31) / 2) + Math.round(Math.sin(t * 1.5)), y: y + h + 3 };
    this.line(x + 9, y + h, sign.x + 2, sign.y);
    this.line(x + w - 10, y + h, sign.x + 28, sign.y);
    this.tag('OFFLINE', sign.x, sign.y);

    // The cable runs down and along the ground to a plug, short of its socket.
    const plug = x - 10;
    ctx.fillRect(x + 3, y + h, 1, G - y - h);
    ctx.fillRect(plug + 4, G - 1, x + 3 - plug - 4, 1);
    this.drawSprite(PLUG, plug, G - 3);
    this.box(x - 22, G - 8, 5, 8);
    this.px(x - 20, G - 6);
    this.px(x - 20, G - 4);
    if (t % 1.4 < 0.1) {
      this.line(plug - 1, G - 2, plug - 3, G - 5);
      this.line(plug - 3, G - 5, plug - 5, G - 3);
      this.line(plug - 5, G - 3, x - 17, G - 5);
    }
  }

  // --- 503 Maintenance: mission control under repair ---------------------------------

  weldPoint() {
    return { x: Math.round(this.canvas.width * 0.84) - 10, y: this.groundY() - 14 };
  }

  hammerPoint() {
    return { x: Math.round(this.canvas.width * 0.14) + 10, y: this.groundY() - 7 };
  }

  maintenance() {
    const W = this.canvas.width;
    const G = this.groundY();
    this.stars(24, 29);
    this.horizon();
    this.crane();
    const dome = Math.round(W * 0.84);
    this.controlDome(dome, G);
    this.scaffold(dome, G);
    this.roadblock(Math.round(W * 0.5), G);
    this.worker(Math.round(W * 0.14), G);
  }

  maintenanceTick() {
    const weld = this.weldPoint();
    if (Math.random() < 0.35) this.sparks(weld.x, weld.y, 1, 22, 80);
    const hit = this.hammerPoint();
    if (this.every(0.6, 0.3)) this.sparks(hit.x, hit.y, 3, 14, 60);
  }

  /** Tower crane on the left, a crate swinging from its hook. */
  crane() {
    const { ctx } = this;
    const W = this.canvas.width;
    const G = this.groundY();
    const t = this.time;
    const mast = Math.round(W * 0.03);
    const jib = 6;
    const end = Math.round(W * 0.33);
    ctx.fillRect(mast, jib, 1, G - jib);
    ctx.fillRect(mast + 3, jib, 1, G - jib);
    for (let y = jib; y + 4 <= G; y += 4) this.line(mast, y, mast + 3, y + 4);
    ctx.fillRect(mast - 4, jib, end - mast + 4, 1);
    ctx.fillRect(mast + 4, jib - 3, end - mast - 6, 1);
    for (let x = mast + 4; x < end - 2; x += 4) this.line(x, jib, x + 2, jib - 3);
    ctx.fillRect(mast - 4, jib + 1, 3, 3);
    ctx.fillRect(mast, jib - 6, 1, 3);
    if (t % 1 < 0.5) this.px(mast, jib - 7);

    const trolley = Math.round(mix(mast + 14, end - 4, (Math.sin(t * 0.25) + 1) / 2));
    const length = 14 + (Math.sin(t * 0.4) + 1) * 5;
    const swing = Math.sin(t * 1.3) * 0.18;
    const hook = { x: trolley + Math.sin(swing) * length, y: jib + 1 + Math.cos(swing) * length };
    ctx.fillRect(trolley - 1, jib + 1, 3, 1);
    this.line(trolley, jib + 1, hook.x, hook.y);
    this.box(hook.x - 4, hook.y + 1, 9, 7);
    this.line(hook.x - 4, hook.y + 1, hook.x + 4, hook.y + 7);
  }

  /** Mission control: a dome on a base, one panel missing, a beacon turning on top. */
  controlDome(cx, G) {
    const { ctx } = this;
    this.box(cx - 16, G - 9, 33, 9);
    for (let x = cx - 13; x < cx + 14; x += 5) ctx.fillRect(x, G - 6, 3, 2);
    const rx = 14;
    const ry = 12;
    const cy = G - 9;
    for (let y = -ry; y <= 0; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d > 1) continue;
        if (d > 0.8) {
          this.px(cx + x, cy + y);
          continue;
        }
        ctx.clearRect(cx + x, cy + y, 1, 1);
        const hole = x < -5 && x > -11 && y < -3 && y > -8;
        if (hole ? (x + y) % 2 === 0 : x % 5 === 0 || y === -6) this.px(cx + x, cy + y);
      }
    }
    ctx.fillRect(cx - 1, cy - ry - 2, 3, 2);
    const side = Math.sin(this.time * 6) > 0 ? 1 : -1;
    this.line(cx + side * 2, cy - ry - 2, cx + side * 8, cy - ry - 5);
    this.line(cx + side * 2, cy - ry - 1, cx + side * 8, cy - ry + 1);
  }

  scaffold(cx, G) {
    const { ctx } = this;
    const left = cx - 22;
    const right = cx - 14;
    const top = G - 26;
    ctx.fillRect(left, top, 1, G - top);
    ctx.fillRect(right, top, 1, G - top);
    for (let y = top; y < G; y += 8) ctx.fillRect(left - 1, y, right - left + 3, 1);
    this.line(left, top + 8, right, top + 16);
    this.line(left, top + 16, right, top + 24);
    // Welding robot on the middle plank, its torch flaring at the missing panel.
    const robot = { x: left + 1, y: top + 2 };
    this.box(robot.x, robot.y, 5, 6);
    this.px(robot.x + 3, robot.y + 2);
    const weld = this.weldPoint();
    this.line(robot.x + 5, robot.y + 3, weld.x - 1, weld.y);
    if (Math.random() < 0.7) {
      this.lit(() => this.disc(weld.x, weld.y, 1));
      ctx.fillRect(weld.x - 2, weld.y, 5, 1);
      ctx.fillRect(weld.x, weld.y - 2, 1, 5);
    }
  }

  /** Striped barrier with blinking lamps and a CLOSED sign, cones on both sides. */
  roadblock(cx, G) {
    const { ctx } = this;
    const t = this.time;
    const w = 34;
    const x = cx - 17;
    const y = G - 10;
    for (const lx of [x + 4, x + w - 5]) {
      this.line(lx, y + 4, lx - 3, G - 1);
      this.line(lx, y + 4, lx + 3, G - 1);
    }
    this.box(x, y, w, 5);
    for (let i = 1; i < w - 1; i++) for (let j = 1; j < 4; j++) if ((i + j) % 6 < 3) this.px(x + i, y + j);
    for (const [k, lx] of [x - 2, x + w - 1].entries()) {
      ctx.globalAlpha = (Math.floor(t * 2) + k) % 2 ? 1 : 0.2;
      ctx.fillRect(lx, y - 3, 3, 3);
    }
    ctx.globalAlpha = 1;
    this.tag('CLOSED', cx - 13, y - 10);
    this.outlined(CONE, x - 9, G - 5);
    this.outlined(CONE, x + w + 4, G - 5);
  }

  /** An astronaut hammering a broken generator, a toolbox at its feet. */
  worker(x, G) {
    const { ctx } = this;
    const t = this.time;
    this.outlined(TOOLBOX, x - 12, G - 5);
    const gen = x + 10;
    this.box(gen, G - 12, 12, 12);
    this.ring(gen + 4, G - 8, 2);
    this.px(gen + 4 + Math.round(Math.sin(t * 9)), G - 9);
    ctx.fillRect(gen + 8, G - 10, 2, 7);
    const u = (t * 0.6) % 1;
    ctx.globalAlpha = 1 - u;
    this.ring(gen + 9 + u * 3, G - 14 - u * 12, 1 + u * 2);
    ctx.globalAlpha = 1;

    this.outlined(WORKER, x, G - 10);
    // Hammer: raised over the helmet, then down on the generator.
    const up = t % 0.6 < 0.3;
    const hand = up ? { x: x + 5, y: G - 14 } : { x: x + 8, y: G - 7 };
    this.line(x + 3, G - 5, hand.x, hand.y);
    if (up) ctx.fillRect(hand.x - 2, hand.y - 2, 4, 2);
    else ctx.fillRect(hand.x + 1, hand.y - 2, 2, 4);
  }
}
