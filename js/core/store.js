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
      searching: false, /* is the search drop-down open */
      selectedRoom: null, /* room number chosen from search or a floor plan, or null */
      selectedRoomFloor: null, /* the floor that room is on */
      directionsOn: false, /* a trip is running */
      directionsTo: null, /* { buildingId, room } while directions are on */
      pickingStart: false, /* true while a map tap should choose where the route starts */
      pendingStartId: null, /* the building just tapped, waiting for "is this the start?" */
      startPickHeld: false, /* true when the user asked to change the start, so a late GPS fix does not cancel it */
      startBuildingId: null, /* the building a tap chose, when location could not be found or the user changed the start */
      pickingEnd: false, /* true while a map tap should choose a new destination */
      pendingEndId: null, /* the building just tapped, waiting for "go to this building?" */
      pickPaused: false, /* the user left the picker; don't send them straight back into it */
      hasRoute: false, /* true after a route has been drawn, so Cancel can keep that trip */
      arrived: false, /* true after directions brought you inside the building */
      travelMode: 'walk', /* walk, bike, or drive */
      units: 'imperial', /* ft/mi or m/km */
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
   * @param {number} [floor] - the room's floor, when a room was chosen
   * @param {string} [roomNumber]
   */
  selectBuilding(building, via, floor, roomNumber) {
    const same = building.id === this.state.selectedId;
    let activeFloor = floor;
    if (activeFloor == null) {
      if (same && this.state.activeFloor != null) {
        activeFloor = this.state.activeFloor;
      } else {
        activeFloor = building.floors && building.floors.includes(1) ? 1 : (building.floors && building.floors.length ? building.floors[0] : null);
      }
    }
    const selectedRoom = roomNumber || null;
    const selectedRoomFloor = selectedRoom && floor != null ? floor : null;
    const directing = via === 'directions';
    /* directions stay on the map until you are close to the building */
    const openNow = !directing;
    if (same) {
      /* already picked, so just open the box. via still changes, so Back can appear. */
      this.update({
        selectedVia: via,
        sheetOpen: openNow,
        sheetWaiting: false,
        searching: false,
        activeFloor: activeFloor,
        selectedRoom: selectedRoom,
        selectedRoomFloor: selectedRoomFloor,
        directionsOn: directing,
      });
      return;
    }
    this.update({
      selectedId: building.id,
      selectedVia: via,
      sheetOpen: false,
      sheetWaiting: openNow,
      activeFloor: activeFloor,
      searching: false,
      selectedRoom: selectedRoom,
      selectedRoomFloor: selectedRoomFloor,
      directionsOn: directing,
    });
  }

  /**
   * A room tap: remember the room. The plan stays open and draws the walk from the door to that room.
   * Directions from where you are start only from the bottom Directions button.
   * @param {string} number
   * @param {number} floor
   */
  pickRoom(number, floor) {
    if (!this.state.selectedId) {
      return;
    }
    this.update({
      selectedRoom: number,
      selectedRoomFloor: floor,
      sheetOpen: true,
      sheetWaiting: false,
      searching: false,
    });
  }

  /** Start directions to the chosen building. The sheet closes so the route shows on the map; the room waits for arrival. */
  startDirections() {
    if (!this.state.selectedId) {
      return;
    }
    let room = null;
    if (this.state.selectedRoom) {
      const number = typeof this.state.selectedRoom === 'string' ? this.state.selectedRoom : this.state.selectedRoom.number;
      room = { number: number, floor: this.state.selectedRoomFloor };
    }
    const trip = { buildingId: this.state.selectedId, room: room };
    this.update({
      directionsTo: trip,
      directionsOn: true,
      sheetOpen: false,
      sheetWaiting: false,
      searching: false,
      arrived: false,
    });
  }

  /**
   * Close the sheet so the map is up, and the next building tap chooses the start.
   * @param {boolean} held - true when the user asked to change the start, so GPS must not cancel it
   */
  beginPickingStart(held) {
    if (!this.state.directionsTo) {
      return;
    }
    this.update({
      pickingStart: true,
      pickingEnd: false,
      pendingEndId: null,
      startPickHeld: Boolean(held),
      pickPaused: false,
      sheetOpen: false,
      sheetWaiting: false,
      searching: false,
    });
  }

  /**
   * A map tap named a building. Ask before it becomes the start.
   * The destination stays the building the trip was already going to.
   * @param {string} buildingId
   */
  proposeStart(buildingId) {
    if (!this.state.pickingStart || !buildingId) {
      return;
    }
    const trip = this.state.directionsTo;
    if (trip && String(trip.buildingId) === String(buildingId)) {
      return; /* tapping the destination would end the trip immediately */
    }
    if (this.state.pendingStartId === buildingId) {
      return;
    }
    this.update({ pendingStartId: buildingId });
  }

  /** The "is this the start?" question was answered no. Keep waiting for a tap. */
  clearPendingStart() {
    if (this.state.pendingStartId) {
      this.update({ pendingStartId: null });
    }
  }

  /**
   * The building the route should start from, after the user confirmed it.
   * @param {string} buildingId
   */
  chooseStart(buildingId) {
    if (!this.state.pickingStart || !buildingId) {
      return;
    }
    const trip = this.state.directionsTo;
    if (trip && String(trip.buildingId) === String(buildingId)) {
      return;
    }
    this.update({ pickingStart: false, pendingStartId: null, startBuildingId: buildingId });
  }

  /** Location arrived, so a building tap is no longer the start. */
  stopPickingStart() {
    if (this.state.pickingStart || this.state.pendingStartId) {
      this.update({ pickingStart: false, pendingStartId: null, startPickHeld: false });
    }
  }

  /**
   * The next building tap chooses a new destination. The sheet stays closed.
   */
  beginPickingEnd() {
    if (!this.state.directionsTo) {
      return;
    }
    this.update({
      pickingEnd: true,
      pickingStart: false,
      pendingStartId: null,
      startPickHeld: false,
      pickPaused: false,
      sheetOpen: false,
      sheetWaiting: false,
      searching: false,
    });
  }

  /** A route is on the map, so leaving the picker can return to it. */
  markRoute() {
    if (!this.state.hasRoute) {
      this.update({ hasRoute: true });
    }
  }

  /**
   * Leave the picker. The route card comes back when a trip is already drawn.
   * Choosing a start before any route exists ends the trip, so a later location
   * fix does not start directions from My Location.
   */
  cancelPicking() {
    if (!this.state.pickingStart && !this.state.pickingEnd) {
      return;
    }
    if (this.state.pickingStart && !this.state.startBuildingId && !this.state.hasRoute) {
      this.endDirections();
      return;
    }
    this.update({
      pickingStart: false,
      pickingEnd: false,
      pendingStartId: null,
      pendingEndId: null,
      startPickHeld: false,
      pickPaused: true,
    });
  }

  /**
   * A map tap named a new destination. Ask before the trip changes.
   * The start building, and the building you are already going to, are ignored.
   * @param {string} buildingId
   */
  proposeEnd(buildingId) {
    if (!this.state.pickingEnd || !buildingId) {
      return;
    }
    if (this.sameBuilding(this.state.startBuildingId, buildingId)) {
      return;
    }
    const trip = this.state.directionsTo;
    if (trip && this.sameBuilding(trip.buildingId, buildingId)) {
      return;
    }
    if (this.sameBuilding(this.state.pendingEndId, buildingId)) {
      return;
    }
    this.update({ pendingEndId: buildingId });
  }

  /** The "go to this building?" question was answered no. Keep waiting for a tap. */
  clearPendingEnd() {
    if (this.state.pendingEndId) {
      this.update({ pendingEndId: null });
    }
  }

  /**
   * The confirmed destination. No room yet: indoor directions start from the floor plan.
   * @param {string} buildingId
   */
  chooseEnd(buildingId) {
    if (!this.state.pickingEnd || !buildingId) {
      return;
    }
    if (this.sameBuilding(this.state.startBuildingId, buildingId)) {
      return;
    }
    this.update({
      pickingEnd: false,
      pendingEndId: null,
      directionsTo: { buildingId: buildingId, room: null },
      selectedId: buildingId,
      selectedRoom: null,
      selectedRoomFloor: null,
      sheetOpen: false,
      sheetWaiting: false,
    });
  }

  /**
   * Exchange the start building and the destination, then the route is drawn again.
   * Only when the start is a building. The room does not move with the swap.
   */
  swapEnds() {
    const start = this.state.startBuildingId;
    const trip = this.state.directionsTo;
    if (!start || !trip || this.sameBuilding(start, trip.buildingId)) {
      return;
    }
    this.update({
      startBuildingId: trip.buildingId,
      directionsTo: { buildingId: start, room: null },
      selectedId: start,
      selectedRoom: null,
      selectedRoomFloor: null,
      pickingStart: false,
      pickingEnd: false,
      pendingStartId: null,
      pendingEndId: null,
      sheetOpen: false,
      sheetWaiting: false,
    });
  }

  /**
   * @param {string|null} left
   * @param {string|null} right
   * @returns {boolean}
   */
  sameBuilding(left, right) {
    return left != null && right != null && String(left) === String(right);
  }

  /** Stop directions. */
  endDirections() {
    if (this.state.directionsTo || this.state.directionsOn || this.state.pickingStart || this.state.pickingEnd) {
      this.update({
        directionsTo: null,
        directionsOn: false,
        pickingStart: false,
        pickingEnd: false,
        pendingStartId: null,
        pendingEndId: null,
        startBuildingId: null,
        startPickHeld: false,
        pickPaused: false,
        hasRoute: false,
      });
    }
  }

  /**
   * You walked into the building: directions end and its sheet opens on the room's floor.
   * @param {object} building
   */
  arrived(building) {
    let room = null;
    if (this.state.directionsTo) {
      room = this.state.directionsTo.room;
    }
    const number = room && room.number ? room.number : null;
    this.update({
      directionsTo: null,
      directionsOn: false,
      pickingStart: false,
      pickingEnd: false,
      pendingStartId: null,
      pendingEndId: null,
      startBuildingId: null,
      startPickHeld: false,
      pickPaused: false,
      hasRoute: false,
      selectedId: building.id,
      selectedRoom: number,
      selectedRoomFloor: room && room.floor != null ? room.floor : null,
      activeFloor: this.firstFloor(building, room),
      sheetOpen: true,
      sheetWaiting: false,
      searching: false,
      arrived: true,
    });
  }

  /**
   * The floor to open when you arrive.
   * @param {object} building
   * @param {object|null} room
   * @returns {number|null}
   */
  firstFloor(building, room) {
    if (room && room.floor != null) {
      return room.floor;
    }
    if (building.floors && building.floors.includes(1)) {
      return 1;
    }
    return building.floors && building.floors.length ? building.floors[0] : null;
  }

  /**
   * Choose how to travel. Directions re-route straight away.
   * @param {'walk'|'bike'|'drive'} mode
   */
  setTravelMode(mode) {
    if (mode !== this.state.travelMode) {
      this.update({ travelMode: mode });
    }
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
    this.update({
      selectedId: null,
      selectedVia: null,
      sheetOpen: false,
      sheetWaiting: false,
      activeFloor: null,
      searching: false,
      selectedRoom: null,
      selectedRoomFloor: null,
      directionsOn: false,
    });
  }

  /** Let go of the picked building and open search. */
  startSearch() {
    this.update({
      selectedId: null,
      selectedVia: null,
      sheetOpen: false,
      sheetWaiting: false,
      activeFloor: null,
      searching: true,
      selectedRoom: null,
      selectedRoomFloor: null,
      directionsOn: false,
    });
  }

  /** Close search. Does nothing if it is already closed. */
  endSearch() {
    if (this.state.searching) {
      this.update({ searching: false });
    }
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
