/**
 * This file & what it does: checks a finished indoor walk and lists every place it goes where a person cannot.
 * Why we have it: a walk must stay on a hallway (or a passable room), never over empty space, a wall,
 * a stair core, an open-to-below void, or a room that is not marked passable.
 * The start and end of a walk are real places (a door, a stair, a room edge), so a short stretch there is allowed.
 */

const END_REACH = 30; /* plan units around the first and last point that are allowed to be off the hallway */
const BOX_PAD = 14; /* plan units around a stair or elevator box that still count as that stair or elevator */
const EDGE_SLACK = 2.5; /* plan units a point may sit outside a hallway edge: a line on the edge is on the hallway */
const SAMPLE_EVERY = 3; /* plan units between checked points */

/**
 * Is (x, y) inside the polygon?
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function inside(points, x, y) {
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
 * Is the point inside any of these shapes?
 * @param {number[][][]} shapes
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function insideAny(shapes, x, y) {
  for (const shape of shapes) {
    if (inside(shape, x, y)) {
      return true;
    }
  }
  return false;
}

/**
 * How far the point is from the edge of a shape.
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function edgeDistance(points, x, y) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const ax = points[i][0];
    const ay = points[i][1];
    const bx = points[(i + 1) % points.length][0];
    const by = points[(i + 1) % points.length][1];
    const dx = bx - ax;
    const dy = by - ay;
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) || 1)));
    best = Math.min(best, Math.hypot(x - (ax + along * dx), y - (ay + along * dy)));
  }
  return best;
}

/**
 * Is the point on a hallway, counting a hair outside its edge?
 * @param {number[][][]} halls
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function onHall(halls, x, y) {
  for (const hall of halls) {
    if (inside(hall, x, y) || edgeDistance(hall, x, y) <= EDGE_SLACK) {
      return true;
    }
  }
  return false;
}

/**
 * Is the point inside a stair or elevator box?
 * @param {{ box: object }[]} links
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function inLinkBox(links, x, y) {
  for (const link of links) {
    const box = link.box;
    if (x >= box.left - BOX_PAD && x <= box.right + BOX_PAD && y >= box.top - BOX_PAD && y <= box.bottom + BOX_PAD) {
      return true;
    }
  }
  return false;
}

/**
 * Points every few plan units along the line.
 * @param {number[][]} points
 * @returns {number[][]}
 */
function samplesOf(points) {
  const found = [];
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const steps = Math.max(1, Math.ceil(length / SAMPLE_EVERY));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      found.push([
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ]);
    }
  }
  return found;
}

/**
 * What is at this point, if a person cannot walk there?
 * @param {object} plan - from planFromMarkup()
 * @param {number} x
 * @param {number} y
 * @returns {string} '' when the point can be walked, otherwise 'empty', 'solid' or 'room'
 */
function problemAt(plan, x, y) {
  if (plan.halls.length === 0) {
    return insideAny(plan.outlines, x, y) ? '' : 'empty';
  }
  if (onHall(plan.halls, x, y)) {
    return insideAny(plan.solids, x, y) && !inLinkBox(plan.stairs, x, y) && !inLinkBox(plan.elevators, x, y) ? 'solid' : '';
  }
  if (inLinkBox(plan.stairs, x, y) || inLinkBox(plan.elevators, x, y)) {
    return '';
  }
  for (const room of plan.rooms) {
    if (room.passable && inside(room.points, x, y)) {
      return '';
    }
  }
  if (!insideAny(plan.outlines, x, y)) {
    return 'empty';
  }
  if (insideAny(plan.solids, x, y)) {
    return 'solid';
  }
  return 'room';
}

/**
 * Every place the line goes where a person cannot, so a test or a log can name them.
 * @param {object} plan - the floor the line is drawn on
 * @param {number[][]} points - the line
 * @returns {{ point: number[], kind: string }[]}
 */
export function routeProblems(plan, points) {
  if (points.length < 2) {
    return [];
  }
  const first = points[0];
  const last = points[points.length - 1];
  const problems = [];
  for (const point of samplesOf(points)) {
    if (Math.hypot(point[0] - first[0], point[1] - first[1]) < END_REACH || Math.hypot(point[0] - last[0], point[1] - last[1]) < END_REACH) {
      continue;
    }
    const kind = problemAt(plan, point[0], point[1]);
    if (kind) {
      problems.push({ point: point, kind: kind });
    }
  }
  return problems;
}
