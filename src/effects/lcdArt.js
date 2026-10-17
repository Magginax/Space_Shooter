// Pixel art and 7-segment digits shared by the login LCD and the game.
// One character is one pixel. A list of two sprites is two frames.

// Real LCD segments never fully disappear: unlit ones show faintly ("ghost 8").
export const GHOST_ALPHA = 0.1;

export const SHIP = [
  '###........',
  '.###.......',
  '..#######..',
  '####..#####',
  '..#######..',
  '.###.......',
  '###........',
];

export const DART = [
  ['....#.#.', '...##.#.', '..####.#', '#######.', '..####.#', '...##.#.', '....#.#.'],
  ['....##..', '...#.#.#', '..###.#.', '########', '..###.#.', '...#.#.#', '....##..'],
];

export const HEART = [
  '.##...##.',
  '####.####',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
];

// Which segments (a-g) each digit lights, and where each segment sits
// inside a 5x9 pixel digit: [x, y, width, height].
const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const SEGMENT_RECTS = {
  a: [1, 0, 3, 1],
  b: [4, 1, 1, 3],
  c: [4, 5, 1, 3],
  d: [1, 8, 3, 1],
  e: [0, 5, 1, 3],
  f: [0, 1, 1, 3],
  g: [1, 4, 3, 1],
};

/** Axis-aligned box of a sprite placed at x, y. */
export const spriteBox = (sprite, x, y) => ({ x, y, w: sprite[0].length, h: sprite.length });

export function drawSprite(ctx, sprite, x, y) {
  const left = Math.round(x);
  const top = Math.round(y);
  sprite.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] === '#') ctx.fillRect(left + dx, top + dy, 1, 1);
    }
  });
}

/** `value` in 7-segment digits whose right edge is at `right`. */
export function drawNumber(ctx, value, digits, right, top) {
  const text = String(value).padStart(digits, '0').slice(-digits);
  [...text].forEach((char, i) => {
    const left = right - (digits - i) * 7 + 2;
    for (const [segment, [x, y, w, h]] of Object.entries(SEGMENT_RECTS)) {
      ctx.globalAlpha = DIGIT_SEGMENTS[char].includes(segment) ? 1 : GHOST_ALPHA;
      ctx.fillRect(left + x, top + y, w, h);
    }
  });
  ctx.globalAlpha = 1;
}
