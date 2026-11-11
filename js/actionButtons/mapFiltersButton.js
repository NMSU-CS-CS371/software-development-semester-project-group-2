/**
 * This file & what it does: the round button right of the pill, and the rows that glide out of it.
 * Why we have it: each row switches one kind of place (Study, Parks, Parking) on or off on the map.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/html.js';
import { forget, readSaved, save } from '../core/storage.js';

/**
 * The kinds that have a row, in the order they are listed in config.yml.
 * @param {Set<string>} [present] - if given, only kinds that have at least one place
 * @returns {string[]}
 */
function filterCategories(present) {
  return Object.keys(CONFIG.categories).filter((name) => CONFIG.categories[name].inFilters && (!present || present.has(name)));
}

/**
 * Which kinds start switched off: what this device saved, or else the ones config.yml says start hidden.
 * @returns {string[]}
 */
export function startingHidden() {
  const kinds = filterCategories();
  const saved = readSaved(CONFIG.mapFilters.storageKey);
  if (saved !== null) {
    try {
      const list = JSON.parse(saved);
      if (Array.isArray(list)) {
        return list.filter((name) => kinds.includes(name));
      }
    } catch {
      forget(CONFIG.mapFilters.storageKey); /* a damaged value: start over */
    }
  }
  return kinds.filter((name) => CONFIG.categories[name].startHidden);
}

export class MapFiltersButton {
  /**
   * @param {object[]} places - every building and place, so a kind with nothing on the map gets no row
   */
  constructor(places) {
    this.kinds = filterCategories(new Set(places.map((place) => place.category)));
    this.settings = CONFIG.mapFilters;
    this.anchor = document.querySelector('#map-filters');
    this.button = document.querySelector('#map-filters-btn');
    this.stack = document.querySelector('#filter-options');
    this.isOpen = false;
    this.stack.inert = true;
    this.button.textContent = this.settings.icon;
    this.buildRows();
    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setOpen(!this.isOpen);
    });
    this.stack.addEventListener('click', (event) => this.onRowTap(event));
    document.addEventListener('click', () => this.setOpen(false));
    store.subscribe((state) => this.follow(state));
  }

  /** One row per kind, top to bottom. */
  buildRows() {
    const kinds = this.kinds;
    let html = '';
    for (let row = 0; row < kinds.length; row += 1) {
      const look = CONFIG.categories[kinds[row]];
      const slot = kinds.length - 1 - row; /* the bottom row leaves the button first */
      html += '<button class="map-option" type="button" data-category="' + escapeHtml(kinds[row]) + '" ' +
        'data-color="' + escapeHtml(look.color) + '" style="--i: ' + slot + '; --row-color: ' + escapeHtml(look.color) + '">' +
        '<span class="map-option-icon"><i class="f7-icons" aria-hidden="true">' + escapeHtml(look.icon) + '</i></span>' +
        '<span>' + escapeHtml(look.label) + '</span></button>';
    }
    this.stack.innerHTML = html;
  }

  /**
   * Keep the rows in step with the store, and hide the button while the building sheet is open.
   * @param {object} state
   */
  follow(state) {
    for (const row of this.stack.querySelectorAll('[data-category]')) {
      const on = !state.hiddenCategories.includes(row.dataset.category);
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-pressed', String(on));
    }
    const hide = Boolean(state.selectedId);
    this.anchor.classList.toggle('is-hidden', hide);
    this.button.inert = hide;
    if (hide) {
      this.setOpen(false);
    }
  }

  /**
   * @param {boolean} open
   */
  setOpen(open) {
    if (open === this.isOpen) {
      return;
    }
    this.isOpen = open;
    this.stack.classList.toggle('is-open', open);
    this.stack.inert = !open;
    this.button.classList.toggle('is-open', open);
    this.button.setAttribute('aria-expanded', String(open));
    this.button.textContent = open ? this.settings.closeIcon : this.settings.icon;
  }

  /**
   * @param {MouseEvent} event
   */
  onRowTap(event) {
    event.stopPropagation();
    const row = event.target.closest('[data-category]');
    if (!row) {
      return;
    }
    store.toggleCategory(row.dataset.category);
    save(this.settings.storageKey, JSON.stringify(store.get().hiddenCategories));
  }
}
