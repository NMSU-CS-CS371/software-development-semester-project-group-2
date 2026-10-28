/**
 * @file js/logic/geo.js
 * @summary Map maths: distances in metres, and the width of a polygon.
 *
 * WHAT IT DOES : Works on [lng, lat] points. Distances use a flat-earth
 *                shortcut that is accurate to well under a metre across a
 *                campus, and is much simpler than full globe maths.
 * USED BY      : js/directions/directions.js, js/directions/routeMath.js, js/directions/turns.js
 */

const METRES_PER_DEGREE = 111320; // north-south length of one degree of latitude

/**
 * Turn a [lng, lat] point into flat [x, y] metres.
 * @param {number[]} point - [lng, lat]
 * @param {number} latitude - the latitude to measure at (east-west degrees get shorter away from the equator)
 * @returns {number[]} [x, y] in metres
 */
function toMetres(point, latitude) {
  const x = point[0] * METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  const y = point[1] * METRES_PER_DEGREE;
  return [x, y];
}

/**
 * The straight-line distance between two points.
 * @param {number[]} a - [lng, lat]
 * @param {number[]} b - [lng, lat]
 * @returns {number} metres
 */
export function metresBetween(a, b) {
  const aMetres = toMetres(a, a[1]);
  const bMetres = toMetres(b, a[1]);
  return Math.hypot(aMetres[0] - bMetres[0], aMetres[1] - bMetres[1]);
}

/**
 * The outside ring of each polygon. Holes are left out, so a courtyard does not shrink the building.
 * @param {object} geometry - a GeoJSON geometry
 * @returns {number[][][]}
 */
function outerRings(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates[0]];
  }
  if (geometry.type === 'MultiPolygon') {
    const rings = [];
    for (const polygon of geometry.coordinates) {
      rings.push(polygon[0]);
    }
    return rings;
  }
  return [];
}

/**
 * Width and depth of a building outline, in metres.
 * The longest wall is treated as the building's long side, so a rotated building is not measured corner to corner.
 * @param {object} geometry - a GeoJSON Polygon or MultiPolygon
 * @returns {{ width: number, depth: number }|null}
 */
export function footprintMetres(geometry) {
  const rings = outerRings(geometry);
  const points = [];
  for (const ring of rings) {
    for (const point of ring) {
      points.push(point);
    }
  }
  if (points.length < 2) {
    return null;
  }
  const latitude = points[0][1];
  let angle = 0;
  let longest = 0;
  for (const ring of rings) {
    const local = [];
    for (const point of ring) {
      local.push(toMetres(point, latitude));
    }
    for (let i = 1; i < local.length; i += 1) {
      const dx = local[i][0] - local[i - 1][0];
      const dy = local[i][1] - local[i - 1][1];
      const length = Math.hypot(dx, dy);
      if (length > longest) {
        longest = length;
        angle = Math.atan2(dy, dx);
      }
    }
  }
  const turn = -angle;
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const metres = toMetres(point, latitude);
    const x = metres[0] * cosine - metres[1] * sine;
    const y = metres[0] * sine + metres[1] * cosine;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const depth = maxY - minY;
  if (!(width > 0) || !(depth > 0)) {
    return null;
  }
  return { width: width, depth: depth };
}
