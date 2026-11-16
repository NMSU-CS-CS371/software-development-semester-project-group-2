// Run the tests with: node --test tests/geometry.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceBetweenPoints,
  isPointInsidePolygonShape,
  isPointInsideAnyAnyPolygonInArrayList,
  boxAroundPolygon,
  middleOfPolygon,
  areaOfPolygon,
  distanceToPolygonEdge,
} from '../js/betterdirections/shared/geometry.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const neighbour = [[12, 0], [20, 0], [20, 10], [12, 10]];

test('a 3-4-5 triangle has a distance of 5', () => {
  assert.equal(calculateDistanceBetweenPoints([0, 0], [3, 4]), 5);
});

test('a point is inside or outside one polygon', () => {
  assert.equal(isPointInsidePolygonShape(5, 5, square), true);
  assert.equal(isPointInsidePolygonShape(15, 5, square), false);
});

test('a point is inside any polygon in a list', () => {
  assert.equal(isPointInsideAnyAnyPolygonInArrayList(15, 5, [square, neighbour]), true);
  assert.equal(isPointInsideAnyAnyPolygonInArrayList(11, 5, [square, neighbour]), false);
  assert.equal(isPointInsideAnyAnyPolygonInArrayList(5, 5, []), false);
});

test('box, middle and area of a square', () => {
  assert.deepEqual(boxAroundPolygon(square), { left: 0, top: 0, right: 10, bottom: 10 });
  assert.deepEqual(middleOfPolygon(square), [5, 5]);
  assert.equal(areaOfPolygon(square), 100);
});

test('distance from a point to the closest edge', () => {
  assert.equal(distanceToPolygonEdge(5, 3, square), 3);
  assert.equal(distanceToPolygonEdge(13, 5, square), 3);
});