/**
 * This file & what it does: the shortest walk on a floor plan, from the main entrance to a room.
 * Why we have it: the info sheet only draws the line. The search lives in the files next to this one.
 * The main entrance is the door that opens onto the largest hallway. Other EXIT marks are not starts.
 * A later public entrance is used only when that main hall cannot reach the room.
 * A room above the entry floor is two walks: main entrance to a stair the hall actually touches,
 * then that stair to the room. Stairs come first. An elevator is used when no stair works, or when asked for.
 */

import { placeLabel } from '../logic/elevators.js';
import { planFromMarkup } from './planRead.js';
import { lineLength, pathToRoom, roomByNumber, roundPoint, startPointOf, startsFor } from './walkEnds.js';
import { centreOf, makeGrid } from './walkGrid.js';
import { centreSquare, nearestHall, nearestHallBox, pathPoints, searchFrom, tidyLine } from './walkSearch.js';

const DOOR_REACH = 4.5; /* hallway squares within this many steps of a door make it an entrance */
const STAIR_REACH = 2; /* hallway squares this many steps from the stair drawing, plus a small pad */
const STAIR_PAD = 8;

/**
 * Is (x, y) inside the polygon?
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function contains(points, x, y) {
  let result = false;
  for (let i = 0; i < points.length; i += 1) {
    const x1 = points[i][0];
    const y1 = points[i][1];
    const next = points[(i + 1) % points.length];
    if ((y1 > y) !== (next[1] > y) && x < x1 + ((y - y1) * (next[0] - x1)) / (next[1] - y1)) {
      result = !result;
    }
  }
  return result;
}

/**
 * Area of a polygon.
 * @param {number[][]} points
 * @returns {number}
 */
function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i][0] * next[1] - next[0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Distance from a point to a polygon's edge.
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function ringDistance(points, x, y) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const ax = points[i][0];
    const ay = points[i][1];
    const bx = points[(i + 1) % points.length][0];
    const by = points[(i + 1) % points.length][1];
    const dx = bx - ax;
    const dy = by - ay;
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) || 1)));
    best = Math.min(best, Math.hypot(x - (ax + along * dx), y - (ay + along * dy)));
  }
  return best;
}

/**
 * The hallway shape under this landing, or the nearest one.
 * @param {object} plan
 * @param {number[]} spot
 * @returns {number}
 */
function hallOf(plan, spot) {
  let best = -1;
  let bestArea = -1;
  for (let i = 0; i < plan.halls.length; i += 1) {
    if (!contains(plan.halls[i], spot[0], spot[1])) {
      continue;
    }
    const area = ringArea(plan.halls[i]);
    if (area > bestArea) {
      best = i;
      bestArea = area;
    }
  }
  if (best >= 0) {
    return best;
  }
  let bestDistance = Infinity;
  for (let i = 0; i < plan.halls.length; i += 1) {
    const distance = ringDistance(plan.halls[i], spot[0], spot[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Doors grouped by the hallway they open onto, largest hall first.
 * A door with no hallway beside it is not an entrance.
 * With no hallway shapes, every door is an entrance.
 * @param {object} plan
 * @param {object} grid
 * @returns {{ doors: number[][], main: boolean }[]}
 */
function entranceGroups(plan, grid) {
  if (!plan.halls.length) {
    return plan.doors.length ? [{ doors: plan.doors, main: true }] : [];
  }
  const groups = new Map();
  const limit = grid.step * DOOR_REACH;
  for (const door of plan.doors) {
    const square = nearestHall(grid, door, limit);
    if (square < 0) {
      continue;
    }
    const index = hallOf(plan, centreOf(grid, square));
    if (index < 0) {
      continue;
    }
    let group = groups.get(index);
    if (!group) {
      group = { area: ringArea(plan.halls[index]), doors: [] };
      groups.set(index, group);
    }
    group.doors.push(door);
  }
  const ordered = [...groups.values()].sort((a, b) => b.area - a.area);
  return ordered.map((group, index) => ({ doors: group.doors, main: index === 0 }));
}

/**
 * Start squares on the hallway beside these doors, each remembering its door.
 * @param {object} grid
 * @param {number[][]} doors
 * @param {boolean} halls
 * @returns {{ starts: number[], startAt: Map<number, number[]> }}
 */
function hallStarts(grid, doors, halls) {
  if (!halls) {
    return startsFor(grid, doors);
  }
  const startAt = new Map();
  const starts = [];
  const limit = grid.step * DOOR_REACH;
  for (const door of doors) {
    const near = nearestHall(grid, door, limit);
    const square = near >= 0 ? centreSquare(grid, near) : -1;
    if (square >= 0 && !startAt.has(square)) {
      startAt.set(square, door);
      starts.push(square);
    }
  }
  return { starts: starts, startAt: startAt };
}

/**
 * The stairs, or the elevators, of a plan, each with a point to walk to and the box it is drawn in.
 * @param {object} plan
 * @param {'stairs'|'elevator'} way
 * @returns {{ point: number[], box: object }[]}
 */
function linksOf(plan, way) {
  if (way === 'stairs') {
    return plan.stairs;
  }
  return plan.elevators.map((elevator) => ({
    point: [(elevator.box.left + elevator.box.right) / 2, (elevator.box.top + elevator.box.bottom) / 2],
    box: elevator.box,
  }));
}

/**
 * Stairs or elevators whose drawing has a hallway beside it.
 * @param {object} plan
 * @param {object} grid
 * @param {'stairs'|'elevator'} way
 * @returns {{ point: number[], box: object }[]}
 */
function publicLinks(plan, grid, way) {
  const limit = grid.step * STAIR_REACH + STAIR_PAD;
  return linksOf(plan, way).filter((link) => nearestHallBox(grid, link.box, limit) >= 0);
}

/**
 * The first entrance group that can walk to this place.
 * @param {object} grid
 * @param {object} plan
 * @param {function({ starts: number[], startAt: Map<number, number[]> }): number[][]|null} arrive
 * @returns {{ points: number[][], main: boolean }|null}
 */
function walkFromEntrances(grid, plan, arrive) {
  for (const group of entranceGroups(plan, grid)) {
    const from = hallStarts(grid, group.doors, plan.halls.length > 0);
    if (from.starts.length === 0) {
      continue;
    }
    const points = arrive(from);
    if (points) {
      return { points: points, main: group.main };
    }
  }
  return null;
}

/**
 * Door to room on the entry floor.
 * @param {object} grid
 * @param {object} plan
 * @param {object} room
 * @param {number} floor
 * @returns {{ legs: { floor: number, points: number[][] }[]|null, main: boolean, blocked: string }}
 */
function sameFloorLegs(grid, plan, room, floor) {
  const found = walkFromEntrances(grid, plan, (from) => {
    return pathToRoom(grid, searchFrom(grid, from.starts), room.points, from.startAt);
  });
  if (!found) {
    return { legs: null, main: true, blocked: 'room' };
  }
  return { legs: [{ floor: floor, points: found.points }], main: found.main, blocked: '' };
}

/**
 * The entry-floor stair closest to a stair upstairs.
 * @param {number[]} upstairs
 * @param {{ point: number[] }[]} stairs
 * @returns {{ point: number[], box: object }}
 */
function nearestStair(upstairs, stairs) {
  let best = stairs[0];
  let bestDistance = Infinity;
  for (const stair of stairs) {
    const distance = Math.hypot(stair.point[0] - upstairs[0], stair.point[1] - upstairs[1]);
    if (distance < bestDistance) {
      best = stair;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Walk from these doors to the hallway beside a stair, then onto the stair.
 * @param {object} grid
 * @param {number[][]} doors
 * @param {{ point: number[], box: object }} stair
 * @param {boolean} halls
 * @returns {number[][]|null}
 */
function pathToStair(grid, doors, stair, halls) {
  const from = hallStarts(grid, doors, halls);
  const landing = nearestHallBox(grid, stair.box, grid.step * STAIR_REACH + STAIR_PAD);
  if (from.starts.length === 0 || landing < 0) {
    return null;
  }
  const goal = centreSquare(grid, landing);
  const found = searchFrom(grid, from.starts);
  if (found.cost[goal] === Infinity) {
    return null;
  }
  const startPoint = startPointOf(found.cameFrom, goal, from.startAt);
  if (!startPoint) {
    return null;
  }
  const points = pathPoints(grid, found.cameFrom, goal, startPoint);
  points.push(roundPoint(stair.point));
  return tidyLine(grid, points);
}

/**
 * Start squares for one stair: the hallway beside it, remembered as the stair point.
 * @param {object} grid
 * @param {{ point: number[], box: object }} stair
 * @returns {{ starts: number[], startAt: Map<number, number[]> }|null}
 */
function stairStart(grid, stair) {
  const landing = nearestHallBox(grid, stair.box, grid.step * STAIR_REACH + STAIR_PAD);
  if (landing < 0) {
    return null;
  }
  const square = centreSquare(grid, landing);
  const startAt = new Map();
  startAt.set(square, stair.point);
  return { starts: [square], startAt: startAt };
}

/**
 * Main entrance to a public stair or elevator, then that one to the room.
 * @param {object} entry
 * @param {object} entryGrid
 * @param {object} upstairs
 * @param {object} room
 * @param {number} entryFloor
 * @param {number} roomFloor
 * @param {'stairs'|'elevator'} way
 * @returns {{ legs: { floor: number, points: number[][] }[]|null, main: boolean, blocked: string }}
 */
function upstairsLegs(entry, entryGrid, upstairs, room, entryFloor, roomFloor, way) {
  const upstairsGrid = makeGrid(upstairs, room.points);
  const upperStairs = publicLinks(upstairs, upstairsGrid, way);
  const entryStairs = publicLinks(entry, entryGrid, way);
  if (upperStairs.length === 0 || entryStairs.length === 0) {
    return { legs: null, main: true, blocked: 'stair' };
  }
  const groups = entranceGroups(entry, entryGrid);
  for (const group of groups) {
    let best = null;
    for (const stair of upperStairs) {
      const from = stairStart(upstairsGrid, stair);
      if (!from) {
        continue;
      }
      const toRoom = pathToRoom(upstairsGrid, searchFrom(upstairsGrid, from.starts), room.points, from.startAt);
      const paired = nearestStair(stair.point, entryStairs);
      const toStair = pathToStair(entryGrid, group.doors, paired, entry.halls.length > 0);
      if (!toRoom || !toStair) {
        continue;
      }
      toRoom[0] = roundPoint(stair.point);
      const total = lineLength(toStair) + lineLength(toRoom);
      if (!best || total < best.total) {
        best = {
          total: total,
          legs: [{ floor: entryFloor, points: toStair }, { floor: roomFloor, points: toRoom }],
        };
      }
    }
    if (best) {
      return { legs: best.legs, main: group.main, blocked: '' };
    }
  }
  return { legs: null, main: true, blocked: 'room' };
}

/**
 * The lines to draw for one place, and which entrance they start from.
 * On the entry floor the line starts at the main entrance. On any other floor it starts at the stairs or elevator.
 * Stairs are tried first. The elevator is the way up when no stair works, or when it is asked for.
 * @param {string} entryMarkup
 * @param {string} roomMarkup
 * @param {string} roomNumber - a room number, or an elevator name like "Elevator 1"
 * @param {number} entryFloor
 * @param {number} roomFloor
 * @param {'stairs'|'elevator'} [way] - the way up to try first
 * @returns {{ legs: { floor: number, points: number[][] }[]|null, main: boolean, blocked: string, via: string, canSwitch: boolean }}
 */
export function routeLegs(entryMarkup, roomMarkup, roomNumber, entryFloor, roomFloor, way = 'stairs') {
  const entry = planFromMarkup(entryMarkup);
  const destination = roomFloor === entryFloor ? entry : planFromMarkup(roomMarkup);
  const room = roomByNumber(destination, roomNumber);
  if (!room || entry.outlines.length === 0 || entry.doors.length === 0) {
    return { legs: null, main: true, blocked: 'room', via: '', canSwitch: false };
  }
  const entryGrid = makeGrid(entry, roomFloor === entryFloor ? room.points : null);
  if (roomFloor === entryFloor) {
    return { ...sameFloorLegs(entryGrid, entry, room, entryFloor), via: '', canSwitch: false };
  }
  if (destination.outlines.length === 0) {
    return { legs: null, main: true, blocked: 'room', via: '', canSwitch: false };
  }
  const other = way === 'stairs' ? 'elevator' : 'stairs';
  const first = upstairsLegs(entry, entryGrid, destination, room, entryFloor, roomFloor, way);
  const second = upstairsLegs(entry, entryGrid, destination, room, entryFloor, roomFloor, other);
  if (first.legs) {
    return { ...first, via: way, canSwitch: Boolean(second.legs) };
  }
  if (second.legs) {
    return { ...second, via: other, canSwitch: false };
  }
  const blocked = first.blocked === 'stair' && second.blocked === 'stair' ? 'stair' : 'room';
  return { legs: null, main: true, blocked: blocked, via: '', canSwitch: false };
}

/**
 * One sentence for the blue line on this floor.
 * @param {{ legs: { floor: number, points: number[][] }[]|null, main: boolean, blocked: string, via: string }|null} result
 * @param {number} floor
 * @param {string} number - a room number, or an elevator name
 * @returns {string}
 */
export function walkWords(result, floor, number) {
  const place = placeLabel(number, 'Room');
  const legs = result && result.legs;
  if (!legs || legs.length === 0) {
    if (result && result.blocked === 'stair') {
      return 'No public stair or elevator reaches Floor ' + floor + '.';
    }
    return 'No walk from the main entrance to ' + place + '.';
  }
  const entrance = result.main === false ? 'the entrance' : 'the main entrance';
  const way = result.via === 'elevator' ? 'elevator' : 'stairs';
  if (legs.length === 1) {
    return 'From ' + entrance + ' to ' + place + '.';
  }
  if (floor === legs[0].floor) {
    return 'From ' + entrance + ', take the ' + way + ' to Floor ' + legs[legs.length - 1].floor + '.';
  }
  return 'From the ' + way + ' to ' + place + '.';
}
