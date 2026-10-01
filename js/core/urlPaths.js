/**
 * This file & what it does: puts the open info sheet in the page address.
 * Why we have it: copying #/infosheet=Milton%20Hall opens that same building for someone else.
 * The address changes only when the open building changes, so opening and closing stays cheap.
 */

import { store } from './store.js';

const MARK = '/infosheet=';

/**
 * Building with this name, or null.
 * @param {Object.<string, object>} buildingsById
 * @param {string} name
 * @returns {object|null}
 */
function buildingNamed(buildingsById, name) {
  for (const building of Object.values(buildingsById)) {
    if (building.name === name) {
      return building;
    }
  }
  return null;
}

/**
 * Name in #/infosheet=Name, or ''.
 * @returns {string}
 */
function nameInUrl() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  let text = hash;
  try {
    text = decodeURIComponent(hash);
  } catch {
    /* leave a broken % sequence as-is */
  }
  if (!text.startsWith(MARK)) {
    return '';
  }
  return text.slice(MARK.length);
}

/**
 * Open the building from the address, then keep the address matched to the sheet.
 * @param {Object.<string, object>} buildingsById
 */
export function watchUrl(buildingsById) {
  let shown = '';
  const pasted = buildingNamed(buildingsById, nameInUrl());
  if (pasted) {
    shown = pasted.name;
    store.update({
      selectedId: pasted.id,
      selectedVia: 'url',
      sheetOpen: true,
      sheetWaiting: false,
    });
  }

  store.subscribe((state) => {
    const building = buildingsById[state.selectedId];
    const next = (state.sheetOpen || state.sheetWaiting) && building ? building.name : '';
    if (next === shown) {
      return;
    }
    shown = next;
    const url = next
      ? '#' + MARK + encodeURIComponent(next)
      : location.pathname + location.search;
    history.replaceState(null, '', url);
  });
}
