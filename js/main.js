/**
 * This file & what it does: starts the app. It loads settings, buildings, and the map, then makes the other parts.
 * Why we have it: something has to run the steps in order. Settings load first because the map and the info box read them.
 * The building file and the map style download at the same time so the first screen shows sooner.
 * Descriptions load after that, because you can use the map before those paragraphs are ready.
 */

import { CONFIG, loadConfig } from './core/config.js';
import { loadJson, parseJsonText } from './core/jsonErrorLocator.js';
import { photoSrc, store } from './core/store.js';
import { watchUrl } from './core/urlPaths.js';
import { boundsAround } from './logic/mapBounds.js';
import { CampusMap } from './map/campusMap.js';
import { CampusMapSettings } from './map/campusMapSettings.js';
import { InfoSheet } from './sheet/infoSheet.js';
import { ActionPill } from './actionButtons/actionPill.js';
import { MapSettingPill } from './actionButtons/mapSettingPill.js';
import { Menu } from './pages/menu.js';
import { Search } from './pages/search.js';
import { roomsOnFloors } from './logic/floorRooms.js';

/**
 * Get the map style and take out the extra label layer we don't want.
 * @returns {Promise<object>}
 */
async function loadMapStyle() {
  const response = await fetch(CONFIG.map.styleUrl);
  if (!response.ok) {
    throw new Error('Could not load the map style at ' + CONFIG.map.styleUrl + '. The server answered ' + response.status + '.');
  }
  const style = parseJsonText(CONFIG.map.styleUrl, await response.text());
  const layers = [];
  for (const layer of style.layers) {
    if (layer['source-layer'] !== CONFIG.map.hiddenBasemapLayer) {
      layers.push(layer);
    }
  }
  style.layers = layers;
  return style;
}

/**
 * Every corner of the campus outline.
 * @param {object} file
 * @returns {number[][]}
 */
function outlinePoints(file) {
  const points = [];
  for (const feature of file.features) {
    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      continue;
    }
    /* a Polygon is one shape; a MultiPolygon is several */
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const point of ring) {
          points.push(point);
        }
      }
    }
  }
  return points;
}

/**
 * Turn each Building in the data file into an object the app can use.
 * @param {object} file
 * @returns {object[]}
 */
function recordsFrom(file) {
  const records = [];
  for (const building of file.buildings) {
    const record = Object.assign({}, building.properties);
    record.center = building.geometry.coordinates;
    record.description = []; /* filled in later */
    record.links = [];
    record.photos = [];
    records.push(record);
  }
  return records;
}

/**
 * One copy of each picture. The same file is listed more than once for some buildings.
 * @param {object[]} photos
 * @returns {object[]}
 */
function uniquePhotos(photos) {
  const seen = new Set();
  const unique = [];
  for (const photo of photos) {
    const src = photoSrc(photo);
    if (!src || seen.has(src)) {
      continue;
    }
    seen.add(src);
    unique.push(photo);
  }
  return unique;
}

/**
 * Load descriptions after the map is already up.
 * @param {object[]} buildings
 * @param {InfoSheet} sheet
 * @returns {Promise<void>}
 */
async function loadDescriptions(buildings, sheet) {
  const file = await loadJson('descriptions.json');
  for (const building of buildings) {
    const entry = file.descriptions[building.id];
    building.description = (entry && entry.paragraphs) || [];
    building.links = (entry && entry.links) || [];
    const photos = uniquePhotos((entry && entry.photos) || []);
    building.photos = photos;
    store.rememberPhotos(building.id, photos);
  }
  sheet.redraw(); /* update the box if it is already open */
}

/**
 * Show a message if something breaks while starting.
 * @param {Error} error
 */
function showStartupError(error) {
  console.error(error);
  const box = document.createElement('div');
  box.className = 'startup-error';
  const message = document.createElement('p');
  if (error.name === 'YAMLException') {
    /* yaml tells us the line it noticed, which can be a little after the typo */
    message.textContent = 'YAML syntax error in config.yml.\n'
      + 'Look near line ' + (error.mark.line + 1) + '.\n'
      + error.reason + '.\n'
      + 'Fix that line, save, and refresh.';
  } else if (error.name === 'JsonSyntaxError') {
    /* jsonErrorLocator.js already names the file, the line, and the usual fix */
    message.textContent = error.message;
  } else if (error.name === 'TypeError' && /fetch|network|load failed/i.test(error.message)) {
    /* couldn't reach the server */
    if (CONFIG.app) {
      message.textContent = CONFIG.app.startupErrorText;
    } else {
      message.textContent = 'Network error.\nCould not start the app. Check your internet connection and refresh.';
    }
  } else {
    message.textContent = (error.name || 'Error') + '.\n' + error.message;
  }
  box.appendChild(message);
  document.body.appendChild(box);
}

/**
 * Start everything in order.
 * @returns {Promise<void>}
 */
async function startApp() {
  await loadConfig();
  document.querySelector('#navbar-title').textContent = CONFIG.navbar.title;

  /* download the files at the same time */
  const files = await Promise.all([
    loadJson('buildings.geojson'), /* building data */
    loadJson('campuses.geojson'), /* campus outline */
    loadMapStyle(), /* map background */
  ]);

  const buildings = recordsFrom(files[0]);
  const campuses = files[1];
  const buildingsById = {};
  for (const building of buildings) {
    buildingsById[building.id] = building;
  }
  /* fence around the campus outline so you can't drag off campus */
  const corners = outlinePoints(campuses);
  if (corners.length === 0) {
    throw new Error('data/campuses.geojson has no outline');
  }
  const fence = boundsAround(corners, CONFIG.map.fencePadding);

  /* drop a saved pick if that building is gone */
  if (store.get().selectedId && !buildingsById[store.get().selectedId]) {
    store.clearSelection();
  }
  watchUrl(buildingsById);

  /* make the map first, then the info box */
  const campusMap = new CampusMap(buildingsById, fence, campuses, files[2]);
  new CampusMapSettings(campusMap);
  const sheet = new InfoSheet(buildingsById);
  new ActionPill(buildingsById);
  new MapSettingPill(campusMap);
  new Menu(() => buildings);
  const search = new Search(buildings, [], buildingsById);
  /* room numbers are read off the floor plans, so search can find them once those files arrive */
  roomsOnFloors(buildings).then((rooms) => search.addRooms(rooms)).catch(showStartupError);

  /* so we can type store.get() in the console */
  window.store = store;
  window.CONFIG = CONFIG;

  loadDescriptions(buildings, sheet).catch(showStartupError); /* this can finish later */
}

startApp().catch(showStartupError);
