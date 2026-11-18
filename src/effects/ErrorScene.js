import { clamp, randomBetween } from '../engine/index.js';
import { LcdScene, hash } from './LcdScene.js';
import { FONT_H, GHOST_ALPHA, SHIP, SKULL, drawNumber, drawText, textWidth } from './lcdArt.js';
import { MOTHERSHIP } from './mothership.js';

// Seconds into each scene's loop shown as the single still frame for reduced
// motion. The keys are also the error types that have a scene of their own.
const STILL = {
  notFound: 2.6,
  forbidden: 3.1,
  sessionExpired: 4.25,
  loginRequired: 3.43,
  scoreRejected: 4.58,
  scoreConflict: 3.6,
  rateLimited: 6.6,
  offline: 1.2,
  leaderboardOffline: 1,
  serverError: 1.9,
  maintenance: 1,
};

// --- Helpers -------------------------------------------------------------------

/** The sprite turned 90° clockwise. */
const turn = (sprite) => [...sprite[0]].map((_, x) => sprite.map((row) => row[x]).reverse().join(''));
/** The sprite at 0°, 90°, 180° and 270°, for things that tumble. */
const turns = (sprite) => [sprite, turn(sprite), turn(turn(sprite)), turn(turn(turn(sprite)))];
/** The sprite mirrored left to right. */
const flip = (sprite) => sprite.map((row) => [...row].reverse().join(''));
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
// A burrow critter with feelers; it lives behind the hill.
const CRITTER = ['.#...#.', '..#.#..', '.#####.', '##.#.##', '#######', '#.#.#.#'];

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

// 400
// 400: the inspection booth, seen from our side of the desk. One loop in seconds,
// and the moment the stamp lands: the dialog appears just after it (login.css).
const BOOTH = { loop: 9, stamp: 3.75 };
// The pilot at the window from the chest up. 'o' is the light visor and suit;
// the eyes are drawn on the visor (BOOTH_EYES), so the face can change.
const PILOT_BUST = [
  '.......#######.......',
  '.....##ooooooo##.....',
  '....#ooooooooooo#....',
  '...#ooooooooooooo#...',
  '..#ooooooooooooooo#..',
  '..#oo###########oo#..',
  '.#oo#ooooooooooo#oo#.',
  '.#oo#ooooooooooo#oo#.',
  '.#oo#ooooooooooo#oo#.',
  '.#ooo###########ooo#.',
  '..#ooooooooooooooo#..',
  '..#ooooo#####ooooo#..',
  '...##ooooooooooo##...',
  '.....###########.....',
  '.......#ooooo#.......',
  '..######ooooo######..',
  '.#oooooo#ooo#oooooo#.',
  '#oooooooo#o#oooooooo#',
  '#o##ooooo#o#ooooo##o#',
  '#o##oooooo#oooooo##o#',
  '#ooooooooooooooooooo#',
  '#ooooooooooooooooooo#',
];
const BOOTH_EYES = {
  calm: [[7, 7], [8, 7], [12, 7], [13, 7]],
  hopeful: [[7, 7], [8, 6], [9, 7], [11, 7], [12, 6], [13, 7]],
  nervous: [[6, 7], [7, 7], [11, 7], [12, 7]],
  shocked: [[7, 6], [8, 6], [7, 7], [8, 7], [12, 6], [13, 6], [12, 7], [13, 7]],
  sad: [[7, 8], [8, 7], [12, 7], [13, 8]],
};
const TINY_PILOT = ['###', '#.#', '###', '.#.', '###', '#.#'];
const FIST = ['..#####..', '.#o#o#o#.', '#ooooooo#', '#ooooooo##', '.########'];
const GLOVE = ['.###.', '#ooo#', '#ooo#', '.###.'];

// 409 and 500: the 401 pilot standing up. Arms are drawn in code, so they can point anywhere.
const PILOT_TORSO = ['..###..', '.#####.', '.#####.', '.##.##.', '..###..'];
const PILOT_LEGS = {
  wide: ['..#.#..', '.#...#.', '.#...#.', '#.....#', '##...##'],
  step: ['..#.#...', '..#..#..', '.#....#.', '.#....#.', '##....##'],
  straight: ['..#.#..', '..#.#..', '..#.#..', '..#.#..', '.##.##.'],
};
/** Head, torso and legs as one sprite facing right, 8 wide; `lean` 1 puts the head forward. */
const pilotPose = (legs, lean) => [
  ...PILOT_HEAD.map((row) => ('.'.repeat(lean) + row).padEnd(8, '.')),
  ...[...PILOT_TORSO, ...PILOT_LEGS[legs]].map((row) => row.padEnd(8, '.')),
];

// 409: seconds in one round of the argument.
const CONFLICT_LOOP = 8;

// 429: the ships in the queue, facing right, in their four turns.
const FIGHTER = ['##......', '###.....', '.#####..', '########', '.#####..', '###.....', '##......'];
const HAULER = ['.##########..', '#..#..#..###.', '#############', '#..#..#..####', '#############', '#..#..#..###.', '.##########..'];
const POD = ['.##..', '####.', '#.###', '####.', '.##..'];
const QUEUE = [HAULER, FIGHTER, POD, FIGHTER, POD, HAULER, FIGHTER, POD].map(turns);
// Seconds in one round of the queue; the ship (from the back) that sleeps through it.
const RATE_LOOP = 8;
const SLEEPER = 7;

// 503 offline
const ANTENNA_ICON = ['#.#.#', '.###.', '..#..', '..#..', '..#..', '..#..'];
const PANEL_TURNS = turns(['#########', '#.#.#.#.#', '#########', '#.#.#.#.#', '#########']);

// 503 leaderboard: chunky flames (solid core, dithered tips), the robot, flying data.
const FLAMES = [
  ['....:....', '...:.:...', '....#:...', '...:#:.:.', '..:##:...', '.:.###:..', '..:####:.', '.:#####:.', ':#######:', '.#######.', '..#####..'],
  ['.....:...', '....:.:..', '...:#....', '.:.:#:...', '...:##:..', '..:###.:.', '.:####:..', '.:#####:.', ':#######:', '.#######.', '..#####..'],
  ['...:.....', '..:.:.:..', '...:#:...', '..:##:...', '..:###:..', '.:.###:..', '.:####:..', '.:#####:.', ':#######:', '.#######.', '..#####..'],
];
// The robot faces right: fire helmet, a box head with one eye, arms forward. Knocked over it
// lies on its back, legs up, then sits, legs out.
const ROBOT_HELMET = ['...##..', '..####.', '#######'];
const ROBOT_BODY = ['..#.##.', '..####.', '.######', '.####..', '.#..#..'];
const ROBOT_LYING = ['......#.#', '.###..#.#', '#.#######', '#########'];
const ROBOT_SAT = ['..#.##.', '..####.', '.####..', '.######'];
const HELMET_TURNS = turns(ROBOT_HELMET);
const HYDRANT = ['..#..', '.###.', '#####', '.###.', '.###.', '#####'];
// A disk platter spinning (face on, then edge on) and a data block turning.
const DISK_SPIN = [['.###.', '#...#', '#.#.#', '#...#', '.###.'], ['.###.', '#####', '.###.']];
const BLOCK_SPIN = [['##', '##'], ['.#.', '###', '.#.']];
const FIRE_LOOP = 8;

// 500: seconds in one crash; a gear in two turns; the wrench upright (jaw up) and swung level.
const CRASH_LOOP = 7;
const GEAR = [
  ['...#...', '.#####.', '.#...#.', '##.#.##', '.#...#.', '.#####.', '...#...'],
  ['..#.#..', '.#####.', '##...##', '.#.#.#.', '##...##', '.#####.', '..#.#..'],
];
const SCREW_TURNS = turns(['###', '.#.', '.#.']);
const WRENCH = ['#.#', '###', '.#.', '.#.'];
const WRENCH_LEVEL = ['..##', '###.', '..##'];

// 503 maintenance
const WORKER = ['.###..', '#..##.', '#..##.', '.###..', '..#...', '.###..', '.###..', '.#.#..', '.#.#..', '##.##.'];
const TOOLBOX = ['..####..', '..#..#..', '########', '#..##..#', '########'];
const CONE = ['..#..', '.#.#.', '.###.', '#...#', '#####'];

// 403: points on the mothership sprite: the core and the two turret orbs.
const MOTHER_CORE = { x: 36, y: 18 };
const MOTHER_TURRETS = [{ x: 16, y: 35 }, { x: 57, y: 35 }];

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
    if (this.scene && this.reducedMotion) {
      // Play the last moments before the still frame, so its sparks are in the picture.
      this.time = STILL[this.scene] - 0.4;
      for (let i = 0; i < 24; i++) this.update(1 / 60);
    }
  }

  // The scenes have no HUD, so they may use the whole height.
  top() {
    return this.scene ? 2 : super.top();
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

  /** A shaded sprite: '#' ink, ':' dither, '+' ghost, 'o' light; all but '.' hide what is behind. `scale` makes chunky pixels. */
  shaded(sprite, x, y, scale = 1) {
    const { ctx } = this;
    const left = Math.round(x);
    const top = Math.round(y);
    sprite.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === '.') continue;
        ctx.clearRect(left + dx * scale, top + dy * scale, scale, scale);
        ctx.globalAlpha = ch === '+' ? 0.3 : 1;
        if (ch === '#' || ch === '+' || (ch === ':' && (dx + dy) % 2 === 0)) ctx.fillRect(left + dx * scale, top + dy * scale, scale, scale);
      }
    });
    ctx.globalAlpha = 1;
  }

  /** `sprite` turned by `angle` (radians, clockwise) around its middle at (cx, cy), with a light rim. */
  tilted(sprite, cx, cy, angle) {
    const w = sprite[0].length;
    const h = sprite.length;
    const ink = (x, y) => sprite[Math.round(y + (h - 1) / 2)]?.[Math.round(x + (w - 1) / 2)] === '#';
    this.shape(cx, cy, angle, Math.ceil(Math.max(w, h) / 2) + 2, (x, y) => {
      if (ink(x, y)) return 'ink';
      if (ink(x + 1, y) || ink(x - 1, y) || ink(x, y + 1) || ink(x, y - 1)) return 'clear';
      return null;
    });
  }

  /** A straight bar from `a` to `b`, `r` pixels out from its centre line; `clear` paints light. */
  bar(a, b, r, clear = false) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(mix(a.x, b.x, i / steps)) - r;
      const y = Math.round(mix(a.y, b.y, i / steps)) - r;
      if (clear) this.ctx.clearRect(x, y, r * 2 + 1, r * 2 + 1);
      else this.ctx.fillRect(x, y, r * 2 + 1, r * 2 + 1);
    }
  }

  /** Checkerboard ink on the pixels of the box where `inside(x, y)` holds. */
  ditherWhere(x0, y0, x1, y1, inside) {
    for (let y = Math.round(y0); y <= y1; y++) {
      for (let x = Math.round(x0); x <= x1; x++) if (((x + y) & 1) === 0 && inside(x, y)) this.ctx.fillRect(x, y, 1, 1);
    }
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
    this.asteroid(W * 0.66, H * 0.17 + Math.sin(t * 0.5) * 1.5, 6.5, -t * 0.1, 2);
    this.pebble(W * 0.2, H * 0.45 + Math.sin(t * 0.7), 0.4 + Math.sin(t * 0.5) * 0.3);
    for (const [fx, fy] of [[0.97, 0.12], [0.68, 0.42]]) {
      this.shape(W * fx, H * fy + Math.sin(t + fx * 9), 0, 3, (x, y) => {
        const d = Math.hypot(x, y) - 2.4;
        return d > 0 ? null : d > -1 ? 'ink' : 'clear';
      });
    }

    // Smoke rising behind the wreck, the hills burying its tail, the big rock in front of it all.
    // 8 s loop: the wreck calls home, a critter peeks out at the noise, the wreck bangs, it ducks.
    const p = t % 8;
    const wreck = this.wreckPose();
    const at = placer(wreck.x, wreck.y, wreck.angle);
    this.smoke(at(6, -4.5));
    this.wreck(wreck);
    this.sos(at(-1, -12), p);
    this.critter(Math.round(W * 0.6), p);
    this.hills();
    this.asteroid(W * 0.11, H * 0.71 + Math.sin(t * 0.4) * 1.5, 8, t * 0.08, 5);
  }

  notFoundTick() {
    const wreck = this.wreckPose();
    const hole = placer(wreck.x, wreck.y, wreck.angle)(6, -3.5);
    if (this.every(8, 4.4)) {
      this.sparks(hole.x, hole.y, 14, 30, 50);
      this.shockWaves.push({ x: hole.x, y: hole.y, life: 0.3 });
    } else if (this.every(1.6)) {
      this.sparks(hole.x, hole.y, 3, 14, 40);
    }
  }

  /** Three radio rings from the bent antenna; they break up and fade: the call is lost. */
  sos(tip, p) {
    const { ctx } = this;
    for (const start of [0.2, 0.8, 1.4]) {
      const u = (p - start) / 1.6;
      if (u < 0 || u > 1) continue;
      ctx.globalAlpha = 1 - u * 0.5;
      this.ring(tip.x, tip.y, 2 + u * 10, u > 0.6 ? 2 : 1, Math.PI * 0.95, Math.PI * 1.55);
      if (u < 0.15) {
        ctx.fillRect(Math.round(tip.x) - 1, Math.round(tip.y), 3, 1);
        ctx.fillRect(Math.round(tip.x), Math.round(tip.y) - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The critter rises behind the ridge (hills() hides its lower half), asks "?", ducks at the bang, peeks again. */
  critter(x, p) {
    const { ctx } = this;
    const ridge = Math.round(this.groundY() - this.ridge(x + 3));
    const rise = 6 * (ease(p, 1.6, 2.2) - ease(p, 4.5, 4.7)) + 4 * (ease(p, 6.2, 6.6) - ease(p, 7.4, 7.8));
    this.drawSprite(CRITTER, x, ridge - Math.round(rise));
    const mark = p >= 2.4 && p < 4.4 ? '?' : p >= 4.4 && p < 4.9 ? '!' : '';
    if (mark) {
      ctx.clearRect(x + 1, ridge - 14, 5, 7);
      drawText(ctx, mark, x + 2, ridge - 13);
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
      // Above the hull is only the fin; solid, so its thin outline does not read as a letter.
      if (y < -5) return 'ink';
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
    const at = placer(cx, cy, angle);
    if (this.time % 1.2 < 0.25) {
      const tip = at(21.5, 0);
      this.ctx.fillRect(Math.round(tip.x) - 1, Math.round(tip.y), 3, 1);
      this.ctx.fillRect(Math.round(tip.x), Math.round(tip.y) - 1, 1, 3);
    }
    // The bent antenna on its back.
    const [base, knee, tip] = [at(-3, -5), at(-3, -10), at(-1, -12)];
    this.line(base.x, base.y, knee.x, knee.y);
    this.line(knee.x, knee.y, tip.x, tip.y);
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

  // --- 403 Forbidden: the mothership's tractor beam pushes the ship back from its gate --

  /** Top-left of the mothership at the right edge, bobbing slowly. */
  mother() {
    return { x: this.canvas.width - MOTHERSHIP[0].length - 1, y: 1 + Math.round(Math.sin(this.time * 1.3)) };
  }

  /**
   * Where the left and right turret beams hit the ground in front of the gate.
   * The right beam lands further out, so it crosses the left one low down
   * instead of running along the right claw.
   */
  impacts() {
    const { x } = this.mother();
    const G = this.groundY();
    return [{ x: x + 10, y: G }, { x: x - 6, y: G }];
  }

  /** Centre of the intruder: it creeps forward, then the beam shoves it back (4 s loop). */
  pushedShip() {
    const p = this.time % 4;
    const back = p < 3 ? 1 - ease(p, 0.2, 3) : ease(p, 3, 3.3);
    const shoved = p >= 3 && p < 3.7;
    return { x: Math.round(this.canvas.width * 0.17 + 8 * (1 - back)), y: 20 + (shoved ? Math.round(Math.sin(this.time * 40)) : 0), shoved };
  }

  forbidden() {
    const { ctx } = this;
    const G = this.groundY();
    const m = this.mother();
    const ship = this.pushedShip();
    this.stars(26, 7);
    this.horizon();

    // The turret beams scorch a line on the ground that the ship can't cross.
    const hits = this.impacts();
    for (let x = hits[1].x; x <= hits[0].x; x += 2) this.px(x, G - 1);
    this.gate(m.x + 22, G);
    this.tractorBeam({ x: m.x + MOTHER_CORE.x, y: m.y + MOTHER_CORE.y }, ship);
    this.shaded(MOTHERSHIP, m.x, m.y);
    this.crossedClaws(m, G);
    // Beams last, so nothing cuts them: from the glowing turret orb straight into the burst.
    MOTHER_TURRETS.forEach((turret, i) => this.turretBeam({ x: m.x + turret.x, y: m.y + turret.y }, hits[i]));

    // The ship tilted back, still thrusting, with motion lines and a "!".
    this.tilted(SHIP, ship.x, ship.y, -0.35);
    ctx.fillRect(ship.x - 7 - Math.floor(Math.random() * 3), ship.y + 3, 2, 1);
    for (const [k, dy] of [-3, 0, 3].entries()) {
      const length = (ship.shoved ? 8 : 4) + ((k + Math.floor(this.time * 8)) % 2);
      ctx.clearRect(ship.x + 7, ship.y + dy - 1, length, 3);
      ctx.fillRect(ship.x + 7, ship.y + dy, length, 1);
    }
    if (!ship.shoved || this.time % 0.2 < 0.12) {
      ctx.clearRect(ship.x - 3, ship.y - 13, 5, 7);
      drawText(ctx, '!', ship.x - 2, ship.y - 12);
    }
    this.transmission(m);
  }

  /**
   * The mothership does not talk: its antenna spire sends ACCESS DENIED to a
   * message display, where it is typed out letter by letter (6 s loop).
   */
  transmission(m) {
    const { ctx } = this;
    const t = this.time;
    const text = 'ACCESS DENIED';
    const p = t % 6;
    const typed = clamp(Math.floor((p - 0.4) / 0.16), 0, text.length);
    const sending = p >= 0.4 && typed < text.length;

    // The display sits left of the claws: the text, then a block cursor.
    const w = textWidth(text) + 8;
    const box = { x: m.x + 6 - w, y: 0, w, h: FONT_H + 4 };
    this.box(box.x, box.y, box.w, box.h);
    const shown = p > 4.6 && p < 5.8 && t % 0.4 >= 0.25 ? '' : text.slice(0, typed);
    drawText(ctx, shown, box.x + 2, box.y + 2);
    if (sending || t % 0.8 < 0.4) ctx.fillRect(box.x + 2 + textWidth(text.slice(0, typed)) + (typed ? 1 : 0), box.y + 2, 3, FONT_H);

    // The signal: a dotted line from the spire tip into the display, data running along it while sending.
    const tip = { x: m.x + 30, y: m.y + 1 };
    const end = { x: box.x + box.w, y: box.y + 4 };
    const steps = Math.round(tip.x - end.x);
    const run = Math.floor(t * 30);
    for (let i = 0; i <= steps; i++) {
      const dot = mixPoint(tip, end, i / steps);
      if (sending ? (i + run) % 6 < 2 : i % 3 === 0) this.px(dot.x, dot.y);
    }
    if (sending) {
      for (let k = 0; k < 2; k++) this.ring(tip.x, tip.y, 2 + ((t * 10 + k * 3) % 6), 1, Math.PI * 0.6, Math.PI * 1.4);
    }
  }

  forbiddenTick() {
    if (this.every(0.25)) for (const hit of this.impacts()) this.sparks(hit.x, hit.y - 1, 3, 30, 120);
    if (this.every(4, 3)) {
      const ship = this.pushedShip();
      this.shockWaves.push({ x: ship.x + 6, y: ship.y, life: 0.3 });
    }
  }

  /** A turret beam from the orb into its ground burst; bright pulses run down it. */
  turretBeam(from, hit) {
    const { ctx } = this;
    const G = this.groundY();
    const to = { x: hit.x, y: G - 1 };
    this.bar(from, to, 1, true);
    ctx.globalAlpha = 0.4;
    this.bar(from, to, 1);
    ctx.globalAlpha = 1;
    this.line(from.x, from.y, to.x, to.y);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const run = (this.time * 40) % 8;
    this.lit(() => {
      for (let d = run; d < length; d += 8) this.px(mix(from.x, to.x, d / length), mix(from.y, to.y, d / length));
    });
    // The orb flashes as it fires; the burst is drawn over the beam's end.
    this.ring(from.x, from.y, this.time % 0.2 < 0.1 ? 3 : 2, 1);
    this.impact(hit.x, G);
  }

  /** Burst where a turret beam hits the ground: a pulsing dithered dome and short rays. */
  impact(x, G) {
    const r = 3 + Math.round(Math.abs(Math.sin(this.time * 9)) * 2);
    // A bright flash dome with a hard rim; the beam ends in its top.
    for (let dy = -r - 1; dy < 0; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= r) this.ctx.clearRect(x + dx, G + dy, 1, 1);
        else if (d <= r + 1) this.px(x + dx, G + dy);
      }
    }
    // Rays and flying grit, alternating so the burst flickers.
    const odd = this.time % 0.2 < 0.1;
    for (const a of odd ? [-2.7, -1.9, -1.2, -0.45] : [-2.4, -1.57, -0.75]) {
      this.line(x + Math.cos(a) * (r + 3), G + Math.sin(a) * (r + 3), x + Math.cos(a) * (r + 5), G + Math.sin(a) * (r + 5));
    }
  }

  /** Wide dithered cone from the core to the ship; its bands run away from the core. */
  tractorBeam(core, ship) {
    const { ctx } = this;
    const x0 = core.x - 7;
    const x1 = ship.x + 8;
    const shift = Math.floor(this.time * 14);
    for (let x = x1; x <= x0; x++) {
      const u = (x0 - x) / (x0 - x1);
      const mid = mix(core.y, ship.y, u);
      const half = 2 + u * 8;
      const top = Math.round(mid - half);
      const bottom = Math.round(mid + half);
      ctx.clearRect(x, top, 1, bottom - top + 1);
      this.px(x, top);
      this.px(x, bottom);
      if ((x + shift) % 5 === 0) continue;
      for (let y = top + 1; y < bottom; y++) if (((x + y) & 1) === 0) this.px(x, y);
    }
  }

  /** The claws hang down and cross in front of the gate, pincers open at the ground. */
  crossedClaws(m, G) {
    const { ctx } = this;
    for (const [from, to] of [
      [{ x: m.x + 12, y: m.y + 31 }, { x: m.x + 52, y: G - 3 }],
      [{ x: m.x + 61, y: m.y + 31 }, { x: m.x + 21, y: G - 3 }],
    ]) {
      this.bar(from, to, 2, true);
      this.bar(from, to, 1);
      for (const u of [0.35, 0.7]) {
        const joint = mixPoint(from, to, u);
        ctx.clearRect(Math.round(joint.x) - 1, Math.round(joint.y), 3, 1);
      }
      const dir = Math.sign(to.x - from.x);
      this.line(to.x, to.y, to.x + dir * 3, to.y - 3);
      this.line(to.x, to.y, to.x + dir * 4, to.y + 1);
    }
  }

  /** Heavy gate under the mothership: lintel with rivets, pillars, bars and a padlock. */
  gate(x, G) {
    const { ctx } = this;
    const w = 31;
    const h = 26;
    const top = G - h;
    this.box(x, top, w, h);
    ctx.fillRect(x, top, w, 3);
    this.lit(() => {
      for (let rx = x + 3; rx < x + w - 2; rx += 4) ctx.fillRect(rx, top + 1, 1, 1);
    });
    this.box(x, top + 3, 4, h - 3);
    this.box(x + w - 4, top + 3, 4, h - 3);
    for (let bx = x + 6; bx < x + w - 5; bx += 3) ctx.fillRect(bx, top + 3, 1, h - 3);
    ctx.fillRect(x + 4, top + 11, w - 8, 1);
    const lock = x + Math.floor(w / 2) - 2;
    this.ring(lock + 2, top + 13, 2, 1, Math.PI, Math.PI * 2);
    this.box(lock, top + 13, 5, 5);
    this.px(lock + 2, top + 15);
  }

  // --- 401 Session expired: the pilot fell asleep and the time ran out ----------------

  sessionExpired() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const G = this.groundY();
    const t = this.time;
    // 8 s loop: the last grain falls, the alarm rings, the spider flees, the pilot slaps the clock quiet and sleeps on.
    const p = t % 8;
    this.moon(Math.round(W * 0.6), 10);
    this.stars(40, 11);
    this.cobweb();
    this.horizon();
    // A snail crossing the whole screen, behind the props: nothing else is in a hurry.
    this.outlined(this.frame(SNAIL, 0.5), ((t * 2.5) % (W + 20)) - 10, G - 5);

    // The ship parked on its pad for so long that spiders moved in.
    const pad = Math.round(W * 0.03);
    this.outlined(SHIP, pad + 8, G - 12);
    this.box(pad, G - 5, 27, 3);
    for (let x = pad + 3; x < pad + 27; x += 7) ctx.fillRect(x, G - 2, 1, 2);
    this.px(pad + (t % 2 < 1 ? 1 : 25), G - 6);
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
      const u = (t / 2 + k / 3) % 1;
      ctx.globalAlpha = 1 - u * 0.7;
      this.zee(crate + 7 + u * 8, G - 21 - u * 22, 4 + Math.floor(u * 3));
    }
    ctx.globalAlpha = 1;

    // The alarm clock beside the crate; without waking, the pilot reaches out and slaps it quiet.
    const clock = { x: crate + 13, y: G - 11 };
    this.alarmClock(clock.x, clock.y, p);
    // The hand goes up over the clock, then down on its bell; the alarm stops as it lands (p 4.45).
    const up = ease(p, 4.1, 4.3) - ease(p, 5, 5.3);
    const down = ease(p, 4.3, 4.45) - ease(p, 4.9, 5);
    if (up > 0) {
      const shoulder = { x: crate + 6, y: G - 9 };
      const raised = mixPoint(shoulder, { x: clock.x - 2, y: clock.y - 9 }, up);
      const hand = mixPoint(raised, { x: clock.x + 3, y: clock.y - 4 }, down);
      this.line(shoulder.x, shoulder.y, hand.x, hand.y);
      ctx.fillRect(Math.round(hand.x) - 1, Math.round(hand.y) - 1, 3, 2);
      if (p >= 4.45 && p < 4.65) for (const a of [-2.4, -1.57, -0.75]) this.px(hand.x + Math.cos(a) * 4, hand.y - 1 + Math.sin(a) * 4);
    }

    // The spider hangs from the web and dashes back up when the alarm goes off.
    const spider = 10;
    const drop = Math.round(11 + 23 * (ease(p, 0.2, 2.6) - ease(p, 2.8, 3.1)));
    ctx.globalAlpha = 0.6;
    ctx.fillRect(spider, 8, 1, drop - 8);
    ctx.globalAlpha = 1;
    this.drawSprite(this.frame(SPIDER, 0.4), spider - 2, drop);
    if (p >= 2.8 && p < 3.4) drawText(ctx, '!', spider + 4, drop - 2);

    this.hourglass(Math.round(W * 0.84), G, p);
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

  hourglass(cx, base, p) {
    const { ctx } = this;
    const top = base - 25;
    ctx.clearRect(cx - 5, top + 2, 11, 21);
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
    // The very last grain falls through the neck, just before the alarm.
    const fall = (p - 2.2) / 0.6;
    if (fall >= 0 && fall < 1) this.px(cx, mix(neck, glassBottom - 6, fall));
  }

  /** Alarm clock with two bells, standing at 00:00; it hops and rattles while it rings (p 2.8 to 4.45). */
  alarmClock(x, y, p) {
    const { ctx } = this;
    const t = this.time;
    const ringing = p >= 2.8 && p < 4.45;
    if (ringing) {
      x += Math.round(Math.sin(t * 60));
      y -= Math.floor(t * 20) % 2;
    }
    for (const bell of [x + 1, x + 15]) {
      ctx.fillRect(bell + 1, y - 2, 3, 1);
      ctx.fillRect(bell, y - 1, 5, 1);
      if (!ringing || t % 0.2 >= 0.1) continue;
      for (const a of [-2.5, -1.57, -0.65]) {
        this.line(bell + 2 + Math.cos(a) * 3, y - 2 + Math.sin(a) * 3, bell + 2 + Math.cos(a) * 4.5, y - 2 + Math.sin(a) * 4.5);
      }
    }
    this.box(x, y, 21, 9);
    ctx.fillRect(x + 2, y + 9, 2, 2);
    ctx.fillRect(x + 17, y + 9, 2, 2);
    if (p < 4.45 || t % 1 < 0.5) {
      drawText(ctx, '00', x + 2, y + 2);
      ctx.fillRect(x + 10, y + 3, 1, 1);
      ctx.fillRect(x + 10, y + 5, 1, 1);
      drawText(ctx, '00', x + 12, y + 2);
    }
  }

  // --- 401 Login required: a checkpoint scans the ship and finds no pilot -------------

  /**
   * 6 s loop: the drone scans the waiting ship and types NO ID, the guard asks for
   * the pilot's ID, the ship dashes for the fence anyway, gets zapped and spins back.
   */
  checkpoint() {
    const { width: W, height: H } = this.canvas;
    const p = this.time % 6;
    const fence = Math.round(W * 0.33);
    const rest = Math.round(W * 0.08);
    const touch = fence - 1 - SHIP[0].length;
    const x = Math.round(p < 3.45 ? mix(rest, touch, ease(p, 3, 3.35)) : mix(touch, rest, ease(p, 3.45, 4.3)));
    return { p, fence, rest, x, y: Math.round(H * 0.44 + Math.sin(this.time * 1.3) * 2) };
  }

  loginRequired() {
    const { ctx, canvas } = this;
    const G = this.groundY();
    const t = this.time;
    const { p, fence, rest, x, y } = this.checkpoint();
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

    // Zapped, the ship spins back to where it waited, with a "!".
    if (p >= 3.45 && p < 4) {
      const sprite = SHIP_TURNS[Math.floor((p - 3.45) / 0.07) % 4];
      this.drawSprite(sprite, x + 5 - (sprite[0].length >> 1), y + 3 - (sprite.length >> 1));
    } else {
      this.drawSprite(SHIP, x, y);
      this.flame(x, y);
    }
    if (p >= 3.35 && p < 4.1) {
      ctx.clearRect(x + 3, y - 9, 5, 7);
      drawText(ctx, '!', x + 4, y - 8);
    }

    // The scanner drone hovers where the ship waits: a beam sweeps the ship, then its screen types NO ID.
    const drone = { x: rest - 8, y: Math.round(this.canvas.height * 0.44) - 20 + Math.round(Math.sin(t * 2)) };
    const lens = this.scanner(drone.x, drone.y, p);
    if (p >= 0.4 && p < 1.8) {
      ctx.globalAlpha = 0.3;
      this.line(lens.x, lens.y, x - 1, y + 7);
      this.line(lens.x, lens.y, x + 11, y + 7);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x - 1, Math.round(y - 1 + (Math.sin(t * 5) + 1) * 4), 13, 1);
      ctx.globalAlpha = 1;
    }

    // The guard robot at its booth, stop sign up; its speech bubble's tail sits on its head.
    const gx = Math.round(canvas.width * 0.78);
    const gy = G - 15;
    this.booth(Math.round(canvas.width * 0.86), G);
    this.guard(gx, gy);
    const ask = p >= 2.2 && p < 3.8 ? 'PILOT ID?' : p >= 4.4 ? 'LOG IN' : '';
    if (ask) this.bubble(ask, gx - 4, gy - 24, gx + 6, 15);
  }

  /** A flying screen with two rotors and a lens below: blank cursor, a scan bar, then NO ID typed out. Returns the lens. */
  scanner(x, y, p) {
    const { ctx } = this;
    const t = this.time;
    const text = 'NO ID';
    const w = textWidth(text) + 8;
    const blade = Math.floor(t * 12) % 2 ? 2 : 1;
    for (const rotor of [x + 4, x + w - 5]) {
      ctx.fillRect(rotor, y - 2, 1, 2);
      ctx.fillRect(rotor - blade, y - 3, blade * 2 + 1, 1);
    }
    this.box(x, y, w, FONT_H + 4);
    const lens = { x: x + (w >> 1), y: y + FONT_H + 5 };
    ctx.fillRect(lens.x - 1, lens.y - 1, 3, 1);
    this.px(lens.x, lens.y);
    if (p >= 0.4 && p < 1.8) {
      ctx.fillRect(x + 2, y + 3, Math.round((w - 4) * ease(p, 0.4, 1.7)), FONT_H - 2);
      return lens;
    }
    const typed = clamp(Math.floor((p - 1.9) / 0.16), 0, text.length);
    drawText(ctx, text.slice(0, typed), x + 2, y + 2);
    if ((p >= 1.9 && typed < text.length) || t % 0.8 < 0.4) ctx.fillRect(x + 2 + textWidth(text.slice(0, typed)) + (typed ? 1 : 0), y + 2, 3, FONT_H);
    return lens;
  }

  loginRequiredTick() {
    const { fence, y } = this.checkpoint();
    if (this.every(6, 3.35)) this.sparks(fence, y + 3, 12, 45, 40);
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

  // --- 400 Bad request: we are the inspector; a pilot's flight record gets stamped --

  /** The booth: the counter ledge under the window, the middle, the record's spot on the desk. */
  booth() {
    const { width: W, height: H } = this.canvas;
    const ledge = H - 33;
    const cx = Math.round(W / 2);
    return { W, H, ledge, cx, record: { x: cx - 22, y: ledge + 7 } };
  }

  scoreRejected() {
    const { ctx } = this;
    const t = this.time;
    const p = t % BOOTH.loop;
    const b = this.booth();
    const { W, H, ledge, cx } = b;
    const shake = p >= BOOTH.stamp && p < BOOTH.stamp + 0.15 ? Math.round(Math.sin(t * 80)) : 0;
    ctx.save();
    ctx.translate(shake, 0);

    this.boothView(b, p);
    this.boothPilot(b, p, Math.floor(t / BOOTH.loop) % 3);

    // The booth itself: roof beam with rivets, pillars, the counter ledge with its slot.
    ctx.fillRect(0, 0, W, 3);
    this.lit(() => {
      for (let x = 5; x < W; x += 10) ctx.fillRect(x, 1, 1, 1);
    });
    for (const x of [0, W - 4]) {
      this.box(x, 0, 4, ledge);
      this.ditherWhere(x + 1, 3, x + 2, ledge - 1, () => true);
    }
    ctx.fillRect(0, ledge, W, 1);
    this.ditherWhere(0, ledge + 1, W, ledge + 2, () => true);
    ctx.fillRect(0, ledge + 3, W, 1);
    ctx.fillRect(cx - 12, ledge + 1, 25, 2);

    // Our desk: grain, a coffee mug, the ink pad.
    ctx.globalAlpha = 0.25;
    for (const [y, from, to] of [[ledge + 9, 6, 40], [ledge + 17, 24, 52], [ledge + 26, 4, 30], [ledge + 13, W - 60, W - 50]]) {
      for (let x = from; x < to; x += 2) this.px(x, y);
    }
    ctx.globalAlpha = 1;
    this.mug(9, H - 18);
    this.box(W - 47, H - 11, 42, 8);
    this.ditherWhere(W - 46, H - 10, W - 7, H - 5, () => true);

    // The record slides out of the slot, waits on the desk, and goes back.
    const y = this.recordY(b, p);
    if (y !== null) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, ledge + 4, W, H);
      ctx.clip();
      this.flightLog(b.record.x, y, p);
      ctx.restore();
    }

    this.rubberStamp(b, p);
    ctx.restore();
  }

  scoreRejectedTick() {
    if (this.every(BOOTH.loop, BOOTH.stamp)) {
      const { cx, record } = this.booth();
      this.shockWaves.push({ x: cx + 1, y: record.y + 10, life: 0.35 });
      this.sparks(cx + 1, record.y + 19, 10, 35, 80);
    }
  }

  /** The record's top on the desk at loop time p, or null while the pilot has it. */
  recordY({ ledge, record }, p) {
    const hidden = ledge + 4 - 22;
    if (p < 2.1 || p >= 5) return null;
    if (p < 2.5) return Math.round(mix(hidden, record.y, ease(p, 2.1, 2.5)));
    if (p >= 4.6) return Math.round(mix(record.y, hidden, ease(p, 4.6, 5)));
    return record.y;
  }

  /** Outside the glass: stars, the landing field, the queue of pilots waiting their turn. */
  boothView({ W, ledge }, p) {
    const { ctx } = this;
    const t = this.time;
    for (let i = 0; i < 16; i++) {
      if ((t + hash(i + 0.3) * 9) % 3 < 0.3) continue;
      ctx.globalAlpha = hash(i + 0.7) < 0.2 ? 0.8 : 0.4;
      this.px(6 + hash(i + 0.1) * (W - 12), 6 + hash(i + 0.5) * (ledge - 20));
    }
    const horizon = ledge - 10;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(4, horizon, W - 8, 1);
    this.ditherWhere(4, horizon + 2, W - 5, ledge - 1, () => true);
    ctx.globalAlpha = 1;
    for (let x = 24; x < W - 8; x += 22) if ((t * 2 + x / 22) % 2 < 1) this.px(x, horizon - 1);

    // Each time a pilot is done, the queue shuffles one step forward.
    const step = 7 * ease(p, BOOTH.loop - 1.4, BOOTH.loop - 0.6);
    ctx.globalAlpha = 0.6;
    for (let k = -1; k < 4; k++) {
      const x = 6 + k * 7 + step;
      if (x >= 5 && x <= 33) this.drawSprite(TINY_PILOT, x, horizon - 4);
    }
    ctx.globalAlpha = 1;
    // Glare on the glass.
    ctx.globalAlpha = 0.15;
    this.line(W - 40, 5, W - 58, 23);
    this.line(W - 34, 5, W - 46, 17);
    ctx.globalAlpha = 1;
  }

  /**
   * The pilot at the window: walks up hopeful, hands the record in, sweats while
   * it is checked, flinches at the stamp, takes it back and walks off sad.
   * `look` picks the helmet, so each loop brings a different pilot.
   */
  boothPilot({ W, ledge, cx }, p, look) {
    const { ctx } = this;
    const t = this.time;
    if (p >= 7.4) return;
    const leaving = p >= 5.4;
    const walking = p < 1.8 || leaving;
    let x = cx;
    if (p < 1.8) x = mix(-14, cx, p / 1.8);
    if (leaving) x = mix(cx, W + 14, (p - 5.4) / 2);
    const mood = p < 1.8 ? 'calm' : p < 2.5 ? 'hopeful' : p < BOOTH.stamp ? 'nervous' : p < 4.6 ? 'shocked' : 'sad';
    // Drawn at twice the size: the pilot stands right at the glass, close to us.
    const left = Math.round(x) - 21;
    const top = ledge - PILOT_BUST.length * 2 + (walking && Math.floor(t * (leaving ? 4 : 6)) % 2 ? 1 : 0) + (mood === 'sad' ? 2 : 0);
    this.shaded(PILOT_BUST, left, top, 2);

    // Three different helmets: an antenna, a fin, a lamp.
    if (look === 0) {
      ctx.fillRect(left + 20, top - 5, 2, 5);
      if (t % 1 < 0.5) ctx.fillRect(left + 19, top - 8, 4, 3);
    } else if (look === 1) {
      ctx.fillRect(left + 14, top - 2, 14, 2);
      ctx.fillRect(left + 17, top - 4, 8, 2);
    } else {
      this.box(left + 16, top - 4, 10, 5);
      if (t % 0.6 < 0.3) ctx.fillRect(left + 19, top - 2, 4, 1);
    }
    for (const [dx, dy] of BOOTH_EYES[mood]) ctx.fillRect(left + dx * 2, top + dy * 2, 2, 2);
    if (mood === 'nervous' && t % 0.8 < 0.6) this.outlined(['.#.', '###', '###', '.#.'], left + 36, top + 6 + Math.floor((t % 0.8) * 6));
    if (mood === 'shocked' && p < BOOTH.stamp + 0.5) {
      ctx.clearRect(left + 29, top - 8, 5, 7);
      drawText(ctx, '!', left + 30, top - 7);
    }
    // The record in both gloves: held up, pushed down into the slot (the ledge hides
    // it, then it slides out on our desk), and later popped back up and carried off.
    const chest = top + 26;
    let sheet = null;
    if (p < 1.6) sheet = chest;
    else if (p < 2.1) sheet = mix(chest, ledge + 2, ease(p, 1.6, 2.1));
    else if (p >= 4.95 && p < 5.4) sheet = mix(ledge + 2, chest, ease(p, 4.95, 5.4));
    else if (leaving) sheet = chest;
    if (sheet !== null) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, ledge);
      ctx.clip();
      const sx = left + 16;
      const sy = Math.round(sheet);
      this.box(sx, sy, 11, 13);
      ctx.fillRect(sx + 2, sy + 3, 7, 1);
      ctx.fillRect(sx + 2, sy + 6, 5, 1);
      ctx.fillRect(sx + 2, sy + 9, 6, 1);
      this.shaded(GLOVE, sx - 3, sy + 5);
      this.shaded(GLOVE, sx + 9, sy + 5);
      ctx.restore();
    }
  }

  /** The flight record on the desk: portrait, lines, a garbled score field, a signature; stamped after the slam. */
  flightLog(x, y, p) {
    const { ctx } = this;
    const t = this.time;
    this.box(x, y, 44, 22);
    ctx.fillRect(x + 1, y + 1, 42, 2);
    this.box(x + 3, y + 5, 11, 12);
    this.drawSprite(PILOT_HEAD, x + 5, y + 6);
    ctx.fillRect(x + 5, y + 13, 7, 3);
    ctx.fillRect(x + 17, y + 6, 22, 1);
    ctx.fillRect(x + 17, y + 9, 15, 1);
    // The score field: digits that never settle, the reason it is rejected.
    this.box(x + 17, y + 12, 22, 7);
    for (let i = 0; i < 18; i++) if (hash(Math.floor(t * 8) * 1.7 + i) > 0.5) this.px(x + 19 + (i % 6) * 3 + (i % 2), y + 14 + Math.floor(i / 6));
    for (let i = 0; i < 10; i++) this.px(x + 3 + i, y + 19 + (i % 3 === 1 ? -1 : 0));
    // While it is checked, marching ants circle the bad field.
    if (p >= 2.6 && p < BOOTH.stamp) {
      for (let i = 0; i < 2 * (26 + 11); i++) {
        if ((i + Math.floor(t * 12)) % 3) continue;
        const side = i < 26 ? [x + 15 + i, y + 10] : i < 37 ? [x + 41, y + 10 + i - 26] : i < 63 ? [x + 41 - (i - 37), y + 21] : [x + 15, y + 21 - (i - 63)];
        this.px(side[0], side[1]);
      }
    }
    if (p >= BOOTH.stamp + 0.03) this.imprint(x + 5, y + 2);
  }

  /** The stamp's mark: INVALID REQUEST in a double frame, worn where the rubber missed. */
  imprint(x, y) {
    const { ctx } = this;
    ctx.clearRect(x, y, 35, 18);
    this.frameRect(x, y, 35, 18);
    this.frameRect(x + 2, y + 2, 31, 14);
    drawText(ctx, 'INVALID', x + 4, y + 4);
    drawText(ctx, 'REQUEST', x + 4, y + 10);
    for (let dy = 0; dy < 18; dy++) {
      for (let dx = 0; dx < 35; dx++) if (hash(dx * 3.7 + dy * 11.3) < 0.035) ctx.clearRect(x + dx, y + dy, 1, 1);
    }
  }

  /**
   * Our hand on the big rubber stamp: it rests on the ink pad, lifts over the
   * record, winds up, slams (the whole view shakes) and goes back.
   */
  rubberStamp({ W, H, cx, record }, p) {
    const { ctx } = this;
    const rest = { x: W - 26, y: H - 11 };
    const over = { x: cx + 1, y: record.y - 7 };
    const down = record.y + 20;
    let at = rest;
    if (p >= 3.2 && p < 3.55) at = mixPoint(rest, over, ease(p, 3.2, 3.55));
    else if (p >= 3.55 && p < 3.7) at = { x: over.x, y: over.y - Math.round(4 * ease(p, 3.55, 3.7)) };
    else if (p >= 3.7 && p < BOOTH.stamp) at = { x: over.x, y: mix(over.y - 4, down, (p - 3.7) / (BOOTH.stamp - 3.7)) };
    else if (p >= BOOTH.stamp && p < 3.95) at = { x: over.x, y: down };
    else if (p >= 3.95 && p < 4.2) at = { x: over.x, y: mix(down, over.y, ease(p, 3.95, 4.2)) };
    else if (p >= 4.2 && p < 4.6) at = mixPoint(over, rest, ease(p, 4.2, 4.6));
    const x = Math.round(at.x);
    const y = Math.round(at.y);

    // Sleeve from the bottom-right corner: dithered cloth with a hard edge.
    const elbow = [W + 10, H + 12];
    const wrist = [x + 5, y - 14];
    this.shape(Math.round((x + W) / 2), Math.round((y + H) / 2), 0, Math.round(Math.max(W - x, H - y) / 2) + 12, (_, __, sx, sy) => {
      const d = segmentDist(sx, sy, elbow, wrist, 4);
      if (d > 0) return null;
      if (d > -1) return 'ink';
      return ((sx + sy) & 1) === 0 ? 'ink' : 'clear';
    });
    // The stamp: rubber block, neck, knob, and the fist round the knob.
    ctx.clearRect(x - 19, y - 8, 39, 9);
    ctx.fillRect(x - 18, y - 7, 37, 5);
    this.lit(() => ctx.fillRect(x - 17, y - 5, 35, 1));
    ctx.fillRect(x - 17, y - 1, 35, 1);
    this.box(x - 2, y - 12, 5, 6);
    this.shaded(FIST, x - 4, y - 17);
  }

  /** A coffee mug on the desk, steam curling up from it. */
  mug(x, y) {
    const { ctx } = this;
    const t = this.time;
    this.box(x, y, 9, 10);
    ctx.fillRect(x + 1, y + 2, 7, 1);
    this.ring(x + 9, y + 5, 2, 1, -Math.PI / 2, Math.PI / 2);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.7 - i * 0.1;
        this.px(x + 3 + k * 3 + Math.sin(t * 3 + i * 0.9 + k * 2) * 1.5, y - 2 - i * 2 - Math.floor((t * 4) % 2));
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- 409 Score conflict: three identical pilots, each says another is the copy -----

  scoreConflict() {
    const { ctx } = this;
    const t = this.time;
    const W = this.canvas.width;
    const G = this.groundY();
    this.stars(30, 13);
    this.horizon();
    const p = t % CONFLICT_LOOP;
    const left = Math.round(W * 0.7);
    // A accuses B, B accuses A, C joins in, it heats up; then the docked ship
    // flashes its lights and all three stop and stare at it.
    const flash = p >= 5 && p < 6.2 && p % 0.4 < 0.2;
    this.dockStation({ x: left, y: 6, w: W - 3 - left, h: 24 }, G, flash);

    const fury = p >= 3 && p < 5;
    const stare = p >= 5.1 && p < 7.4;
    const glance = p >= 2.4 && p < 2.9;
    const stomp = (k) => (fury && (t * 2.5 + k / 3) % 1 < 0.3 ? 1 : 0);
    const xs = [left - 5, left + 15, W - 13];
    const a = this.standingPilot(xs[0], G - stomp(0), stare ? -1 : 1, 'wide', 1);
    const b = this.standingPilot(xs[1], G - stomp(1), glance ? 1 : -1, 'straight', 0);
    const c = this.standingPilot(xs[2], G - stomp(2), -1, 'step', 1);
    // Who points at whom and from when; the arms aim at different heights, so they never meet.
    const arms = [
      [a, p >= 0.4, () => b(3, 0)],
      [b, p >= 1.2 && !glance, () => a(4, 9)],
      [c, p >= 2.2, () => b(3, 1)],
    ];
    arms.forEach(([who, points, target], k) => {
      const hands = [who(0, 8), who(0, 9)];
      if (points && p < 5.1) this.pointAt(who(5, 7), target(), 5 + (fury ? (Math.floor(t * 8) + k) % 2 : 0));
      else hands.push(who(6, 8), who(6, 9));
      for (const { x, y } of hands) this.px(x, y);
    });

    const marks = [
      p >= 0.4 && p < 5 && '!',
      (glance || (p >= 2.9 && p < 3)) ? '?' : p >= 1.2 && p < 5 && '!',
      p >= 2.2 && p < 5 && '!',
    ];
    [a(4, -7), b(3, -7), c(4, -7)].forEach((mark, k) => {
      const text = p >= 5.3 && p < 7.4 ? '?' : marks[k];
      if (!text) return;
      ctx.clearRect(mark.x - 2, mark.y - 1, 5, 7);
      drawText(ctx, text, mark.x - 1, mark.y);
    });
  }

  /**
   * The standing pilot with feet at `G`, facing right (`face` 1) or left (-1).
   * Returns a map from the right-facing sprite's pixels to the screen, for the arms.
   */
  standingPilot(x, G, face, legs, lean) {
    const pose = pilotPose(legs, lean);
    const top = G - pose.length;
    this.outlined(face > 0 ? pose : flip(pose), x, top);
    return (lx, ly) => ({ x: face > 0 ? x + lx : x + 7 - lx, y: top + ly });
  }

  /** An arm from the shoulder `length` pixels towards `target`, finger out. */
  pointAt(shoulder, target, length) {
    const d = Math.hypot(target.x - shoulder.x, target.y - shoulder.y);
    const hand = { x: shoulder.x + ((target.x - shoulder.x) / d) * length, y: shoulder.y + ((target.y - shoulder.y) / d) * length };
    this.bar(shoulder, hand, 1, true);
    this.line(shoulder.x, shoulder.y, hand.x, hand.y);
    this.ctx.fillRect(Math.round(hand.x) - (hand.x < shoulder.x ? 1 : 0), Math.round(hand.y), 2, 1);
  }

  /** The docking station on a pylon: solar wing, slot display 08, one ship docked; `flash` = its lights. */
  dockStation({ x, y, w, h }, G, flash) {
    const { ctx } = this;
    const t = this.time;
    // One faint pylon to the ground, in the gap between the second and third pilot.
    const lx = x + 26;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(lx, y + h, 1, G - y - h);
    ctx.fillRect(lx + 3, y + h, 1, G - y - h);
    for (let ly = y + h; ly + 3 < G; ly += 6) this.line(lx, ly, lx + 3, ly + 3);
    ctx.globalAlpha = 1;
    // Solar wing along the top strip.
    ctx.fillRect(x - 45, y + 2, 45, 1);
    for (let i = 0; i < 5; i++) {
      this.box(x - 45 + i * 9, y - 2, 8, 9);
      ctx.fillRect(x - 45 + i * 9, y + 2, 8, 1);
      ctx.fillRect(x - 41 + i * 9, y - 2, 1, 9);
    }
    // Hull: windows, a hangar door with hazard stripes, the slot display.
    this.box(x, y, w, h);
    for (let wx = x + 3; wx < x + w - 3; wx += 4) ctx.fillRect(wx, y + 2, 2, 2);
    ctx.fillRect(x + 1, y + 5, w - 2, 1);
    this.box(x + 2, y + 8, w - 23, h - 10);
    ctx.fillRect(x + 2 + Math.floor((w - 23) / 2), y + 8, 1, h - 14);
    for (let sx = x + 2; sx < x + w - 21; sx += 3) this.line(sx, y + h - 3, Math.min(sx + 5, x + w - 22), y + h - 3 - Math.min(5, x + w - 22 - sx));
    this.box(x + w - 19, y + 7, 17, 13);
    drawNumber(ctx, 8, 2, x + w - 4, y + 9);
    ctx.fillRect(x + w - 8, y - 5, 1, 5);
    if (t % 1 < 0.5) this.px(x + w - 8, y - 6);
    // The docking port and the one ship in it, clamped.
    const ship = { x: x - 14, y: y + 14 };
    this.box(x - 3, ship.y - 1, 4, 9);
    this.outlined(SHIP, ship.x, ship.y);
    ctx.fillRect(x - 5, ship.y - 1, 2, 1);
    ctx.fillRect(x - 5, ship.y + 7, 2, 1);
    if ((t + 0.5) % 1 < 0.5) this.px(x - 2, ship.y - 3);
    // Its lights flash: short rays all round it, a pixel clear of the hull.
    const rays = [[-3, 3, -5, 3], [-2, 0, -3, -1], [-2, 6, -3, 7], [5, -2, 5, -4]];
    if (flash) for (const [x0, y0, x1, y1] of rays) this.line(ship.x + x0, ship.y + y0, ship.x + x1, ship.y + y1);
  }

  // --- 429 Rate limited: a queue of ships snakes into a planet's landing port -------

  /** The planet on the right, cut off by the edge, and its port on the left rim. */
  bigPlanet() {
    const W = this.canvas.width;
    const y = Math.round(this.groundY() * 0.54);
    return { x: W + 6, y, r: 44, port: { x: W - 38, y } };
  }

  /** The queue's S: in from the left edge, down the left side, along the bottom, up and into the port. */
  queuePath() {
    const G = this.groundY();
    const { port } = this.bigPlanet();
    // The climb runs just right of the error panel, then turns into the hatch.
    const climb = port.x - 13;
    const corners = [{ x: -20, y: 15 }, { x: 44, y: 15 }, { x: 44, y: G - 9 }, { x: climb, y: G - 9 }, { x: climb, y: port.y }, { x: port.x - 3, y: port.y }];
    const pts = [corners[0]];
    for (let i = 1; i < corners.length - 1; i++) {
      const from = mixPoint(corners[i - 1], corners[i], 0.5);
      const to = mixPoint(corners[i], corners[i + 1], 0.5);
      for (let k = i === 1 ? 0 : 1; k <= 24; k++) pts.push(bezier(from, corners[i], to, k / 24));
    }
    pts.push(corners.at(-1));
    let length = 0;
    const lengths = pts.map((p, i) => (length += i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0));
    return { pts, lengths, length };
  }

  /** Point `s` pixels along the queue path, and which way the path runs there. */
  along({ pts, lengths }, s) {
    const i = clamp(lengths.findIndex((l) => l >= s), 1, pts.length - 1);
    const a = pts[i - 1];
    const b = pts[i];
    const u = clamp((s - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1), 0, 1);
    return { ...mixPoint(a, b, u), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  /**
   * The ships from the back of the queue (at the left edge) to the front; the
   * second from the back is the player. Each loop the hatch opens a crack, the
   * queue inches up, the hatch slams and the bump runs back down the line.
   * `hit` is when the bump reaches a ship.
   */
  queue() {
    const path = this.queuePath();
    const p = this.time % RATE_LOOP;
    const ships = [];
    let end = 4;
    for (let k = 0; ; k++) {
      const turned = k === 1 ? SHIP_TURNS : QUEUE[k % QUEUE.length];
      const length = turned[0][0].length;
      if (end + length > path.length - 4) break;
      ships.push({ k, turned, length, s: end + length / 2 });
      end += length + 4;
    }
    // The spare length goes into the gaps, so the front ship waits nose to the hatch.
    const spare = (path.length - end) / (ships.length - 1);
    for (const ship of ships) {
      ship.s += ship.k * spare;
      const back = ships.length - 1 - ship.k;
      // Facing comes from the resting place, so a ship on a bend does not flip while it inches.
      const facing = (((Math.round(this.along(path, ship.s).angle / (Math.PI / 2)) % 4) + 4) % 4);
      ship.hit = 3 + back * 0.12;
      // Each ship moves back only once the one in front has knocked into it.
      ship.s += 4 * (ease(p, 2.2 + back * 0.03, 2.5 + back * 0.03) - ease(p, ship.hit, ship.hit + 0.12));
      ship.nudge = ship.k === 1 && ((p >= 5.6 && p < 5.95) || (p >= 6.4 && p < 6.75));
      if (ship.nudge) ship.s += 3 * Math.sin(Math.PI * (((p - 5.6) % 0.8) / 0.35));
      Object.assign(ship, this.along(path, ship.s), { sprite: ship.turned[facing] });
    }
    return { path, ships };
  }

  rateLimited() {
    const { ctx } = this;
    const t = this.time;
    const planet = this.bigPlanet();
    this.stars(24, 17);
    this.planetDisc(planet);
    this.horizon();
    this.landingPort(planet.port);

    const p = t % RATE_LOOP;
    const { path, ships } = this.queue();
    for (const ship of ships) {
      const { sprite, x, y, k } = ship;
      // Exhaust puffs behind the tail, a big one when the player nudges.
      const u = (t * 0.8 + k * 0.37) % 1;
      if (ship.nudge || u < 0.4) {
        const tail = this.along(path, ship.s - ship.length / 2 - 2 - u * 4);
        ctx.globalAlpha = 0.5 * (1 - u);
        this.ring(tail.x, tail.y, ship.nudge ? 2 : 1, 1);
        ctx.globalAlpha = 1;
      }
      const left = x - sprite[0].length / 2;
      const top = y - sprite.length / 2;
      this.outlined(sprite, left, top);
      // The player is knocked by the bump and gets impatient.
      if (k === 1 && p >= ship.hit && p < 6.8) {
        ctx.clearRect(x - 2, top - 8, 5, 7);
        drawText(ctx, '!', x - 1, top - 7);
      }
      // One pilot sleeps through all of it.
      if (k === SLEEPER) {
        const z = (t * 0.6) % 1;
        ctx.globalAlpha = 1 - z * 0.6;
        this.zee(x - 9 - z * 3, top - z * 5, 4);
        this.zee(x - 15 - z * 3, top - 7 - z * 5, 5);
        ctx.globalAlpha = 1;
      }
    }
  }

  rateLimitedTick() {
    const { port } = this.bigPlanet();
    // The front ship hits the slammed hatch; the player knocks into the ship in front.
    if (this.every(RATE_LOOP, 3)) this.sparks(port.x - 3, port.y, 6, 30, 40);
    if (this.every(RATE_LOOP, 5.77) || this.every(RATE_LOOP, 6.57)) {
      const { path, ships } = this.queue();
      const nose = this.along(path, ships[1].s + ships[1].length / 2 + 1);
      this.sparks(nose.x, nose.y, 4, 25, 40);
    }
  }

  /** Big planet: dithered night side, craters, an outline; only its left part is on screen. */
  planetDisc({ x: cx, y: cy, r }) {
    const { ctx } = this;
    const W = this.canvas.width;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        ctx.clearRect(x, y, 1, 1);
        const shade = Math.hypot(x - (cx - r * 0.6), y - (cy - r * 0.6)) / r;
        if (d > r - 1 || shade > 1.5 || (shade > 1.15 && ((x + y) & 1) === 0)) this.px(x, y);
      }
    }
    // Craters: a rim with its shadow side dithered.
    for (const [ex, ey, rx, ry] of [[-31, -14, 4, 3], [-15, -27, 4, 2], [-27, 25, 3, 2], [-12, -6, 3, 2]]) {
      const ox = cx + ex;
      const oy = cy + ey;
      this.ditherWhere(ox - rx, oy - ry, ox + rx, oy, (px, py) => ((px - ox) / rx) ** 2 + ((py - oy) / ry) ** 2 <= 1);
      for (let a = 0; a < Math.PI * 2; a += 0.3) this.px(ox + Math.cos(a) * rx, oy + Math.sin(a) * ry);
    }
  }

  /** The port: a hatch on the rim, a signal lamp on top holding the queue, the counter stuck at 999 below. */
  landingPort({ x, y }) {
    const { ctx } = this;
    const t = this.time;
    const p = t % RATE_LOOP;
    // The hatch door lifts a crack (dark inside), then slams shut.
    const crack = Math.round(3 * (ease(p, 2, 2.3) - ease(p, 2.8, 2.9)));
    this.box(x - 2, y - 6, 8, 13);
    this.ditherWhere(x, y - 4, x + 3, y + 4 - crack, () => true);
    ctx.fillRect(x, y + 5 - crack, 4, crack);
    for (const dy of [-8, 8]) if ((t + (dy > 0 ? 0.3 : 0)) % 0.6 < 0.3) ctx.fillRect(x, y + dy, 2, 1);

    // Signal lamp on a mast: top lit, the bottom one only while the hatch opens.
    const lamp = { x: x - 1, y: y - 31 };
    const go = p >= 2 && p < 2.8;
    ctx.fillRect(lamp.x + 3, lamp.y + 15, 1, 10);
    this.box(lamp.x, lamp.y, 7, 15);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i === (go ? 2 : 0) ? 1 : GHOST_ALPHA * 2;
      ctx.fillRect(lamp.x + 2, lamp.y + 2 + i * 4, 3, 3);
    }
    ctx.globalAlpha = 1;

    // Queue counter on a bracket under the hatch, overflowed: a ghost digit in front, 999 blinking.
    const counter = { x: x + 4, y: y + 10 };
    ctx.fillRect(counter.x, y + 7, 1, 3);
    this.box(counter.x, counter.y, 32, 13);
    drawNumber(ctx, t % 1 < 0.7 ? ' 999' : '    ', 4, counter.x + 30, counter.y + 2);
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

  // --- 503 Leaderboard offline: the score database is on fire ------------------------

  /** The data-centre module on the right: walls from `roof` down to the ground. */
  dataCenter() {
    const W = this.canvas.width;
    const G = this.groundY();
    const x = W - 55;
    return { x, roof: G - 58, w: 48, racks: G - 30, fire: x + 34, db: { x: x - 12, top: G - 13 } };
  }

  /**
   * The 8 s story: the robot's water shrinks the fire, the fire flares up and
   * knocks the robot onto its back (legs up, dizzy), it sits up, its helmet
   * lands back on its head, and it walks back and sprays again.
   */
  firefight() {
    const p = this.time % FIRE_LOOP;
    return {
      p,
      size: 2.4 - 1.1 * ease(p, 0.3, 3.6) + 1.9 * ease(p, 3.75, 3.95) - 0.8 * ease(p, 4.4, 6),
      back: ease(p, 3.8, 4.1) - ease(p, 6, 6.6),
      down: p >= 4.05 && p < 5.8,
      helmetOn: p < 3.85 || p >= 5.3,
      spraying: p < 3.8 || p >= 6.8,
    };
  }

  leaderboardOffline() {
    const { ctx } = this;
    const t = this.time;
    const G = this.groundY();
    const m = this.dataCenter();
    const f = this.firefight();
    this.stars(26, 23);
    this.horizon();

    // A thick column of smoke rolling up off the screen.
    for (let k = 0; k < 8; k++) {
      const u = (t * 0.2 + k / 8) % 1;
      const cx = m.fire + Math.sin(u * 4 + k) * 3 + u * 8;
      const cy = m.roof - 8 - u * (m.roof + 4);
      const r = 4 + u * 5;
      this.ditherWhere(cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r);
    }

    // The module: roof slab, walls, the HI SCORE monitor with dead digits (it rolls in the flare-up).
    this.box(m.x, m.roof, m.w, G - m.roof + 1);
    ctx.fillRect(m.x - 2, m.roof, m.w + 4, 3);
    this.box(m.x + 4, m.roof + 5, 40, 21);
    drawText(ctx, 'HI SCORE', m.x + 4 + Math.round((40 - textWidth('HI SCORE')) / 2), m.roof + 8);
    drawNumber(ctx, '     ', 5, m.x + 42, m.roof + 15);
    if (f.p > 3.8 && f.p < 4.1) ctx.fillRect(m.x + 5, m.roof + 6 + Math.floor((f.p - 3.8) * 63), 38, 1);
    for (let i = 0; i < 3; i++) this.rack(m.x + 3 + i * 14, m.racks, G, i === 2);
    // Patch cables sagging from the first rack to the second.
    for (const y of [m.racks + 6, m.racks + 17]) {
      const from = { x: m.x + 12, y };
      const to = { x: m.x + 17, y: y + 1 };
      let prev = from;
      for (let k = 1; k <= 6; k++) {
        const p = bezier(from, { x: m.x + 14.5, y: y + 7 }, to, k / 6);
        this.line(prev.x, prev.y, p.x, p.y);
        prev = p;
      }
    }

    this.blaze(FLAMES[Math.floor(t * 8) % 3], m.fire, m.roof, f.size);
    this.beacon(m.x + 47, m.roof - 1, true);
    this.database(m.db.x, m.db.top, G);
    this.firefighter(m, f);
  }

  leaderboardOfflineTick() {
    const m = this.dataCenter();
    const { size } = this.firefight();
    if (this.every(0.3)) this.sparks(m.x + 35, m.racks + 20, 3, 25, 80);
    if (this.every(0.2)) this.sparks(m.fire + (Math.random() - 0.5) * 8 * size, m.roof - 5 * size, 2, 20, -30);
    if (this.every(FIRE_LOOP, 3.85)) this.sparks(m.fire, m.roof - 10, 14, 55, 40);
    if (this.every(0.9, 0.4)) this.sparks(m.db.x, m.db.top, 4, 25, 60);
  }

  /** A FLAMES frame `scale` times its size (any scale, so it can grow smoothly), standing on `base`. */
  blaze(sprite, cx, base, scale) {
    const { ctx } = this;
    const w = sprite[0].length;
    const h = sprite.length;
    const at = (i, n, origin) => Math.round(origin + (i - n) * scale);
    sprite.forEach((row, dy) => {
      const y0 = at(dy, h, base);
      const y1 = at(dy + 1, h, base);
      for (let dx = 0; dx < w; dx++) {
        if (row[dx] === '.') continue;
        const x0 = at(dx, w / 2, cx);
        const x1 = at(dx + 1, w / 2, cx);
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
        if (row[dx] === '#' || (dx + dy) % 2 === 0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    });
  }

  /** Rotating alarm beacon standing on (x, y), sweeping three rays round; a ghost lamp when off. */
  beacon(x, y, on) {
    const { ctx } = this;
    const sweep = on ? Math.round(Math.cos(this.time * 5) * 10) : 0;
    if (on && Math.abs(sweep) >= 3) {
      const from = { x: x + Math.sign(sweep) * 2, y: y - 2 };
      const ends = [-0.7, -0.3, 0.1].map((slope) => ({ x: x + sweep, y: from.y + Math.abs(sweep) * slope }));
      // A light rim, so the rays also show over smoke and fire.
      for (const end of ends) this.bar(from, end, 1, true);
      for (const end of ends) this.line(from.x, from.y, end.x, end.y);
    } else if (on) {
      // Facing us: a short glint all round.
      for (const [dx, dy] of [[-4, 0], [4, 0], [-3, -3], [3, -3], [0, -5]]) this.line(x + dx, y - 2 + dy, x + dx * 1.3, y - 2 + dy * 1.3);
    }
    this.shaded(on ? ['..#..', '.###.', '.###.', '#####'] : ['..+..', '.+++.', '.+++.', '#####'], x - 2, y - 3);
  }

  /** The robot on the roof, its hose from the hydrant; in the flare-up its helmet flies off and back. */
  firefighter(m, f) {
    const { ctx } = this;
    // No light rims here: they would notch the roof slab under the feet.
    const hydrant = { x: m.x, y: m.roof - HYDRANT.length };
    this.drawSprite(HYDRANT, hydrant.x, hydrant.y);
    const hop = f.p > 3.8 && f.p < 4.1 ? Math.round(Math.sin((Math.PI * (f.p - 3.8)) / 0.3) * 3) : 0;
    const bob = f.p > 6 && f.p < 6.6 ? Math.floor(f.p * 8) % 2 : 0;
    const lying = f.down && f.p < 5;
    const body = lying ? ROBOT_LYING : f.down ? ROBOT_SAT : ROBOT_BODY;
    const sprite = f.helmetOn ? [...ROBOT_HELMET, ...body] : body;
    const x = m.x + 9 - Math.round(f.back * 3);
    const y = m.roof - sprite.length - hop - bob;
    this.drawSprite(sprite, x, y);
    // Dizzy: two stars circle its head while it lies there.
    if (lying) for (const a of [0, Math.PI]) this.px(x + 2 + Math.cos(f.p * 8 + a) * 3, y - 1 + Math.sin(f.p * 8 + a));

    // The hose arches from the hydrant's outlet to the robot's foot.
    const hose = { from: { x: hydrant.x + 5, y: hydrant.y + 2 }, to: { x: x + 1, y: y + sprite.length - 1 } };
    let prev = hose.from;
    for (let k = 1; k <= 6; k++) {
      const p = bezier(hose.from, { x: (hose.from.x + hose.to.x) / 2, y: hydrant.y }, hose.to, k / 6);
      this.line(prev.x, prev.y, p.x, p.y);
      prev = p;
    }
    const nozzle = f.down ? { x: x + sprite[sprite.length - 1].length, y: m.roof - 1 } : { x: x + 7, y: y + sprite.length - 3 };

    if (f.spraying) {
      // A dashed jet with a light rim, so it reads in front of the fire; light spray where it hits.
      const from = { x: nozzle.x + 2, y: nozzle.y };
      const to = { x: m.fire - 2.5 * f.size, y: m.roof - 3 * f.size };
      const pts = Array.from({ length: 15 }, (_, k) => bezier(from, { x: (from.x + to.x) / 2, y: to.y - 9 }, to, k / 14));
      for (const p of pts) ctx.clearRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 4);
      const flow = Math.floor(this.time * 20);
      pts.forEach((p, k) => (k + flow) % 4 && ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2));
      this.lit(() => {
        for (const [dx, dy] of [[1, -2], [2, 0], [1, 2], [3, -1], [3, 1]]) this.px(to.x + dx, to.y + dy);
      });
    }
    ctx.fillRect(nozzle.x, nozzle.y, 2, 1);
    if (!f.helmetOn) {
      // Two turns in the air, landing upright on the sitting robot's head.
      const u = clamp((f.p - 3.85) / 1.45, 0, 1);
      const spin = HELMET_TURNS[Math.floor(u * 8) % 4];
      const hx = mix(m.x + 12.5, m.x + 9.5, u) - spin[0].length / 2;
      const hy = mix(m.roof - 6.5, m.roof - 5.5, u) - Math.sin(Math.PI * u) * 16 - spin.length / 2;
      this.drawSprite(spin, hx, hy);
    }
  }

  /** A tall server rack: LED rows and drive bays; the blown one is gutted, its doors open on their hinges. */
  rack(x, top, G, blown) {
    const { ctx } = this;
    const t = this.time;
    this.box(x, top, 10, G - top);
    if (blown) {
      // Scorched top, a bent shelf, a torn cable hanging out (it sparks).
      this.ditherWhere(x + 1, top + 1, x + 8, top + 7, () => true);
      this.line(x + 1, top + 13, x + 8, top + 16);
      for (let y = top + 8; y <= top + 20; y++) this.px(x + 4 + Math.round(Math.sin(y * 0.7 + t * 2) * 0.6), y);
      // Door panels swung out into the gaps beside the rack: an edge line and a dithered face.
      for (const dir of [-1, 1]) {
        const hinge = dir < 0 ? x : x + 9;
        for (let c = 1; c <= 3; c++) {
          const dx = hinge + dir * c;
          ctx.clearRect(dx, top + c, 1, G - top - 2 * c);
          if (c === 3) ctx.fillRect(dx, top + c, 1, G - top - 2 * c);
          else this.ditherWhere(dx, top + c, dx, G - 1 - c, () => true);
        }
      }
      return;
    }
    for (let row = 0, y = top + 2; y < G - 3; row++, y += 4) {
      if (row % 2) {
        for (let i = 0; i < 3; i++) if (hash(Math.floor(t * 5) + i * 3.1 + row * 7.7 + x) > 0.4) ctx.fillRect(x + 2 + i * 2, y + 1, 1, 1);
      } else {
        this.frameRect(x + 2, y, 6, 3);
        this.px(x + 6, y + 1);
      }
    }
  }

  /** The database: stacked discs, cracked down the middle, spilling floppies and blocks onto a pile. */
  database(cx, top, G) {
    const { ctx } = this;
    const t = this.time;
    const rx = 8;
    const arc = (y, from, to) => {
      for (let x = -rx; x <= rx; x++) {
        const dy = 2 * Math.sqrt(1 - (x / rx) ** 2);
        if (from < 0) this.px(cx + x, y - dy);
        if (to > 0) this.px(cx + x, y + dy);
      }
    };

    // Disks and blocks hop out of the top (drawn first, so the lid hides their start), spinning,
    // and land on the pile; the last spin frame is the one lying there, so the landing does not pop.
    [DISK_SPIN, BLOCK_SPIN, DISK_SPIN].forEach((frames, k) => {
      const rest = frames[0];
      const spot = { x: cx - 13 - k * 6, y: G - 1 - Math.floor(rest.length / 2) };
      this.outlined(rest, spot.x - Math.floor(rest[0].length / 2), spot.y - Math.floor(rest.length / 2));
      const u = (t * 0.5 + k / 3) % 1;
      const sprite = frames[(Math.floor(u * 6) + 3) % frames.length];
      const x = mix(cx, spot.x, u);
      const y = mix(top - 1, spot.y, u) - 24 * u * (1 - u);
      this.outlined(sprite, x - Math.floor(sprite[0].length / 2), y - Math.floor(sprite.length / 2));
    });

    ctx.clearRect(cx - rx, top - 2, rx * 2 + 1, G - top + 2);
    ctx.fillRect(cx - rx, top, 1, G - top);
    ctx.fillRect(cx + rx, top, 1, G - top);
    arc(top, -1, 1);
    for (const y of [top + 5, top + 10]) arc(y, 0, 1);
    // The crack, with chipped edges.
    this.lit(() => {
      this.line(cx, top - 2, cx + 2, top + 4);
      this.line(cx + 2, top + 4, cx - 1, top + 9);
      this.line(cx - 1, top + 9, cx + 1, G - 1);
    });
    for (const [x, y] of [[-1, 0], [3, 3], [1, 6], [-2, 9]]) this.px(cx + x, top + y);
  }

  // --- 500 Server error: the onboard computer crashed like a broken jack-in-the-box --

  /** The CRT console on the right: left edge and the top of the screen. */
  crt() {
    const W = this.canvas.width;
    const G = this.groundY();
    return { x: W - 50, top: G - 50 };
  }

  serverError() {
    const { ctx } = this;
    const t = this.time;
    const G = this.groundY();
    const { x, top } = this.crt();
    const p = t % CRASH_LOOP;
    this.stars(30, 29);
    this.horizon();

    // The lid rattles, the spring boings out and the pilot jumps; a whack with the
    // wrench sends it back in, but it shakes a gear loose that rolls away.
    const q = p - 1.2;
    let height = 0;
    if (p >= 1.2 && p < 3.6) height = 20 * (1 - Math.exp(-q * 3) * Math.cos(q * 12));
    else if (p >= 3.6) height = 20 * (1 - ease(p, 3.6, 3.9));
    const rattle = p > 6.3 || (p > 0.2 && p < 1.2);
    const lid = rattle ? 0.08 * Math.abs(Math.sin(t * 35)) : ease(p, 1.2, 1.3) - ease(p, 3.8, 3.95);

    // Screws fly out with the boing and drop behind the console, so they come first.
    if (p >= 1.2 && p < 2.5) {
      const u = (p - 1.2) / 1.3;
      [[-12, 16], [-20, 20], [20, 22]].forEach(([reach, rise], k) => {
        this.outlined(SCREW_TURNS[Math.floor(t * 8 + k) % 4], x + 17 + reach * u, top - Math.sin(u * Math.PI) * rise + u * u * (G - top));
      });
    }

    // Desk with keys and blinking lights; its front panel hangs open, wires dangling to the floor.
    this.box(x - 4, G - 21, 48, 21);
    for (let ky = G - 18; ky < G - 13; ky += 2) for (let kx = x; kx < x + 40; kx += 3) ctx.fillRect(kx, ky, 2, 1);
    for (let i = 0; i < 5; i++) if (hash(Math.floor(t * 9) + i) > 0.5) ctx.fillRect(x + 22 + i * 4, G - 10, 2, 2);
    const panel = { x: x + 6, y: G - 11 };
    this.box(panel.x, panel.y, 12, 10);
    this.ditherWhere(panel.x + 1, panel.y + 1, panel.x + 10, panel.y + 8, () => true);
    this.line(panel.x, panel.y, panel.x - 5, panel.y + 2);
    this.line(panel.x, panel.y + 9, panel.x - 5, panel.y + 8);
    this.line(panel.x - 5, panel.y + 2, panel.x - 5, panel.y + 8);
    for (let k = 0; k < 2; k++) {
      const from = { x: panel.x + 6, y: panel.y + 5 };
      const bend = { x: panel.x + 2 - k * 3, y: panel.y - 4 + k * 2 };
      this.curve(from, bend, { x: panel.x - 2 - k * 4 + Math.sin(t * 3 + k), y: G - 1 });
    }

    // The CRT with a dizzy face: spiral eyes and a wobbly mouth.
    this.box(x, top, 40, 29);
    this.box(x + 4, top + 4, 32, 21);
    for (const ex of [x + 13, x + 27]) {
      for (let a = Math.PI; a < Math.PI * 4; a += 0.2) this.px(ex + Math.cos(a + t * 6) * a * 0.4, top + 11 + Math.sin(a + t * 6) * a * 0.4);
    }
    for (let mx = x + 12; mx <= x + 28; mx++) this.px(mx, top + 19 + Math.round(Math.sin(mx * 1.1 + t * 8)));

    // A slot in the top with its lid hinged on the right; out of it the spring, a gear on top, and wires.
    ctx.clearRect(x + 9, top, 17, 1);
    const angle = Math.PI * (1 + lid * 0.65);
    this.line(x + 26, top, x + 26 + Math.cos(angle) * 17, top + Math.sin(angle) * 17);
    if (height >= 1) {
      for (const [reach, rise] of [[-14, 6], [-9, 10]]) {
        this.curve({ x: x + 12, y: top + 2 }, { x: x + 12 + reach * 0.4, y: top - rise * (height / 20) + Math.sin(t * 5 + reach) }, { x: x + 12 + reach, y: top + 4 });
      }
      const head = { x: x + 17 + Math.sin(t * 2.5) * 2 * Math.min(1, height / 20), y: top - height };
      this.spring({ x: x + 17, y: top + 3 }, head, 3, 2);
      this.outlined(this.frame(GEAR, 0.12), head.x - 3, head.y - 6);
    }

    // The gear the whack shakes loose: out of the desk panel, then rolling away to the left.
    if (p >= 3.6 && p < 6.8) {
      const land = { x: x - 2, y: G - 4 };
      const at = p < 4 ? bezier({ x: panel.x + 6, y: panel.y + 4 }, { x: x + 2, y: G - 22 }, land, (p - 3.6) / 0.4) : { x: land.x - (p - 4) * 50, y: land.y };
      this.outlined(GEAR[Math.floor(t * 12) % 2], at.x - 3, at.y - 3);
    }

    // The pilot: scratches their helmet, jumps at the boing and over the gear, whacks the desk.
    const startle = p >= 1.2 && p < 1.6;
    const jump = 8 * Math.sin(Math.PI * clamp((p - 4.08) / 0.36, 0, 1));
    const lift = Math.round(jump + (startle ? 2 * Math.sin((Math.PI * (p - 1.2)) / 0.4) : 0));
    const pilot = this.standingPilot(x - 17, G - lift, p >= 4.5 && p < 6.3 ? -1 : 1, 'straight', 0);
    const limb = (...joints) => joints.slice(1).forEach((j, i) => this.line(pilot(...joints[i]).x, pilot(...joints[i]).y, pilot(...j).x, pilot(...j).y));
    const up = startle || jump > 1;
    const whack = p >= 3.45 && p < 3.75;
    if (up) limb([1, 7], [-2, 1]);
    else if (p >= 3 && p < 3.75) limb([0, 8], [0, 9]);
    else limb([1, 7], [-3, 3], [1 + (Math.floor(t * 7) % 2), -1]);
    const hand = up || (p >= 3 && !whack && p < 3.45) ? [8, 1] : whack ? [10, 7] : [7, 9];
    limb([5, 7], hand);
    const grip = pilot(...hand);
    if (whack) this.drawSprite(WRENCH_LEVEL, grip.x, grip.y - 1);
    else this.drawSprite(WRENCH, grip.x - 1, grip.y - 3);

    const mark = (p >= 1.2 && p < 1.8 && '!') || (((p >= 1.8 && p < 2.8) || (p >= 4.6 && p < 6.2)) && '?');
    if (mark) {
      const at = pilot(3, -7);
      ctx.clearRect(at.x - 2, at.y - 1, 5, 7);
      drawText(ctx, mark, at.x - 1, at.y);
    }
  }

  serverErrorTick() {
    const { x, top } = this.crt();
    const G = this.groundY();
    const p = this.time % CRASH_LOOP;
    if (this.every(CRASH_LOOP, 1.2)) this.sparks(x + 17, top, 10, 45, 80);
    if (p > 1.2 && p < 3.6 && this.every(0.3)) this.sparks(x + (this.time % 0.6 < 0.3 ? 9 : 26), top, 3, 35, 80);
    if ((p > 6.3 || (p > 0.2 && p < 1.2)) && this.every(0.25)) this.sparks(x + 17, top - 1, 2, 20, 60);
    if (this.every(CRASH_LOOP, 3.6)) {
      this.sparks(x - 4, G - 9, 6, 35, 80);
      this.shockWaves.push({ x: x - 4, y: G - 9, life: 0.25 });
    }
    if (this.every(1.1, 0.5)) this.sparks(x + 5, G - 12, 3, 25, 60);
  }

  /** A loose wire: a curve from `a` to `c` that bends towards `b`. */
  curve(a, b, c) {
    let prev = a;
    for (let i = 1; i <= 8; i++) {
      const next = bezier(a, b, c, i / 8);
      this.line(prev.x, prev.y, next.x, next.y);
      prev = next;
    }
  }

  /** Zigzag spring from `a` to `b`: `coils` turns, `width` pixels out to each side. */
  spring(a, b, coils, width) {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    let prev = a;
    for (let i = 1; i <= coils * 2; i++) {
      const u = i / (coils * 2);
      const side = i === coils * 2 ? 0 : (i % 2 ? 1 : -1) * width;
      const p = { x: mix(a.x, b.x, u) + nx * side, y: mix(a.y, b.y, u) + ny * side };
      this.line(prev.x, prev.y, p.x, p.y);
      prev = p;
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
