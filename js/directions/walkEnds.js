/**
 * This file & what it does: the two ends of a walk, the door or stairs and the room.
 * Why we have it: the grid search finds squares down the middle of the hallway. This file turns those
 * squares into a line that starts at a real door or stair and stops at the middle of a room's hallway wall.
 * The last stretch leaves the hallway centre at a right angle to that wall.
 */

import { centreOf } from './walkGrid.js';
import { centreSquare, nearestOpen, pathPoints, tidyLine } from './walkSearch.js';

const MIN_FRONTAGE = 3; /* wall samples that must face the hallway, so a corner that only brushes it is not a door */

/**
 * Square index of each start, and the point that square belongs to.
 * @param {object} grid
 * @param {number[][]} places
 * @returns {{ starts: number[], startAt: Map<number, number[]> }}
 */
export function startsFor(grid, places) {
  const startAt = new Map();
  const starts = [];
  for (const place of places) {
    const square = nearestOpen(grid, place);
    if (square >= 0 && !startAt.has(square)) {
      startAt.set(square, place);
      starts.push(square);
    }
  }
  return { starts: starts, startAt: startAt };
}

/**
 * Follow cameFrom back until the square is one of the starts.
 * @param {Int32Array} cameFrom
 * @param {number} goal
 * @param {Map<number, number[]>} startAt
 * @returns {number[]|null}
 */
export function startPointOf(cameFrom, goal, startAt) {
  let square = goal;
  const seen = new Set();
  while (square >= 0 && cameFrom[square] !== -1 && !startAt.has(square) && !seen.has(square)) {
    seen.add(square);
    square = cameFrom[square];
  }
  return startAt.get(square) || null;
}

/**
 * Average of the room's corners.
 * @param {number[][]} points
 * @returns {number[]}
 */
function roomCentre(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

/**
 * Points along one wall, about one grid step apart.
 * @param {number[]} start
 * @param {number[]} end
 * @param {number} step
 * @returns {number[][]}
 */
function wallSamples(start, end, step) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const count = Math.max(2, Math.round(length / step));
  const samples = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    samples.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
  }
  return samples;
}

/**
 * The unit vector at a right angle to this wall, pointing out of the room.
 * @param {number[]} start
 * @param {number[]} end
 * @param {number[]} centre
 * @returns {number[]}
 */
function wallNormal(start, end, centre) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  let nx = -(end[1] - start[1]) / length;
  let ny = (end[0] - start[0]) / length;
  const outward = ((start[0] + end[0]) / 2 - centre[0]) * nx + ((start[1] + end[1]) / 2 - centre[1]) * ny;
  if (outward < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/**
 * The open square just outside this wall point, when the hallway is right there.
 * @param {object} grid
 * @param {{ cost: Float64Array }} found
 * @param {number[]} point
 * @param {number[]} normal
 * @returns {number} square index, or -1
 */
function hallSquare(grid, found, point, normal) {
  const outside = [point[0] + normal[0] * grid.step * 1.5, point[1] + normal[1] * grid.step * 1.5];
  const square = nearestOpen(grid, outside);
  if (square < 0 || found.cost[square] === Infinity) {
    return -1;
  }
  const spot = centreOf(grid, square);
  if (Math.hypot(spot[0] - outside[0], spot[1] - outside[1]) > grid.step * 2.5) {
    return -1;
  }
  /* Straight out from this wall. A square around the corner is not this wall's door. */
  return outwardFrom(point, spot, normal) >= grid.step * 0.5 && sideways(point, spot, normal) <= grid.step ? square : -1;
}

/**
 * How far a spot sits out from a wall point, along the wall's normal.
 * @param {number[]} point
 * @param {number[]} spot
 * @param {number[]} normal
 * @returns {number}
 */
function outwardFrom(point, spot, normal) {
  return (spot[0] - point[0]) * normal[0] + (spot[1] - point[1]) * normal[1];
}

/**
 * How far a spot sits to the side of the line straight out from a wall point.
 * @param {number[]} point
 * @param {number[]} spot
 * @param {number[]} normal
 * @returns {number}
 */
function sideways(point, spot, normal) {
  return Math.abs((spot[0] - point[0]) * -normal[1] + (spot[1] - point[1]) * normal[0]);
}

/**
 * Is (x, y) inside the polygon?
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function contains(points, x, y) {
  let result = false;
  for (let i = 0; i < points.length; i += 1) {
    const x1 = points[i][0];
    const y1 = points[i][1];
    const next = points[(i + 1) % points.length];
    if ((y1 > y) !== (next[1] > y) && x < x1 + ((y - y1) * (next[0] - x1)) / (next[1] - y1)) {
      result = !result;
    }
  }
  return result;
}

/**
 * The line from the landing to this wall point stays on open floor.
 * Samples inside the destination room are the door itself, so they do not count.
 * The last square before the wall is often only partly hallway, so the check stops one square short of it.
 * @param {object} grid
 * @param {number} square
 * @param {number[]} point
 * @param {number[][]} room
 * @returns {boolean}
 */
function sees(grid, square, point, room) {
  const from = centreOf(grid, square);
  const distance = Math.hypot(point[0] - from[0], point[1] - from[1]);
  const checked = Math.max(0, distance - grid.step);
  const steps = Math.max(1, Math.ceil(checked / (grid.step * 0.45)));
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * (checked / (distance || 1));
    const x = from[0] + (point[0] - from[0]) * t;
    const y = from[1] + (point[1] - from[1]) * t;
    if (contains(room, x, y)) {
      continue;
    }
    const column = Math.floor((x - grid.left) / grid.step);
    const row = Math.floor((y - grid.top) / grid.step);
    if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) {
      return false;
    }
    if (!grid.walkable[row * grid.columns + column]) {
      return false; /* the line would cross a room, a stair, a void, or the white floor */
    }
  }
  return true;
}

/**
 * Indexes of the longest run of consecutive wall samples.
 * @param {number[]} open
 * @returns {number[]}
 */
function longestRun(open) {
  let best = [];
  let start = 0;
  for (let i = 1; i <= open.length; i += 1) {
    const broken = i === open.length || open[i] !== open[i - 1] + 1;
    if (!broken) {
      continue;
    }
    const run = open.slice(start, i);
    if (run.length > best.length) {
      best = run;
    }
    start = i;
  }
  return best;
}

/**
 * Door on one wall: the middle of the stretch that faces the hallway, off the corner.
 * The landing is the middle of the hallway straight out from that door.
 * @param {object} grid
 * @param {{ cost: Float64Array }} found
 * @param {number[]} start
 * @param {number[]} end
 * @param {number[]} centre
 * @param {number[][]} room
 * @returns {{ square: number, mid: number[], normal: number[], reach: number }|null}
 */
function doorOnWall(grid, found, start, end, centre, room) {
  const normal = wallNormal(start, end, centre);
  const samples = wallSamples(start, end, grid.step);
  const open = [];
  const squares = [];
  for (let i = 0; i < samples.length; i += 1) {
    const square = hallSquare(grid, found, samples[i], normal);
    squares.push(square);
    if (square >= 0) {
      open.push(i);
    }
  }
  const run = longestRun(open);
  if (run.length < MIN_FRONTAGE) {
    return null;
  }
  const middle = run[Math.floor((run.length - 1) / 2)];
  let chosen = -1;
  let bestOff = Infinity;
  for (const index of run) {
    if (index === 0 || index === samples.length - 1 || !sees(grid, squares[index], samples[index], room)) {
      continue;
    }
    const off = Math.abs(index - middle);
    if (off < bestOff) {
      bestOff = off;
      chosen = index;
    }
  }
  if (chosen < 0) {
    return null;
  }
  const landing = centreSquare(grid, squares[chosen]);
  const usable = found.cost[landing] !== Infinity &&
    sideways(samples[chosen], centreOf(grid, landing), normal) <= grid.step &&
    sees(grid, landing, samples[chosen], room);
  return { square: usable ? landing : squares[chosen], mid: samples[chosen], normal: normal, reach: run.length };
}

/**
 * The hallway door on the side the walk arrives from. The shorter walk wins.
 * @param {object} grid
 * @param {{ cost: Float64Array }} found
 * @param {number[][]} roomPoints
 * @returns {{ square: number, mid: number[], normal: number[], reach: number }|null}
 */
function doorway(grid, found, roomPoints) {
  const centre = roomCentre(roomPoints);
  let best = null;
  for (let i = 0; i < roomPoints.length; i += 1) {
    const door = doorOnWall(grid, found, roomPoints[i], roomPoints[(i + 1) % roomPoints.length], centre, roomPoints);
    if (!door) {
      continue;
    }
    const cost = found.cost[door.square];
    if (!best || cost < found.cost[best.square] || (cost === found.cost[best.square] && door.reach > best.reach)) {
      best = door;
    }
  }
  return best;
}

/**
 * The walk down the hallway centre, then one right-angle turn to the middle of the room's hallway wall.
 * @param {object} grid
 * @param {{ cost: Float64Array, cameFrom: Int32Array }} found
 * @param {number[][]} roomPoints
 * @param {Map<number, number[]>} startAt
 * @returns {number[][]|null}
 */
export function pathToRoom(grid, found, roomPoints, startAt) {
  const door = doorway(grid, found, roomPoints);
  if (!door) {
    return null;
  }
  const startPoint = startPointOf(found.cameFrom, door.square, startAt);
  if (!startPoint) {
    return null;
  }
  const points = pathPoints(grid, found.cameFrom, door.square, startPoint);
  /* The turn sits on the hallway centre, straight out from the door. */
  const reachOut = outwardFrom(door.mid, points[points.length - 1], door.normal);
  points[points.length - 1] = roundPoint([
    door.mid[0] + door.normal[0] * reachOut,
    door.mid[1] + door.normal[1] * reachOut,
  ]);
  points.push(roundPoint(door.mid));
  return tidyLine(grid, points);
}

/**
 * Length of a drawn line.
 * @param {number[][]} points
 * @returns {number}
 */
export function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/**
 * One rounded point.
 * @param {number[]} point
 * @returns {number[]}
 */
export function roundPoint(point) {
  return [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10];
}

/**
 * The room or elevator with this number, or null.
 * @param {object} plan
 * @param {string} roomNumber
 * @returns {{ number: string, points: number[][] }|null}
 */
export function roomByNumber(plan, roomNumber) {
  const want = String(roomNumber).toLowerCase();
  for (const room of [...plan.rooms, ...plan.elevators]) {
    if (room.number.toLowerCase() === want) {
      return room;
    }
  }
  return null;
}
