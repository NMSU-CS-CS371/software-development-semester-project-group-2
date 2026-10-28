/**
 * @file js/directions/routeMath.js
 * @summary The maths of finding a route on a network of paths. No page or map code here.
 *
 * WHAT IT DOES : A "network" is every path, street or road of one travel mode
 *                (data/routes/walk.geojson, ...), turned into a graph: points
 *                joined by segments. These functions:
 *                  - give each segment its cost (its length; one-way streets one way only),
 *                  - remember which way (street name) every segment is on,
 *                  - find the network point nearest to a place,
 *                  - pick where a route should start and end, and the shortest route.
 *                The shortest route itself is found by geojson-path-finder
 *                (Dijkstra's algorithm), which directions.js loads.
 * DEPENDS ON   : ../logic/geo.js
 * USED BY      : js/directions/routeData.js, js/directions/directions.js
 */

import { metresBetween } from '../logic/geo.js';

/**
 * How costly a segment is to travel: its length in metres.
 * One-way streets (bike and drive networks) can only be travelled their way: 0 means "not allowed".
 * @param {number[]} a - the segment's start, in the order the way was drawn
 * @param {number[]} b - the segment's end
 * @param {object} properties - the way's properties (oneway: 'yes', '-1' or 'no')
 * @returns {number|{forward: number, backward: number}}
 */
export function segmentCost(a, b, properties) {
  const metres = metresBetween(a, b);
  if (properties.oneway === 'yes') {
    return { forward: metres, backward: 0 };
  }
  if (properties.oneway === '-1') {
    return { forward: 0, backward: metres };
  }
  return metres;
}

/**
 * A lookup of which way (name and kind) every little segment belongs to, for naming turns.
 * @param {object} network - one network file from data/routes/
 * @returns {Map<string, object>} "lng,lat|lng,lat" (both directions) -> the way's properties
 */
export function waysBySegment(network) {
  const ways = new Map();
  for (const way of network.features) {
    const points = way.geometry.coordinates;
    for (let i = 1; i < points.length; i += 1) {
      ways.set(points[i - 1] + '|' + points[i], way.properties);
      ways.set(points[i] + '|' + points[i - 1], way.properties);
    }
  }
  return ways;
}

/**
 * Every point of a network: where a route can start or end.
 * @param {object} network - one network file from data/routes/
 * @returns {number[][]}
 */
export function allNetworkPoints(network) {
  const points = [];
  for (const way of network.features) {
    for (const point of way.geometry.coordinates) {
      points.push(point);
    }
  }
  return points;
}

/**
 * The network point closest to a place, in a straight line.
 * @param {number[][]} points - from allNetworkPoints()
 * @param {number[]} place - [lng, lat]
 * @returns {{ point: number[], metres: number }}
 */
export function nearestPoint(points, place) {
  let best = { point: null, metres: Infinity };
  for (const point of points) {
    const metres = metresBetween(point, place);
    if (metres < best.metres) {
      best = { point: point, metres: metres };
    }
  }
  return best;
}

/**
 * Where the route should end for a building: next to the door closest to you,
 * or (when no door is mapped) at the network point closest to the building pin.
 * @param {number[][]} points - from allNetworkPoints()
 * @param {object} building - has .doors and .center
 * @param {number[]} from - your position
 * @returns {{ point: number[], door: number[]|null }}
 */
export function routeEnd(points, building, from) {
  if (building.doors.length > 0) {
    let closestDoor = building.doors[0];
    for (const door of building.doors) {
      if (metresBetween(door, from) < metresBetween(closestDoor, from)) {
        closestDoor = door;
      }
    }
    return { point: nearestPoint(points, closestDoor).point, door: closestDoor };
  }
  return { point: nearestPoint(points, building.center).point, door: null };
}

/**
 * A point in the form geojson-path-finder wants.
 * @param {number[]} coordinates - [lng, lat]
 * @returns {object} a GeoJSON Point feature
 */
function asFeature(coordinates) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coordinates } };
}

/**
 * The best route from where you are. The nearest path isn't always the best
 * start (it can be a loop, like a running track), so this tries a few of the
 * closest starting points and keeps the shortest whole trip (straight hop + route).
 * @param {object} network - { finder, points } from js/directions/routeData.js
 * @param {number[]} here - your position
 * @param {number[]} endPoint - where the route ends on the network
 * @param {object} settings - CONFIG.directions
 * @returns {{ start: {point: number[], metres: number}, found: object }|null} null when no route exists
 */
export function bestRoute(network, here, endPoint, settings) {
  // Every network point with its distance from you, closest first.
  const byDistance = [];
  for (const point of network.points) {
    byDistance.push({ point: point, metres: metresBetween(point, here) });
  }
  byDistance.sort((a, b) => a.metres - b.metres);

  // A few starting points: close to you, and not bunched up together.
  const candidates = [];
  for (const option of byDistance) {
    const tooFar = option.metres > byDistance[0].metres + settings.startSearchMetres;
    if (tooFar || candidates.length === settings.startCandidates) {
      break;
    }
    let spreadOut = true;
    for (const chosen of candidates) {
      if (metresBetween(chosen.point, option.point) <= settings.startSpacingMetres) {
        spreadOut = false;
      }
    }
    if (spreadOut) {
      candidates.push(option);
    }
  }

  // The shortest route from any of them.
  let best = null;
  for (const start of candidates) {
    const found = network.finder.findPath(asFeature(start.point), asFeature(endPoint));
    if (!found) {
      continue;
    }
    if (best === null || start.metres + found.weight < best.start.metres + best.found.weight) {
      best = { start: start, found: found };
    }
  }
  return best;
}
