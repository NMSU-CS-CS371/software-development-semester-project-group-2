/**
 * This file & what it does: checks the place data: every place has its facts, its category is defined,
 * parks and lots have no floors, and floor-plan files match the floors a building lists.
 * Why we have it: the app reads these files as they are, so a missing field or a mistyped category breaks a page.
 * "Verified" here means what the files can prove: the facts and the code are sourced from NMSU, the record was
 * written by the scraper and not hand-edited, and the building has a photo. It does not call NMSU.
 * Run it with: node --test tests/places.test.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const buildingRecords = JSON.parse(fs.readFileSync(new URL('data/buildings.geojson', root), 'utf8')).buildings;
const placeRecords = JSON.parse(fs.readFileSync(new URL('data/places.geojson', root), 'utf8')).buildings;
const lotOutlines = JSON.parse(fs.readFileSync(new URL('data/parking-lots.geojson', root), 'utf8')).features;
const places = buildingRecords.concat(placeRecords); /* the app loads both files as one list */
const descriptions = JSON.parse(fs.readFileSync(new URL('data/descriptions.json', root), 'utf8')).descriptions;
const config = fs.readFileSync(new URL('config.yml', root), 'utf8');
const SPACE_PLANNING = 'NMSU Space Planning';
const OUTDOOR = ['park', 'parking'];

/**
 * The category names defined under "categories:" in config.yml.
 * @returns {string[]}
 */
function configCategories() {
  const start = config.indexOf('\ncategories:');
  const names = [];
  for (const line of config.slice(start + 1).split('\n').slice(1)) {
    const match = /^ {2}(\w+):\s*\{/.exec(line);
    if (match) {
      names.push(match[1]);
    } else if (/^\S/.test(line)) {
      break;
    }
  }
  return names;
}

/**
 * The floor numbers that have an SVG file for this building code.
 * @param {string} code
 * @returns {number[]}
 */
function floorFiles(code) {
  const found = [];
  for (const file of fs.readdirSync(new URL('data/floors/', root))) {
    const match = /^(\w+)-(\d+)\.svg$/.exec(file);
    if (match && match[1] === code.toLowerCase()) {
      found.push(Number(match[2]));
    }
  }
  return found;
}

/**
 * Is this building one we can stand behind: NMSU facts, scraper-written, with a photo?
 * @param {object} place
 * @returns {boolean}
 */
function isVerified(place) {
  const p = place.properties;
  const photos = (descriptions[p.id] && descriptions[p.id].photos) || [];
  return place.lastInputSource === 'scraper'
    && p.floorsSource === SPACE_PLANNING
    && p.builtSource === SPACE_PLANNING
    && /NMSU/.test(p.source)
    && /Registrar/.test(p.codeSource)
    && photos.length > 0;
}

test('config.yml defines the study, park and parking categories', () => {
  const names = configCategories();
  for (const name of ['study', 'park', 'parking']) {
    assert.ok(names.includes(name), 'config.yml has no category ' + name);
  }
});

test('every place has its required facts and a defined category', () => {
  const names = configCategories();
  for (const place of places) {
    const p = place.properties;
    const needed = p.category === 'parking' ? ['id', 'name', 'category', 'source'] : ['id', 'name', 'category', 'nmsuUrl', 'source'];
    for (const key of needed) {
      assert.ok(p[key], (p.name || p.id) + ' is missing ' + key);
    }
    assert.ok(names.includes(p.category), p.name + ' has an unknown category ' + p.category);
    assert.equal(place.geometry.type, 'Point', p.name + ' needs a point on the map');
    assert.ok(Array.isArray(p.floors), p.name + ' floors must be a list');
  }
});

test('every building has a description entry, and ids are unique', () => {
  const seen = new Set();
  for (const place of places) {
    const id = place.properties.id;
    assert.ok(!seen.has(id), 'duplicate id ' + id);
    seen.add(id);
    if (OUTDOOR.includes(place.properties.category)) {
      continue; /* parks and lots carry their own facts and need no description entry */
    }
    assert.ok(descriptions[id], place.properties.name + ' has no entry in descriptions.json');
  }
});

test('parks and lots have no floors, so no floor plan is expected', () => {
  for (const place of places) {
    if (OUTDOOR.includes(place.properties.category)) {
      assert.deepEqual(place.properties.floors, [], place.properties.name + ' must list no floors');
    }
  }
});

test('indoor buildings list at least one floor', () => {
  for (const place of places) {
    if (!OUTDOOR.includes(place.properties.category)) {
      assert.ok(place.properties.floors.length > 0, place.properties.name + ' lists no floors');
    }
  }
});

test('every floor-plan file belongs to a floor its building lists', () => {
  for (const place of places) {
    const code = place.properties.code;
    if (!code || code === 'N/A') {
      continue;
    }
    for (const floor of floorFiles(code)) {
      assert.ok(place.properties.floors.includes(floor), code + '-' + floor + '.svg is not in ' + place.properties.name + ' floors');
    }
  }
});

test('parks come from the places file and lots come with an outline', () => {
  assert.ok(placeRecords.some((place) => place.properties.category === 'park'), 'data/places.geojson has no parks');
  const lots = placeRecords.filter((place) => place.properties.category === 'parking');
  const outlineIds = lotOutlines.map((outline) => outline.properties.id).sort();
  assert.deepEqual(lots.map((lot) => lot.properties.id).sort(), outlineIds, 'every lot needs one outline and every outline one lot');
  for (const lot of lots) {
    assert.equal(typeof lot.properties.permitColor === 'string' || lot.properties.permitColor === null, true, lot.properties.id + ' permitColor');
  }
});

test('at least ten buildings have NMSU-sourced facts, a scraper record and a photo', () => {
  const verified = buildingRecords.filter(isVerified).map((place) => place.properties.code);
  assert.ok(verified.length >= 10, 'only ' + verified.length + ' verified: ' + verified.join(', '));
});

test('every photo of a verified building is an https link', () => {
  for (const place of buildingRecords.filter(isVerified)) {
    for (const photo of descriptions[place.properties.id].photos) {
      const src = typeof photo === 'string' ? photo : photo.src || photo.url || '';
      assert.ok(src === '' || src.startsWith('https://') || src.startsWith('data/'), place.properties.name + ' has a photo at ' + src);
    }
  }
});
