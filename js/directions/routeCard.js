/**
 * @file js/directions/routeCard.js
 * @summary The turn-by-turn card at the bottom of the map while directions are on.
 *
 * WHAT IT DOES : Shows the next turn ("590 ft · Turn right onto the path") with its
 *                arrow, and a walking figure with the time, distance and arrival time.
 *                  - Tap the card: it grows to show a Walk / Bike / Drive switch and
 *                    every step (like Apple Maps). Tap the card again, or tap the map, to fold it back.
 *                    The mode is remembered on this device (js/pages/settings.js).
 *                  - Start and end sit above the turn. Tap one to change it.
 *                    Swap exchanges them when the start is a building.
 *                  - X asks "Are you sure you want to end your trip?" first.
 *                It only shows while you're looking at the map (not over the sheet
 *                or search); the pill hides while it's up (js/bottomBar/bottomPill.js).
 * DEPENDS ON   : ../core/config.js, ../core/dialogs.js, ../core/store.js, ../core/html.js,
 *                #route-card in index.html.
 * CONTROLS     : #route-card.
 * USED BY      : js/main.js (makes it and hands it to js/directions/directions.js)
 */

import { CONFIG } from '../core/config.js';
import { askEndTrip } from '../core/dialogs.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/html.js';
import { placeLabel } from '../logic/elevators.js';

export class RouteCard {
  /**
   * @param {Object.<string, object>} buildingsById
   * @param {CampusMap} campusMap - zoom out when the user changes the start or the end
   */
  constructor(buildingsById, campusMap) {
    this.buildingsById = buildingsById;
    this.campusMap = campusMap;
    this.words = CONFIG.directions;
    this.card = document.querySelector('#route-card');
    this.toggle = document.querySelector('#route-toggle');
    this.turnIcon = document.querySelector('#route-turn-icon');
    this.instruction = document.querySelector('#route-instruction');
    this.summary = document.querySelector('#route-summary');
    this.stepList = document.querySelector('#route-steps');
    this.hasTrip = false; // nothing to show until the first route is worked out
    this.modeIcon = document.querySelector('#route-mode-icon');
    this.modeSwitch = document.querySelector('#route-modes');

    this.buildModeSwitch();
    this.modeSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mode]');
      if (button) {
        store.setTravelMode(button.dataset.mode); // js/pages/settings.js remembers it
      }
    });

    // The card grows while it expands: keep its height up to date the whole time.
    new ResizeObserver(() => this.shareHeight()).observe(this.card);
    this.pickBar = document.querySelector('#route-pick');
    this.pickText = document.querySelector('#route-pick-text');
    document.querySelector('#route-pick-cancel').textContent = this.words.pickCancel;
    document.querySelector('#route-pick-cancel').addEventListener('click', () => store.cancelPicking());

    this.startButton = document.querySelector('#route-start');
    this.startName = document.querySelector('#route-start-name');
    this.endButton = document.querySelector('#route-finish');
    this.endName = document.querySelector('#route-finish-name');
    this.swap = document.querySelector('#route-swap');
    this.startButton.setAttribute('aria-label', this.words.changeStartLabel);
    this.endButton.setAttribute('aria-label', this.words.changeEndLabel);
    this.swap.setAttribute('aria-label', this.words.swapLabel);

    this.startButton.addEventListener('click', (event) => {
      event.stopPropagation();
      store.beginPickingStart(true);
      this.campusMap.goHome();
    });
    this.endButton.addEventListener('click', (event) => {
      event.stopPropagation();
      store.beginPickingEnd();
      this.campusMap.goHome();
    });
    this.swap.addEventListener('click', (event) => {
      event.stopPropagation();
      store.swapEnds();
    });

    this.toggle.addEventListener('click', () => this.setExpanded(!this.card.classList.contains('is-expanded')));
    document.querySelector('#route-end').addEventListener('click', () => this.confirmEnd());

    store.subscribe((state) => this.update(state));
  }

  /** One button per travel mode in config.yml, plus Framework7's sliding highlight. */
  buildModeSwitch() {
    let html = '';
    for (const mode of Object.keys(this.words.modes)) {
      const look = this.words.modes[mode];
      html += '<button class="button" type="button" role="radio" data-mode="' + escapeHtml(mode) + '">' +
        '<span class="material-symbols-rounded" aria-hidden="true">' + escapeHtml(look.icon) + '</span>' +
        '<span>' + escapeHtml(look.label) + '</span></button>';
    }
    this.modeSwitch.innerHTML = html + '<span class="segmented-highlight"></span>';
  }

  /** Show the card while a trip is on. Hide it while a new start or end is being chosen. */
  updateVisibility() {
    const state = store.get();
    const picking = Boolean(state.pickingStart || state.pickingEnd);
    const asking = Boolean(state.pendingStartId || state.pendingEndId);
    const onMap = Boolean(state.directionsTo && !state.sheetOpen && !state.searching);
    this.card.hidden = !onMap || picking;
    this.pickBar.hidden = !onMap || !picking || asking;
    if (!this.pickBar.hidden) {
      this.pickText.textContent = state.pickingEnd ? this.words.pickEndBanner : this.words.pickStartBanner;
    }
    this.shareHeight();
  }

  /** Tell the page how tall the card is, so Map settings can sit just above it (styles/bottomBar.css). */
  shareHeight() {
    let height = 0;
    if (!this.card.hidden) {
      height = this.card.offsetHeight;
    } else if (!this.pickBar.hidden) {
      height = this.pickBar.offsetHeight;
    }
    document.documentElement.style.setProperty('--route-card-height', height + 'px');
  }

  /**
   * Fold the step list when it is open. A map tap uses this and then does nothing else.
   * @returns {boolean} true when the list was open and is now folded
   */
  foldIfOpen() {
    if (this.card.hidden || !this.card.classList.contains('is-expanded')) {
      return false;
    }
    this.setExpanded(false);
    return true;
  }

  /** @param {boolean} expanded - show every step, or just the next one */
  setExpanded(expanded) {
    this.card.classList.toggle('is-expanded', expanded);
    this.toggle.setAttribute('aria-expanded', String(expanded));
  }

  /**
   * Start and end names. Swap only when the start is a building.
   * @param {object} state
   */
  fillPlaces(state) {
    const trip = state.directionsTo;
    if (!trip) {
      this.swap.hidden = true;
      return;
    }
    const startName = state.startBuildingId ? this.placeName(state.startBuildingId, null) : this.words.myLocationText;
    this.startName.textContent = startName;
    this.endName.textContent = this.placeName(trip.buildingId, trip.room);
    this.swap.hidden = !state.startBuildingId;
  }

  /**
   * "Room 118, Science Hall", or just the building name.
   * @param {string} buildingId
   * @param {object|null} room
   * @returns {string}
   */
  placeName(buildingId, room) {
    const building = this.buildingsById[buildingId];
    const name = building ? building.name : '';
    if (room && room.number) {
      return placeLabel(room.number, CONFIG.search.roomText) + ', ' + name;
    }
    return name;
  }

  /** Ask before ending the trip, so a stray tap doesn't lose the route. */
  confirmEnd() {
    askEndTrip(() => store.endDirections());
  }

  /**
   * Show the chosen travel mode, and fold the card away when directions end.
   * @param {object} state
   */
  update(state) {
    // The chosen mode: highlighted in the switch, and its figure next to the time.
    for (const button of this.modeSwitch.querySelectorAll('[data-mode]')) {
      const chosen = button.dataset.mode === state.travelMode;
      button.classList.toggle('button-active', chosen);
      button.setAttribute('aria-checked', String(chosen));
    }
    this.modeIcon.textContent = this.words.modes[state.travelMode].icon;
    this.fillPlaces(state);

    if (!state.directionsTo) {
      this.hasTrip = false; // the next trip starts with a fresh, folded card
      this.setExpanded(false);
    } else if (!this.hasTrip && !state.pickingStart && !state.pickingEnd) {
      this.turnIcon.textContent = 'location';
      this.instruction.textContent = state.pickPaused ? this.words.pickStartBanner : this.words.findingText;
      this.summary.textContent = '';
      this.summary.parentElement.hidden = true;
    }
    this.updateVisibility();
  }

  /**
   * Put a trip on the card.
   * @param {{ instruction: string, icon: string, summary: string, steps: object[] }} trip - from planTrip() in js/directions/turns.js
   */
  show(trip) {
    this.turnIcon.textContent = trip.icon;
    this.instruction.textContent = trip.instruction;
    this.summary.parentElement.hidden = false;
    this.summary.textContent = trip.summary;

    let html = '';
    for (const step of trip.steps) {
      html += '<li class="route-step"><i class="icon f7-icons" aria-hidden="true">' + escapeHtml(step.icon) + '</i>' +
        '<span><span class="route-step-text">' + escapeHtml(step.text) + '</span>';
      if (step.distance) {
        html += '<span class="route-step-distance">' + escapeHtml(step.distance) + '</span>';
      }
      html += '</span></li>';
    }
    this.stepList.innerHTML = html;

    this.hasTrip = true;
    this.updateVisibility();
  }
}
