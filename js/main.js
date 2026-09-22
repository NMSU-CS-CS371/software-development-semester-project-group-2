/**
 * This file & what it does: starts the app. It loads settings, buildings, and the map, then makes the other parts.
 * Why we have it: something has to run the steps in order. Settings load first because the map and the info box read them.
 * The building file and the map style download at the same time so the first screen shows sooner.
 * Descriptions load after that, because you can use the map before those paragraphs are ready.
 */

import { CONFIG, loadConfig } from './core/config.js';
import { store } from './core/store.js';
import { boxAround } from './logic/box.js';
import { CampusMap } from './map/campusMap.js';
import { BuildingSheet } from './sheet/buildingSheet.js';

/**
 * Get the map style and take out the extra label layer we don't want.
 * @returns {Promise<object>}
 */
async function loadMapStyle() {
  const response = await fetch(CONFIG.map.styleUrl);
  const style = await response.json();
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
 * Download a file from the data folder.
 * @param {string} fileName
 * @returns {Promise<object>}
 */
async function loadData(fileName) {
  const response = await fetch('data/' + fileName);
  if (!response.ok) {
    throw new Error('Could not load data/' + fileName);
  }
  return response.json();
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
    records.push(record);
  }
  return records;
}

/**
 * Load descriptions after the map is already up.
 * @param {object[]} buildings
 * @param {BuildingSheet} sheet
 * @returns {Promise<void>}
 */
async function loadDescriptions(buildings, sheet) {
  const file = await loadData('descriptions.json');
  for (const building of buildings) {
    building.description = file.descriptions[building.id] || [];
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
  if (error.name === 'YAMLException') {
    /* yaml tells us the line it noticed, which can be a little after the typo */
    box.textContent = 'config.yml has a mistake near line ' + (error.mark.line + 1) + ': ' + error.reason + '.';
  } else if (error.name === 'TypeError' && /fetch/i.test(error.message)) {
    /* couldn't reach the server */
    if (CONFIG.app) {
      box.textContent = CONFIG.app.startupErrorText;
    } else {
      box.textContent = 'Could not start the app. Check your internet connection and refresh.';
    }
  } else {
    box.textContent = 'Could not start the app: ' + error.message;
  }
  document.body.appendChild(box);
}

/**
 * Start everything in order.
 * @returns {Promise<void>}
 */
async function startApp() {
  await loadConfig();
  document.querySelector('#navbar-title').textContent = CONFIG.navbar.title;

  /* download both files at the same time */
  const files = await Promise.all([
    loadData('buildings.geojson'), /* building data */
    loadMapStyle(), /* map background */
  ]);

  const buildings = recordsFrom(files[0]);
  const buildingsById = {};
  const centers = [];
  for (const building of buildings) {
    buildingsById[building.id] = building;
    centers.push(building.center);
  }
  /* box around the buildings so you can't drag off campus */
  const fence = boxAround(centers, CONFIG.map.fencePadding);

  /* make the map first, then the info box */
  new CampusMap(buildingsById, fence, files[1]);
  const sheet = new BuildingSheet(buildingsById);

  /* so we can type store.get() in the console */
  window.store = store;
  window.CONFIG = CONFIG;

  loadDescriptions(buildings, sheet); /* this can finish later */
}

startApp().catch(showStartupError);
