/**
 * This file & what it does: remembers which building is picked and whether the info box is open.
 * Why we have it: the map and the info box both need that answer. If each file kept its own
 * copy, they could disagree. One store means they always see the same thing.
 */

const SHEET_KEY = 'nmsu-info-sheet';

/**
 * Read the sheet saved for this tab, or null.
 * @returns {{ selectedId: string, sheetOpen: boolean }|null}
 */
function readSavedSheet() {
  try {
    const raw = sessionStorage.getItem(SHEET_KEY);
    if (!raw) {
      return null;
    }
    const saved = JSON.parse(raw);
    if (!saved || !saved.selectedId) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

/** Holds the state and tells listeners when it changes. */
class Store {
  /** Start from the last sheet in this tab, or nothing. */
  constructor() {
    const saved = readSavedSheet();
    this.state = {
      selectedId: saved ? saved.selectedId : null, /* building id, or null */
      selectedVia: saved ? 'reload' : null, /* how it was picked, like 'map' */
      sheetWaiting: false, /* true means open the box after the map flies there */
      sheetOpen: saved ? Boolean(saved.sheetOpen) : false, /* is the info box showing */
      activeFloor: null, /* which floor the sheet is showing */
      showNames: true, /* building labels on the map */
      showTools: true, /* compass, Home, and zoom start on */
    };
    this.listeners = []; /* functions to call after a change */
    this.photos = {}; /* building id -> photo list, so the sheet does not rebuild them */
  }

  /**
   * Keep a building's photos. Does not redraw the sheet.
   * @param {string} buildingId
   * @param {object[]} photos
   */
  rememberPhotos(buildingId, photos) {
    this.photos[buildingId] = photos;
  }

  /**
   * Get the current state.
   * @returns {object}
   */
  get() {
    return this.state;
  }

  /**
   * Call listener now, and again after every change.
   * @param {(state: object) => void} listener
   */
  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.state);
  }

  /**
   * Change some fields, then tell every listener.
   * @param {object} changes
   */
  update(changes) {
    for (const key of Object.keys(changes)) {
      this.state[key] = changes[key];
    }
    for (const listener of this.listeners) {
      listener(this.state);
    }
    this.rememberSheet();
  }

  /** Keep this tab's open sheet so a reload can show it again. */
  rememberSheet() {
    try {
      if (!this.state.selectedId) {
        sessionStorage.removeItem(SHEET_KEY);
        return;
      }
      sessionStorage.setItem(SHEET_KEY, JSON.stringify({
        selectedId: this.state.selectedId,
        sheetOpen: this.state.sheetOpen || this.state.sheetWaiting,
      }));
    } catch {
      /* private browsing can block storage; the app still works */
    }
  }

  /**
   * Pick a building. The map flies there, then the box opens.
   * @param {object} building
   * @param {string} via
   */
  selectBuilding(building, via) {
    if (building.id === this.state.selectedId) {
      /* already picked, so just open the box */
      this.update({ sheetOpen: true, sheetWaiting: false });
      return;
    }
    const floor = building.floors && building.floors.includes(1) ? 1 : (building.floors && building.floors.length ? building.floors[0] : null);
    this.update({
      selectedId: building.id,
      selectedVia: via,
      sheetOpen: false,
      sheetWaiting: true,
      activeFloor: floor,
    });
  }

  /** Open the sheet for the building that is already picked. */
  openSheet() {
    this.update({ sheetOpen: true, sheetWaiting: false });
  }

  /**
   * Show one floor of the open sheet.
   * @param {number} floor
   */
  showFloor(floor) {
    this.update({ activeFloor: floor });
  }

  /**
   * The map finished flying, so the box can open.
   * @param {string} buildingId
   */
  sheetCanOpen(buildingId) {
    if (this.state.sheetWaiting && this.state.selectedId === buildingId) {
      this.update({ sheetOpen: true, sheetWaiting: false });
    }
  }

  /** Unpick the building and close the box. */
  clearSelection() {
    this.update({ selectedId: null, selectedVia: null, sheetOpen: false, sheetWaiting: false, activeFloor: null });
  }

  /**
   * Show or hide the building names on the map.
   * @param {boolean} on
   */
  setShowNames(on) {
    this.update({ showNames: on });
  }

  /**
   * Show or hide the compass, Home, and zoom buttons.
   * @param {boolean} on
   */
  setShowTools(on) {
    this.update({ showTools: on });
  }

  /** Close the box but keep the building picked. */
  closeSheet() {
    this.update({ sheetOpen: false, sheetWaiting: false });
  }
}

/**
 * The picture address. The row and the full-screen view must use this same
 * address, or the browser stores one file and then downloads another.
 * @param {object} photo
 * @returns {string}
 */
export function photoSrc(photo) {
  return (photo && (photo.url || photo.thumbUrl)) || '';
}

/** The one store the whole app uses. */
export const store = new Store();
