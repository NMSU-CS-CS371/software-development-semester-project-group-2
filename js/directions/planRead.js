/**
 * This file & what it does: reads a floor-plan SVG into outlines, hallways, walls, doors, stairs, elevators, and rooms.
 * Why we have it: the walk needs those shapes. This file does not draw anything.
 */

import { elevatorName, isElevatorPath } from '../logic/elevators.js';

const BLOCKING = { room: true, ours: true, core: true, void: true };
const SOLID = { core: true, void: true };

/** The text of one attribute on an opening tag. */
function attr(tag, name) {
  const match = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag);
  return match ? match[1] : '';
}

/** Numbers in a points attribute, as [x, y] pairs. */
function pairNumbers(text) {
  const nums = text.trim().split(/[\s,]+/).map(Number);
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
      points.push([nums[i], nums[i + 1]]);
    }
  }
  return points;
}

/**
 * A room number such as 118 or R113.
 * @param {string} words
 * @returns {boolean}
 */
function isRoomNumber(words) {
  return /^[A-Za-z]{0,4}\s*\d+[A-Za-z]?$/.test(words.trim());
}

/**
 * A rectangle or polygon a person cannot walk through.
 * @param {string} tag
 * @param {string} kind
 * @returns {number[][]|null}
 */
function blockerPoints(tag, kind) {
  if (kind === 'rect') {
    const x = Number(attr(tag, 'x'));
    const y = Number(attr(tag, 'y'));
    const width = Number(attr(tag, 'width'));
    const height = Number(attr(tag, 'height'));
    if (!Number.isFinite(x) || !Number.isFinite(width) || width === 0 || height === 0) {
      return null;
    }
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  }
  if (kind === 'polygon') {
    const points = pairNumbers(attr(tag, 'points'));
    return points.length >= 3 ? points : null;
  }
  return null;
}

/**
 * Centre and box of the stair lines in one group.
 * The box is the drawing itself, so a landing can be the hall beside it.
 * @param {string} openTag
 * @param {string} inner
 * @returns {{ point: number[], box: { left: number, top: number, right: number, bottom: number } }|null}
 */
function stairCentre(openTag, inner) {
  const shift = /translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)/.exec(attr(openTag, 'transform'));
  const dx = shift ? Number(shift[1]) : 0;
  const dy = shift ? Number(shift[2]) : 0;
  let sx = 0;
  let sy = 0;
  let count = 0;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const lines = inner.match(/<line\b[^>]*>/gi) || [];
  for (const line of lines) {
    const x1 = Number(attr(line, 'x1'));
    const y1 = Number(attr(line, 'y1'));
    const x2 = Number(attr(line, 'x2'));
    const y2 = Number(attr(line, 'y2'));
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) {
      continue;
    }
    sx += x1 + x2;
    sy += y1 + y2;
    count += 2;
    left = Math.min(left, x1, x2);
    top = Math.min(top, y1, y2);
    right = Math.max(right, x1, x2);
    bottom = Math.max(bottom, y1, y2);
  }
  if (count === 0) {
    return null;
  }
  return {
    point: [sx / count + dx, sy / count + dy],
    box: { left: left + dx, top: top + dy, right: right + dx, bottom: bottom + dy },
  };
}

/**
 * A door or a floor outline. Returns true when the tag was one of those.
 * @param {object} plan
 * @param {string} kind
 * @param {string} tag
 * @param {string[]} names
 * @returns {boolean}
 */
function addDoorOrFloor(plan, kind, tag, names) {
  if (kind === 'line' && names.indexOf('door') !== -1) {
    const x1 = Number(attr(tag, 'x1'));
    const y1 = Number(attr(tag, 'y1'));
    const x2 = Number(attr(tag, 'x2'));
    const y2 = Number(attr(tag, 'y2'));
    if (Number.isFinite(x1) && Number.isFinite(y1)) {
      plan.doors.push([(x1 + x2) / 2, (y1 + y2) / 2]);
    }
    return true;
  }
  if (kind === 'polygon' && names.indexOf('floor') !== -1) {
    const points = pairNumbers(attr(tag, 'points'));
    if (points.length >= 3) {
      plan.outlines.push(points);
    }
    return true;
  }
  return false;
}

/**
 * A drawn hallway. The white floor around it is not one.
 * @param {object} plan
 * @param {string} kind
 * @param {string} tag
 * @param {string[]} names
 * @returns {boolean}
 */
function addHall(plan, kind, tag, names) {
  if (names.indexOf('hall') === -1) {
    return false;
  }
  const points = blockerPoints(tag, kind);
  if (points) {
    plan.halls.push(points);
  }
  return true;
}

/**
 * A wall. A room shape is returned so the next number can be attached to it.
 * Rooms can be walked through. Stair cores and open-to-below voids cannot.
 * @param {object} plan
 * @param {string} kind
 * @param {string} tag
 * @param {string[]} names
 * @returns {number[][]|null|undefined} undefined means this tag is not a wall
 */
function addWall(plan, kind, tag, names) {
  if (!names.some((name) => BLOCKING[name])) {
    return undefined;
  }
  const points = blockerPoints(tag, kind);
  if (points) {
    plan.blockers.push(points);
    if (names.some((name) => SOLID[name])) {
      plan.solids.push(points);
    } else {
      plan.passages.push(points);
    }
  }
  return points && names.indexOf('room') !== -1 ? points : null;
}

/**
 * The box around a shape.
 * @param {number[][]} points
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function boxOf(points) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * An elevator: an elevator icon drawn straight after a core block. The block is its shape.
 * The legend draws a plain box before its icon, not a core, so it never counts.
 * @param {object} plan
 * @param {string} markup
 * @param {RegExpExecArray} match
 * @param {number[][]|null} core - the core block the previous tag drew, or null
 */
function addElevator(plan, markup, match, core) {
  const close = markup.indexOf('</g>', match.index + match[0].length);
  const inner = close === -1 ? '' : markup.slice(match.index + match[0].length, close);
  const path = /<path\b[^>]*>/i.exec(inner);
  if (core && path && isElevatorPath(attr(path[0], 'd'))) {
    plan.elevators.push({ number: elevatorName(plan.elevators.length), points: core, box: boxOf(core) });
  }
}

/**
 * The shape of a core block, or null when this tag is anything else.
 * @param {RegExpExecArray} match
 * @returns {number[][]|null}
 */
function coreShape(match) {
  if (!match[1]) {
    return null;
  }
  const kind = match[1].toLowerCase();
  const names = attr(match[0], 'class').split(/\s+/);
  return names.indexOf('core') !== -1 ? blockerPoints(match[0], kind) : null;
}

/**
 * Add one tag to the plan. A room shape is remembered until its number is read.
 * @param {object} plan
 * @param {string} markup
 * @param {RegExpExecArray} match
 * @param {number[][]|null} pending
 * @param {number[][]|null} core - the core block the previous tag drew, or null
 * @returns {number[][]|null}
 */
function addTag(plan, markup, match, pending, core) {
  if (match[0] === '</g>') {
    return null;
  }
  const kind = match[1].toLowerCase();
  const tag = match[0];
  const names = attr(tag, 'class').split(/\s+/).filter(Boolean);
  if (kind === 'g' && names.indexOf('stair') !== -1) {
    const close = markup.indexOf('</g>', match.index + match[0].length);
    const inner = close === -1 ? '' : markup.slice(match.index + match[0].length, close);
    const stair = stairCentre(tag, inner);
    if (stair) {
      plan.stairs.push(stair);
    }
    return null;
  }
  if (kind === 'g' && names.indexOf('icon') !== -1) {
    addElevator(plan, markup, match, core);
    return null;
  }
  if (addDoorOrFloor(plan, kind, tag, names)) {
    return null;
  }
  if (addHall(plan, kind, tag, names)) {
    return null;
  }
  const wall = addWall(plan, kind, tag, names);
  if (wall !== undefined) {
    return wall;
  }
  if (kind === 'text' && pending) {
    const written = markup.slice(match.index + match[0].length).match(/^([^<]*)/);
    const words = written ? written[1].trim() : '';
    if (isRoomNumber(words)) {
      plan.rooms.push({ number: words, points: pending });
    }
    return null;
  }
  return null;
}

/**
 * Outlines, hallways, walls, doors, stairs, and rooms from one floor-plan file.
 * @param {string} markup
 * @returns {object}
 */
export function planFromMarkup(markup) {
  const plan = {
    outlines: [],
    blockers: [],
    halls: [],
    passages: [],
    solids: [],
    doors: [],
    stairs: [],
    elevators: [],
    rooms: [],
  };
  const tags = /<(polygon|rect|line|text|g)\b([^>]*?)\/?>|<\/g>/gi;
  let pending = null;
  let core = null;
  let match = tags.exec(markup);
  while (match) {
    pending = addTag(plan, markup, match, pending, core);
    core = coreShape(match);
    match = tags.exec(markup);
  }
  return plan;
}
