/** Grid coordinates. (0, 2) is the left end of the middle row. */
export const NODES = {
  start: { id: 'start', x: 0, y: 2, links: { right: 'bend' } },
  bend: {
    id: 'bend',
    x: 1,
    y: 2,
    links: { left: 'start', up: 'north', down: 'south', right: 'level' },
  },
  north: { id: 'north', x: 1, y: 1, links: { left: 'west', down: 'bend' } },
  west: { id: 'west', x: 0, y: 1, links: { right: 'north' } },
  south: { id: 'south', x: 1, y: 3, links: { up: 'bend' } },
  level: {
    id: 'level',
    x: 2,
    y: 2,
    levelId: 'endless',
    links: { left: 'bend', right: 'east', down: 'below' },
  },
  east: { id: 'east', x: 3, y: 2, requires: 'endless', links: { left: 'level' } },
  below: { id: 'below', x: 2, y: 3, requires: 'endless', links: { up: 'level' } },
};

export const START_NODE = 'start';

/** Each path drawn once. Built from the links so the picture cannot drift. */
export const EDGES = Object.values(NODES).flatMap((node) =>
  Object.values(node.links)
    .filter((nextId) => node.id < nextId)
    .map((nextId) => [node.id, nextId]),
);

/**
 * One step along the path.
 * A node that `requires` a level stays out of reach until that id is in
 * `cleared`. The endless level is never cleared, so the path stops on it.
 * Stepping back off that level stays allowed.
 * @param {string} nodeId
 * @param {'up' | 'down' | 'left' | 'right'} direction
 * @param {ReadonlySet<string>} cleared
 * @returns {string}
 */
export function step(nodeId, direction, cleared) {
  const nextId = NODES[nodeId]?.links[direction];
  if (!nextId) return nodeId;
  const next = NODES[nextId];
  if (next.requires && !cleared.has(next.requires)) return nodeId;
  return nextId;
}

/** The level a confirm key would start, or null when the node is only path. */
export function levelIdAt(nodeId) {
  return NODES[nodeId]?.levelId ?? null;
}
