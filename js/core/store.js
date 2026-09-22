/**
 * This file & what it does: remembers which building is picked and whether the info box is open.
 * Why we have it: the map and the info box both need that answer. If each file kept its own
 * copy, they could disagree. One store means they always see the same thing.
 */

/** Holds the state and tells listeners when it changes. */
class Store {
  /** Start with nothing picked. */
  constructor() {
    this.state = {
      selectedId: null, /* building id, or null */
      selectedVia: null, /* how it was picked, like 'map' */
      sheetWaiting: false, /* true means open the box after the map flies there */
      sheetOpen: false, /* is the info box showing */
    };
    this.listeners = []; /* functions to call after a change */
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
    this.update({ selectedId: building.id, selectedVia: via, sheetOpen: false, sheetWaiting: true });
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
    this.update({ selectedId: null, selectedVia: null, sheetOpen: false, sheetWaiting: false });
  }

  /** Close the box but keep the building picked. */
  closeSheet() {
    this.update({ sheetOpen: false, sheetWaiting: false });
  }
}

/** The one store the whole app uses. */
export const store = new Store();
