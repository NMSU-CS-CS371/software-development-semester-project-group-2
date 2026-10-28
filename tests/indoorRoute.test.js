/**
 * This file & what it does: checks that an indoor walk stays in the middle of the hallways.
 * Why we have it: a shortcut through a classroom, a stair core, or a crack in the plan is the bug.
 * Run it with: node tests/indoorRoute.test.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planFromMarkup } from '../js/directions/planRead.js';
import { routeLegs } from '../js/directions/route.js';

const markup = fs.readFileSync(new URL('../data/floors/ay-1.svg', import.meta.url), 'utf8');
const plan = planFromMarkup(markup);

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
 * Distance from a point to a polygon, or 0 when the point is inside.
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function edgeDistance(points, x, y) {
  if (inside(points, x, y)) {
    return 0;
  }
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
 * Points every few plan units along the drawn line.
 * @param {number[][]} points
 * @returns {number[][]}
 */
function samples(points) {
  const found = [];
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const steps = Math.max(1, Math.ceil(length / 4));
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
 * The drawn walk to this room.
 * @param {string} number
 * @returns {number[][]}
 */
function walk(number) {
  const result = routeLegs(markup, markup, number, 1, 1);
  assert.ok(result.legs, number + ' has a walk');
  return result.legs[0].points;
}

/**
 * How far this point sits from the nearest hallway.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function gap(x, y) {
  let best = Infinity;
  for (const shape of plan.halls) {
    best = Math.min(best, edgeDistance(shape, x, y));
  }
  return best;
}

test('a room with no hallway on its walls has no walk, instead of a shortcut through other rooms', () => {
  for (const number of ['111', '111A', '109A', '100A']) {
    assert.equal(routeLegs(markup, markup, number, 1, 1).legs, null, number + ' has no walk');
  }
});

test('a hallway room is reached by one line down the hallway centre', () => {
  const points = walk('103');
  assert.equal(points.length, 5);
  assert.deepEqual(points[0], [410, 102.5]);
  assert.equal(points[1][0], 371); /* the middle of the long hall at x 340-405 */
  assert.deepEqual(points[points.length - 1], [397.5, 640]);
});

test('every room on this floor is reached along a hallway', () => {
  for (const room of plan.rooms) {
    const result = routeLegs(markup, markup, room.number, 1, 1);
    if (!result.legs) {
      continue;
    }
    const points = result.legs[0].points;
    const start = points[0];
    for (const point of samples(points)) {
      if (Math.hypot(point[0] - start[0], point[1] - start[1]) < 24) {
        continue;
      }
      assert.ok(gap(point[0], point[1]) <= 8, room.number + ' leaves the hallway');
    }
  }
});

test('a walk never covers another room', () => {
  for (const room of plan.rooms) {
    const result = routeLegs(markup, markup, room.number, 1, 1);
    if (!result.legs) {
      continue;
    }
    for (const point of samples(result.legs[0].points)) {
      for (const other of plan.rooms) {
        if (other !== room && inside(other.points, point[0], point[1]) && gap(point[0], point[1]) > 8) {
          assert.fail(room.number + ' covers room ' + other.number);
        }
      }
    }
  }
});

test('every segment is straight up-and-down or sideways in a building of square halls', () => {
  /* 3 units of slack: a few drawn room walls are 1 or 2 units off level */
  for (const room of plan.rooms) {
    const result = routeLegs(markup, markup, room.number, 1, 1);
    if (!result.legs) {
      continue;
    }
    const points = result.legs[0].points;
    for (let i = 1; i < points.length; i += 1) {
      const dx = Math.abs(points[i][0] - points[i - 1][0]);
      const dy = Math.abs(points[i][1] - points[i - 1][1]);
      assert.ok(Math.min(dx, dy) < 3, room.number + ' slants at ' + points[i].join(','));
    }
  }
});

const foster = fs.readFileSync(new URL('../data/floors/fh-1.svg', import.meta.url), 'utf8');
const fosterUp = fs.readFileSync(new URL('../data/floors/fh-2.svg', import.meta.url), 'utf8');

/**
 * The drawn walk on Foster Hall's entry floor.
 * @param {string} number
 * @returns {{ points: number[][], main: boolean }}
 */
function fosterWalk(number) {
  const result = routeLegs(foster, foster, number, 1, 1);
  assert.ok(result.legs, number + ' has a walk');
  assert.equal(result.main, true);
  return { points: result.legs[0].points, main: result.main };
}

test('Foster Hall starts at the main entrance, not the side exit', () => {
  for (const number of ['R107B', 'R160A', '160', 'CS 150']) {
    const start = fosterWalk(number).points[0];
    assert.ok(Math.hypot(start[0] - 2062, start[1] - 555) < 5, number + ' starts at ' + start.join(','));
  }
});

test('R107B is met on the hall side, not by looping to the side exit', () => {
  const points = fosterWalk('R107B').points;
  const end = points[points.length - 1];
  const onHallSide = end[1] < 640 || end[0] < 530;
  assert.ok(onHallSide, 'ends at ' + end.join(','));
  const notch = samples(points).filter((point) => point[0] > 640 && point[0] < 820 && point[1] > 660 && point[1] < 860);
  assert.equal(notch.length, 0);
});

test('an upper floor uses a stair the hallway can reach', () => {
  const result = routeLegs(foster, fosterUp, '212', 1, 2);
  assert.ok(result.legs, '212 has a walk');
  assert.equal(result.legs.length, 2);
  const stair = result.legs[0].points[result.legs[0].points.length - 1];
  assert.ok(Math.hypot(stair[0] - 884, stair[1] - 938) > 80, 'stair at ' + stair.join(','));
  const start = result.legs[0].points[0];
  assert.ok(Math.hypot(start[0] - 2062, start[1] - 555) < 5);
});

test('an elevator is read from its icon, and is a place the walk can go to', () => {
  const elevator = plan.elevators[0];
  assert.equal(elevator.number, 'Elevator 1');
  const result = routeLegs(markup, markup, 'Elevator 1', 1, 1);
  assert.ok(result.legs, 'Elevator 1 has a walk');
  for (const point of samples(result.legs[0].points)) {
    const inside = point[0] > elevator.box.left + 8 && point[0] < elevator.box.right - 8 &&
      point[1] > elevator.box.top + 8 && point[1] < elevator.box.bottom - 8;
    assert.equal(inside, false, 'the walk goes into the elevator at ' + point.join(','));
  }
});

test('a walk never crosses an elevator on its way to another room', () => {
  const elevator = plan.elevators[0];
  for (const room of plan.rooms) {
    const result = routeLegs(markup, markup, room.number, 1, 1);
    for (const point of samples(result.legs ? result.legs[0].points : [])) {
      assert.ok(!inside(elevator.points, point[0], point[1]) || gap(point[0], point[1]) <= 8, room.number + ' crosses the elevator');
    }
  }
});

test('an upper floor prefers the stairs, and offers the elevator when both reach the room', () => {
  const stairs = routeLegs(foster, fosterUp, '212', 1, 2, 'stairs');
  assert.ok(stairs.legs, '212 has a walk');
  assert.equal(stairs.via, 'stairs');
  const elevator = routeLegs(foster, fosterUp, '212', 1, 2, 'elevator');
  if (stairs.canSwitch) {
    assert.equal(elevator.via, 'elevator');
    assert.equal(elevator.canSwitch, true);
  } else {
    assert.equal(elevator.via, 'stairs', 'with only one way up, that way is used');
  }
});
