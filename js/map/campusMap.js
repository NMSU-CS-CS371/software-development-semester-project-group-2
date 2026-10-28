/**
 * This file & what it does: makes the campus map, grays out everything outside campus, draws the outline, and handles taps on it.
 * Why we have it: a badge tap should pick that building and fly the map to it.
 * The info box waits until the flight ends so you see where the building is before the box covers the map.
 * A tap on empty space clears the pick.
 */

import { waitOneFrame } from '../core/waitOneFrame.js';
import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { addBadges, badgePictureRule, nameColorRule } from './badges.js';

/**
 * Starts fast and slows down at the end.
 * @param {number} progress
 * @returns {number}
 */
function easeOut(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Signed area of a ring. Positive means counterclockwise.
 * @param {number[][]} ring
 * @returns {number}
 */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum;
}

/**
 * A rectangle over the fence, with the campus shapes cut out.
 * The gray layer uses this so color shows only inside campus.
 * @param {number[][]} fence
 * @param {object} campuses
 * @returns {object}
 */
function outsideMask(fence, campuses) {
  const west = fence[0][0];
  const south = fence[0][1];
  const east = fence[1][0];
  const north = fence[1][1];
  const outer = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  const holes = [];
  for (const feature of campuses.features) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      continue;
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const shell = polygon[0].slice();
      /* a hole winds the opposite way from the outer rectangle */
      if (ringArea(shell) > 0) {
        shell.reverse();
      }
      holes.push(shell);
    }
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [outer].concat(holes) },
  };
}

/** Fold the map credits into the little (i) button. */
function foldCredits() {
  const credits = document.querySelector('.maplibregl-ctrl-attrib');
  if (!credits) {
    return;
  }
  credits.removeAttribute('open');
  credits.classList.remove('maplibregl-compact-show');
}

export class CampusMap {
  /**
   * Create the map.
   * @param {Object.<string, object>} buildingsById
   * @param {number[][]} fence
   * @param {object} campuses
   * @param {object} style
   */
  constructor(buildingsById, fence, campuses, style) {
    const settings = CONFIG.map;
    this.buildingsById = buildingsById;
    this.selectedId = null; /* the picked building */
    this.foldOnTap = null; /* when the directions card is open, a map tap folds it and does nothing else */
    this.fence = fence;
    this.campuses = campuses;

    this.map = new maplibregl.Map({
      container: 'map',
      style: style,
      center: settings.center,
      zoom: settings.zoom,
      minZoom: settings.minZoom,
      maxZoom: settings.maxZoom,
      maxBounds: this.fence,
      /* cap how sharp the map draws so slower phones stay smooth */
      pixelRatio: Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio),
      attributionControl: { compact: true },
      maxTileCacheSize: settings.maxTileCache, /* keep fewer tiles in memory */
      refreshExpiredTiles: false, /* don't re-download tiles we already have */
    });

    this.ready = new Promise((resolve) => {
      this.map.on('load', () => resolve());
    });
    this.map.on('load', () => this.drawEverything());
    this.map.on('error', (event) => console.error('Map:', event.error));
    this.followSelection();
  }

  /** Wash everything outside campus with a light gray, then draw the outline. */
  drawOutline() {
    const settings = CONFIG.map;
    this.map.addSource('campus-outside', { type: 'geojson', data: outsideMask(this.fence, this.campuses) });
    this.map.addLayer({
      id: 'campus-outside',
      type: 'fill',
      source: 'campus-outside',
      paint: {
        'fill-color': settings.outsideColor,
        'fill-opacity': settings.outsideOpacity,
      },
    });
    this.map.addSource('campus-outline', { type: 'geojson', data: this.campuses });
    this.map.addLayer({
      id: 'campus-outline',
      type: 'line',
      source: 'campus-outline',
      paint: {
        'line-color': settings.campusOutlineColor,
        'line-width': settings.campusOutlineWidth,
        'line-opacity': settings.campusOutlineOpacity,
      },
    });
  }

  /** Map is loaded, so draw the outline, badges, and listen for taps. */
  drawEverything() {
    foldCredits();
    this.drawOutline();
    addBadges(this.map, this.buildingsById);
    this.markSelected(store.get().selectedId);
    this.applyNames(store.get().showNames);
    this.listenForTaps();
  }

  /**
   * True once the badge layer exists.
   * @returns {boolean}
   */
  hasBadges() {
    /* getLayer throws if the style is not on the map yet */
    if (!this.map.style) {
      return false;
    }
    return Boolean(this.map.getLayer('building-pins'));
  }

  /**
   * Give the picked building a blue ring. The others stay white.
   * @param {string|null} buildingId
   */
  markSelected(buildingId) {
    this.selectedId = buildingId;
    this.paintBadge(buildingId);
  }

  /**
   * Blue ring on this building. Does not change which building the sheet remembers.
   * @param {string|null} buildingId
   */
  paintBadge(buildingId) {
    if (!this.hasBadges()) {
      return; /* still loading */
    }
    this.map.setLayoutProperty('building-pins', 'icon-image', badgePictureRule(buildingId));
    this.map.setPaintProperty('building-names', 'text-color', nameColorRule(buildingId));
  }

  /**
   * Show or hide the building names.
   * @param {boolean} on
   */
  applyNames(on) {
    /* the store calls this as soon as we subscribe, which is before the style exists */
    if (!this.map.style || !this.map.getLayer('building-names')) {
      return;
    }
    this.map.setLayoutProperty('building-names', 'visibility', on ? 'visible' : 'none');
  }

  /** Fly back over Corbett Center, facing north. */
  goHome() {
    const settings = CONFIG.map;
    this.map.flyTo({
      center: settings.center,
      zoom: settings.zoom,
      bearing: 0,
      pitch: 0,
      duration: settings.flyDuration,
      essential: true,
    });
  }

  /** Tap a badge to pick it. Tap somewhere else to unpick it. */
  listenForTaps() {
    this.map.on('click', (event) => {
      const hits = this.map.queryRenderedFeatures(event.point, { layers: ['building-pins', 'building-names'] });
      const pickingPlace = store.get().pickingStart || store.get().pickingEnd;
      /* The step list is open. This tap only folds it, so the trip stays put. */
      if (!pickingPlace && this.foldOnTap && this.foldOnTap()) {
        return;
      }
      /* A trip is waiting for a start or a new destination: the tap asks first, and does not open a sheet.
         A tap on empty map leaves the picker. With no route yet, that ends the trip. */
      if (store.get().pickingStart || store.get().pickingEnd) {
        if (hits.length === 0) {
          store.cancelPicking();
          return;
        }
        const building = this.buildingsById[hits[0].properties.id];
        if (!building) {
          return;
        }
        if (store.get().pickingStart) {
          store.proposeStart(building.id);
        } else {
          store.proposeEnd(building.id);
        }
        return;
      }
      if (hits.length > 0) {
        store.selectBuilding(this.buildingsById[hits[0].properties.id], 'map');
      } else {
        store.clearSelection();
      }
    });

    /* show a pointer when the mouse is over a badge or name */
    for (const layer of ['building-pins', 'building-names']) {
      this.map.on('mouseenter', layer, () => {
        this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layer, () => {
        this.map.getCanvas().style.cursor = '';
      });
    }
  }

  /** When a new building is picked, fly the map to it, then open the box. */
  followSelection() {
    /*
      flyTo adds flightTo to the moveend event.
      if the user drags and cancels the flight, flightTo is missing and the box stays closed.
    */
    this.map.on('moveend', (event) => {
      if (!event.flightTo) {
        return;
      }
      setTimeout(() => store.sheetCanOpen(event.flightTo), CONFIG.map.sheetPauseAfterTap);
    });

    let lastSelectedId = null;
    let ringId = null;
    store.subscribe((state) => {
      this.applyNames(state.showNames);
      const pending = state.pendingStartId || state.pendingEndId;
      const ring = pending || state.selectedId;
      if (ring !== ringId && this.hasBadges()) {
        ringId = ring;
        this.paintBadge(ring); /* the tapped building gets the blue ring before the popup */
      }
      if (state.selectedId === lastSelectedId) {
        return;
      }
      lastSelectedId = state.selectedId;
      /* wait one frame so the tap feels instant, then move the map */
      waitOneFrame(() => this.showSelection());
    });
  }

  /** Mark the picked building and fly to it. */
  showSelection() {
    const state = store.get();
    if (state.selectedId === this.selectedId) {
      return; /* already showing this one */
    }
    this.markSelected(state.selectedId);
    const building = this.buildingsById[state.selectedId];
    if (!building || state.directionsOn) {
      return; /* nothing is picked, or the trip frames you and the building */
    }
    /* short flight that starts fast and slows down */
    this.map.flyTo({
      center: building.center,
      zoom: Math.max(this.map.getZoom(), CONFIG.map.selectZoom),
      duration: CONFIG.map.flyDuration,
      curve: CONFIG.map.flyCurve,
      easing: easeOut,
      essential: true,
    }, { flightTo: building.id });
  }
}
