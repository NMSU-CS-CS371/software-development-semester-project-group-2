/**
 * This file & what it does: draws the round badges and the building names on the map.
 * Why we have it: the badges are map layers, not HTML tags. HTML markers get moved by JavaScript
 * every frame and lag behind while you drag. A map layer is drawn with the map, so the badge stays on its building.
 */

import { CONFIG } from '../core/config.js';

/* reuse one canvas so we don't make a new one for every badge */
let sharedCanvas = null;

/**
 * Draw one round badge picture.
 * @param {string} color
 * @param {string} letter
 * @param {boolean} selected
 * @returns {object}
 */
function drawBadgePicture(color, letter, selected) {
  const look = CONFIG.badge;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = look.size * look.pixelRatio;
    sharedCanvas.height = look.size * look.pixelRatio;
  }
  const canvas = sharedCanvas;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, canvas.width, canvas.height);
  pen.scale(look.pixelRatio, look.pixelRatio);
  const middle = look.size / 2;

  /* outer ring */
  pen.beginPath();
  pen.arc(middle, middle, look.ringRadius, 0, Math.PI * 2);
  if (selected) {
    pen.fillStyle = look.selectedRing;
  } else {
    pen.fillStyle = look.ring;
  }
  pen.fill();

  /* colored middle. smaller when selected so the blue ring is thicker */
  pen.beginPath();
  if (selected) {
    pen.arc(middle, middle, look.selectedCenterRadius, 0, Math.PI * 2);
  } else {
    pen.arc(middle, middle, look.centerRadius, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();

  /* the letter in the middle */
  pen.fillStyle = CONFIG.theme.white;
  pen.font = look.letterFont;
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText(letter, middle, middle + look.letterOffset);

  const image = pen.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}

/**
 * Pick the blue badge for the selected building, otherwise the normal one.
 * @param {string|null} selectedId
 * @returns {Array}
 */
export function badgePictureRule(selectedId) {
  const isSelected = ['==', ['get', 'id'], selectedId || ''];
  const selectedPicture = ['concat', 'badge-', ['get', 'category'], '-selected']; /* like "badge-study-selected" */
  const normalPicture = ['concat', 'badge-', ['get', 'category']]; /* like "badge-study" */
  return ['case', isSelected, selectedPicture, normalPicture];
}

/**
 * Make the selected building's name blue.
 * @param {string|null} selectedId
 * @returns {Array}
 */
export function nameColorRule(selectedId) {
  const isSelected = ['==', ['get', 'id'], selectedId || ''];
  return ['case', isSelected, CONFIG.badge.selectedRing, CONFIG.map.nameColor];
}

/**
 * One map point for a building.
 * @param {object} building
 * @returns {object}
 */
export function badgeFeature(building) {
  return {
    type: 'Feature',
    properties: { id: building.id, name: building.name, category: building.category },
    geometry: { type: 'Point', coordinates: building.center },
  };
}

/**
 * Add badge pictures for these categories, but only if they aren't already there.
 * @param {object} map
 * @param {string[]} categories
 */
export function addBadgePictures(map, categories) {
  const imageOptions = { pixelRatio: CONFIG.badge.pixelRatio };
  for (const category of categories) {
    if (map.hasImage('badge-' + category)) {
      continue; /* already drawn */
    }
    const look = CONFIG.categories[category];
    const letter = look.letter || CONFIG.badge.letter;
    /* one picture with a white ring, and one with a blue ring */
    map.addImage('badge-' + category, drawBadgePicture(look.color, letter, false), imageOptions);
    map.addImage('badge-' + category + '-selected', drawBadgePicture(look.color, letter, true), imageOptions);
  }
}

/**
 * Add the buildings, badges, and names to the map.
 * @param {object} map
 * @param {Object.<string, object>} buildingsById
 */
export function addBadges(map, buildingsById) {
  addBadgePictures(map, Object.keys(CONFIG.categories));

  /* one point per building */
  const features = [];
  for (const building of Object.values(buildingsById)) {
    features.push(badgeFeature(building));
  }
  map.addSource('buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });

  map.addLayer({
    id: 'building-pins',
    type: 'symbol',
    source: 'buildings',
    layout: { 'icon-image': ['concat', 'badge-', ['get', 'category']], 'icon-allow-overlap': true },
  });

  /*
    names sit above the badges.
    if two names would overlap, the map hides one until you zoom in.
  */
  const settings = CONFIG.map;
  map.addLayer({
    id: 'building-names',
    type: 'symbol',
    source: 'buildings',
    minzoom: settings.namesMinZoom,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [settings.labelFont],
      /* text gets a little bigger as you zoom in */
      'text-size': ['interpolate', ['linear'], ['zoom'], settings.namesMinZoom, settings.nameSizeSmall, settings.maxZoom, settings.nameSizeLarge],
      'text-max-width': settings.nameMaxWidth,
      'text-anchor': 'bottom',
      'text-offset': [0, settings.nameOffset],
      'text-padding': settings.namePadding,
    },
    paint: {
      'text-color': settings.nameColor,
      'text-halo-color': settings.nameHalo,
      'text-halo-width': settings.nameHaloWidth,
    },
  }, 'building-pins'); /* put names under the badges so badges get placed first */
}
