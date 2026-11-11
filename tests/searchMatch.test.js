/**
 * This file & what it does: checks that typed text finds the right buildings and rooms.
 * Why we have it: class schedules write rooms as "SH 118A", and search must accept that.
 * Run it with: node --test tests/searchMatch.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingMatches, buildingWords, roomScore, startNewSearch, typedWords } from '../js/logic/searchMatch.js';

const science = { code: 'SH', id: '100', name: 'Science Hall', address: '1780 E University Ave', propertyNumber: '100' };
const hardman = { code: 'HA', id: '323', name: 'Hardman and Jacobs Undergraduate Learning Center', address: '2902 McFie Cir.', propertyNumber: '323' };

/**
 * Does the typed text find the building?
 * @param {string} typed
 * @param {object} building
 * @returns {boolean}
 */
function finds(typed, building) {
  startNewSearch();
  return buildingMatches(typedWords(typed), buildingWords(building));
}

/**
 * How well the typed text matches a room.
 * @param {string} typed
 * @param {string} number
 * @param {object} building
 * @returns {number}
 */
function score(typed, number, building) {
  startNewSearch();
  return roomScore(typedWords(typed), { number: number }, building, buildingWords(building));
}

test('typedWords splits on punctuation and lowercases', () => {
  assert.deepEqual(typedWords('SH-205 Hall'), ['sh', '205', 'hall']);
  assert.deepEqual(typedWords('   '), []);
});

test('a building is found by code, name start and property number', () => {
  assert.equal(finds('SH', science), true);
  assert.equal(finds('sci', science), true);
  assert.equal(finds('science hall', science), true);
  assert.equal(finds('323', hardman), true);
});

test('a building is not found by an unrelated word', () => {
  assert.equal(finds('library', science), false);
  assert.equal(finds('', science), false);
});

test('a small typo is allowed in longer words only', () => {
  assert.equal(finds('harmon', hardman), true);
  assert.equal(finds('hardmen', hardman), true);
  assert.equal(finds('sx', science), false);
});

test('a room written like a class schedule matches: "SH 118A"', () => {
  assert.equal(score('SH 118A', '118A', science), 2);
});

test('a room with no space matches: "SH118A"', () => {
  assert.equal(score('sh118a', '118A', science), 2);
});

test('a bare room number matches any building', () => {
  assert.equal(score('118a', '118A', science), 2);
});

test('the start of a room number is a weaker match', () => {
  assert.equal(score('SH 118', '118A', science), 1);
});

test('a room does not match with the wrong building code', () => {
  assert.equal(score('BC 118A', '118A', science), 0);
});

test('a room does not match a different number', () => {
  assert.equal(score('SH 205', '118A', science), 0);
});
