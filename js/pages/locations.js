/**
 * This file & what it does: the Locations page, every place on the map grouped by kind.
 * Why we have it: the menu opens this page, and a tap flies the map to that building and opens its sheet.
 * Only the group titles are built at first. A group's rows are built the first time it opens.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml, iconHtml } from '../core/html.js';

const BY_NAME = new Intl.Collator('en', { numeric: true });
const FIRST_ROWS = 40; /* rows made the moment a group opens */
const ROWS_PER_PIECE = 25; /* then this many at a time while the phone is idle */

/**
 * The grey line under a name, like "HA · 2902 McFie Cir."
 * @param {object} place
 * @returns {string}
 */
function subtitleFor(place) {
  const parts = [];
  if (place.code) {
    parts.push(place.code);
  }
  if (place.kind) {
    parts.push(place.kind);
  }
  if (place.address) {
    parts.push(place.address);
  }
  return parts.join(' · ');
}

/**
 * Sort a copy of the list A to Z. "Lot 9" comes before "Lot 10".
 * @param {object[]} places
 * @returns {object[]}
 */
function sortedByName(places) {
  const copy = places.slice();
  copy.sort((a, b) => BY_NAME.compare(a.name, b.name));
  return copy;
}

export class LocationsPage {
  /**
   * @param {object[]} places - every building
   * @param {{ close: () => void }} page - closes this screen
   */
  constructor(places, page) {
    this.page = page;
    this.byId = {};

    document.querySelector('#locations-title').textContent = CONFIG.locations.title;

    const groups = {};
    for (const category of Object.keys(CONFIG.categories)) {
      groups[category] = [];
    }
    for (const place of places) {
      this.byId[place.id] = place;
      if (groups[place.category]) {
        groups[place.category].push(place);
      }
      /* a historic building also appears under Historic, even if its own category is Study */
      if (place.historic && place.category !== 'historic' && groups.historic) {
        groups.historic.push(place);
      }
    }

    const holder = document.querySelector('#places-list');
    for (const category of Object.keys(groups)) {
      if (groups[category].length > 0) {
        holder.appendChild(this.makeGroup(category, groups[category]));
      }
    }

    /* one listener for every row, not one per row */
    holder.addEventListener('click', (event) => {
      const row = event.target.closest('[data-place]');
      if (!row) {
        return;
      }
      event.preventDefault();
      this.page.close();
      store.selectBuilding(this.byId[row.dataset.place], 'locations');
    });
  }

  /**
   * One category: a coloured title, then a list that opens and closes.
   * @param {string} category
   * @param {object[]} places
   * @returns {HTMLElement}
   */
  makeGroup(category, places) {
    const look = CONFIG.categories[category];
    const group = document.createElement('div');
    group.className = 'places-group';
    group.style.setProperty('--row-color', look.color);
    const icon = look.icon ? iconHtml(look.icon) : '';
    group.innerHTML =
      '<a href="#" class="places-title" role="button" aria-expanded="false">' +
      icon +
      '<span>' + escapeHtml(look.label) + ' (' + places.length + ')</span>' +
      iconHtml('chevron_down', 'places-arrow') +
      '</a>' +
      '<div class="places-fold"><div class="places-fold-inner"><ul class="places-rows"></ul></div></div>';

    const list = group.querySelector('ul');
    const toggle = group.querySelector('.places-title');
    let sorted = null;

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      const open = group.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && sorted === null) {
        sorted = sortedByName(places);
        list.innerHTML = this.rowsHtml(sorted.slice(0, FIRST_ROWS));
        this.addRestOfRows(list, sorted);
      }
    });
    return group;
  }

  /**
   * Add the remaining rows a few at a time while the phone is idle.
   * @param {HTMLElement} list
   * @param {object[]} sorted
   */
  addRestOfRows(list, sorted) {
    const later = window.requestIdleCallback || ((work) => setTimeout(() => work({ timeRemaining: () => 4 }), 16));
    const work = (deadline) => {
      let next = list.childElementCount;
      while (next < sorted.length && deadline.timeRemaining() > 2) {
        list.insertAdjacentHTML('beforeend', this.rowsHtml(sorted.slice(next, next + ROWS_PER_PIECE)));
        next = list.childElementCount;
      }
      if (next < sorted.length) {
        later(work);
      }
    };
    if (list.childElementCount < sorted.length) {
      later(work);
    }
  }

  /**
   * One chunk of rows as a single piece of HTML.
   * @param {object[]} places
   * @returns {string}
   */
  rowsHtml(places) {
    let html = '';
    for (const place of places) {
      html += '<li><a href="#" class="places-row" data-place="' + escapeHtml(place.id) + '">' +
        '<div class="places-name">' + escapeHtml(place.name) + '</div>' +
        '<div class="places-sub">' + escapeHtml(subtitleFor(place)) + '</div></a></li>';
    }
    return html;
  }
}
