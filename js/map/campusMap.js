/**
 * This file & what it does: makes the campus map and handles taps on it.
 * Why we have it: a badge tap should pick that building and fly the map to it.
 * The info box waits until the flight ends so you see where the building is before the box covers the map.
 * A tap on empty space clears the pick.
 */

import { afterNextPaint } from '../core/afterPaint.js';
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
   * @param {object} style
   */
  constructor(buildingsById, fence, style) {
    const settings = CONFIG.map;
    this.buildingsById = buildingsById;
    this.selectedId = null; /* the picked building */
    this.fence = fence;

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

    this.map.on('load', () => this.drawEverything());
    this.map.on('error', (event) => console.error('Map:', event.error));
    this.followSelection();
  }

  /** Map is loaded, so draw badges and listen for taps. */
  drawEverything() {
    foldCredits();
    addBadges(this.map, this.buildingsById);
    this.markSelected(store.get().selectedId);
    this.listenForTaps();
  }

  /**
   * True once the badge layer exists.
   * @returns {boolean}
   */
  hasBadges() {
    return Boolean(this.map.getLayer('building-pins'));
  }

  /**
   * Give the picked building a blue ring. The others stay white.
   * @param {string|null} buildingId
   */
  markSelected(buildingId) {
    this.selectedId = buildingId;
    if (!this.hasBadges()) {
      return; /* still loading */
    }
    this.map.setLayoutProperty('building-pins', 'icon-image', badgePictureRule(buildingId));
    this.map.setPaintProperty('building-names', 'text-color', nameColorRule(buildingId));
  }

  /** Tap a badge to pick it. Tap somewhere else to unpick it. */
  listenForTaps() {
    this.map.on('click', (event) => {
      const hits = this.map.queryRenderedFeatures(event.point, { layers: ['building-pins', 'building-names'] });
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
    store.subscribe((state) => {
      if (state.selectedId === lastSelectedId) {
        return;
      }
      lastSelectedId = state.selectedId;
      /* wait one frame so the tap feels instant, then move the map */
      afterNextPaint(() => this.showSelection());
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
    if (!building) {
      return; /* nothing is picked */
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
