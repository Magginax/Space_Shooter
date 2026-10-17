import { GameLoop, clamp, randomBetween, rectsOverlap } from '../engine/index.js';
import { DART, GHOST_ALPHA, HEART, SHIP, drawNumber as paintNumber, drawSprite as paintSprite, spriteBox } from './lcdArt.js';

// Like SpaceBackground, the scene is drawn at a low resolution and scaled up by
// CSS (image-rendering: pixelated). About this many LCD pixels fit across the
// screen; the exact number depends on the screen width.
const TARGET_WIDTH = 170;

const INK = '#13280b';
// Each frame only part of the old picture is erased, so moving things leave a
// short smear like on a slow phone LCD. 1 would mean no smear.
const FADE_PER_FRAME = 0.5;

const MAX_LIVES = 3;
const HUD_HEIGHT = 12;
const GROUND_SPEED = 18; // LCD pixels per second
const BULLET_SPEED = 130;
const MAX_BULLETS = 8;
const BOSS_RADIUS = { x: 15, y: 12 };
const BOSS_DEATH_SECONDS = 1.6;
// Boss health bar: hits take some, it slowly heals, and it never drops below
// BOSS_MIN_HP on its own. Only a successful login drains it to 0.
const BOSS_MAX_HP = 100;
const BOSS_MIN_HP = 15;
const BOSS_HIT_DAMAGE = 4;
const BOSS_HEAL_PER_SECOND = 1.5;
// Background layers are drawn fainter, so they look far away.
const FAR_ALPHA = 0.2;

// Planet rings: [x radius, y radius] of the outer and inner ring, and their tilt.
const RING_RADII = [[13, 3.5], [10.5, 2.6]];
const RING_TILT = -0.18; // radians, a slight slope down to the left

/** Rotates a point by the ring tilt (direction -1 rotates it back). */
const tilt = (x, y, direction = 1) => {
  const angle = RING_TILT * direction;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
};

// Pixel art, one character per pixel ('#' = dark pixel). Ship, darts and hearts
// live in lcdArt.js. Lists of two = animation frames.
const MINE = [
  ['..###..', '.#...#.', '#.#.#.#', '#..#..#', '#.#.#.#', '.#...#.', '..###..'],
  ['..###..', '.#.#.#.', '#..#..#', '#######', '#..#..#', '.#.#.#.', '..###..'],
];
const ORB = [
  ['.#.', '###', '.#.'],
  ['#.#', '.#.', '#.#'],
];
const BOMB = [
  '....##.',
  '...#...',
  '.####..',
  '######.',
  '#.####.',
  '#.####.',
  '######.',
  '.####..',
];
// Asteroids turn (two frames); a big one breaks into two small ones.
const ROCK_BIG = [
  ['..####.', '.#...##', '#..#..#', '#.....#', '##.#..#', '.#...#.', '..###..'],
  ['..###..', '.##..#.', '#.....#', '#..#.##', '#.....#', '##..#.#', '.####..'],
];
const ROCK_SMALL = [
  ['.#.', '###', '.##'],
  ['##.', '###', '.#.'],
];

// Things on the ground. `frames` = animation, `light` = a pixel [x, y] that
// blinks, `walk` = moves on its own (LCD pixels per second, against the scroll).
const DECOR = [
  { frames: [['.###.', '#...#', '...#.', '..#..', '..#..', '.##..', '#.#..']] }, // hooked plant
  { frames: [['#.....#', '##...##', '.#...#.', '.##.##.', '..###..', '...#...']] }, // V plant
  { frames: [['#.#.#', '.###.', '..#..']] }, // grass
  { frames: [['..##..', '.####.', '######']] }, // rock
  { frames: [['.####.', '#.##.#', '######', '.#..#.', '.####.']] }, // skull
  { frames: [['.....', '.#.#.', '..#..', '..#..', '..#..', '.#.#.', '#...#']], light: [2, 0] }, // antenna
  { frames: [['.###.', '#####', '#.#.#'], ['.###.', '#####', '.#.#.']], walk: 7 }, // beetle
];
const PLANT_COUNT = 4; // the first four DECOR items are the common ones

// Small skull in front of the boss health bar.
const BOSS_ICON = ['.###.', '#.#.#', '#####', '.###.', '.#.#.'];

// Tiny 3x5 font for "+50" score pop-ups.
const TINY_FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};

/** Always the same "random" number 0..1 for the same n, so the skyline does not flicker. */
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Animated "phone LCD" shoot 'em up behind the login form: a ship fights waves
 * of enemies and a tentacled boss. Decoration only, but the page can drive it:
 * fire() on every key press, loseLife() on a wrong password, defeatBoss() after
 * a successful login.
 *
 * `data-state` on the canvas is "animated", or "static" for reduced motion;
 * `data-lives` holds the hearts left, so tests do not need to read pixels.
 */
export class LcdScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // The canvas sits in a wrapper (sized here to whole LCD pixels, so the CSS
    // pixel grid lines up) inside the screen element (which gives the space).
    this.wrapper = canvas.parentElement;
    this.screen = this.wrapper.parentElement;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.time = 0;
    this.lives = MAX_LIVES;
    this.score = 0;
    this.kills = 0;
    this.ship = { y: 40, cooldown: 0, blink: 0 };
    this.boss = {
      alive: true,
      dying: 0,
      flash: 0,
      enter: 0,
      blink: 0,
      blinkTimer: 3,
      fireTimer: 4,
      hp: BOSS_MAX_HP,
      defeated: false, // set by defeatBoss(): the health bar drains, then it explodes
      droolTimer: 1,
    };
    this.enemies = []; // darts, mines and asteroids
    this.bullets = [];
    this.orbs = [];
    this.particles = [];
    this.shockWaves = []; // growing circles of explosions
    this.popups = []; // "+50" score texts
    this.drool = [];
    this.dust = [];
    this.decor = [];
    this.groundOffset = 0;
    this.spawnTimer = 3;
    this.rockTimer = 2;

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.screen);
    this.resize();
    // Start with enemies already on screen, so the first frame is not empty.
    this.spawnWave(this.canvas.width * 0.55);
    canvas.dataset.lives = String(this.lives);
  }

  start() {
    this.canvas.dataset.state = this.reducedMotion ? 'static' : 'animated';
    if (this.reducedMotion) this.render();
    else this.loop.start();
  }

  // --- What the page can do -------------------------------------------------

  fire() {
    if (this.bullets.length >= MAX_BULLETS) return;
    const ship = this.shipBox();
    this.bullets.push({ x: ship.x + ship.w, y: ship.y + 3 });
    this.redrawIfStatic();
  }

  /** Takes one heart and returns how many are left. */
  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.ship.blink = 1.2;
    const ship = this.shipBox();
    this.explode(ship.x + 5, ship.y + 3, 10);
    this.canvas.dataset.lives = String(this.lives);
    this.redrawIfStatic();
    return this.lives;
  }

  refillLives() {
    this.lives = MAX_LIVES;
    this.canvas.dataset.lives = String(this.lives);
    this.redrawIfStatic();
  }

  /** The health bar drains to 0, then the boss explodes (see updateBoss). */
  defeatBoss() {
    if (!this.boss.alive || this.boss.defeated) return;
    this.boss.defeated = true;
    this.score += 5000;
    this.kills += 1;
    for (const enemy of this.enemies) this.explode(enemy.x + 3, enemy.y + 3, 6);
    this.enemies = [];
    this.orbs = [];
    if (this.reducedMotion) Object.assign(this.boss, { alive: false, hp: 0 });
    this.redrawIfStatic();
  }

  /** A new boss slides in from the right (e.g. after logging out). */
  respawnBoss() {
    Object.assign(this.boss, {
      alive: true,
      dying: 0,
      flash: 0,
      hp: BOSS_MAX_HP,
      defeated: false,
      enter: this.reducedMotion ? 0 : 1,
    });
    this.spawnTimer = 2;
    this.redrawIfStatic();
  }

  destroy() {
    this.loop.stop();
    this.resizeObserver.disconnect();
  }

  // --- Layout ----------------------------------------------------------------

  resize() {
    const { clientWidth, clientHeight } = this.screen;
    if (!clientWidth || !clientHeight) return;
    const scale = Math.max(2, Math.round(clientWidth / TARGET_WIDTH));
    const width = Math.floor(clientWidth / scale);
    const height = Math.floor(clientHeight / scale);
    if (width === this.canvas.width && height === this.canvas.height) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.wrapper.style.width = `${width * scale}px`;
    this.wrapper.style.height = `${height * scale}px`;
    this.screen.style.setProperty('--px', `${scale}px`); // size of the CSS pixel grid
    this.ship.y = clamp(this.ship.y, this.top(), this.bottom() - SHIP.length);

    this.dust = Array.from({ length: Math.round((width * height) / 450) }, () => ({
      x: randomBetween(0, width),
      y: randomBetween(this.top(), this.bottom()),
      far: Math.random() < 0.6,
    }));
    this.decor = [];
    for (let x = randomBetween(0, 20); x < width + 20; x += randomBetween(18, 40)) this.addDecor(x);
    this.redrawIfStatic();
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
    // A small forward/back drift, so the ship does not look glued to the edge.
    const drift = Math.round((Math.sin(this.time * 0.9) + 1) * 1.5);
    return spriteBox(SHIP, 3 + drift, Math.round(this.ship.y));
  }

  bossCenter() {
    return {
      x: Math.round(this.canvas.width - 20 + this.boss.enter * 45),
      y: Math.round(this.top() + (this.bottom() - this.top()) * 0.5),
    };
  }

  bossBox() {
    const { x, y } = this.bossCenter();
    return { x: x - BOSS_RADIUS.x, y: y - BOSS_RADIUS.y, w: BOSS_RADIUS.x * 2, h: BOSS_RADIUS.y * 2 };
  }

  // --- Game logic ------------------------------------------------------------

  spawnWave(startX = this.canvas.width + 4) {
    const top = this.top() + 10;
    const bottom = this.bottom() - 18;
    const y = randomBetween(top, Math.max(top, bottom));
    if (Math.random() < 0.7) {
      // Darts fly in a "V", like a squadron.
      for (const [dx, dy] of [[0, 0], [11, -9], [11, 9]]) {
        this.enemies.push({ kind: DART, x: startX + dx, baseY: y + dy, y: y + dy, speed: 26, amp: 5, phase: Math.random() * 6, vy: 0, points: 50 });
      }
    } else {
      // Mines drift slowly side by side and spin.
      for (const dx of [0, 14]) {
        this.enemies.push({ kind: MINE, x: startX + dx, baseY: y, y, speed: 16, amp: 2, phase: dx, vy: 0, points: 30 });
      }
    }
    this.spawnTimer = randomBetween(2.5, 4.5);
  }

  /** Mostly plants; now and then a skull, an antenna or a beetle. */
  addDecor(x) {
    const pool = Math.random() < 0.7 ? PLANT_COUNT : DECOR.length;
    this.decor.push({ ...DECOR[Math.floor(Math.random() * pool)], x, phase: Math.random() * 3 });
  }

  /** An asteroid drifting in from the right. */
  spawnRock() {
    const y = randomBetween(this.top() + 2, this.bottom() - 12);
    this.enemies.push({ kind: ROCK_BIG, x: this.canvas.width + 4, baseY: y, y, speed: randomBetween(12, 20), amp: 0, phase: 0, vy: 0, points: 20 });
    this.rockTimer = randomBetween(5, 8);
  }

  /** A destroyed enemy: debris, a shock wave and the points floating up. */
  blast(x, y, points) {
    this.explode(x, y, 8);
    this.shockWaves.push({ x, y, life: 0.35 });
    this.popups.push({ x: x - 4, y: y - 4, text: `+${points}`, life: 0.9 });
    this.score += points;
  }

  explode(x, y, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: randomBetween(-35, 35),
        vy: randomBetween(-35, 35),
        life: randomBetween(0.25, 0.6),
      });
    }
  }

  update(dt) {
    const { width } = this.canvas;
    const boss = this.boss;
    this.time += dt;

    for (const speck of this.dust) {
      speck.x -= (speck.far ? 5 : 12) * dt;
      if (speck.x < 0) speck.x += width;
    }

    this.groundOffset += GROUND_SPEED * dt;
    for (const item of this.decor) item.x -= (GROUND_SPEED - (item.walk ?? 0)) * dt;
    this.decor = this.decor.filter((item) => item.x > -10);
    const lastItem = this.decor.at(-1);
    if (!lastItem || lastItem.x < width - 18) this.addDecor(width + randomBetween(2, 24));

    // New waves and asteroids only while the boss fights.
    const bossFighting = boss.alive && !boss.defeated;
    this.spawnTimer -= dt;
    if (bossFighting && this.spawnTimer <= 0) this.spawnWave();
    this.rockTimer -= dt;
    if (bossFighting && this.rockTimer <= 0) this.spawnRock();

    for (const enemy of this.enemies) {
      enemy.x -= enemy.speed * dt;
      enemy.baseY += enemy.vy * dt;
      enemy.y = enemy.baseY + Math.sin(this.time * 2 + enemy.phase) * enemy.amp;
    }
    this.enemies = this.enemies.filter((enemy) => enemy.x > -10 && enemy.y > this.top() - 4 && enemy.y < this.groundY());

    this.updateShip(dt);
    this.updateBullets(dt);
    this.updateBoss(dt);

    for (const orb of this.orbs) {
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
    }
    this.orbs = this.orbs.filter((orb) => orb.x > -4);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const wave of this.shockWaves) wave.life -= dt;
    this.shockWaves = this.shockWaves.filter((wave) => wave.life > 0);
    for (const popup of this.popups) {
      popup.y -= 8 * dt; // floats up
      popup.life -= dt;
    }
    this.popups = this.popups.filter((popup) => popup.life > 0);

    // Drool falls with gravity and splashes on the ground.
    for (const drop of this.drool) {
      drop.vy += 60 * dt;
      drop.y += drop.vy * dt;
    }
    for (const drop of this.drool.filter((d) => d.y >= this.groundY() - 1)) this.explode(drop.x, this.groundY() - 1, 2);
    this.drool = this.drool.filter((drop) => drop.y < this.groundY() - 1);
  }

  updateShip(dt) {
    const ship = this.ship;
    const box = this.shipBox();
    const center = (thing) => thing.y + 3;

    // Autopilot: line up with the nearest enemy ahead, otherwise cruise in waves.
    const ahead = this.enemies.filter((enemy) => enemy.x > box.x + box.w && enemy.x < this.canvas.width - 8);
    const target = ahead.reduce((best, enemy) => (!best || enemy.x < best.x ? enemy : best), null);
    const middle = (this.top() + this.bottom()) / 2 - 3;
    const targetY = target ? target.y : middle + Math.sin(this.time * 0.7) * (this.bottom() - this.top()) * 0.3;
    ship.y += clamp((targetY - ship.y) * 3, -40, 40) * dt;
    ship.y = clamp(ship.y, this.top(), this.bottom() - SHIP.length);
    ship.blink = Math.max(0, ship.blink - dt);

    ship.cooldown -= dt;
    const enemyInLine = ahead.some((enemy) => Math.abs(center(enemy) - center(box)) <= 3);
    const bossInLine = this.boss.alive && Math.abs(this.bossCenter().y - center(box)) < BOSS_RADIUS.y;
    if (ship.cooldown <= 0 && (enemyInLine || (bossInLine && Math.random() < 0.02))) {
      this.fire();
      ship.cooldown = 0.45;
    }
  }

  updateBullets(dt) {
    const bossBox = this.boss.alive && !this.boss.defeated ? this.bossBox() : null;

    this.bullets = this.bullets.filter((bullet) => {
      bullet.x += BULLET_SPEED * dt;
      const box = { x: bullet.x, y: bullet.y, w: 3, h: 1 };

      const enemy = this.enemies.find((e) => rectsOverlap(box, spriteBox(e.kind[0], e.x, e.y)));
      if (enemy) {
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        this.blast(enemy.x + 4, enemy.y + 3, enemy.points);
        this.kills += 1;
        // A big asteroid breaks into two small ones flying apart.
        if (enemy.kind === ROCK_BIG) {
          for (const vy of [-10, 10]) {
            this.enemies.push({ ...enemy, kind: ROCK_SMALL, baseY: enemy.y + 2, vy, speed: enemy.speed + 6, points: 10 });
          }
        }
        return false;
      }
      const orb = this.orbs.find((o) => rectsOverlap(box, { x: o.x, y: o.y, w: 3, h: 3 }));
      if (orb) {
        this.orbs.splice(this.orbs.indexOf(orb), 1);
        this.explode(orb.x + 1, orb.y + 1, 4);
        this.score += 10;
        return false;
      }
      if (bossBox && rectsOverlap(box, bossBox)) {
        this.boss.flash = 0.15;
        this.boss.hp = Math.max(BOSS_MIN_HP, this.boss.hp - BOSS_HIT_DAMAGE);
        this.score += 5;
        return false;
      }
      return bullet.x < this.canvas.width;
    });
  }

  updateBoss(dt) {
    const boss = this.boss;
    boss.enter = Math.max(0, boss.enter - dt * 0.6);
    boss.flash = Math.max(0, boss.flash - dt);
    if (!boss.alive) return;

    // After a login the health bar drains first; at 0 the explosion starts.
    if (boss.defeated && !boss.dying) {
      boss.hp = Math.max(0, boss.hp - 150 * dt);
      if (boss.hp === 0) boss.dying = 0.001;
      return;
    }
    if (!boss.defeated) boss.hp = Math.min(BOSS_MAX_HP, boss.hp + BOSS_HEAL_PER_SECOND * dt);

    if (boss.dying) {
      boss.dying += dt;
      const box = this.bossBox();
      if (Math.random() < dt * 14) {
        this.explode(randomBetween(box.x, box.x + box.w), randomBetween(box.y, box.y + box.h), 5);
      }
      if (boss.dying > BOSS_DEATH_SECONDS) {
        boss.alive = false;
        boss.dying = 0;
        this.explode(box.x + box.w / 2, box.y + box.h / 2, 40);
      }
      return;
    }

    // Blinks now and then.
    boss.blink = Math.max(0, boss.blink - dt);
    boss.blinkTimer -= dt;
    if (boss.blinkTimer <= 0) {
      boss.blink = 0.18;
      boss.blinkTimer = randomBetween(2, 5);
    }

    // Spits a slow orb towards the ship, which the ship can shoot down.
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0 && boss.enter === 0) {
      const { x, y } = this.bossCenter();
      const ship = this.shipBox();
      this.orbs.push({ x: x - 10, y: y - 2, vx: -32, vy: clamp((ship.y + 2 - y) / 4, -6, 6) });
      boss.fireTimer = randomBetween(3, 5);
    }

    // Drools now and then from the mouth (see renderBoss for where it is).
    boss.droolTimer -= dt;
    if (boss.droolTimer <= 0 && boss.enter === 0) {
      const { x, y } = this.bossCenter();
      this.drool.push({ x: x - 8 + Math.floor(Math.random() * 10), y: y + 9, vy: 0 });
      boss.droolTimer = randomBetween(0.8, 2);
    }
  }

  // --- Drawing ---------------------------------------------------------------

  redrawIfStatic() {
    if (this.reducedMotion) this.render();
  }

  px(x, y) {
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  drawSprite(sprite, x, y) {
    paintSprite(this.ctx, sprite, x, y);
  }

  /** Two animation frames switch every `seconds`. */
  frame(frames, seconds = 0.25) {
    return frames[Math.floor(this.time / seconds) % frames.length];
  }

  render() {
    const { ctx, canvas } = this;
    const { width, height } = canvas;

    // The canvas is transparent: the LCD colour comes from CSS. "destination-out"
    // erases, here only partly, which leaves the LCD smear behind moving things.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = this.reducedMotion ? 1 : FADE_PER_FRAME;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;

    // Back to front: far background, then the action, then the HUD on top.
    this.renderPlanet();
    this.renderSkyline();
    for (const speck of this.dust) {
      ctx.globalAlpha = speck.far ? 0.25 : 0.6;
      this.px(speck.x, speck.y);
    }
    ctx.globalAlpha = 1;

    this.renderGround();
    for (const enemy of this.enemies) this.drawSprite(this.frame(enemy.kind), enemy.x, enemy.y);
    for (const orb of this.orbs) this.drawSprite(this.frame(ORB, 0.15), orb.x, orb.y);
    this.renderBoss();
    for (const drop of this.drool) ctx.fillRect(Math.round(drop.x), Math.round(drop.y), 1, 2);
    for (const bullet of this.bullets) ctx.fillRect(Math.round(bullet.x), bullet.y, 3, 1);
    this.renderShip();
    for (const p of this.particles) this.px(p.x, p.y);
    this.renderShockWaves();
    for (const popup of this.popups) this.drawTinyText(popup.text, popup.x, popup.y);
    this.renderHud();
  }

  /** A ringed planet far away in the upper left, like Saturn. */
  renderPlanet() {
    const { ctx } = this;
    const cx = Math.round(this.canvas.width * 0.2);
    const cy = this.top() + 11;
    const r = 7;
    const insidePlanet = (x, y) => Math.hypot(x, y) <= r + 0.5;

    // Back half of the rings first; the planet stands in front of it.
    ctx.globalAlpha = FAR_ALPHA * 1.6;
    for (const [x, y] of this.ringPixels('back')) if (!insidePlanet(x, y)) this.px(cx + x, cy + y);

    ctx.globalAlpha = FAR_ALPHA;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r) continue;
        const outline = d > r - 1;
        const shadeRight = x > 2 && (x + y) % 2 === 0;
        // The rings throw a thin shadow on the planet just below their front half.
        const ringShadow = this.underFrontRing(x, y) && (x + y) % 2 === 0;
        if (outline || shadeRight || ringShadow) this.px(cx + x, cy + y);
      }
    }

    // Front half last, across the planet.
    ctx.globalAlpha = FAR_ALPHA * 1.6;
    for (const [x, y] of this.ringPixels('front')) this.px(cx + x, cy + y);
    ctx.globalAlpha = 1;
  }

  /**
   * Pixels of two tilted ellipses with a gap between them (outer and inner
   * ring), relative to the planet centre. "back" = the half further away.
   * Collected by position first: drawing a pixel twice at half opacity would
   * make it darker than its neighbours.
   */
  ringPixels(half) {
    const pixels = new Map();
    for (const [rx, ry] of RING_RADII) {
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        if (Math.sin(a) < 0 !== (half === 'back')) continue;
        const [x, y] = tilt(Math.cos(a) * rx, Math.sin(a) * ry);
        const key = `${Math.round(x)},${Math.round(y)}`;
        pixels.set(key, [Math.round(x), Math.round(y)]);
      }
    }
    return pixels.values();
  }

  /** True for planet pixels in the 2-pixel band just below the front of the outer ring. */
  underFrontRing(x, y) {
    // Undo the tilt, so the ring is a flat ellipse again and easy to compare with.
    const [lx, ly] = tilt(x, y, -1);
    const [rx, ry] = RING_RADII[0];
    if (Math.abs(lx) >= rx) return false;
    const ringY = ry * Math.sqrt(1 - (lx / rx) ** 2);
    return ly > ringY + 0.5 && ly < ringY + 2.5;
  }

  /**
   * Hills and alien towers on the horizon. They scroll slower than the ground
   * (parallax), which makes the scene look deep.
   */
  renderSkyline() {
    const { ctx } = this;
    const ground = this.groundY();
    const offset = Math.floor(this.groundOffset * 0.35);
    for (let x = 0; x < this.canvas.width; x++) {
      const wx = x + offset; // position in the "world", not on the screen
      const height = Math.round(5 + Math.sin(wx * 0.11) * 2 + Math.sin(wx * 0.037) * 3);
      ctx.globalAlpha = FAR_ALPHA * 1.6;
      this.px(x, ground - height); // ridge line
      ctx.globalAlpha = FAR_ALPHA;
      for (let y = ground - height + 1; y < ground; y++) if ((x + y) % 2 === 0) this.px(x, y);

      // Every 41 world pixels maybe a tower with a blinking light on top.
      const tower = Math.floor(wx / 41);
      if (wx % 41 === 0 && hash(tower) > 0.35) {
        const towerHeight = 8 + Math.round(hash(tower + 0.5) * 8);
        const top = ground - height - towerHeight;
        ctx.globalAlpha = FAR_ALPHA * 1.6;
        ctx.fillRect(x, top, 1, towerHeight);
        ctx.fillRect(x - 1, top + towerHeight - 3, 3, 3);
        ctx.fillRect(x - 1, top + 2, 3, 1);
        if ((this.time + hash(tower) * 3) % 1.4 < 0.7) {
          ctx.globalAlpha = 0.8;
          this.px(x, top - 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  renderGround() {
    const y = this.groundY();
    // Dotted line that scrolls, so the ship seems to fly forward.
    const offset = Math.floor(this.groundOffset) % 3;
    for (let x = -offset; x < this.canvas.width; x += 3) this.ctx.fillRect(x, y, 2, 1);
    for (const item of this.decor) {
      const sprite = this.frame(item.frames, 0.3);
      const top = y - sprite.length;
      this.drawSprite(sprite, item.x, top);
      if (item.light && (this.time + item.phase) % 1 < 0.5) this.px(item.x + item.light[0], top + item.light[1]);
    }
  }

  /** Shock waves: circles that grow while they fade out. */
  renderShockWaves() {
    for (const wave of this.shockWaves) {
      const radius = (1 - wave.life / 0.35) * 7 + 1;
      for (let a = 0; a < Math.PI * 2; a += 0.5) this.px(wave.x + Math.cos(a) * radius, wave.y + Math.sin(a) * radius);
    }
  }

  drawTinyText(text, x, y) {
    [...text].forEach((char, i) => this.drawSprite(TINY_FONT[char], x + i * 4, y));
  }

  renderShip() {
    const ship = this.shipBox();
    // Blinking after a hit, like the short "invincible" time in old games.
    if (this.ship.blink > 0 && Math.floor(this.ship.blink * 12) % 2 === 0) return;
    this.drawSprite(SHIP, ship.x, ship.y);
    const flame = this.reducedMotion ? 2 : 1 + Math.floor(Math.random() * 3);
    this.ctx.fillRect(ship.x - flame, ship.y + 3, flame, 1);
  }

  renderBoss() {
    const boss = this.boss;
    if (!boss.alive) return;
    // Flickers while exploding or right after being hit.
    if (boss.dying && Math.floor(boss.dying * 20) % 2 === 0) return;
    if (boss.flash > 0 && Math.floor(boss.flash * 40) % 2 === 0) return;

    const { ctx } = this;
    const { x: cx, y: cy } = this.bossCenter();
    const { x: rx, y: ry } = BOSS_RADIUS;
    const t = this.time;

    // Segmented stalk down to the ground that sways a little, with roots at the foot.
    const ground = this.groundY();
    const neckTop = cy + ry - 3;
    for (let y = neckTop; y < ground; y++) {
      const sway = Math.round(Math.sin(y * 0.35 + t * 1.5) * 0.8);
      const half = 4 + Math.round(Math.sin(y * 0.9) * 0.5); // slightly knobbly edges
      this.px(cx - half + sway, y);
      this.px(cx + half + sway, y);
      if ((y - neckTop) % 5 === 0) ctx.fillRect(cx - half + sway, y, half * 2 + 1, 1); // segment rings
      else if (y % 2 === 0) this.px(cx + sway + ((y >> 1) % 3) - 1, y); // texture
    }
    for (const side of [-1, 1]) {
      this.line(cx + side * 4, ground - 5, cx + side * 9, ground - 1);
      this.line(cx + side * 5, ground - 3, cx + side * 13, ground - 1);
    }

    // Tentacles: points on a travelling sine wave joined by lines, thicker at
    // the root, with suckers and a small curl at the tip.
    for (let k = 0; k < 5; k++) {
      const length = 18 + (k % 2) * 6;
      const rootX = cx - rx + 4;
      const rootY = cy - 7 + k * 3.5;
      let [prevX, prevY] = [rootX, rootY];
      for (let i = 1; i <= length; i++) {
        const x = rootX - i * 1.3;
        const y = rootY + (k - 2) * i * 0.32 + Math.sin(t * 2.4 - i * 0.4 + k * 1.7) * i * 0.3;
        this.line(prevX, prevY, x, y);
        if (i < length * 0.4) this.line(prevX, prevY + 1, x, y + 1);
        if (i % 5 === 0) this.px(x, y + 2);
        [prevX, prevY] = [x, y];
      }
      this.px(prevX - 1, prevY - 1);
      this.px(prevX, prevY - 2);
      this.px(prevX + 1, prevY - 2);
    }

    // Head: an outlined oval, cleared inside (covers the tentacle roots), with
    // dithered shading on the lower right and rows of small scales elsewhere.
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d > 1) continue;
        if (d > 0.72) {
          this.px(cx + x, cy + y);
          continue;
        }
        ctx.clearRect(cx + x, cy + y, 1, 1);
        const shaded = x / rx + y / ry > 0.55;
        // Scales: small "U" cups, every other row shifted by 2 like roof tiles.
        const row = Math.floor((y + ry) / 3);
        const sx = (x + rx + (row % 2) * 2) % 4;
        const sy = (y + ry) % 3;
        const scale = (sy === 1 && (sx === 0 || sx === 3)) || (sy === 2 && (sx === 1 || sx === 2));
        if (shaded ? (x + y) % 2 === 0 : d < 0.6 && scale) this.px(cx + x, cy + y);
      }
    }

    // Spikes on top that sway.
    for (const s of [-10, -5, 0, 5, 10]) {
      const baseY = cy - Math.round(ry * Math.sqrt(1 - (s / rx) ** 2));
      const length = s % 10 === 0 ? 5 : 3;
      for (let i = 1; i <= length; i++) {
        this.px(cx + s + Math.sign(s) * Math.floor(i / 2) + Math.round(Math.sin(t * 3 + s) * (i / length)), baseY - i);
      }
    }

    // Eye: looks at the ship and blinks.
    const ex = cx - 4;
    const ey = cy - 3;
    const look = Math.round(clamp((this.shipBox().y + 3 - ey) / 15, -1, 1) * 2);
    for (let y = -7; y <= 7; y++) {
      for (let x = -7; x <= 7; x++) {
        const d = Math.hypot(x, y);
        if (d <= 6.5) ctx.clearRect(ex + x, ey + y, 1, 1);
        if (d >= 5.4 && d <= 6.5) this.px(ex + x, ey + y);
      }
    }
    if (boss.blink > 0) {
      ctx.fillRect(ex - 5, ey, 11, 1);
    } else {
      // The pupil pulses: a bit bigger and smaller, like it is breathing.
      const pupil = 2.4 + (Math.sin(t * 4) + 1) * 0.5;
      for (let y = -4; y <= 4; y++) {
        for (let x = -4; x <= 4; x++) {
          if (Math.hypot(x, y) <= pupil) this.px(ex - 2 + x, ey + look + y);
        }
      }
      ctx.clearRect(ex - 3, ey + look - 1, 1, 1); // glint
    }

    // Grinning mouth with teeth that opens and closes.
    const my = cy + 5;
    const open = Math.round(Math.sin(t * 3) + 1);
    ctx.clearRect(cx - 10, my, 15, 4);
    ctx.fillRect(cx - 10, my, 15, 1);
    ctx.fillRect(cx - 9, my + 1 + open, 13, 1);
    for (let x = cx - 9; x < cx + 4; x += 2) this.px(x, my + 1);
  }

  /** Straight pixel line between two points (Bresenham's algorithm). */
  line(x0, y0, x1, y1) {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.ctx.fillRect(x, y, 1, 1);
      if (x === endX && y === endY) return;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += stepX;
      }
      if (doubled <= dx) {
        error += dx;
        y += stepY;
      }
    }
  }

  renderHud() {
    const { ctx, canvas } = this;
    // Redrawn from scratch every frame: no smear in the HUD.
    ctx.clearRect(0, 0, canvas.width, HUD_HEIGHT);

    for (let i = 0; i < MAX_LIVES; i++) {
      ctx.globalAlpha = i < this.lives ? 1 : GHOST_ALPHA * 2;
      this.drawSprite(HEART, 2 + i * 11, 2);
    }
    ctx.globalAlpha = 1;

    const right = canvas.width - 2;
    // Layout from the right: score (5 digits = 35 px), a gap, kills (2 digits), bomb icon.
    this.drawNumber(this.score, 5, right, 1);
    this.drawNumber(this.kills, 2, right - 38, 1);
    this.drawSprite(BOMB, right - 59, 2);

    this.renderBossHealth(38, right - 64);
  }

  /** Boss health between the hearts and the bomb icon: a small skull + LCD segments. */
  renderBossHealth(left, right) {
    const { ctx } = this;
    const width = right - left;
    if (width < 20) return; // no room on a very small screen
    this.drawSprite(BOSS_ICON, left, 3);
    const barLeft = left + 5;
    const segments = Math.floor((width - 5) / 3);
    const lit = Math.ceil((this.boss.hp / BOSS_MAX_HP) * segments);
    for (let i = 0; i < segments; i++) {
      ctx.globalAlpha = i < lit ? 1 : GHOST_ALPHA;
      ctx.fillRect(barLeft + i * 3, 3, 2, 5);
    }
    ctx.globalAlpha = 1;
  }

  /** `value` in 7-segment digits whose right edge is at `right`. */
  drawNumber(value, digits, right, top) {
    paintNumber(this.ctx, value, digits, right, top);
  }
}
