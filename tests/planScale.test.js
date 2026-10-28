/**
 * This file & what it does: checks the floor-plan sizing maths.
 * Why we have it: a big building has to stay bigger on screen than a small one, and a small one still has to be large enough to tap.
 * Run it with: node tests/planScale.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { footprintMetres } from '../js/logic/geo.js';
import { planBox, scaleBar } from '../js/logic/planScale.js';

test('a rectangle is measured along its walls, in metres', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [0.001, 0],
      [0.001, 0.002],
      [0, 0.002],
      [0, 0],
    ]],
  };
  const size = footprintMetres(geometry);
  const longSide = Math.max(size.width, size.depth);
  const shortSide = Math.min(size.width, size.depth);
  assert.ok(Math.abs(longSide - 222.64) < 1);
  assert.ok(Math.abs(shortSide - 111.32) < 1);
});

test('a shorter building is drawn smaller, and a tiny one stops at three quarters of the widest', () => {
  const wide = planBox({ width: 100, depth: 50 }, 100, 200, 100, 360, 400);
  const shorter = planBox({ width: 80, depth: 40 }, 100, 200, 100, 360, 400);
  const tiny = planBox({ width: 20, depth: 10 }, 100, 200, 100, 360, 400);
  assert.equal(wide.enlarged, false);
  assert.equal(wide.width, 360);
  assert.equal(shorter.enlarged, false);
  assert.equal(shorter.width, 288);
  assert.equal(tiny.enlarged, true);
  assert.equal(tiny.width, 270);
  assert.ok(tiny.width < shorter.width);
  assert.ok(shorter.width < wide.width);
});

test('a plan that would run off the screen is shrunk, and two floors keep the same long side', () => {
  const landscape = planBox({ width: 80, depth: 40 }, 100, 300, 150, 400, 500);
  const portrait = planBox({ width: 80, depth: 40 }, 100, 150, 300, 400, 500);
  assert.equal(Math.max(landscape.width, landscape.height), Math.max(portrait.width, portrait.height));
  assert.equal(landscape.enlarged, false);
  const tooTall = planBox({ width: 100, depth: 80 }, 100, 100, 200, 300, 120);
  assert.equal(tooTall.height, 120);
  assert.equal(tooTall.enlarged, false);
});

test('the scale bar is a round length and matches the drawing', () => {
  const box = planBox({ width: 100, depth: 40 }, 100, 250, 100, 400, 300);
  const bar = scaleBar(box.metresPerPixel, Math.max(box.width, box.height), 'imperial');
  assert.ok(bar.px >= 24);
  assert.ok(bar.px <= Math.max(box.width, box.height));
  assert.match(bar.label, /^\d+ ft$/);
  const feet = Number(bar.label.replace(' ft', ''));
  const metres = feet / 3.28084;
  assert.ok(Math.abs(metres / box.metresPerPixel - bar.px) < 1.5);
});
