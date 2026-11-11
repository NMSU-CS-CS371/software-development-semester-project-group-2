/**
 * This file & what it does: checks that no indoor walk goes where a person cannot, in every building we have a plan for.
 * Why we have it: a walk over empty space, a wall, a stair core or a closed room is the bug people notice first.
 * It also checks that a walk may turn at 45 degrees, and that a room marked "room passable" can be crossed.
 * Run it with: node --test tests/routeCheck.test.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planFromMarkup } from '../js/directions/planRead.js';
import { routeProblems } from '../js/directions/routeCheck.js';
import { routeLegs } from '../js/directions/route.js';

const FLOORS = new URL('../data/floors/', import.meta.url);

/**
 * Every floor of every building, as { code: { floor: markup } }.
 * @returns {Object.<string, Object.<number, string>>}
 */
function allFloors() {
  const buildings = {};
  for (const file of fs.readdirSync(FLOORS)) {
    const match = /^(\w+)-(\d+)\.svg$/.exec(file);
    if (!match) {
      continue;
    }
    if (!buildings[match[1]]) {
      buildings[match[1]] = {};
    }
    buildings[match[1]][Number(match[2])] = fs.readFileSync(new URL(file, FLOORS), 'utf8');
  }
  return buildings;
}

const buildings = allFloors();

for (const code of Object.keys(buildings)) {
  const floors = Object.keys(buildings[code]).map(Number).sort((a, b) => a - b);
  const entryFloor = floors.includes(1) ? 1 : floors[0];

  test(code + ': no walk goes over empty space, a wall, a stair core or a closed room', () => {
    const plans = {};
    for (const floor of floors) {
      plans[floor] = planFromMarkup(buildings[code][floor]);
    }
    for (const floor of floors) {
      for (const room of plans[floor].rooms) {
        const result = routeLegs(buildings[code][entryFloor], buildings[code][floor], room.number, entryFloor, floor);
        for (const leg of result.legs || []) {
          const problems = routeProblems(plans[leg.floor], leg.points);
          assert.equal(problems.length, 0, code + ' floor ' + floor + ' room ' + room.number + ' goes ' + (problems[0] && problems[0].kind) + ' at ' + (problems[0] && problems[0].point.map(Math.round).join(',')));
        }
      }
    }
  });
}

test('a walk may turn at 45 degrees instead of only at right angles', () => {
  const markup = buildings.ay[1];
  const plan = planFromMarkup(markup);
  let diagonals = 0;
  for (const room of plan.rooms) {
    const result = routeLegs(markup, markup, room.number, 1, 1);
    for (const leg of result.legs || []) {
      for (let i = 1; i < leg.points.length; i += 1) {
        const across = Math.abs(leg.points[i][0] - leg.points[i - 1][0]);
        const down = Math.abs(leg.points[i][1] - leg.points[i - 1][1]);
        if (across > 8 && down > 8 && Math.abs(across - down) / Math.max(across, down) < 0.15) {
          diagonals += 1;
        }
      }
    }
  }
  assert.ok(diagonals > 0, 'expected at least one 45 degree segment');
});

/**
 * A small plan: a hall on the left, a hall on the right, and a middle room between them.
 * @param {string} middleClass
 * @returns {string}
 */
function planWithMiddle(middleClass) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">',
    '<polygon class="floor" points="0,0 300,0 300,200 0,200"/>',
    '<polygon class="hall" points="0,80 100,80 100,120 0,120"/>',
    '<polygon class="hall" points="200,80 300,80 300,120 200,120"/>',
    '<polygon class="' + middleClass + '" points="100,80 200,80 200,120 100,120"/>',
    '<text>110</text>',
    '<polygon class="room" points="220,120 300,120 300,200 220,200"/>',
    '<text>102</text>',
    '<line class="door" x1="0" y1="90" x2="0" y2="110"/>',
    '</svg>',
  ].join('\n');
}

test('a closed room in the way means no walk', () => {
  const markup = planWithMiddle('room');
  assert.equal(routeLegs(markup, markup, '102', 1, 1).legs, null);
});

test('a room marked passable can be walked through', () => {
  const markup = planWithMiddle('room passable');
  const plan = planFromMarkup(markup);
  assert.equal(plan.rooms.find((room) => room.number === '110').passable, true);
  const result = routeLegs(markup, markup, '102', 1, 1);
  assert.ok(result.legs, 'a walk exists through the passable room');
  const points = result.legs[0].points;
  let crossed = false;
  for (let i = 1; i < points.length; i += 1) {
    const from = Math.min(points[i - 1][0], points[i][0]);
    const to = Math.max(points[i - 1][0], points[i][0]);
    if (from < 110 && to > 190) {
      crossed = true;
    }
  }
  assert.ok(crossed, 'the line goes through the middle room');
  assert.equal(routeProblems(plan, result.legs[0].points).length, 0);
});

test('a stair core can never be crossed, even next to a passable room', () => {
  const markup = planWithMiddle('core');
  assert.equal(routeLegs(markup, markup, '102', 1, 1).legs, null);
});
