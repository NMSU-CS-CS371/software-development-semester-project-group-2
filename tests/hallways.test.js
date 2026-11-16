import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sizeOfHallwayInPixels,
  walkingAxisOfHallway,
  centerLineOfHallway,
  describeHallway,
} from '../js/betterdirections/indoor/hallways.js';

const wideHall = [[0, 0], [100, 0], [100, 10], [0, 10]];
const tallHall = [[0, 0], [10, 0], [10, 80], [0, 80]];

test('size of a hallway', () => {
  assert.deepEqual(sizeOfHallwayInPixels(wideHall), { width: 100, height: 10 });
  assert.deepEqual(sizeOfHallwayInPixels(tallHall), { width: 10, height: 80 });
});

test('walking axis', () => {
    assert.equal(walkingAxisOfHallway(wideHall), 'horizontal');
    assert.equal(walkingAxisOfHallway(tallHall), 'vertical');
  });

test('center line of a wide hallway is the middle y', () => {
  assert.deepEqual(centerLineOfHallway(wideHall), {
    start: [0, 5],
    end: [100, 5],
  });
});

test('center line of a tall hallway is the middle x', () => {
  assert.deepEqual(centerLineOfHallway(tallHall), {
    start: [5, 0],
    end: [5, 80],
  });
});

test('describeHallway puts it together', () => {
  const hall = describeHallway(wideHall);
  assert.equal(hall.width, 100);
  assert.equal(hall.height, 10);
  assert.equal(hall.walkingAxis, 'horizontal');
  assert.deepEqual(hall.middle, [50, 5]);
});