import { test, expect } from '@playwright/test';
import { SpaceShooterGame } from '../../src/games/space-shooter/SpaceShooterGame.js';
import { DART } from '../../src/effects/lcdArt.js';

const STEP = 1 / 60;

function installBrowserFakes() {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== fn));
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
    },
    matchMedia() {
      return { matches: false };
    },
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
}

function fakeCanvas() {
  const screen = {
    clientWidth: 900,
    clientHeight: 500,
    style: { setProperty() {} },
  };
  const wrapper = { style: {}, parentElement: screen };
  return {
    width: 0,
    height: 0,
    dataset: {},
    parentElement: wrapper,
    getContext() {
      return {
        fillRect() {},
        clearRect() {},
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        fillStyle: '#000',
      };
    },
  };
}

function press(key) {
  window.dispatchEvent({ type: 'keydown', key });
}

function release(key) {
  window.dispatchEvent({ type: 'keyup', key });
}

function releaseAll(...keys) {
  for (const key of keys) release(key);
}

/** A dart that stays put unless a test gives it a speed. */
function dart(x, y, extra = {}) {
  return { kind: DART, x, baseY: y, y, speed: 0, amp: 0, phase: 0, points: 50, ...extra };
}

function step(game, frames = 1) {
  for (let i = 0; i < frames; i++) game.update(STEP);
}

test.describe('Space shooter rules', () => {
  /** @type {SpaceShooterGame} */
  let game;
  let scores;
  let gameOvers;

  test.beforeEach(() => {
    installBrowserFakes();
    scores = [];
    gameOvers = [];
    game = new SpaceShooterGame(fakeCanvas(), {
      onScore: (score) => scores.push(score),
      onGameOver: (score) => gameOvers.push(score),
    });
    game.spawnTimer = 999;
  });

  test.afterEach(() => {
    game.destroy();
  });

  /** A round with an empty field, so a test can place exactly the darts it needs. */
  function beginRound() {
    game.setState('running');
    game.enemies = [];
    game.bullets = [];
    game.spawnTimer = 999;
  }

  function placeOnBulletLine(x) {
    const box = game.shipBox();
    game.enemies.push(dart(x, box.y));
    return box;
  }

  test.describe('states', () => {
    test('a new game is idle with three hearts and no score', () => {
      expect(game.state).toBe('idle');
      expect(game.canvas.dataset).toMatchObject({ state: 'idle', lives: '3', score: '0' });
      expect(game.lives).toBe(3);
      expect(game.score).toBe(0);
      expect(scores).toEqual([0]);
      expect(gameOvers).toEqual([]);
      expect(game.loop.running).toBe(false);
    });

    test('PLAY starts a round and spawns the opening wave on the ship', () => {
      game.start();

      expect(game.state).toBe('running');
      expect(game.canvas.dataset.state).toBe('running');
      expect(game.loop.running).toBe(true);
      expect(game.lives).toBe(3);
      expect(game.score).toBe(0);
      expect(game.enemies).toHaveLength(3);
      expect(game.enemies.every((enemy) => enemy.points === 50)).toBe(true);

      const box = game.shipBox();
      const centre = game.enemies.find((enemy) => enemy.baseY === box.y);
      expect(centre).toBeTruthy();
      expect(centre.amp).toBe(0);
    });

    test('PLAY again while the round is running does not reset it', () => {
      game.start();
      game.addScore(50);
      game.lives = 2;
      const enemies = game.enemies.length;

      game.start();

      expect(game.state).toBe('running');
      expect(game.score).toBe(50);
      expect(game.lives).toBe(2);
      expect(game.enemies).toHaveLength(enemies);
      expect(gameOvers).toEqual([]);
    });

    test('game over from idle or from an ended round is ignored', () => {
      game.gameOver();
      expect(game.state).toBe('idle');
      expect(gameOvers).toEqual([]);

      game.start();
      game.lives = 1;
      game.enemies = [dart(game.shipBox().x, game.shipBox().y)];
      step(game);

      expect(game.state).toBe('over');
      expect(gameOvers).toEqual([0]);
      game.gameOver();
      expect(gameOvers).toEqual([0]);
      expect(game.loop.running).toBe(false);
    });

    test('PLAY after game over starts a fresh round', () => {
      game.start();
      game.addScore(50);
      game.lives = 1;
      game.enemies = [dart(game.shipBox().x, game.shipBox().y)];
      step(game);
      expect(game.state).toBe('over');

      game.start();

      expect(game.state).toBe('running');
      expect(game.canvas.dataset).toMatchObject({ state: 'running', lives: '3', score: '0' });
      expect(game.score).toBe(0);
      expect(game.lives).toBe(3);
      expect(game.loop.running).toBe(true);
      expect(scores.at(-1)).toBe(0);
    });
  });

  test.describe('input', () => {
    test('arrow keys and W S move the ship, and releasing them stops it', () => {
      beginRound();
      const startY = game.ship.y;

      press('ArrowUp');
      step(game, 3);
      expect(game.ship.y).toBeLessThan(startY);
      release('ArrowUp');
      const held = game.ship.y;
      step(game, 3);
      expect(game.ship.y).toBe(held);

      press('s');
      step(game, 3);
      expect(game.ship.y).toBeGreaterThan(held);
      release('s');
    });

    test('W and ArrowUp together move as fast as one of them', () => {
      beginRound();
      const startY = game.ship.y;
      press('ArrowUp');
      step(game);
      const oneKey = startY - game.ship.y;
      release('ArrowUp');

      game.ship.y = startY;
      press('ArrowUp');
      press('w');
      step(game);
      expect(startY - game.ship.y).toBeCloseTo(oneKey);
      releaseAll('ArrowUp', 'w');
    });

    test('opposite directions cancel, and unbound keys do nothing', () => {
      beginRound();
      const startY = game.ship.y;

      press('ArrowUp');
      press('ArrowDown');
      step(game, 10);
      expect(game.ship.y).toBe(startY);
      releaseAll('ArrowUp', 'ArrowDown');

      press('W');
      press('S');
      step(game, 5);
      expect(game.ship.y).toBe(startY);
      releaseAll('W', 'S');

      press('ArrowLeft');
      press('ArrowRight');
      press('d');
      press('Enter');
      step(game, 5);
      expect(game.ship.y).toBe(startY);
      expect(game.bullets).toHaveLength(0);
      releaseAll('ArrowLeft', 'ArrowRight', 'd', 'Enter');
    });

    test('the ship stops at the top and the bottom of the playfield', () => {
      beginRound();

      press('ArrowUp');
      step(game, 300);
      expect(game.ship.y).toBe(game.top());
      release('ArrowUp');

      press('ArrowDown');
      step(game, 300);
      expect(game.ship.y).toBe(game.bottom() - game.shipBox().h);
      release('ArrowDown');
    });

    test('Space fires, the cooldown blocks another shot, then a shot is allowed again', () => {
      beginRound();
      press(' ');

      step(game);
      expect(game.bullets).toHaveLength(1);

      while (game.ship.cooldown > STEP) step(game);
      expect(game.bullets).toHaveLength(1);

      step(game);
      expect(game.bullets).toHaveLength(2);
      release(' ');
    });

    test('letting go of Space, or already having 8 bullets, does not fire', () => {
      beginRound();
      step(game);
      expect(game.bullets).toHaveLength(0);

      press(' ');
      step(game);
      release(' ');
      game.ship.cooldown = 0;
      step(game);
      expect(game.bullets).toHaveLength(1);

      press(' ');
      for (let i = game.bullets.length; i < 8; i++) {
        game.ship.cooldown = 0;
        step(game);
      }
      expect(game.bullets).toHaveLength(8);
      game.ship.cooldown = 0;
      step(game);
      expect(game.bullets).toHaveLength(8);
      release(' ');
    });
  });

  test.describe('score', () => {
    test('a bullet that hits a dart scores 50 once and removes both', () => {
      beginRound();
      const box = placeOnBulletLine(game.shipBox().x + game.shipBox().w + 6);
      game.bullets.push({ x: box.x + box.w + 7, y: box.y + 3 }, { x: box.x + box.w + 8, y: box.y + 3 });

      step(game);

      expect(game.score).toBe(50);
      expect(game.canvas.dataset.score).toBe('50');
      expect(scores.at(-1)).toBe(50);
      expect(game.enemies).toHaveLength(0);
    });

    test('two darts score 100', () => {
      beginRound();
      const box = game.shipBox();
      game.enemies.push(dart(box.x + box.w + 4, box.y), dart(box.x + box.w + 20, box.y));
      press(' ');

      step(game, 40);

      expect(game.score).toBe(100);
      expect(game.canvas.dataset.score).toBe('100');
      release(' ');
    });

    test('a miss, a dart off the bullet row, and a dart that leaves the screen score nothing', () => {
      beginRound();
      press(' ');
      step(game);
      release(' ');
      step(game, 90);
      expect(game.bullets).toHaveLength(0);
      expect(game.score).toBe(0);

      const box = game.shipBox();
      game.enemies = [dart(box.x + box.w + 4, box.y + 30)];
      press(' ');
      step(game, 30);
      expect(game.score).toBe(0);
      expect(game.enemies).toHaveLength(1);
      release(' ');

      game.enemies = [dart(-8, box.y, { speed: 26 })];
      step(game, 5);
      expect(game.enemies).toHaveLength(0);
      expect(game.score).toBe(0);
      expect(game.lives).toBe(3);
    });

    test('a new wave appears only when its timer runs out', () => {
      beginRound();
      game.spawnTimer = 5;
      step(game, 10);
      expect(game.enemies).toHaveLength(0);

      game.spawnTimer = STEP;
      step(game);
      expect(game.enemies).toHaveLength(3);
      expect(game.enemies.every((enemy) => enemy.points === 50)).toBe(true);
    });
  });

  test.describe('damage', () => {
    test('a dart that misses the ship costs no heart', () => {
      beginRound();
      const box = game.shipBox();
      game.enemies = [dart(box.x + 40, box.y), dart(30, -20)];

      step(game);

      expect(game.lives).toBe(3);
      expect(game.canvas.dataset.lives).toBe('3');
      expect(game.ship.blink).toBe(0);
      expect(game.state).toBe('running');
    });

    test('a hit costs one heart, and another hit during the blink does not', () => {
      beginRound();
      const box = game.shipBox();
      game.enemies = [dart(box.x, box.y)];

      step(game);

      expect(game.lives).toBe(2);
      expect(game.canvas.dataset.lives).toBe('2');
      expect(game.ship.blink).toBeCloseTo(1.2);
      expect(game.enemies).toHaveLength(0);
      expect(game.state).toBe('running');

      game.enemies = [dart(game.shipBox().x, game.shipBox().y)];
      while (game.ship.blink > STEP) step(game);
      expect(game.lives).toBe(2);

      step(game);
      expect(game.lives).toBe(1);
      expect(game.canvas.dataset.lives).toBe('1');
    });

    test('the third heart ends the round and reports the score once', () => {
      beginRound();
      placeOnBulletLine(game.shipBox().x + game.shipBox().w + 4);
      press(' ');
      step(game, 20);
      expect(game.score).toBe(50);
      release(' ');

      game.lives = 1;
      game.enemies = [dart(game.shipBox().x, game.shipBox().y)];
      step(game);

      expect(game.lives).toBe(0);
      expect(game.canvas.dataset).toMatchObject({ state: 'over', lives: '0', score: '50' });
      expect(gameOvers).toEqual([50]);
      expect(game.loop.running).toBe(false);

      game.enemies = [dart(game.shipBox().x, game.shipBox().y)];
      step(game);
      expect(game.lives).toBe(0);
      expect(gameOvers).toEqual([50]);
    });
  });
});
