/**
 * This file & what it does: the button at the bottom of the screen.
 * Why we have it: the words tell you what a tap will do.
 * Nothing picked says "Tap a building". A picked building says "Info".
 * An open sheet says "Floor 1", and a tap lists the other floors.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';

export class ActionPill {
  /**
   * @param {Object.<string, object>} buildingsById
   */
  constructor(buildingsById) {
    this.buildingsById = buildingsById;
    this.words = CONFIG.pill;
    this.pill = document.querySelector('#pill');
    this.label = document.querySelector('#pill-label');
    this.stack = document.querySelector('#pill-stack');
    this.pill.addEventListener('click', (event) => this.onTap(event));
    store.subscribe((state) => this.update(state));
  }

  /**
   * @param {number} floor
   * @returns {string}
   */
  floorName(floor) {
    return this.words.floorText + ' ' + floor;
  }

  /**
   * Buttons for every floor except the one showing.
   * @param {object} building
   * @param {number} currentFloor
   */
  fillStack(building, currentFloor) {
    this.stack.replaceChildren();
    let slot = 0;
    for (const floor of building.floors) {
      if (floor === currentFloor) {
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill pill--floor';
      button.style.setProperty('--i', slot);
      button.textContent = this.floorName(floor);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        store.showFloor(floor);
        this.setStackOpen(false);
      });
      this.stack.append(button);
      slot += 1;
    }
  }

  /** @param {boolean} open */
  setStackOpen(open) {
    this.stack.classList.toggle('is-open', open);
    this.pill.classList.toggle('is-stack-open', open);
  }

  /**
   * Open the sheet, or show the other floors.
   * @param {MouseEvent} event
   */
  onTap(event) {
    event.stopPropagation();
    const state = store.get();
    const building = this.buildingsById[state.selectedId];
    if (!building) {
      return;
    }
    if (!state.sheetOpen) {
      this.setStackOpen(false);
      store.openSheet();
      return;
    }
    if (!building.floors || building.floors.length <= 1) {
      return;
    }
    const open = !this.stack.classList.contains('is-open');
    if (open) {
      const floor = state.activeFloor != null ? state.activeFloor : building.floors[0];
      this.fillStack(building, floor);
      this.stack.getBoundingClientRect(); /* lay them out closed before they glide open */
    }
    this.setStackOpen(open);
  }

  /**
   * Put the right words on the pill.
   * @param {object} state
   */
  update(state) {
    const building = this.buildingsById[state.selectedId];
    let text = this.words.idleText;
    const floor = state.activeFloor != null ? state.activeFloor : (building && building.floors && building.floors[0]);
    let showArrow = false;
    if (building && state.sheetOpen && floor != null) {
      text = this.floorName(floor);
      showArrow = Boolean(building.floors && building.floors.length > 1);
    } else if (building) {
      text = this.words.infoText;
    }
    this.label.textContent = text;
    this.pill.classList.toggle('has-chev', showArrow);
    this.pill.disabled = !building;
    if (!state.sheetOpen) {
      this.setStackOpen(false);
    }
  }
}
