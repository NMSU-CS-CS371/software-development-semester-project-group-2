/**
 * This file & what it does: checks that a broken JSON file reports the file, the line, and the reason.
 * Why we have it: the startup screen is only useful if those three stay correct.
 * Run it with: node tests/jsonErrorLocator.test.js
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { locateJsonError, parseJsonText } from '../js/core/jsonErrorLocator.js';

test('a valid object has no error', () => {
  assert.equal(locateJsonError('{ "a": 1, "b": [true, false, null] }'), null);
});

test('a new entry inside the previous object names the line and the reason', () => {
  const text = [
    '{',
    '  "url": "https://bio.nmsu.edu/"',
    '  "172": { "name": "Hadley Hall" }',
    '}',
  ].join('\n');
  const found = locateJsonError(text);
  assert.equal(found.line, 3);
  assert.equal(found.column, 3);
  assert.match(found.hint, /pasted inside it/);
  assert.match(found.hint, /add }/);
  assert.throws(() => parseJsonText('data/descriptions.json', text), (error) => {
    assert.equal(error.name, 'JsonSyntaxError');
    assert.match(error.message, /Broken JSON in data\/descriptions\.json/);
    assert.match(error.message, /go to line 3/);
    assert.match(error.message, /"172"/);
    assert.match(error.message, /add }/);
    return true;
  });
});

test('a missing comma in a list names that line', () => {
  const text = '{ "coordinates": [\n  -106.75,\n  32.28\n  -106.75,\n  32.28\n] }';
  const found = locateJsonError(text);
  assert.equal(found.line, 4);
  assert.match(found.hint, /comma is missing/);
});

test('a missing } names where the file ended', () => {
  const found = locateJsonError('{ "a": { "x": 1 }');
  assert.equal(found.line, 1);
  assert.match(found.hint, /still open/);
});

test('a comma with nothing after it says to delete it', () => {
  const found = locateJsonError('{ "a": 1, }');
  assert.match(found.hint, /nothing after it/);
});

test('a leading zero says the number is not valid JSON', () => {
  const found = locateJsonError('{ "a": 01 }');
  assert.match(found.hint, /leading zero/);
});

test('an unclosed quote says to close the string', () => {
  const found = locateJsonError('{ "a": "hi }');
  assert.match(found.hint, /quote/);
});

test('the broken buildings file tells you which building to close', () => {
  const text = readFileSync('tests/fixtures/broken-buildings.geojson', 'utf8');
  assert.throws(() => parseJsonText('data/buildings.geojson', text), (error) => {
    assert.equal(error.name, 'JsonSyntaxError');
    assert.match(error.message, /Broken JSON in data\/buildings\.geojson/);
    assert.match(error.message, /go to line 226/);
    assert.match(error.message, /Biology Annex starts on line 182 and was never closed/);
    assert.match(error.message, /add }/);
    return true;
  });
});

test('the broken descriptions file tells you which entry to close', () => {
  const text = readFileSync('tests/fixtures/broken-descriptions.json', 'utf8');
  assert.throws(() => parseJsonText('data/descriptions.json', text), (error) => {
    assert.equal(error.name, 'JsonSyntaxError');
    assert.match(error.message, /Broken JSON in data\/descriptions\.json/);
    assert.match(error.message, /go to line 145/);
    assert.match(error.message, /"172"/);
    assert.match(error.message, /Entry "82" starts on line 137 and was never closed/);
    assert.match(error.message, /add }/);
    return true;
  });
});

test('every JSON file under data/ parses', () => {
  const files = [];
  function collect(directory) {
    for (const name of readdirSync(directory)) {
      const full = join(directory, name);
      if (statSync(full).isDirectory()) {
        collect(full);
      } else if (name.endsWith('.json') || name.endsWith('.geojson')) {
        files.push(full);
      }
    }
  }
  collect('data');
  assert.ok(files.length >= 3);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.equal(locateJsonError(text), null, file);
    assert.doesNotThrow(() => JSON.parse(text), file);
  }
});
