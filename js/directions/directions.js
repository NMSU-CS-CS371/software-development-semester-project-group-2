/**
 * @file js/directions/directions.js
 * @summary Directions: blue arrows from where you are to the building, redrawn as you move.
 *
 * WHAT IT DOES : When directions start (the Directions button, js/bottomBar/directionsButton.js):
 *                1. follows your GPS position,
 *                2. finds the shortest way along campus paths and streets to the
 *                   building's nearest door (or its nearest walkway if no door is
 *                   mapped), walking, biking or driving. geojson-path-finder runs
 *                   Dijkstra's algorithm, the classic shortest-path search map apps
 *                   are built on. Only mapped paths and roads are used,
 *                3. draws it (./routeDrawing.js) and shows the next turn, time and
 *                   distance on the card at the bottom (./turns.js, ./routeCard.js),
 *                4. when you reach the building pin, a door, or the end of the path,
 *                   ends directions and opens the building's sheet on the room's floor.
 *                Inside buildings there are no arrows: NMSU publishes no hallway
 *                data, so the highlighted room on the floor plan takes over.
 * DEPENDS ON   : ../core/config.js, ../core/dialogs.js, ../core/store.js, ../logic/geo.js,
 *                ./routeMath.js, ./turns.js, ./routeData.js, ./routeDrawing.js,
 *                and (handed in) the map, your location and the route card.
 * CONTROLS     : when directions run, and the route on the map.
 * USED BY      : js/main.js
 */

import { CONFIG } from '../core/config.js';
import { askDestination, askLocationFailed, askStart, tell } from '../core/dialogs.js';
import { store } from '../core/store.js';
import { placeLabel } from '../logic/elevators.js';
import { metresBetween } from '../logic/geo.js';
import { nearestPoint, routeEnd, bestRoute } from './routeMath.js';
import { planTrip } from './turns.js';
import { RouteData } from './routeData.js';
import { drawRoute, clearRoute } from './routeDrawing.js';

/**
 * A short text naming a trip, so we can tell when it changes: "323|228|walk|imperial".
 * @param {object} state
 * @returns {string} '' when directions are off
 */
function tripKey(state) {
  const trip = state.directionsTo;
  if (!trip) {
    return '';
  }
  let roomNumber = '';
  if (trip.room) {
    roomNumber = trip.room.number;
  }
  return trip.buildingId + '|' + roomNumber + '|' + state.travelMode + '|' + state.units;
}

export class Directions {
  /**
   * @param {CampusMap} campusMap
   * @param {MyLocation} myLocation - shows the blue dot
   * @param {RouteCard} card - the turn-by-turn card
   * @param {Object.<string, object>} buildingsById
   */
  constructor(campusMap, myLocation, card, buildingsById) {
    this.campusMap = campusMap;
    this.map = campusMap.map;
    this.myLocation = myLocation;
    this.card = card;
    this.buildingsById = buildingsById;
    this.settings = CONFIG.directions;
    this.data = new RouteData();

    this.lastPosition = null; // the latest GPS reading, so a new destination or mode can re-route at once
    this.routedFrom = null; // where the route on the map starts
    this.routedKey = ''; // the trip the route on the map is for
    this.running = false; // are directions on?
    this.currentTrip = ''; // the trip directions are on for now
    this.startFrom = null; // [lng, lat] when the trip starts at a building instead of GPS
    this.appliedStartId = null; // the startBuildingId already drawn, so a later update does not draw it again
    this.startAsk = null; // the "Start from this building?" question, while it is open
    this.askedStartId = null; // the building that question is about
    this.endAsk = null; // the "Go to this building?" question, while it is open
    this.askedEndId = null; // the building that question is about
    this.locationAsk = null; // the "can't find your location" popup, while it is open
    this.locationTimer = null; // gives up on GPS if no fix arrives

    this.myLocation.onLocate((position) => {
      const state = store.get();
      if (!this.running || this.startFrom || state.startPickHeld) {
        return; // a chosen start stays put, and a start the user asked to change is not cancelled by GPS
      }
      if (state.pickingStart && !state.startBuildingId && !state.hasRoute) {
        return; // Cancel ends this trip; a fix found on this computer must not become My Location
      }
      this.clearLocationWait();
      this.dismissLocationAsk();
      store.stopPickingStart(); // a real fix arrived, so the map tap is no longer the start
      this.onPosition(position);
    });
    this.myLocation.onFail(() => {
      if (!this.running) {
        return false;
      }
      if (this.startFrom || store.get().pickingStart || this.lastPosition) {
        return true; // already started, already picking, or a fix we can keep using
      }
      this.offerStart();
      return true;
    });

    store.subscribe((state) => this.update(state));
  }

  /**
   * Turn directions on or off, or re-route, when the state changes.
   * @param {object} state
   */
  update(state) {
    this.confirmStart(state);
    this.confirmEnd(state);
    if (state.startBuildingId && state.startBuildingId !== this.appliedStartId && state.directionsTo) {
      this.appliedStartId = state.startBuildingId;
      const building = this.buildingsById[state.startBuildingId];
      if (building) {
        this.useStart(building);
      }
    }
    const wanted = Boolean(state.directionsTo);
    const nextTrip = tripKey(state);
    if (wanted !== this.running) {
      this.running = wanted;
      this.currentTrip = nextTrip;
      if (this.running) {
        this.start();
      } else {
        this.stop();
      }
    } else if (this.running && nextTrip !== this.currentTrip) {
      this.currentTrip = nextTrip;
      this.reroute(); // a new destination, travel mode or units
    }
    this.pickIfNoFix(state);
  }

  /**
   * Location already failed and there is still no start. Stay on "tap a building",
   * not "Finding your location".
   * @param {object} state
   */
  pickIfNoFix(state) {
    if (!state.directionsTo || state.pickingStart || state.pickingEnd || state.startBuildingId) {
      return;
    }
    if (state.pickPaused || this.startFrom || this.lastPosition || !this.myLocation.failed) {
      return;
    }
    this.beginPicking();
  }

  /** Turn directions on: load the route data, then follow your GPS position. */
  async start() {
    if (!navigator.geolocation) {
      this.offerStart();
      return;
    }
    const watching = this.myLocation.showMyLocation(); // the blue dot, following you
    try {
      // The route data, and a map to draw on.
      await Promise.all([this.data.loadNetwork(store.get().travelMode), this.campusMap.ready]);
    } catch (error) {
      console.error(error);
      this.giveUp(this.settings.loadFailedText);
      return;
    }
    if (!store.get().directionsTo) {
      return; // turned off while loading
    }
    if (this.startFrom) {
      this.routeFrom(this.startFrom);
      return;
    }
    if (!watching || this.myLocation.failed) {
      this.offerStart(); // no watch, or the watch already failed and will not report again
      return;
    }
    if (!this.lastPosition) {
      this.lastPosition = this.myLocation.lastFix; // the dot is already on, so no new reading will arrive
    }
    if (this.lastPosition) {
      this.route(this.lastPosition);
      return;
    }
    this.armLocationWait(); // still no fix: don't sit on "Finding your location" forever
  }

  /** Ask for a start building if GPS never answers. */
  armLocationWait() {
    this.clearLocationWait();
    const wait = Number(this.settings.locationWaitMs) || 5000;
    this.locationTimer = setTimeout(() => {
      this.locationTimer = null;
      if (!this.running || this.startFrom || this.lastPosition) {
        return;
      }
      this.myLocation.failed = true;
      this.offerStart();
    }, wait);
  }

  /** Stop waiting for GPS. A second call does nothing. */
  clearLocationWait() {
    if (!this.locationTimer) {
      return;
    }
    clearTimeout(this.locationTimer);
    this.locationTimer = null;
  }

  /** Turn directions off. */
  stop() {
    this.lastPosition = null;
    this.startFrom = null;
    this.appliedStartId = null;
    this.clearLocationWait();
    this.dismissLocationAsk();
    this.dismissStartAsk();
    this.dismissEndAsk();
    clearRoute(this.map);
    this.routedFrom = null;
    this.routedKey = '';
  }

  /** A new destination or travel mode while directions are on: re-route from the last position straight away. */
  async reroute() {
    try {
      await this.data.loadNetwork(store.get().travelMode);
    } catch (error) {
      console.error(error);
      this.giveUp(this.settings.loadFailedText);
      return;
    }
    if (this.startFrom && store.get().directionsTo) {
      this.routeFrom(this.startFrom);
      return;
    }
    if (this.lastPosition && store.get().directionsTo) {
      this.route(this.lastPosition);
    }
  }

  /**
   * A building was tapped. Ask before the route starts there.
   * No leaves the map up so another building can be tapped.
   * @param {object} state
   */
  confirmStart(state) {
    const pending = state.pickingStart ? state.pendingStartId : null;
    if (!pending) {
      this.dismissStartAsk();
      return;
    }
    if (pending === this.askedStartId && this.startAsk) {
      return;
    }
    this.dismissStartAsk();
    const building = this.buildingsById[pending];
    if (!building) {
      return;
    }
    const id = pending;
    this.askedStartId = id;
    this.startAsk = askStart(building.name, () => this.acceptStart(id), () => this.declineStart(id));
  }

  /**
   * A building was tapped as the new destination. Ask before the trip changes.
   * No leaves the map zoomed out so another building can be tapped.
   * @param {object} state
   */
  confirmEnd(state) {
    const pending = state.pickingEnd ? state.pendingEndId : null;
    if (!pending) {
      this.dismissEndAsk();
      return;
    }
    if (pending === this.askedEndId && this.endAsk) {
      return;
    }
    this.dismissEndAsk();
    const building = this.buildingsById[pending];
    if (!building) {
      return;
    }
    const id = pending;
    this.askedEndId = id;
    this.endAsk = askDestination(building.name, () => this.acceptEnd(id), () => this.declineEnd(id));
  }

  /** Close the destination question. A second call does nothing. */
  dismissEndAsk() {
    this.askedEndId = null;
    if (!this.endAsk) {
      return;
    }
    const dialog = this.endAsk;
    this.endAsk = null;
    dialog.close();
  }

  /**
   * Not this destination. Keep waiting for another tap.
   * @param {string} id
   */
  declineEnd(id) {
    if (this.askedEndId !== id && this.askedEndId !== null) {
      return;
    }
    this.endAsk = null;
    this.askedEndId = null;
    store.clearPendingEnd();
  }

  /**
   * This building is the destination. Draw the route to it. The sheet stays closed.
   * @param {string} id
   */
  acceptEnd(id) {
    this.endAsk = null;
    this.askedEndId = null;
    store.chooseEnd(id);
  }

  /**
   * Close the start question. A second call does nothing.
   */
  dismissStartAsk() {
    this.askedStartId = null;
    if (!this.startAsk) {
      return;
    }
    const dialog = this.startAsk;
    this.startAsk = null;
    dialog.close();
  }

  /**
   * Not this building. Keep waiting for another tap.
   * @param {string} id
   */
  declineStart(id) {
    if (this.askedStartId !== id && this.askedStartId !== null) {
      return;
    }
    this.startAsk = null;
    this.askedStartId = null;
    store.clearPendingStart();
  }

  /**
   * This building is the start. Draw the route from it.
   * @param {string} id
   */
  acceptStart(id) {
    this.startAsk = null;
    this.askedStartId = null;
    store.chooseStart(id);
  }

  /**
   * Location failed. Tell the user, zoom out, and let the next building tap be the start.
   * One button: the trip keeps going, and the X on the card is how it ends.
   */
  offerStart() {
    const state = store.get();
    if (this.startFrom || !state.directionsTo || this.locationAsk || state.pickingStart) {
      return;
    }
    this.clearLocationWait();
    this.locationAsk = askLocationFailed(() => this.dismissLocationAsk());
    this.beginPicking(); // the map is ready as soon as the popup closes
  }

  /** Zoom out to campus and wait for a building tap. */
  beginPicking() {
    store.beginPickingStart(false);
    this.campusMap.goHome();
  }

  /** Close the location popup. A second call does nothing. */
  dismissLocationAsk() {
    if (!this.locationAsk) {
      return;
    }
    const dialog = this.locationAsk;
    this.locationAsk = null;
    dialog.close();
  }

  /**
   * Route from this building's centre. Later GPS readings do not move the start.
   * @param {object} building
   */
  async useStart(building) {
    if (!store.get().directionsTo || !building.center) {
      return;
    }
    this.startFrom = building.center.slice(); // set before any wait, so a destination change in the same update uses it
    try {
      await Promise.all([this.data.loadNetwork(store.get().travelMode), this.campusMap.ready]);
    } catch (error) {
      console.error(error);
      this.giveUp(this.settings.loadFailedText);
      return;
    }
    if (!store.get().directionsTo) {
      return;
    }
    this.routeFrom(this.startFrom);
  }

  /**
   * Draw the route as if you were standing at this point.
   * @param {number[]} point [lng, lat]
   */
  routeFrom(point) {
    this.lastPosition = { coords: { longitude: point[0], latitude: point[1] } };
    this.routedKey = '';
    this.route(this.lastPosition);
  }

  /** @param {GeolocationPosition} position - a new GPS reading */
  onPosition(position) {
    this.lastPosition = position;
    this.route(position);
  }

  /**
   * Explain a problem and turn directions off.
   * @param {string} text
   */
  giveUp(text) {
    store.endDirections();
    tell(this.settings.title, text);
  }

  /**
   * Close enough to count as there: the building pin, a door, or the end of the path.
   * @param {number[]} here
   * @param {object} building
   * @param {{ point: number[]|null, door: number[]|null }} end
   * @returns {boolean}
   */
  hasArrived(here, building, end) {
    const close = this.settings.arrivalMetres;
    if (metresBetween(here, building.center) <= close) {
      return true;
    }
    if (end.door && metresBetween(here, end.door) <= close) {
      return true;
    }
    return Boolean(end.point) && metresBetween(here, end.point) <= close;
  }

  /**
   * Work out the route from a GPS position (or keep the one on the map).
   * @param {GeolocationPosition} position
   */
  route(position) {
    const state = store.get();
    const target = state.directionsTo;
    const network = this.data.network(state.travelMode);
    if (!target || !network) {
      return; // directions are off, or this mode's paths are still loading
    }
    const building = this.buildingsById[target.buildingId];
    const here = [position.coords.longitude, position.coords.latitude];

    const end = routeEnd(network.points, building, here);
    if (this.hasArrived(here, building, end)) {
      store.arrived(building);
      return;
    }

    // The same trip, and you haven't moved much: keep the route that's on the map.
    const key = tripKey(state);
    if (key === this.routedKey && metresBetween(here, this.routedFrom) < this.settings.rerouteMetres) {
      return;
    }

    if (nearestPoint(network.points, here).metres > this.settings.maxDistanceToNetwork) {
      this.giveUp(this.settings.tooFarText);
      return;
    }
    if (!end.point) {
      this.giveUp(this.settings.noRouteText);
      return;
    }
    const best = bestRoute(network, here, end.point, this.settings);
    if (!best) {
      this.giveUp(this.settings.noRouteText);
      return;
    }

    this.routedFrom = here;
    this.routedKey = key;
    store.markRoute();
    const hops = [[here, best.start.point]]; // you -> the start of the route
    if (end.door) {
      hops.push([end.point, end.door]); // the end of the route -> the door
    }
    drawRoute(this.map, best.found.path, hops);

    let destination = building.name;
    if (target.room) {
      destination = building.name + ' · ' + placeLabel(target.room.number, CONFIG.search.roomText);
    }
    const wayBetween = (a, b) => network.ways.get(a + '|' + b) || { name: '', highway: 'path' };
    this.card.show(planTrip(best.start.metres, best.found.path, wayBetween, destination, state.travelMode, state.units));
  }
}
