/**
 * @file js/directions/routeData.js
 * @summary Loads what directions need, only once and only when it's first needed.
 *
 * WHAT IT DOES : The first time directions start it loads geojson-path-finder
 *                (the shortest-route library, from the CDN).
 *                For each travel mode (walk, bike, drive) it loads that mode's
 *                paths from data/routes/ the first time it's used, and keeps it.
 * DEPENDS ON   : geojson-path-finder, ./routeMath.js,
 *                data/routes/{walk,bike,drive}.geojson.
 * USED BY      : js/directions/directions.js
 */

import { segmentCost, waysBySegment, allNetworkPoints } from './routeMath.js';

const PATH_FINDER_URL = 'https://cdn.jsdelivr.net/npm/geojson-path-finder@2.1.0/+esm';

/**
 * Download a JSON file.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function loadJson(url) {
  const response = await fetch(url);
  return response.json();
}

export class RouteData {
  /** Nothing is loaded until directions are first used. */
  constructor() {
    this.PathFinder = null; // the routing library, once loaded
    this.networks = {}; // 'walk' | 'bike' | 'drive' -> { finder, points, ways }, once loaded
  }

  /**
   * Load one travel mode's paths (the library only the first time).
   * @param {'walk'|'bike'|'drive'} mode
   * @returns {Promise<object>} the network: { finder, points, ways }
   */
  async loadNetwork(mode) {
    if (!this.PathFinder) {
      const library = await import(PATH_FINDER_URL);
      this.PathFinder = library.default;
    }
    if (!this.networks[mode]) {
      const paths = await loadJson('data/routes/' + mode + '.geojson');
      this.networks[mode] = {
        finder: new this.PathFinder(paths, { weight: segmentCost }),
        points: allNetworkPoints(paths), // where a route can start or end
        ways: waysBySegment(paths), // for naming the streets in the steps
      };
    }
    return this.networks[mode];
  }

  /**
   * A travel mode's network, if it has loaded.
   * @param {'walk'|'bike'|'drive'} mode
   * @returns {object|undefined}
   */
  network(mode) {
    return this.networks[mode];
  }
}
