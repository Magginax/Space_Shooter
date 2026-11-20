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

// Login ground decoration.
export const SKULL = [
  '.####.',
  '#.##.#',
  '######',
  '.#..#.',
  '.####.',
];

// Folded map: three islands and a short road between them.
export const MAP = [
  '###########',
  '#.#.#.....#',
  '##..#.....#',
  '#......##.#',
  '#......##.#',
  '#.....#...#',
  '#....##...#',
  '#....##...#',
  '#.##.#....#',
  '#.##......#',
  '###########',
];

// A coin. The top row is inset, so it reads low if it shares a box with a bar.
export const COIN = [
  '.###.',
  '#####',
  '##.##',
  '#####',
  '.###.',
];

// Matching frame. Three up-chevrons, the retro rank-up mark.
export const UPGRADE = [
  '###########',
  '#....#....#',
  '#...#.#...#',
  '#..#...#..#',
  '#....#....#',
  '#...#.#...#',
  '#..#...#..#',
  '#....#....#',
  '#...#.#...#',
  '#..#...#..#',
  '###########',
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

// Compact 3×5 digits for the experience level. One row is one pixel.
const SMALL_DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '.#.'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '##.', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '..#', '..#', '..#'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];
const SMALL_DIGIT_W = 3;
const SMALL_DIGIT_GAP = 1;

/** Width of `value` drawn by drawSmallNumber. */
export function smallNumberWidth(value) {
  const digits = String(Math.max(0, Math.floor(value))).length;
  return digits * SMALL_DIGIT_W + (digits - 1) * SMALL_DIGIT_GAP;
}

// 5×5 letters. A 3×5 glyph sat on the frame, so M and U both collapsed into a bar.
const KEY_GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
};
const KEY_PAD = 1;
export const KEYCAP_W = KEY_GLYPHS.M[0].length + KEY_PAD * 2 + 2;
export const KEYCAP_H = KEY_GLYPHS.M.length + KEY_PAD * 2 + 2;

/** A 9×9 keycap: 1px frame, 1px of air, then the letter. `glyph` is "M" or "U". */
export function drawKeycap(ctx, glyph, x, y) {
  const rows = KEY_GLYPHS[glyph];
  const left = Math.round(x);
  const top = Math.round(y);
  ctx.fillRect(left, top, KEYCAP_W, 1);
  ctx.fillRect(left, top + KEYCAP_H - 1, KEYCAP_W, 1);
  ctx.fillRect(left, top, 1, KEYCAP_H);
  ctx.fillRect(left + KEYCAP_W - 1, top, 1, KEYCAP_H);
  const ox = left + 1 + KEY_PAD;
  const oy = top + 1 + KEY_PAD;
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] === '#') ctx.fillRect(ox + dx, oy + dy, 1, 1);
    }
  });
}

/** `value` in 3×5 digits whose left edge is at `left`. Lit pixels only. */
export function drawSmallNumber(ctx, value, left, top) {
  const text = String(Math.max(0, Math.floor(value)));
  let x = Math.round(left);
  const y = Math.round(top);
  for (const char of text) {
    SMALL_DIGITS[Number(char)].forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] === '#') ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    });
    x += SMALL_DIGIT_W + SMALL_DIGIT_GAP;
  }
}

// 3×5 uppercase. One row is one pixel high. A space is a blank cell.
const FONT = {
  0: SMALL_DIGITS[0],
  1: SMALL_DIGITS[1],
  2: SMALL_DIGITS[2],
  3: SMALL_DIGITS[3],
  4: SMALL_DIGITS[4],
  5: SMALL_DIGITS[5],
  6: SMALL_DIGITS[6],
  7: SMALL_DIGITS[7],
  8: SMALL_DIGITS[8],
  9: SMALL_DIGITS[9],
  A: ['###', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['##.', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['###', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '#.#', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  ' ': ['...', '...', '...', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
};
const FONT_W = 3;
const FONT_GAP = 1;
export const FONT_H = 5;

/** Width of `text` drawn by drawText. Unknown characters take a blank cell. */
export function textWidth(text) {
  const count = [...text].length;
  if (count === 0) return 0;
  return count * FONT_W + (count - 1) * FONT_GAP;
}

/** Uppercase `text` in 3×5 letters whose left edge is at `left`. */
export function drawText(ctx, text, left, top) {
  let x = Math.round(left);
  const y = Math.round(top);
  for (const char of text) {
    const glyph = FONT[char] ?? FONT[' '];
    glyph.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] === '#') ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    });
    x += FONT_W + FONT_GAP;
  }
}

/** `value` in 7-segment digits whose right edge is at `right`. A space shows only the ghost segments. */
export function drawNumber(ctx, value, digits, right, top) {
  const text = String(value).padStart(digits, '0').slice(-digits);
  [...text].forEach((char, i) => {
    const left = right - (digits - i) * 7 + 2;
    for (const [segment, [x, y, w, h]] of Object.entries(SEGMENT_RECTS)) {
      ctx.globalAlpha = (DIGIT_SEGMENTS[char] ?? '').includes(segment) ? 1 : GHOST_ALPHA;
      ctx.fillRect(left + x, top + y, w, h);
    }
  });
  ctx.globalAlpha = 1;
}
