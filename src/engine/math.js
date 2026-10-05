/** Small helpers shared by games. */

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const randomBetween = (min, max) => min + Math.random() * (max - min);

/** Axis-aligned rectangle overlap test. Rects are { x, y, w, h }. */
export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
