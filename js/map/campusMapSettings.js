/**
 * This file & what it does: the compass, Home, and zoom buttons on the map.
 * Why we have it: they stay on the map, like Apple Maps, instead of inside the pill.
 * The compass is MapLibre's own needle. It points north and tilts when the map does.
 * They stay hidden until Map tools is turned on.
 */

import { store } from '../core/store.js';

export class CampusMapSettings {
  /**
   * @param {import('./campusMap.js').CampusMap} campusMap
   */
  constructor(campusMap) {
    this.campusMap = campusMap;
    this.map = campusMap.map;
    this.shown = false;
    this.compass = new maplibregl.NavigationControl({
      showZoom: false,
      showCompass: true,
      visualizePitch: true,
    });
    this.homeControl = {
      onAdd: () => this.homeButton(),
      onRemove: () => this.home.remove(),
    };
    this.zoom = new maplibregl.NavigationControl({
      showZoom: true,
      showCompass: false,
    });
    store.subscribe((state) => this.update(state));
  }

  /**
   * Put the buttons on the map only while Map tools is on.
   * @param {object} state
   */
  update(state) {
    if (state.showTools === this.shown) {
      return;
    }
    this.shown = state.showTools;
    if (this.shown) {
      this.map.addControl(this.compass, 'top-left');
      this.map.addControl(this.homeControl, 'top-left');
      this.map.addControl(this.zoom, 'top-left');
      return;
    }
    this.map.removeControl(this.zoom);
    this.map.removeControl(this.homeControl);
    this.map.removeControl(this.compass);
  }

  /** A round Home button between the compass and the zoom buttons. */
  homeButton() {
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl maplibregl-ctrl-group campus-home';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f7-icons';
    button.setAttribute('aria-label', 'Home, Corbett Center');
    button.textContent = 'house_fill';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.campusMap.goHome();
    });
    group.append(button);
    this.home = group;
    return group;
  }
}
