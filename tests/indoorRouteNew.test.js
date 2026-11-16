import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { indoorWalk, walkWords } from '../js/betterdirections/indoor/indoorRoute.js';

const markup = fs.readFileSync(new URL('../data/floors/ay-1.svg', import.meta.url), 'utf8');

test('AY-1 same floor has a walk from a door to a room', () => {
  const result = indoorWalk(markup, markup, '103', 1, 1);
  assert.ok(result.legs, 'should find a walk');
  assert.ok(result.legs[0].points.length >= 2);
  assert.equal(walkWords(result, 1, '103').includes('103'), true);
});

test('different floor walks to a stair then the other floor', () => {
  const result = indoorWalk(markup, markup, '103', 1, 2);
  assert.ok(result.legs);
  assert.equal(result.legs.length, 2);
  assert.equal(result.via, 'stairs');
});
