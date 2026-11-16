import test from 'node:test';
import assert from 'node:assert/strict';
import { describeHallway } from '../js/betterdirections/indoor/hallways.js';
import { closestPointOnLine, placeOnNearestHallway } from '../js/betterdirections/indoor/placeOnHallway.js';

test('closest point on a horizontal line', () => {
  assert.deepEqual(closestPointOnLine([50, 20], [0, 5], [100, 5]), [50, 5]);
});

test('a door beside a hall snaps onto the centre line', () => {
  const hall = describeHallway([[0, 0], [100, 0], [100, 10], [0, 10]]);
  const placed = placeOnNearestHallway([20, 25], [hall]);
  assert.equal(placed.HallwayIndex, 0);
  assert.deepEqual(placed.SpotOnHallway, [20, 5]);
});
