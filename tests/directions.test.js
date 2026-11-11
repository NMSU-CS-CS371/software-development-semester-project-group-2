/**
 * This file & what it does: checks the maths behind directions: distances, entrance choice and turn-by-turn steps.
 * Why we have it: these run on every trip, and a wrong turn word or distance is easy to miss by eye.
 * Run it with: node --test tests/directions.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG } from '../js/core/config.js';
import { metresBetween } from '../js/logic/geo.js';
import { allNetworkPoints, nearestPoint, routeEnd, segmentCost, waysBySegment } from '../js/directions/routeMath.js';
import { formatDistance, planTrip } from '../js/directions/turns.js';

/* the same words and numbers as the directions section of config.yml */
CONFIG.directions = {
  speeds: { walk: 1.4, bike: 4.2, drive: 8.9 },
  turnLeftText: 'Turn left',
  turnRightText: 'Turn right',
  slightLeftText: 'Slight left',
  slightRightText: 'Slight right',
  continueText: 'Continue',
  headText: 'Head',
  onText: 'on',
  compass: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
  arriveText: 'Arrive at',
  ontoText: 'onto',
  minText: 'min',
  arrivalTimeText: 'arrive',
  slightTurnDegrees: 30,
  turnDegrees: 60,
  unnamedWays: { footway: 'the path', default: 'the street' },
};

const ORIGIN = [-106.75, 32.28];
const METRES_PER_DEGREE_LAT = 111320;

/**
 * A point this many metres north and east of the origin.
 * @param {number} north
 * @param {number} east
 * @returns {number[]} [lng, lat]
 */
function offset(north, east) {
  const latitude = ORIGIN[1] + north / METRES_PER_DEGREE_LAT;
  const longitude = ORIGIN[0] + east / (METRES_PER_DEGREE_LAT * Math.cos((ORIGIN[1] * Math.PI) / 180));
  return [longitude, latitude];
}

/**
 * A lookup that says every piece of the route is on the same named street.
 * @param {string} name
 * @returns {function(): object}
 */
function sameWay(name) {
  return () => ({ name: name, highway: 'footway' });
}

test('metresBetween measures a known distance', () => {
  const distance = metresBetween(ORIGIN, offset(100, 0));
  assert.ok(Math.abs(distance - 100) < 0.5, 'got ' + distance);
});

test('formatDistance gives feet and miles in imperial', () => {
  assert.equal(formatDistance(30, 'imperial'), '100 ft');
  assert.equal(formatDistance(1609, 'imperial'), '1.0 mi');
});

test('formatDistance gives metres and kilometres in metric', () => {
  assert.equal(formatDistance(120, 'metric'), '120 m');
  assert.equal(formatDistance(1500, 'metric'), '1.5 km');
});

test('segmentCost forbids driving against a one-way street', () => {
  const a = offset(0, 0);
  const b = offset(50, 0);
  assert.equal(segmentCost(a, b, { oneway: 'yes' }).backward, 0);
  assert.equal(segmentCost(a, b, { oneway: '-1' }).forward, 0);
  assert.ok(segmentCost(a, b, { oneway: 'no' }) > 40);
});

test('nearestPoint picks the closest network point', () => {
  const points = [offset(0, 0), offset(100, 0), offset(500, 0)];
  const best = nearestPoint(points, offset(90, 0));
  assert.deepEqual(best.point, points[1]);
});

test('routeEnd picks the door closest to you', () => {
  const network = { features: [{ geometry: { coordinates: [offset(0, 0), offset(0, 200)] } }] };
  const points = allNetworkPoints(network);
  const building = { doors: [offset(0, 0), offset(0, 200)], center: offset(50, 100) };
  const end = routeEnd(points, building, offset(0, 190));
  assert.deepEqual(end.door, building.doors[1]);
});

test('routeEnd uses the building pin when no door is mapped', () => {
  const network = { features: [{ geometry: { coordinates: [offset(0, 0), offset(0, 200)] } }] };
  const end = routeEnd(allNetworkPoints(network), { doors: [], center: offset(10, 5) }, offset(0, 190));
  assert.equal(end.door, null);
});

test('waysBySegment finds a way in both directions', () => {
  const a = offset(0, 0);
  const b = offset(50, 0);
  const ways = waysBySegment({ features: [{ properties: { name: 'Main St' }, geometry: { coordinates: [a, b] } }] });
  assert.equal(ways.get(a + '|' + b).name, 'Main St');
  assert.equal(ways.get(b + '|' + a).name, 'Main St');
});

test('a straight route says head north and ends with Arrive at', () => {
  const path = [offset(0, 0), offset(100, 0), offset(200, 0)];
  const trip = planTrip(0, path, sameWay('Main St'), 'Science Hall', 'walk', 'imperial');
  assert.equal(trip.steps[0].text, 'Head north on Main St');
  assert.equal(trip.steps[trip.steps.length - 1].text, 'Arrive at Science Hall');
  assert.equal(trip.steps.length, 2);
});

test('a right-angle turn to the east is announced as a right turn', () => {
  const path = [offset(0, 0), offset(100, 0), offset(100, 100)];
  let call = 0;
  const names = ['Main St', 'Oak Ave'];
  const wayBetween = () => ({ name: names[call++ === 0 ? 0 : 1], highway: 'footway' });
  const trip = planTrip(0, path, wayBetween, 'Science Hall', 'walk', 'imperial');
  assert.equal(trip.steps[1].text, 'Turn right onto Oak Ave');
});

test('a right-angle turn to the west is announced as a left turn', () => {
  const path = [offset(0, 0), offset(100, 0), offset(100, -100)];
  let call = 0;
  const names = ['Main St', 'Oak Ave'];
  const wayBetween = () => ({ name: names[call++ === 0 ? 0 : 1], highway: 'footway' });
  const trip = planTrip(0, path, wayBetween, 'Science Hall', 'walk', 'imperial');
  assert.equal(trip.steps[1].text, 'Turn left onto Oak Ave');
});

test('driving is quicker than walking over the same route', () => {
  const path = [offset(0, 0), offset(1000, 0)];
  const walk = planTrip(0, path, sameWay('Main St'), 'Science Hall', 'walk', 'imperial');
  const drive = planTrip(0, path, sameWay('Main St'), 'Science Hall', 'drive', 'imperial');
  const walkMinutes = parseInt(walk.summary, 10);
  const driveMinutes = parseInt(drive.summary, 10);
  assert.ok(driveMinutes < walkMinutes, walkMinutes + ' vs ' + driveMinutes);
});

test('a route with no points just says Arrive', () => {
  const trip = planTrip(20, [], sameWay('Main St'), 'Science Hall', 'walk', 'imperial');
  assert.equal(trip.instruction, 'Arrive at Science Hall');
});
