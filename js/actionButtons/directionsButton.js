/**
 * @file js/bottomBar/directionsButton.js
 * @summary The Directions button, and the "Get directions?" question before a trip starts.
 *
 * WHAT IT DOES : When a building is chosen, a round Directions button takes the
 *                Map settings button's spot, left of the pill. Tapping it asks:
 *                  - no trip yet:             "Get directions to Room 228, Hardman and Jacobs…?"
 *                  - a trip somewhere else:   "You're on your way to X. Get directions to Y?"
 *                  - already going there:     no question, it just shows the route.
 *                Answering yes starts directions (js/directions/directions.js takes over).
 * DEPENDS ON   : ../core/config.js, ../core/dialogs.js, ../core/store.js,
 *                #directions-btn in index.html.
 * CONTROLS     : #directions-btn.
 * USED BY      : js/main.js
 */

import { CONFIG } from '../core/config.js';
import { askTrip } from '../core/dialogs.js';
import { store } from '../core/store.js';
import { placeLabel } from '../logic/elevators.js';

/**
 * The room's number, or '' when there's no room.
 * @param {object|null} room
 * @returns {string}
 */
function roomNumberOf(room) {
  if (!room) {
    return '';
  }
  if (typeof room === 'string') {
    return room;
  }
  return room.number || '';
}

export class DirectionsButton {
  /**
   * @param {Object.<string, object>} buildingsById
   */
  constructor(buildingsById) {
    this.buildingsById = buildingsById;
    this.words = CONFIG.directions;
    this.button = document.querySelector('#directions-btn');

    this.button.addEventListener('click', () => this.ask());
    document.addEventListener('ask-directions', () => this.ask());

    // Shown whenever a building is chosen (map or sheet); Map settings has the spot otherwise.
    store.subscribe((state) => {
      const show = Boolean(state.selectedId);
      this.button.classList.toggle('is-hidden', !show);
      this.button.inert = !show;
      const title = document.querySelector('#navbar-title');
      const trip = state.directionsTo;
      if (trip && this.buildingsById[trip.buildingId]) {
        title.textContent = this.words.toText + ' ' + this.placeName(trip.buildingId, trip.room);
      } else if (title.textContent.indexOf(this.words.toText + ' ') === 0) {
        title.textContent = CONFIG.navbar.title;
      }
    });
  }

  /**
   * How a place is named in the questions.
   * @param {string} buildingId
   * @param {object|null} room
   * @returns {string} e.g. "Room 228, Hardman and Jacobs Undergraduate Learning Center"
   */
  placeName(buildingId, room) {
    const name = this.buildingsById[buildingId].name;
    if (room) {
      return placeLabel(roomNumberOf(room), CONFIG.search.roomText) + ', ' + name;
    }
    return name;
  }

  /**
   * Show one question with a "no" and a "yes" button. Yes starts directions.
   * @param {string} title
   * @param {string} text
   * @param {string} noText
   * @param {string} yesText
   */
  confirm(title, text, noText, yesText) {
    askTrip(title, text, noText, yesText, () => store.startDirections());
  }

  /** Ask before starting (or switching) directions to the chosen building and room. */
  ask() {
    const state = store.get();
    if (!state.selectedId) {
      return;
    }
    const current = state.directionsTo;
    const here = this.placeName(state.selectedId, state.selectedRoom);

    if (!current) {
      this.confirm(this.words.askTitle, this.words.askText + ' ' + here + '?', this.words.askNo, this.words.askYes);
      return;
    }
    const alreadyGoingHere = current.buildingId === state.selectedId &&
      roomNumberOf(current.room) === roomNumberOf(state.selectedRoom);
    if (alreadyGoingHere) {
      store.startDirections(); // just show the route
      return;
    }
    const text = this.words.switchFromText + ' ' + this.placeName(current.buildingId, current.room) + '. ' +
      this.words.switchToText + ' ' + here + '?';
    this.confirm(this.words.switchTitle, text, this.words.switchNo, this.words.switchYes);
  }
}
