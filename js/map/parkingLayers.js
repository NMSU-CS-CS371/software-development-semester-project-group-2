/**
 * This file & what it does: draws parking lots on the map as coloured shapes, with their names.
 * Why we have it: a lot is an area, so a badge alone does not show where you can park. The outlines are a big file,
 * so they are only downloaded the first time Parking is switched on.
 */

import { CONFIG } from '../core/config.js';
import { loadJson } from '../core/jsonErrorLocator.js';

const SOURCE = 'parking-lots';
const LAYERS = ['parking-fill', 'parking-edge', 'parking-names'];

/**
 * The colour rule: NMSU's permit colour name picks the lot's colour.
 * @returns {Array}
 */
function colorRule() {
  const look = CONFIG.parking;
  const rule = ['match', ['get', 'permitColor']];
  for (const name of Object.keys(look.permitColors)) {
    rule.push(name, look.permitColors[name]);
  }
  rule.push(look.otherColor);
  return rule;
}

export class ParkingLayers {
  /**
   * @param {object} map
   * @param {string} beforeLayer - the layer the lots go under, so badges and names stay on top
   */
  constructor(map, beforeLayer) {
    this.map = map;
    this.beforeLayer = beforeLayer;
    this.loading = false;
    this.loaded = false;
    this.visible = false;
  }

  /**
   * The lot layers that exist right now, for tap checks.
   * @returns {string[]}
   */
  tapLayers() {
    return this.loaded ? ['parking-fill'] : [];
  }

  /**
   * Show or hide the lots. Downloads the outlines the first time.
   * @param {boolean} on
   * @returns {Promise<void>}
   */
  async setVisible(on) {
    this.visible = on;
    if (on && !this.loaded) {
      await this.load();
    }
    if (!this.loaded) {
      return;
    }
    for (const layer of LAYERS) {
      this.map.setLayoutProperty(layer, 'visibility', this.visible ? 'visible' : 'none');
    }
  }

  /** Download the outlines and add the layers. */
  async load() {
    if (this.loading) {
      return;
    }
    this.loading = true;
    try {
      const outlines = await loadJson(CONFIG.parking.dataFile);
      this.map.addSource(SOURCE, { type: 'geojson', data: outlines });
      this.addLayers();
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /** Fill, edge, and name layers. */
  addLayers() {
    const look = CONFIG.parking;
    const hidden = { visibility: this.visible ? 'visible' : 'none' };
    this.map.addLayer({
      id: 'parking-fill',
      type: 'fill',
      source: SOURCE,
      layout: hidden,
      paint: { 'fill-color': colorRule(), 'fill-opacity': look.fillOpacity },
    }, this.beforeLayer);
    this.map.addLayer({
      id: 'parking-edge',
      type: 'line',
      source: SOURCE,
      layout: hidden,
      paint: { 'line-color': colorRule(), 'line-width': look.edgeWidth },
    }, this.beforeLayer);
    this.map.addLayer({
      id: 'parking-names',
      type: 'symbol',
      source: SOURCE,
      minzoom: look.nameMinZoom,
      layout: Object.assign({
        'text-field': ['get', 'name'],
        'text-font': [CONFIG.map.labelFont],
        'text-size': look.nameSize,
        'text-max-width': CONFIG.map.nameMaxWidth,
      }, hidden),
      paint: {
        'text-color': look.nameColor,
        'text-halo-color': look.nameHalo,
        'text-halo-width': look.nameHaloWidth,
      },
    }, this.beforeLayer);
    this.map.on('mouseenter', 'parking-fill', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'parking-fill', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }
}
