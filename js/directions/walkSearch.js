/**
 * This file & what it does: the shortest walk across the open squares.
 * Why we have it: Dijkstra's search always expands the cheapest square next.
 * A square near a wall costs more, so the cheapest walk runs down the middle of the hallway.
 * The line is then reduced to its corners, so a straight hall is one straight segment.
 */

import { CENTRE_PULL, centreOf, neighboursOf } from './walkGrid.js';

/**
 * The open square closest to a point, or -1.
 * @param {object} grid
 * @param {number[]} point
 * @returns {number}
 */
export function nearestOpen(grid, point) {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < grid.walkable.length; i += 1) {
    if (!grid.walkable[i]) {
      continue;
    }
    const centre = centreOf(grid, i);
    const distance = Math.hypot(centre[0] - point[0], centre[1] - point[1]);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The open (hallway) square closest to this point, when one is within limit.
 * @param {object} grid
 * @param {number[]} point
 * @param {number} limit
 * @returns {number} square index, or -1
 */
export function nearestHall(grid, point, limit) {
  let best = -1;
  let bestDistance = limit;
  for (let i = 0; i < grid.walkable.length; i += 1) {
    if (!grid.walkable[i]) {
      continue;
    }
    const centre = centreOf(grid, i);
    const distance = Math.hypot(centre[0] - point[0], centre[1] - point[1]);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The open (hallway) square closest to this box, when one is within limit of its edge.
 * @param {object} grid
 * @param {{ left: number, top: number, right: number, bottom: number }} box
 * @param {number} limit
 * @returns {number} square index, or -1
 */
export function nearestHallBox(grid, box, limit) {
  let best = -1;
  let bestDistance = limit;
  for (let i = 0; i < grid.walkable.length; i += 1) {
    if (!grid.walkable[i]) {
      continue;
    }
    const centre = centreOf(grid, i);
    const x = Math.max(box.left, Math.min(box.right, centre[0]));
    const y = Math.max(box.top, Math.min(box.bottom, centre[1]));
    const distance = Math.hypot(centre[0] - x, centre[1] - y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Put a square on the cheap-first list.
 * @param {{ value: number, index: number }[]} heap
 * @param {number} value
 * @param {number} index
 */
function pushCheap(heap, value, index) {
  heap.push({ value: value, index: index });
  let at = heap.length - 1;
  while (at > 0) {
    const parent = Math.floor((at - 1) / 2);
    if (heap[parent].value <= heap[at].value) {
      break;
    }
    const swapped = heap[parent];
    heap[parent] = heap[at];
    heap[at] = swapped;
    at = parent;
  }
}

/**
 * Take off the cheapest square.
 * @param {{ value: number, index: number }[]} heap
 * @returns {{ value: number, index: number }}
 */
function popCheap(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last) {
    heap[0] = last;
    let at = 0;
    for (;;) {
      const left = at * 2 + 1;
      const right = left + 1;
      let smallest = at;
      if (left < heap.length && heap[left].value < heap[smallest].value) {
        smallest = left;
      }
      if (right < heap.length && heap[right].value < heap[smallest].value) {
        smallest = right;
      }
      if (smallest === at) {
        break;
      }
      const swapped = heap[at];
      heap[at] = heap[smallest];
      heap[smallest] = swapped;
      at = smallest;
    }
  }
  return top;
}

/**
 * Cheapest cost to every square, and which square each one was reached from.
 * @param {object} grid
 * @param {number[]} starts
 * @returns {{ cost: Float64Array, cameFrom: Int32Array }}
 */
export function searchFrom(grid, starts) {
  const cost = new Float64Array(grid.walkable.length);
  const cameFrom = new Int32Array(grid.walkable.length);
  cost.fill(Infinity);
  cameFrom.fill(-1);
  const heap = [];
  for (const start of starts) {
    if (start >= 0) {
      cost[start] = 0;
      pushCheap(heap, 0, start);
    }
  }
  while (heap.length > 0) {
    const top = popCheap(heap);
    if (top.value > cost[top.index]) {
      continue;
    }
    for (const neighbour of neighboursOf(grid, top.index)) {
      const nextCost = top.value + neighbour[1] * (1 + CENTRE_PULL / grid.clearance[neighbour[0]]);
      if (nextCost < cost[neighbour[0]]) {
        cost[neighbour[0]] = nextCost;
        cameFrom[neighbour[0]] = top.index;
        pushCheap(heap, nextCost, neighbour[0]);
      }
    }
  }
  return { cost: cost, cameFrom: cameFrom };
}

/**
 * The square that contains this plan point, or -1 when it falls outside the grid.
 * @param {object} grid
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function squareAt(grid, x, y) {
  let column = Math.floor((x - grid.left) / grid.step);
  let row = Math.floor((y - grid.top) / grid.step);
  if (column === grid.columns) {
    column -= 1;
  }
  if (row === grid.rows) {
    row -= 1;
  }
  if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) {
    return -1;
  }
  return row * grid.columns + column;
}

const CORNER_TOLERANCE = 0.9; /* squares a straight segment may drift from the middle line it replaces */
const AXIS_SLACK = 1.5; /* squares; a segment this close to straight is drawn straight, a slant beyond it turns at a right angle */
const RIDGE_REACH = 40; /* squares to climb from a wall toward the middle of a hallway */

/**
 * Move a square to the middle of its hallway by stepping toward more room until there is no more.
 * From a door this is the straight way across the hall.
 * @param {object} grid
 * @param {number} square
 * @returns {number}
 */
export function centreSquare(grid, square) {
  let here = square;
  for (let moves = 0; moves < RIDGE_REACH; moves += 1) {
    let best = here;
    for (const neighbour of neighboursOf(grid, here)) {
      if (grid.clearance[neighbour[0]] > grid.clearance[best]) {
        best = neighbour[0];
      }
    }
    if (best === here) {
      break;
    }
    here = best;
  }
  return here;
}

/**
 * Can you walk in a straight line between these squares without leaving the open floor?
 * @param {object} grid
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
function clearLine(grid, a, b) {
  const start = centreOf(grid, a);
  const end = centreOf(grid, b);
  const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / (grid.step * 0.5)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const index = squareAt(grid, start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t);
    if (index < 0 || !grid.walkable[index]) {
      return false;
    }
  }
  return true;
}

/**
 * How far square c sits from the straight line through squares a and b, in squares.
 * @param {object} grid
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
function drift(grid, a, b, c) {
  const from = centreOf(grid, a);
  const to = centreOf(grid, b);
  const at = centreOf(grid, c);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(at[0] - from[0], at[1] - from[1]) / grid.step;
  }
  return Math.abs((at[0] - from[0]) * dy - (at[1] - from[1]) * dx) / length / grid.step;
}

/**
 * Keep only the squares where the walk really turns (Douglas-Peucker).
 * A segment is kept only while it stays near the middle line and inside the hallway.
 * @param {object} grid
 * @param {number[]} squares
 * @param {number} first
 * @param {number} last
 * @param {Set<number>} kept - positions in squares that survive
 */
function keepCorners(grid, squares, first, last, kept) {
  let worst = first + 1;
  let worstDrift = -1;
  for (let i = first + 1; i < last; i += 1) {
    const away = drift(grid, squares[first], squares[last], squares[i]);
    if (away > worstDrift) {
      worstDrift = away;
      worst = i;
    }
  }
  if (last - first < 2 || (worstDrift <= CORNER_TOLERANCE && clearLine(grid, squares[first], squares[last]))) {
    return;
  }
  kept.add(worst);
  keepCorners(grid, squares, first, worst, kept);
  keepCorners(grid, squares, worst, last, kept);
}

/**
 * Does a straight segment between two plan points stay on open floor?
 * @param {object} grid
 * @param {number[]} from
 * @param {number[]} to
 * @returns {boolean}
 */
function openSegment(grid, from, to) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (grid.step * 0.5)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const index = squareAt(grid, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
    if (index < 0 || !grid.walkable[index]) {
      return false;
    }
  }
  return true;
}

/**
 * How much room there is around a plan point, in squares, or 0 off the open floor.
 * @param {object} grid
 * @param {number[]} point
 * @returns {number}
 */
function roomAround(grid, point) {
  const index = squareAt(grid, point[0], point[1]);
  return index < 0 ? 0 : grid.clearance[index];
}

/**
 * The corner where a slanted stretch between two points turns, or null to keep it slanted.
 * Halls meet at right angles, so the turn is one of the two right-angle corners, when that corner is still
 * well inside the hallway. A hallway that really runs on a diagonal has no such corner and stays diagonal.
 * @param {object} grid
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]|null}
 */
function rightAngleBetween(grid, a, b) {
  const slack = grid.step * AXIS_SLACK;
  if (Math.min(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) < slack) {
    return null;
  }
  const needed = 0.75 * Math.min(roomAround(grid, a), roomAround(grid, b));
  let best = null;
  for (const turn of [[a[0], b[1]], [b[0], a[1]]]) {
    const fits = roomAround(grid, turn) >= needed && openSegment(grid, a, turn) && openSegment(grid, turn, b);
    if (fits && (!best || roomAround(grid, turn) > roomAround(grid, best))) {
      best = turn;
    }
  }
  return best;
}

/**
 * Draw every nearly straight segment exactly straight.
 * Points joined by a near-vertical segment share one x, and by a near-horizontal one share one y.
 * The first and last points are real places (a door, a wall, a stair): their value wins, and a group
 * that would need two different real values is left alone. A point is never moved off the open floor.
 * @param {object} grid
 * @param {number[][]} points
 * @returns {number[][]}
 */
function squareUp(grid, points) {
  const last = points.length - 1;
  const slack = grid.step * AXIS_SLACK;
  const parent = points.flatMap((point, i) => [2 * i, 2 * i + 1]);
  const find = (key) => {
    while (parent[key] !== key) {
      parent[key] = parent[parent[key]];
      key = parent[key];
    }
    return key;
  };
  for (let i = 1; i <= last; i += 1) {
    const across = Math.abs(points[i][0] - points[i - 1][0]);
    const down = Math.abs(points[i][1] - points[i - 1][1]);
    if (across <= slack && across < down) {
      parent[find(2 * i)] = find(2 * (i - 1));
    } else if (down <= slack && down < across) {
      parent[find(2 * i + 1)] = find(2 * (i - 1) + 1);
    }
  }
  const groups = new Map();
  for (let key = 0; key < parent.length; key += 1) {
    const root = find(key);
    groups.set(root, [...(groups.get(root) || []), key]);
  }
  const value = (key) => points[Math.floor(key / 2)][key % 2];
  const shared = new Map();
  for (const [root, keys] of groups) {
    const fixed = keys.filter((key) => Math.floor(key / 2) === 0 || Math.floor(key / 2) === last).map(value);
    if (fixed.length > 0 && fixed.some((number) => number !== fixed[0])) {
      continue;
    }
    shared.set(root, fixed.length > 0 ? fixed[0] : keys.reduce((total, key) => total + value(key), 0) / keys.length);
  }
  return points.map((point, i) => {
    const moved = [0, 1].map((axis) => (shared.has(find(2 * i + axis)) ? shared.get(find(2 * i + axis)) : point[axis]));
    return roomAround(grid, moved) > 0 || i === 0 || i === last ? moved : point;
  });
}

/**
 * Is b on the straight line from a to c?
 * @param {number[]} a
 * @param {number[]} b
 * @param {number[]} c
 * @returns {boolean}
 */
function onLine(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0.5;
}

/**
 * The finished walk: straight segments drawn straight, slanted cuts at junctions turned into right-angle
 * corners, and no point in the middle of a straight run. The first and last points are real places.
 * @param {object} grid
 * @param {number[][]} points
 * @returns {number[][]}
 */
export function tidyLine(grid, points) {
  const squared = squareUp(grid, points);
  const turned = [squared[0]];
  for (let i = 1; i < squared.length; i += 1) {
    const interior = i > 1 && i < squared.length - 1;
    const turn = interior ? rightAngleBetween(grid, turned[turned.length - 1], squared[i]) : null;
    if (turn) {
      turned.push(turn);
    }
    turned.push(squared[i]);
  }
  const tidy = [turned[0]];
  for (let i = 1; i < turned.length; i += 1) {
    const last = tidy[tidy.length - 1];
    if (Math.hypot(turned[i][0] - last[0], turned[i][1] - last[1]) < 0.5) {
      continue;
    }
    if (tidy.length > 1 && onLine(tidy[tidy.length - 2], last, turned[i])) {
      tidy[tidy.length - 1] = turned[i];
    } else {
      tidy.push(turned[i]);
    }
  }
  return tidy.map((point) => [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10]);
}

/**
 * The squares from the start to the goal, as plan coordinates, reduced to the corners.
 * @param {object} grid
 * @param {Int32Array} cameFrom
 * @param {number} goal
 * @param {number[]} startPoint
 * @returns {number[][]}
 */
export function pathPoints(grid, cameFrom, goal, startPoint) {
  const squares = [];
  let square = goal;
  const seen = new Set();
  while (square !== -1 && !seen.has(square)) {
    seen.add(square);
    squares.push(square);
    square = cameFrom[square];
  }
  squares.reverse();
  const kept = new Set([0, squares.length - 1]);
  keepCorners(grid, squares, 0, squares.length - 1, kept);
  const points = [startPoint.slice()];
  for (const position of [...kept].sort((a, b) => a - b)) {
    const centre = centreOf(grid, squares[position]);
    points.push([Math.round(centre[0] * 10) / 10, Math.round(centre[1] * 10) / 10]);
  }
  return points;
}
