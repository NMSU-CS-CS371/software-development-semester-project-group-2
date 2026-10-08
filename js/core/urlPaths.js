/**
 * This file & what it does: puts the open info sheet in the page address.
 * Why we have it: copying #/infosheet=Milton%20Hall opens that same building for someone else.
 * The address stays while that building is picked. It clears when the pick is cleared.
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
    const state = store.get();
    /* this tab already closed the sheet but kept the building, so don't open it again */
    const keptClosed = state.selectedId === pasted.id && !state.sheetOpen && !state.sheetWaiting;
    if (!keptClosed) {
      const floor = pasted.floors && pasted.floors.includes(1) ? 1 : (pasted.floors && pasted.floors.length ? pasted.floors[0] : null);
      store.update({
        selectedId: pasted.id,
        selectedVia: 'url',
        sheetOpen: true,
        sheetWaiting: false,
        activeFloor: floor,
      });
    }
  }

  store.subscribe((state) => {
    const building = buildingsById[state.selectedId];
    /* the address stays while the building is picked, even if the sheet is closed */
    const next = building ? building.name : '';
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
