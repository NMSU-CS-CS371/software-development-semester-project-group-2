/**
 * This file & what it does: a stand-in for the compass the location dot expects.
 * Why we have it: myLocation.js calls it when GPS updates. This app does not turn the map with you.
 */

export class Compass {
  /** @param {object} _map */
  constructor(_map) {}

  /** The phone may ask for the compass here. */
  start() {}

  /** @param {GeolocationCoordinates} _coords */
  fromGps(_coords) {}
}
