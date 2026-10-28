/**
 * @file js/directions/routeDrawing.js
 * @summary Draws the route on the map: a see-through blue line with > > > arrows.
 *
 * WHAT IT DOES : - The route along paths and streets: a solid line with arrows.
 *                - The two short straight hops off them (you -> the path, and the
 *                  path -> the door): dotted, so they don't look like real paths.
 *                The layers are added the first time a route is drawn, under the
 *                badges so the badges stay tappable.
 * DEPENDS ON   : a MapLibre map, ../core/config.js
 * CONTROLS     : the 'route' map source and its 'route-hops', 'route-line' and 'route-arrows' layers.
 * USED BY      : js/directions/directions.js
 */

import { CONFIG } from '../core/config.js';

/**
 * Draw one arrow ">" as a picture the map repeats along the route.
 * It points right; the map turns it to follow the line.
 * @param {object} settings - CONFIG.directions
 * @returns {object} { width, height, data } for map.addImage
 */
function drawArrowPicture(settings) {
  const size = settings.arrowSize * CONFIG.badge.pixelRatio;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pen = canvas.getContext('2d');
  pen.strokeStyle = settings.arrowColor;
  pen.lineWidth = size * 0.18;
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.beginPath();
  pen.moveTo(size * 0.35, size * 0.2);
  pen.lineTo(size * 0.65, size * 0.5);
  pen.lineTo(size * 0.35, size * 0.8);
  pen.stroke();
  return { width: size, height: size, data: pen.getImageData(0, 0, size, size).data };
}

/**
 * One line for the map.
 * @param {'walk'|'hop'} kind - 'walk' is the real route, 'hop' a dotted straight bit
 * @param {number[][]} coordinates
 * @returns {object} a GeoJSON LineString feature
 */
function makeLine(kind, coordinates) {
  return { type: 'Feature', properties: { kind: kind }, geometry: { type: 'LineString', coordinates: coordinates } };
}

/**
 * Put the route on the map (adds the layers the first time).
 * @param {maplibregl.Map} map
 * @param {number[][]} path - the route along paths and streets: solid line with arrows
 * @param {number[][][]} hops - short straight bits off them: dotted
 */
export function drawRoute(map, path, hops) {
  const settings = CONFIG.directions;
  const features = [makeLine('walk', path)];
  for (const hop of hops) {
    features.push(makeLine('hop', hop));
  }
  const data = { type: 'FeatureCollection', features: features };

  if (map.getSource('route')) {
    map.getSource('route').setData(data); // already drawn once: just change the line
    return;
  }

  map.addImage('route-arrow', drawArrowPicture(settings), { pixelRatio: CONFIG.badge.pixelRatio });
  map.addSource('route', { type: 'geojson', data: data });
  const below = 'building-pins'; // under the badges, so they stay tappable

  map.addLayer({
    id: 'route-hops',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'kind'], 'hop'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': settings.lineColor, 'line-width': settings.hopWidth, 'line-dasharray': [0, 2] },
  }, below);

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'kind'], 'walk'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': settings.lineColor, 'line-opacity': settings.lineOpacity, 'line-width': settings.lineWidth },
  }, below);

  map.addLayer({
    id: 'route-arrows',
    type: 'symbol',
    source: 'route',
    filter: ['==', ['get', 'kind'], 'walk'],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': settings.arrowSpacing,
      'icon-image': 'route-arrow',
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  }, below);
}

/**
 * Take the route off the map.
 * @param {maplibregl.Map} map
 */
export function clearRoute(map) {
  const source = map.getSource('route');
  if (source) {
    source.setData({ type: 'FeatureCollection', features: [] });
  }
}
