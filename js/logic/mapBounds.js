/**
 * This file & what it does: finds a rectangle around a list of points.
 * Why we have it: the map uses that rectangle as a fence so dragging stays on campus
 * instead of sliding off to another state. There is no page code here so the math is easy to read by itself.
 */

/**
 * Rectangle around the points, plus a little extra space on each side.
 * @param {number[][]} points - [[lng, lat], ...]
 * @param {number} padding
 * @returns {number[][]} [[west, south], [east, north]]
 */
export function boundsAround(points, padding) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const point of points) {
    west = Math.min(west, point[0]);
    south = Math.min(south, point[1]);
    east = Math.max(east, point[0]);
    north = Math.max(north, point[1]);
  }
  return [[west - padding, south - padding], [east + padding, north + padding]];
}
