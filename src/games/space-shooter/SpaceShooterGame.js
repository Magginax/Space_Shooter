import { GameLoop, Input, clamp, randomBetween, rectsOverlap } from '../../engine/index.js';
import { COIN, DART, FONT_H, GHOST_ALPHA, HEART, KEYCAP_H, KEYCAP_W, MAP, SHIP, UPGRADE, drawKeycap, drawNumber, drawSmallNumber, drawSprite, drawText, smallNumberWidth, spriteBox, textWidth } from '../../effects/lcdArt.js';
import { grantXp, progressFromXp, xpForLevel } from './experience.js';
import { EDGES, LEVELS, NODES, PLANETS, START_NODE, START_PLANET, levelIdAt, step } from './levelMap.js';
import {
  GUN_ORDER,
  GUNS,
  SHOT_OFFSET,
  STAT_ORDER,
  burstBox,
  GUN_BLURB,
  buyGun,
  claim,
  cloneLoadout,
  cooldownFor,
  equip,
  isOwned,
  isUnlocked,
  loadoutPrice,
  nodeBlurb,
  nodePrice,
  nodeStatus,
  spawnShots,
  statCap,
} from './weapons.js';

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
const DART_SPEED = 26;
const DART_POINTS = 50;
const DART_XP = 50;
const DART_COINS = 1;
const BLINK_TIME = 1.2;
const BAR_TRACK_W = 55;
const BAR_TRACK_H = 3;
const BAR_BORDER = 1;
const BAR_NOTCH_X = 2;
const ABANDON_LOCK = 3;
const KEY_DIRECTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const GUN_ICON = {
  blaster: ['..#..', '.###.', '#####', '.###.', '..#..'],
  beam: ['#####', '#...#', '#####', '.....', '.....'],
  pods: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
};
const STAT_ICON = {
  rate: ['#.#.#', '.....', '#.#.#', '.....', '.....'],
  shot: ['#.#..', '.....', '#.#..', '.....', '.....'],
  pierce: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
};
const LOCK = ['.###.', '#...#', '#####', '#####', '#####'];

// Login boss, each pixel doubled so the eyes stay readable on the east node.
const BOSS = ['.###.', '#.#.#', '#####', '.###.', '.#.#.'].flatMap((row) => {
  const wide = [...row].map((px) => px + px).join('');
  return [wide, wide];
});
const BOSS_R = 5;
const SKULL = ['.###.', '#.#.#', '#####', '.###.', '.#.#.'];
const CHEV_L = ['..#..', '.#...', '#....', '.#...', '..#..'];
const CHEV_R = ['..#..', '...#.', '....#', '...#.', '..#..'];
const PAD = [
  '....#....',
  '...###...',
  '....#....',
  '.#..#..#.',
  '#########',
  '.#..#..#.',
  '....#....',
  '...###...',
  '....#....',
];

const GO = ['#####', '.###.', '..#..'];
const WAVE_ICON = ['.....', '#.#.#', '.....', '#.#.#', '.....'];
const PIP_COUNT = 5;
const PIP_SIZE = 3;

const DEBUG_ROWS = [
  { id: 'level1', label: 'LEVEL PLUS 1' },
  { id: 'level5', label: 'LEVEL PLUS 5' },
  { id: 'beam', label: 'JUMP BEAM LV 5' },
  { id: 'pods', label: 'JUMP PODS LV 10' },
  { id: 'all', label: 'JUMP ALL LV 16' },
  { id: 'coins100', label: 'COINS PLUS 100' },
  { id: 'coins1000', label: 'COINS PLUS 1000' },
  { id: 'buy', label: 'BUY OPEN NODES' },
  { id: 'mount', label: 'MOUNT NEXT GUN' },
  { id: 'heal', label: 'HEAL' },
  { id: 'god', label: 'GOD' },
  { id: 'score', label: 'SCORE PLUS 1000' },
];

/**
 * Playable game on the home page.
 *
 * States "idle" -> "map" -> "running" -> "over", "paused" over a run,
 * "upgrades" for the gun banners, and "weapon" for one gun's nodes.
 * Mirrored on the canvas as data-state, with data-lives, data-score,
 * data-level, data-xp, data-coins, data-node, data-planet, data-level-name,
 * data-gun, data-row, and data-locked, so tests never read pixels.
 */
export class SpaceShooterGame {
  constructor(canvas, { onScore = () => {}, onGameOver = () => {}, onProgress = () => {}, onCoins = () => {}, onLoadout = () => {}, level = 0, xp = 0, coinsEarned = 0, coinsSpent = 0, loadout = null, prompt = null, backButton = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrapper = canvas.parentElement;
    this.screen = this.wrapper.parentElement;
    this.onScore = onScore;
    this.onGameOver = onGameOver;
    this.onProgress = onProgress;
    this.onCoins = onCoins;
    this.onLoadout = onLoadout;
    // Lifetime totals. Earned only goes up. Spent follows what the loadout holds.
    this.coinsEarned = coinsEarned;
    this.coinsSpent = coinsSpent;
    this.prompt = prompt;
    this.backButton = backButton;
    this.nodeId = START_NODE;
    this.planetIndex = START_PLANET;
    this.cleared = new Set();
    this.abandonLock = 0;
    this.choice = 'no';
    // The saved level arrives with the total. The curve derives the level the
    // bar shows, so the two cannot disagree.
    void level;
    this.setProgress(xp);
    this.loadout = cloneLoadout(loadout);
    this.heroIndex = 0;
    this.pathGun = 'blaster';
    this.statIndex = 0;
    this.nodeIndex = 0;
    this.abandonTo = 'map';
    this.god = false;
    this.debugIndex = 0;
    this.debugFrom = 'idle';
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
    this.syncMap();
    this.syncFocus();
    this.render();
  }

  /** Lifetime total. Level and the bar are derived; a new round does not clear them. */
  setProgress(totalXp) {
    const progress = progressFromXp(totalXp);
    this.xp = progress.xp;
    this.level = progress.level;
    this.intoLevel = progress.intoLevel;
    this.nextLevelXp = progress.xpToNext;
  }

  addXp(amount) {
    this.setProgress(grantXp(this.xp, amount).xp);
    this.syncHud();
    this.onProgress(this.xp);
  }

  /** The wallet. A new round does not clear it. */
  get coins() {
    return this.coinsEarned - this.coinsSpent;
  }

  addCoins(amount) {
    this.coinsEarned += amount;
    this.syncHud();
    this.onCoins(this.coinsEarned);
  }

  reset() {
    this.score = 0;
    this.lives = MAX_LIVES;
    this.time = 0;
    this.groundOffset = 0;
    this.spawnTimer = 2.5;
    this.bullets = [];
    this.beam = [];
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
    if (this.backButton) this.backButton.hidden = state !== 'upgrades' && state !== 'weapon';
  }

  /** One screen back. The weapon path returns to the banners. The banners return to the map. */
  back() {
    if (this.state === 'weapon') {
      this.setState('upgrades');
      this.syncFocus();
      this.render();
      return;
    }
    if (this.state === 'upgrades') this.closeUpgrades();
  }

  /** ` opens and closes the debug list. The run underneath stays where it was. */
  toggleDebug() {
    if (this.state === 'debug') {
      this.closeDebug();
      return;
    }
    this.debugFrom = this.state || 'idle';
    this.debugIndex = 0;
    this.syncPrompt(false);
    this.setState('debug');
    this.canvas.dataset.debug = DEBUG_ROWS[0].id;
    this.loop.start();
    this.input.drainPressed();
    this.render();
  }

  closeDebug() {
    if (this.state !== 'debug') return;
    const back = this.debugFrom || 'idle';
    this.setState(back);
    this.canvas.dataset.debug = '';
    if (back === 'paused') this.syncPrompt(true);
    if (back === 'idle') this.loop.stop();
    this.syncFocus();
    this.render();
  }

  takeDebugKey() {
    if (!this.input.justPressed('`', '~')) return false;
    this.toggleDebug();
    return true;
  }

  updateDebug() {
    for (const key of this.input.pressedKeys()) {
      if (key === '`' || key === '~' || key === 'Escape') {
        this.closeDebug();
        return;
      }
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        this.debugIndex = Math.max(0, this.debugIndex - 1);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        this.debugIndex = Math.min(DEBUG_ROWS.length - 1, this.debugIndex + 1);
      } else if (key === 'Enter' || key === ' ') this.runDebug(DEBUG_ROWS[this.debugIndex].id);
    }
    this.canvas.dataset.debug = DEBUG_ROWS[this.debugIndex].id;
  }

  /** Raises the level locally. A higher total is saved. A lower one stays on this page. */
  setLevel(level) {
    const next = xpForLevel(level);
    const raised = next > this.xp;
    this.setProgress(next);
    this.syncHud();
    if (raised) this.onProgress(this.xp);
  }

  /** A cheat still pays: the price is granted first, so the database accepts the save. */
  grantAndCommit(next) {
    const price = loadoutPrice(next) - loadoutPrice(this.loadout);
    if (price > 0) this.addCoins(price);
    this.commitLoadout(next);
  }

  /** Every node left on the guns already bought. */
  buyOpenNodes() {
    let loadout = this.loadout;
    for (const gun of loadout.owned) {
      for (const stat of STAT_ORDER) {
        let result = claim(loadout, Infinity, gun, stat);
        while (result.ok) {
          loadout = result.loadout;
          result = claim(loadout, Infinity, gun, stat);
        }
      }
    }
    this.grantAndCommit(loadout);
  }

  mountNextGun() {
    const at = GUN_ORDER.indexOf(this.loadout.gun);
    const gunId = GUN_ORDER[(at + 1) % GUN_ORDER.length];
    if (this.level < GUNS[gunId].unlockLevel) this.setLevel(GUNS[gunId].unlockLevel);
    const bought = buyGun(this.loadout, this.level, Infinity, gunId);
    const result = equip(bought.ok ? bought.loadout : this.loadout, gunId);
    if (result.ok) this.grantAndCommit(result.loadout);
  }

  runDebug(id) {
    if (id === 'level1') this.setLevel(this.level + 1);
    else if (id === 'level5') this.setLevel(this.level + 5);
    else if (id === 'beam') this.setLevel(5);
    else if (id === 'pods') this.setLevel(10);
    else if (id === 'all') this.setLevel(16);
    else if (id === 'coins100') this.addCoins(100);
    else if (id === 'coins1000') this.addCoins(1000);
    else if (id === 'buy') this.buyOpenNodes();
    else if (id === 'mount') this.mountNextGun();
    else if (id === 'heal') {
      this.lives = MAX_LIVES;
      this.syncHud();
    } else if (id === 'god') this.god = !this.god;
    else if (id === 'score') this.addScore(1000);
    this.render();
  }

  syncHud() {
    this.canvas.dataset.lives = String(this.lives);
    this.canvas.dataset.score = String(this.score);
    this.canvas.dataset.level = String(this.level);
    this.canvas.dataset.xp = String(this.xp);
    this.canvas.dataset.coins = String(this.coins);
    this.syncFocus();
  }

  /** Focus of the upgrade screens. The map keeps its own node id. */
  syncFocus() {
    const choosing = this.state === 'upgrades' || this.state === 'weapon';
    const gunId = this.state === 'weapon' ? this.pathGun : GUN_ORDER[this.heroIndex] ?? this.loadout.gun;
    this.canvas.dataset.gun = choosing ? gunId : this.loadout.gun;
    this.canvas.dataset.row = this.state === 'weapon' ? STAT_ORDER[this.statIndex] : '';
    if (this.state === 'weapon') this.canvas.dataset.node = String(this.nodeIndex);
    const locked = this.state === 'upgrades' && !isUnlocked(gunId, this.level);
    this.canvas.dataset.locked = locked ? String(GUNS[gunId].unlockLevel) : '';
  }

  /** PLAY, and the way back from an abandoned run. The cursor stays put. */
  openMap() {
    if (this.state === 'running' || this.state === 'map') return;
    this.choice = 'no';
    this.syncPrompt(false);
    this.syncMap();
    this.setState('map');
    this.syncFocus();
    this.loop.start();
    this.render();
  }

  start() {
    if (this.state === 'running') return;
    this.abandonLock = 0;
    this.syncPrompt(false);
    this.reset();
    const box = this.shipBox();
    this.spawnWave({ startX: box.x + box.w + 80, y: box.y, aimed: true });
    this.setState('running');
    this.loop.start();
  }

  confirmLevel() {
    if (!levelIdAt(this.nodeId)) return;
    this.start();
    // The key that started the run is still held. Don't spend it as a shot.
    const ranks = this.loadout.ranks[this.loadout.gun];
    this.ship.cooldown = cooldownFor(this.loadout.gun, ranks);
  }

  /** `where` is "map" for M, or "upgrades" for U. Yes goes there after the run is dropped. */
  pauseRun(where = 'map') {
    this.abandonTo = where;
    this.choice = 'no';
    this.setState('paused');
    this.syncPrompt(true);
  }

  resumeRun() {
    this.abandonLock = ABANDON_LOCK;
    this.syncPrompt(false);
    this.setState('running');
  }

  abandonRun() {
    this.abandonLock = 0;
    this.syncPrompt(false);
    this.reset();
    this.openMap();
  }

  syncPrompt(visible) {
    if (!this.prompt) return;
    this.prompt.hidden = !visible;
    this.prompt.dataset.choice = this.choice;
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

  /** Spent moves with the loadout's price, so a refused save hands the coins back. */
  swapLoadout(next) {
    this.coinsSpent += loadoutPrice(next) - loadoutPrice(this.loadout);
    this.loadout = next;
    this.syncHud();
  }

  /** Replaces the loadout without telling the server. Used when a save is refused. */
  setLoadout(loadout) {
    this.swapLoadout(cloneLoadout(loadout));
    if (this.state === 'upgrades' || this.state === 'weapon') this.render();
  }

  commitLoadout(next) {
    if (next === this.loadout) return;
    this.swapLoadout(next);
    this.onLoadout(next);
  }

  /** Hero banners. Leaving them always opens the level select, never a run. */
  openUpgrades() {
    if (this.state === 'running' || this.state === 'weapon') return;
    const mounted = GUN_ORDER.indexOf(this.loadout.gun);
    this.heroIndex = mounted < 0 ? 0 : mounted;
    this.syncPrompt(false);
    this.setState('upgrades');
    this.syncFocus();
    this.loop.start();
    this.input.drainPressed();
    this.render();
  }

  closeUpgrades() {
    if (this.state !== 'upgrades') return;
    this.openMap();
  }

  /** Drops the run without saving the score, then opens the hero banners. */
  abandonToUpgrades() {
    this.abandonLock = 0;
    this.syncPrompt(false);
    this.reset();
    this.setState('idle');
    this.openUpgrades();
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
    return this.canvas.height - HUD_HEIGHT - 4;
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
        xp: DART_XP,
        coins: DART_COINS,
      });
    }
    this.spawnTimer = randomBetween(2.5, 4.5);
  }

  // --- Game logic ------------------------------------------------------------

  update(dt) {
    try {
      if (this.takeDebugKey()) return;
      if (this.state === 'debug') {
        this.updateDebug();
        return;
      }
      if (this.state === 'map') {
        this.updateMap();
        return;
      }
      if (this.state === 'paused') {
        this.updatePrompt();
        return;
      }
      if (this.state === 'upgrades') {
        this.updateHeroes();
        return;
      }
      if (this.state === 'weapon') {
        this.updateWeapon();
        return;
      }
      if (this.state === 'running' && (this.takeAbandonKey(dt) || this.takeUpgradeKey())) return;

      this.advance(dt);
    } finally {
      this.input.drainPressed();
    }
  }

  advance(dt) {
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
    this.beam = [];
    this.fire();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnWave();

    for (const enemy of this.enemies) {
      enemy.x -= enemy.speed * dt;
      enemy.y = enemy.baseY + Math.sin(this.time * 2 + enemy.phase) * enemy.amp;
    }
    this.enemies = this.enemies.filter((enemy) => enemy.x > -10 && enemy.y > this.top() - 4 && enemy.y < this.groundY());

    this.bullets = this.bullets.filter((bullet) => {
      bullet.x += (bullet.speed ?? BULLET_SPEED) * dt;
      const box = { x: bullet.x, y: bullet.y, w: bullet.w ?? 3, h: bullet.h ?? 1 };
      const index = this.enemies.findIndex((enemy) => rectsOverlap(box, spriteBox(enemy.kind[0], enemy.x, enemy.y)));
      if (index === -1) return bullet.x < width;
      if (bullet.kind === 'pod') {
        this.detonate(bullet);
        if ((bullet.pierce ?? 0) > 0) {
          bullet.pierce -= 1;
          return bullet.x < width;
        }
        return false;
      }
      this.killEnemy(this.enemies[index]);
      if ((bullet.pierce ?? 0) > 0) {
        bullet.pierce -= 1;
        return bullet.x < width;
      }
      return false;
    });

    if (this.state !== 'running') return;
    if (this.ship.blink > 0) return;
    const ship = this.shipBox();
    const hit = this.enemies.findIndex((enemy) => rectsOverlap(ship, spriteBox(enemy.kind[0], enemy.x, enemy.y)));
    if (hit === -1) return;
    this.enemies.splice(hit, 1);
    if (this.god) return;
    this.lives -= 1;
    this.ship.blink = BLINK_TIME;
    this.syncHud();
    if (this.lives <= 0) this.gameOver();
  }

  updateMap() {
    for (const key of this.input.pressedKeys()) {
      const direction = KEY_DIRECTION[key];
      if (direction) {
        this.nodeId = step(this.nodeId, direction, this.cleared);
        continue;
      }
      if (key === 'q' || key === 'Q') {
        this.shiftPlanet(-1);
        continue;
      }
      if (key === 'e' || key === 'E') {
        this.shiftPlanet(1);
        continue;
      }
      if (key === 'm' || key === 'M' || key === 'u' || key === 'U') {
        this.openUpgrades();
        break;
      }
      if (key === 'Enter' || key === ' ') {
        this.confirmLevel();
        break;
      }
    }
    this.syncMap();
  }

  shiftPlanet(delta) {
    const next = this.planetIndex + delta;
    if (next < 0 || next >= PLANETS.length) return;
    this.planetIndex = next;
  }

  syncMap() {
    this.canvas.dataset.node = this.nodeId;
    this.canvas.dataset.planet = PLANETS[this.planetIndex].id;
    this.canvas.dataset.levelName = LEVELS[this.nodeId]?.name ?? '';
  }

  updatePrompt() {
    for (const key of this.input.pressedKeys()) {
      if (key === 'ArrowLeft') this.choice = 'no';
      else if (key === 'ArrowRight') this.choice = 'yes';
      else if (key === 'Enter' || key === ' ') {
        if (this.choice === 'yes' && this.abandonTo === 'upgrades') this.abandonToUpgrades();
        else if (this.choice === 'yes') this.abandonRun();
        else this.resumeRun();
        return;
      }
    }
    this.syncPrompt(true);
  }

  updateHeroes() {
    for (const key of this.input.pressedKeys()) {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') this.heroIndex = Math.max(0, this.heroIndex - 1);
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.heroIndex = Math.min(GUN_ORDER.length - 1, this.heroIndex + 1);
      } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'w' || key === 'W' || key === 's' || key === 'S') {
        this.equipHero();
      } else if (key === 'Enter' || key === ' ') {
        this.confirmHero();
        if (this.state !== 'upgrades') return;
      }
      else if (key === 'Escape' || key === 'm' || key === 'M' || key === 'b' || key === 'B') {
        this.back();
        return;
      }
    }
    this.syncFocus();
  }

  /** Mounts the focused gun and stays on the banners. A gun not bought yet is left alone. */
  equipHero() {
    const gunId = GUN_ORDER[this.heroIndex];
    const result = equip(this.loadout, gunId);
    if (!result.ok) return;
    this.commitLoadout(result.loadout);
    this.syncFocus();
    this.render();
  }

  /** Opens the focused gun's nodes. A gun whose level is reached is bought first when the coins cover it. */
  confirmHero() {
    const gunId = GUN_ORDER[this.heroIndex];
    const bought = buyGun(this.loadout, this.level, this.coins, gunId);
    const result = equip(bought.ok ? bought.loadout : this.loadout, gunId);
    if (!result.ok) return;
    this.commitLoadout(result.loadout);
    this.pathGun = gunId;
    this.statIndex = 0;
    this.nodeIndex = this.nextNode(gunId, STAT_ORDER[0]);
    this.setState('weapon');
    this.syncFocus();
    this.render();
  }

  updateWeapon() {
    const stat = STAT_ORDER[this.statIndex];
    const cap = statCap(this.pathGun, stat);
    for (const key of this.input.pressedKeys()) {
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        this.statIndex = Math.max(0, this.statIndex - 1);
        this.nodeIndex = this.nextNode(this.pathGun, STAT_ORDER[this.statIndex]);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        this.statIndex = Math.min(STAT_ORDER.length - 1, this.statIndex + 1);
        this.nodeIndex = this.nextNode(this.pathGun, STAT_ORDER[this.statIndex]);
      } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.nodeIndex = Math.max(0, this.nodeIndex - 1);
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.nodeIndex = Math.min(cap - 1, this.nodeIndex + 1);
      } else if (key === 'Enter' || key === ' ') this.confirmNode();
      else if (key === 'Escape' || key === 'm' || key === 'M' || key === 'b' || key === 'B') {
        this.back();
        return;
      }
    }
    this.syncFocus();
  }

  /** The next unbought node, or the last node when the row is full. */
  nextNode(gunId, statId) {
    const rank = this.loadout.ranks[gunId][statId];
    return Math.min(rank, statCap(gunId, statId) - 1);
  }

  confirmNode() {
    const stat = STAT_ORDER[this.statIndex];
    const rank = this.loadout.ranks[this.pathGun][stat];
    if (this.nodeIndex !== rank) return;
    const result = claim(this.loadout, this.coins, this.pathGun, stat);
    if (!result.ok) return;
    this.commitLoadout(result.loadout);
    this.nodeIndex = this.nextNode(this.pathGun, stat);
    this.render();
  }

  /**
   * M pauses the run when the lock has run out. A press while the lock is
   * still counting is discarded, and the count only moves during play.
   * @returns {boolean} true when this frame should not simulate
   */
  takeAbandonKey(dt) {
    this.abandonLock = Math.max(0, this.abandonLock - dt);
    if (this.abandonLock < 1e-4) this.abandonLock = 0;
    if (!this.input.justPressed('m', 'M') || this.abandonLock > 0) return false;
    this.pauseRun('map');
    return true;
  }

  /** U during a run asks to abandon, then opens the hero banners. */
  takeUpgradeKey() {
    if (!this.input.justPressed('u', 'U') || this.abandonLock > 0) return false;
    this.pauseRun('upgrades');
    return true;
  }

  // --- Firing ----------------------------------------------------------------

  fire() {
    if (this.state !== 'running') return;
    const gun = this.loadout.gun;
    const ranks = this.loadout.ranks[gun];
    if (gun === 'beam') {
      this.fireBeam(ranks);
      return;
    }
    if (this.ship.cooldown > 0 || !this.input.isDown(' ')) return;
    const box = this.shipBox();
    const shots = spawnShots(gun, ranks, { x: box.x + box.w, y: box.y + 3 });
    // A partial volley drops the extra pellet. Wait until the whole group fits.
    if (this.bullets.length + shots.length > MAX_BULLETS) return;
    this.bullets.push(...shots);
    this.ship.cooldown = cooldownFor(gun, ranks);
  }

  /** A held line. It ticks the first enemy on the row, and keeps going once pierce is bought. */
  fireBeam(ranks) {
    if (!this.input.isDown(' ')) return;
    const box = this.shipBox();
    const muzzleX = box.x + box.w;
    const rows = [box.y + 3];
    if (ranks.shot > 0) rows.push(box.y + 3 - SHOT_OFFSET);
    const tick = this.ship.cooldown <= 0;
    const doomed = [];
    for (const y of rows) {
      const hits = this.enemiesOnRow(y, muzzleX);
      const victims = ranks.pierce > 0 ? hits : hits.slice(0, 1);
      const end = victims.length && ranks.pierce <= 0 ? victims[0].box.x : this.canvas.width;
      if (end > muzzleX) this.beam.push({ y, x0: muzzleX, x1: end });
      if (tick) doomed.push(...victims.map((hit) => hit.enemy));
    }
    if (!tick) return;
    for (const enemy of doomed) this.killEnemy(enemy);
    this.ship.cooldown = cooldownFor('beam', ranks);
  }

  enemiesOnRow(y, fromX) {
    return this.enemies
      .map((enemy) => ({ enemy, box: spriteBox(enemy.kind[0], enemy.x, enemy.y) }))
      .filter(({ box }) => y >= box.y && y < box.y + box.h && box.x + box.w > fromX && box.x < this.canvas.width)
      .sort((a, b) => a.box.x - b.box.x);
  }

  detonate(bullet) {
    const area = burstBox(bullet);
    const hit = this.enemies.filter((enemy) => rectsOverlap(area, spriteBox(enemy.kind[0], enemy.x, enemy.y)));
    for (const enemy of hit) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    const index = this.enemies.indexOf(enemy);
    if (index === -1) return;
    this.addScore(enemy.points);
    this.addXp(enemy.xp ?? 0);
    this.addCoins(enemy.coins ?? 0);
    this.enemies.splice(index, 1);
  }

  // --- Drawing ---------------------------------------------------------------

  render() {
    if (this.state === 'paused') return;
    if (this.state === 'debug') {
      this.renderDebug();
      return;
    }
    if (this.state === 'map') {
      this.renderMap();
      return;
    }
    if (this.state === 'upgrades') {
      this.renderHeroes();
      return;
    }
    if (this.state === 'weapon') {
      this.renderWeapon();
      return;
    }
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
    for (const bullet of this.bullets) {
      ctx.fillRect(Math.round(bullet.x), Math.round(bullet.y), bullet.w ?? 3, bullet.h ?? 1);
    }
    for (const line of this.beam) {
      const x = Math.round(line.x0);
      const w = Math.round(line.x1) - x;
      if (w > 0) ctx.fillRect(x, line.y, w, 1);
    }
    this.renderShip();
    this.renderHud();
  }

  renderDebug() {
    this.clearMenu();
    const { canvas } = this;
    if (!canvas.width || !canvas.height) return;
    this.drawCentered('DEBUG', 2);
    DEBUG_ROWS.forEach((row, index) => {
      const y = 12 + index * 7;
      const label = row.id === 'god' ? `GOD ${this.god ? 'ON' : 'OFF'}` : row.label;
      if (index === this.debugIndex) this.ctx.fillRect(4, y, 2, FONT_H);
      drawText(this.ctx, label, 8, y);
    });
  }

  clearMenu() {
    const { ctx, canvas } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;
  }

  drawCentered(text, y) {
    drawText(this.ctx, text, Math.round((this.canvas.width - textWidth(text)) / 2), y);
  }

  /** Word-wrapped uppercase lines. Returns the y of the next free row. */
  drawWrapped(text, y, maxWidth = this.canvas.width - 8) {
    const words = text.split(' ');
    let line = '';
    let top = y;
    const flush = () => {
      if (!line) return;
      this.drawCentered(line, top);
      top += FONT_H + 2;
      line = '';
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next) > maxWidth) flush();
      line = line ? `${line} ${word}` : word;
    }
    flush();
    return top;
  }

  drawLevel() {
    drawText(this.ctx, `LV ${this.level}`, 4, 4);
  }

  /** Coin plus the balance in 3×5 digits. `right` is the row's right edge. */
  paintBalance(right, top) {
    const width = COIN[0].length + 1 + smallNumberWidth(this.coins);
    const left = right - width;
    drawSprite(this.ctx, COIN, left, top);
    drawSmallNumber(this.ctx, this.coins, left + COIN[0].length + 1, top);
    return left;
  }

  /** Gun banners in a row. A gun not bought yet is ghosted. Below its level it also has a lock. */
  renderHeroes() {
    this.clearMenu();
    const { ctx, canvas } = this;
    if (!canvas.width || !canvas.height) return;
    this.drawCentered('UPGRADES', 4);
    this.drawLevel();
    this.paintBalance(canvas.width - 4, 4);
    const pad = 8;
    const gap = 6;
    const bannerW = Math.max(20, Math.floor((canvas.width - pad * 2 - gap * 2) / 3));
    const bannerH = 32;
    const top = 16;
    GUN_ORDER.forEach((gunId, index) => {
      const left = pad + index * (bannerW + gap);
      const locked = !isUnlocked(gunId, this.level);
      const focused = index === this.heroIndex;
      ctx.globalAlpha = isOwned(this.loadout, gunId) ? 1 : GHOST_ALPHA * 2;
      const icon = GUN_ICON[gunId];
      const iconX = left + Math.floor((bannerW - icon[0].length) / 2);
      drawSprite(ctx, icon, iconX, top + 3);
      const name = gunId === 'blaster' ? 'BLASTER' : gunId === 'beam' ? 'BEAM' : 'PODS';
      drawText(ctx, name, left + Math.floor((bannerW - textWidth(name)) / 2), top + 12);
      if (this.loadout.gun === gunId) ctx.fillRect(left + 2, top + bannerH - 4, 2, 2);
      ctx.globalAlpha = 1;
      if (focused) this.strokeRect(left, top, bannerW, bannerH);
      if (locked) drawSprite(ctx, LOCK, left + bannerW - LOCK[0].length - 2, top + 2);
    });
    const focused = GUN_ORDER[this.heroIndex];
    const open = isOwned(this.loadout, focused);
    const hintY = top + bannerH + 6;
    if (open) this.drawCentered('UP DOWN EQUIPS', hintY);
    else if (isUnlocked(focused, this.level)) this.drawCentered(`COSTS ${GUNS[focused].price}`, hintY);
    else this.drawCentered(`LEVEL ${GUNS[focused].unlockLevel} REQUIRED`, hintY);
    if (open) this.drawCentered('SPACE OPENS', hintY + 8);
    this.drawWrapped(GUN_BLURB[focused], Math.max(hintY + (open ? 20 : 12), canvas.height - 28));
  }

  /** One gun's rows. Filled nodes are bought. The next node is solid once the coins cover it. */
  renderWeapon() {
    this.clearMenu();
    const { ctx, canvas } = this;
    if (!canvas.width || !canvas.height) return;
    const icon = GUN_ICON[this.pathGun];
    const title = this.pathGun === 'blaster' ? 'BLASTER' : this.pathGun === 'beam' ? 'BEAM' : 'PODS';
    const rowW = icon[0].length + 3 + textWidth(title);
    const left = Math.round((canvas.width - rowW) / 2);
    drawSprite(ctx, icon, left, 4);
    drawText(ctx, title, left + icon[0].length + 3, 4);
    this.drawLevel();
    this.paintBalance(canvas.width - 4, 4);
    STAT_ORDER.forEach((stat, row) => {
      const y = 20 + row * 16;
      drawSprite(ctx, STAT_ICON[stat], 6, y);
      drawText(ctx, stat.toUpperCase(), 14, y);
      const cap = statCap(this.pathGun, stat);
      const rank = this.loadout.ranks[this.pathGun][stat];
      for (let i = 0; i < cap; i++) {
        const center = 58 + i * 14;
        const owned = i < rank;
        const open = i === rank && this.coins >= nodePrice(stat, i);
        if (owned) this.fillSquare(center, y + 2, 7);
        else {
          ctx.globalAlpha = open ? 1 : GHOST_ALPHA * 2;
          this.strokeSquare(center, y + 2, 7);
          ctx.globalAlpha = 1;
        }
        if (row === this.statIndex && i === this.nodeIndex) this.strokeSquare(center, y + 2, 11);
      }
    });
    const stat = STAT_ORDER[this.statIndex];
    const rank = this.loadout.ranks[this.pathGun][stat];
    const detail = `${nodeBlurb(this.pathGun, stat, this.nodeIndex)} ${nodeStatus(stat, this.nodeIndex, rank)}`;
    this.drawWrapped(detail, Math.max(70, canvas.height - 28));
  }

  strokeRect(left, top, width, height) {
    const { ctx } = this;
    ctx.fillRect(left, top, width, 1);
    ctx.fillRect(left, top + height - 1, width, 1);
    ctx.fillRect(left, top, 1, height);
    ctx.fillRect(left + width - 1, top, 1, height);
  }

  /** Path, nodes, the planet row, and the level description. No scenery. */
  renderMap() {
    const { ctx, canvas } = this;
    const { width, height } = canvas;
    if (!width || !height) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = INK;

    const at = (id) => this.mapPoint(NODES[id], width, height);
    const bossAt = at('east');
    for (const [from, to] of EDGES) this.drawMapEdge(at(from), at(to), bossAt);

    for (const node of Object.values(NODES)) {
      if (node.id === 'east') continue;
      const point = at(node.id);
      if (node.levelId) this.strokeSquare(point.x, point.y, 7);
      else this.fillSquare(point.x, point.y, 3);
    }
    drawSprite(ctx, BOSS, bossAt.x - BOSS_R, bossAt.y - BOSS_R);
    const cursor = at(this.nodeId);
    if (this.nodeId === 'east') this.strokeSquare(cursor.x, cursor.y, 12);
    else this.fillSquare(cursor.x, cursor.y, 5);

    this.drawLevel();
    this.paintBalance(width - 4, 4);
    this.renderPlanetTitle();
    this.renderMapKeys();
    this.renderDetail();
  }

  mapBox(width, height) {
    return {
      x: Math.round(26 * width / 185),
      y: Math.round(20 * height / 104),
      w: Math.round(134 * width / 185),
      h: Math.round(65 * height / 104),
    };
  }

  mapPoint(node, width, height) {
    const box = this.mapBox(width, height);
    return {
      x: Math.round(box.x + (node.x * box.w) / 3),
      y: Math.round(box.y + ((node.y - 1) * box.h) / 2),
    };
  }

  // The path stops on the boss's edge so the line does not cut the eyes.
  drawMapEdge(a, b, boss) {
    let x0 = a.x;
    let y0 = a.y;
    let x1 = b.x;
    let y1 = b.y;
    const trim = (which) => {
      const point = which === 0 ? a : b;
      const other = which === 0 ? b : a;
      if (point.x !== boss.x || point.y !== boss.y) return;
      const toward = (from, to) => from + Math.sign(to - from) * BOSS_R;
      if (other.x !== point.x) {
        const next = toward(point.x, other.x);
        if (which === 0) x0 = next;
        else x1 = next;
      } else if (other.y !== point.y) {
        const next = toward(point.y, other.y);
        if (which === 0) y0 = next;
        else y1 = next;
      }
    };
    trim(0);
    trim(1);
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (w === 0 && h === 0) return;
    this.ctx.fillRect(x, y, w || 1, h || 1);
  }

  renderPlanetTitle() {
    const { ctx, canvas } = this;
    const label = `PLANET: ${PLANETS[this.planetIndex].name}`;
    const left = Math.round((canvas.width - textWidth(label)) / 2);
    const y = 4;
    ctx.globalAlpha = this.planetIndex > 0 ? 1 : GHOST_ALPHA * 2;
    drawSprite(ctx, CHEV_L, left - 3 - CHEV_L[0].length, y);
    ctx.globalAlpha = this.planetIndex < PLANETS.length - 1 ? 1 : GHOST_ALPHA * 2;
    drawSprite(ctx, CHEV_R, left + textWidth(label) + 3, y);
    ctx.globalAlpha = 1;
    drawText(ctx, label, left, y);
  }

  /** Arrows move, the key starts the level. Bottom-left, 3px off the corner. */
  renderMapKeys() {
    const { ctx, canvas } = this;
    const top = canvas.height - 3 - PAD.length;
    drawSprite(ctx, PAD, 4, top);
    const key = 4 + PAD[0].length + 2;
    ctx.fillRect(key, top, 9, 1);
    ctx.fillRect(key, top + 8, 9, 1);
    ctx.fillRect(key, top, 1, 9);
    ctx.fillRect(key + 8, top, 1, 9);
    drawSprite(ctx, GO, key + 2, top + 4);
  }

  /** Skull, waves, and the level name. Always on screen, bottom-right. */
  renderDetail() {
    const { canvas } = this;
    const info = LEVELS[this.nodeId];
    if (!info) return;
    const right = canvas.width - 4;
    const nameTop = canvas.height - 4 - FONT_H;
    drawText(this.ctx, info.name, right - textWidth(info.name), nameTop);
    const gap = 2;
    const waveTop = nameTop - gap - WAVE_ICON.length;
    const skullTop = waveTop - gap - SKULL.length;
    this.drawStatRow(SKULL, info.difficulty, right, skullTop);
    this.drawStatRow(WAVE_ICON, info.waves, right, waveTop);
  }

  drawStatRow(icon, filled, right, top) {
    const pipsW = PIP_COUNT * PIP_SIZE + (PIP_COUNT - 1);
    const left = right - (icon[0].length + 2 + pipsW);
    drawSprite(this.ctx, icon, left, top);
    this.drawPips(filled, left + icon[0].length + 2 + pipsW, top + 1);
  }

  drawPips(filled, right, top) {
    let x = right - (PIP_COUNT * PIP_SIZE + (PIP_COUNT - 1));
    for (let i = 0; i < PIP_COUNT; i++) {
      this.ctx.globalAlpha = i < filled ? 1 : GHOST_ALPHA * 2;
      this.ctx.fillRect(x, top, PIP_SIZE, PIP_SIZE);
      x += PIP_SIZE + 1;
    }
    this.ctx.globalAlpha = 1;
  }

  fillSquare(x, y, size) {
    this.ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  }

  strokeSquare(x, y, size) {
    const left = x - Math.floor(size / 2);
    const top = y - Math.floor(size / 2);
    this.ctx.fillRect(left, top, size, 1);
    this.ctx.fillRect(left, top + size - 1, size, 1);
    this.ctx.fillRect(left, top, 1, size);
    this.ctx.fillRect(left + size - 1, top, 1, size);
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
    // 2px under the score. The row hangs into the playfield; a ship at the top can cover it.
    const balanceTop = 12;
    const balanceRight = canvas.width - 2;
    const balanceLeft = balanceRight - (COIN[0].length + 1 + smallNumberWidth(this.coins));
    const clearLeft = Math.min(balanceLeft, this.coinClearLeft ?? balanceLeft);
    ctx.clearRect(clearLeft, balanceTop, balanceRight - clearLeft, COIN.length);
    this.coinClearLeft = balanceLeft;
    this.paintBalance(balanceRight, balanceTop);

    // Same clear as the top bar: the LCD smear must not eat the level digits.
    const bandTop = canvas.height - HUD_HEIGHT;
    ctx.clearRect(0, bandTop, canvas.width, HUD_HEIGHT);
    const bar = this.renderExperience();
    this.renderCornerIcons(bar);
  }

  /**
   * Framed gauge centered between the ground and the bottom edge. The level
   * straddles the top of the frame. The notch opens the top border and the
   * upper fill around the digit; the bottom row of the track stays one piece.
   */
  renderExperience() {
    const { ctx, canvas } = this;
    const outerW = BAR_TRACK_W + BAR_BORDER * 2;
    const outerH = BAR_TRACK_H + BAR_BORDER * 2;
    if (canvas.width < outerW + 4) return null;

    const left = Math.round((canvas.width - outerW) / 2);
    const mid = (this.groundY() + canvas.height) / 2;
    const top = Math.round(mid - outerH / 2);
    const innerLeft = left + BAR_BORDER;
    const innerTop = top + BAR_BORDER;

    const numberW = smallNumberWidth(this.level);
    const numberH = 5;
    const numberLeft = Math.round(left + outerW / 2 - numberW / 2);
    const numberTop = top - 3;
    const notchLeft = numberLeft - BAR_NOTCH_X;
    const notchTop = numberTop - 1;
    const notchW = numberW + BAR_NOTCH_X * 2;
    const notchH = innerTop + BAR_TRACK_H - 1 - notchTop;

    ctx.globalAlpha = GHOST_ALPHA;
    ctx.fillRect(innerLeft, innerTop, BAR_TRACK_W, BAR_TRACK_H);
    ctx.globalAlpha = 1;

    const ratio = this.nextLevelXp > 0 ? this.intoLevel / this.nextLevelXp : 0;
    if (ratio > 0) {
      const fillW = Math.min(BAR_TRACK_W, Math.max(1, Math.round(ratio * BAR_TRACK_W)));
      ctx.fillRect(innerLeft, innerTop, fillW, BAR_TRACK_H);
    }

    ctx.clearRect(notchLeft, notchTop, notchW, notchH);
    this.strokeBar(left, top, outerW, outerH, notchLeft, notchLeft + notchW);
    drawSmallNumber(ctx, this.level, numberLeft, numberTop);
    return { left, right: left + outerW };
  }

  /**
   * Map and upgrade buttons together on the lower left. The letter is a label
   * only. The pair is skipped when it would touch the bar.
   */
  renderCornerIcons(bar) {
    const { ctx } = this;
    const iconTop = this.canvas.height - 1 - MAP.length;
    const keyTop = iconTop + Math.floor((MAP.length - KEYCAP_H) / 2);

    const mapLeft = 2;
    const keyMLeft = mapLeft + MAP[0].length + 1;
    const upgradeLeft = keyMLeft + KEYCAP_W + 2;
    const keyULeft = upgradeLeft + UPGRADE[0].length + 1;
    const cluster = { left: mapLeft, right: keyULeft + KEYCAP_W };
    if (bar && cluster.left <= bar.right && cluster.right >= bar.left) return;

    drawSprite(ctx, MAP, mapLeft, iconTop);
    drawKeycap(ctx, 'M', keyMLeft, keyTop);
    drawSprite(ctx, UPGRADE, upgradeLeft, iconTop);
    drawKeycap(ctx, 'U', keyULeft, keyTop);
  }

  /** 1px frame. The top edge stops around the level; the other three sides stay closed. */
  strokeBar(left, top, width, height, gapLeft, gapRight) {
    const { ctx } = this;
    const right = left + width;
    if (gapLeft > left) ctx.fillRect(left, top, gapLeft - left, 1);
    if (gapRight < right) ctx.fillRect(gapRight, top, right - gapRight, 1);
    ctx.fillRect(left, top, 1, height);
    ctx.fillRect(right - 1, top, 1, height);
    ctx.fillRect(left, top + height - 1, width, 1);
  }
}
