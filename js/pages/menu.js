/**
 * This file & what it does: the full-screen menu, Map and Locations.
 * Why we have it: the menu button fades the words in one after another.
 * The page you are on is underlined. Locations is built the first time it opens.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { LocationsPage } from './locations.js';

const PAGE_NAMES = ['map', 'locations'];

export class Menu {
  /**
   * @param {() => object[]} getPlaces - every building, read when Locations is first opened
   */
  constructor(getPlaces) {
    this.getPlaces = getPlaces;
    this.locations = null; /* the page, built on the first open */
    this.button = document.querySelector('#menu-btn');
    this.menu = document.querySelector('#menu-popup');
    this.locationsEl = document.querySelector('#locations-popup');

    document.querySelector('#menu-map').textContent = CONFIG.menu.mapText;
    document.querySelector('#menu-locations').textContent = CONFIG.menu.locationsText;
    this.underline('map');

    this.button.addEventListener('click', () => this.open());
    document.querySelector('#menu-close').addEventListener('click', () => this.close());
    document.querySelector('#menu-map').addEventListener('click', (event) => {
      event.preventDefault();
      this.underline('map');
      this.close();
    });
    document.querySelector('#menu-locations').addEventListener('click', (event) => {
      event.preventDefault();
      this.underline('locations');
      this.close();
      this.openLocations();
    });
    document.querySelector('#locations-close').addEventListener('click', () => this.closeLocations());
    document.addEventListener('show-locations', () => {
      this.underline('locations');
      this.openLocations();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (this.locationsEl.classList.contains('is-open')) {
        this.closeLocations();
      } else if (this.menu.classList.contains('is-open')) {
        this.close();
      }
    });
  }

  /** Fade the menu in. The words rise on their own from styles/menuStyle.css. */
  open() {
    store.endSearch();
    this.menu.classList.add('is-open');
    this.menu.setAttribute('aria-hidden', 'false');
    this.button.setAttribute('aria-expanded', 'true');
  }

  /** Fade the menu out. */
  close() {
    this.menu.classList.remove('is-open');
    this.menu.setAttribute('aria-hidden', 'true');
    this.button.setAttribute('aria-expanded', 'false');
  }

  /** Slide the Locations page up. The list is built once, the first time. */
  openLocations() {
    if (!this.locations) {
      this.locations = { close: () => this.closeLocations() };
      new LocationsPage(this.getPlaces(), this.locations);
    }
    this.locationsEl.classList.add('is-open');
    this.locationsEl.setAttribute('aria-hidden', 'false');
  }

  /** Slide the Locations page back down and put the underline back on Map. */
  closeLocations() {
    this.locationsEl.classList.remove('is-open');
    this.locationsEl.setAttribute('aria-hidden', 'true');
    this.underline('map');
  }

  /**
   * Underline this word.
   * @param {string} current - 'map' or 'locations'
   */
  underline(current) {
    for (const name of PAGE_NAMES) {
      document.querySelector('#menu-' + name).classList.toggle('is-current', name === current);
    }
  }
}
