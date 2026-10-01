/**
 * This file & what it does: the round button left of the pill, and the options that glide out of it.
 * Why we have it: Map tools and Building names sit in one place instead of on the map.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/html.js';

export class MapSettingPill {
  /**
   * @param {import('../map/campusMap.js').CampusMap} campusMap
   */
  constructor(campusMap) {
    this.campusMap = campusMap;
    this.settings = CONFIG.mapSettings;
    this.anchor = document.querySelector('#map-settings');
    this.button = document.querySelector('#map-settings-btn');
    this.stack = document.querySelector('#map-options');
    this.isOpen = false;
    this.stack.inert = true;
    this.buildOptions();
    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setOpen(!this.isOpen);
    });
    this.stack.addEventListener('click', (event) => this.onOptionTap(event));
    document.addEventListener('click', () => this.setOpen(false));
    store.subscribe((state) => this.followSheet(state));
    this.showWhatIsOn();
  }

  /**
   * Hide the button while the building sheet is open.
   * @param {object} state
   */
  followSheet(state) {
    this.anchor.classList.toggle('is-hidden', state.sheetOpen);
    this.button.inert = state.sheetOpen;
    if (state.sheetOpen) {
      this.setOpen(false);
    }
  }

  /** One row per option, top to bottom. */
  buildOptions() {
    const names = Object.keys(this.settings.options);
    let html = '';
    for (let row = 0; row < names.length; row += 1) {
      const name = names[row];
      const look = this.settings.options[name];
      const slot = names.length - 1 - row; /* bottom row leaves the button first */
      html += '<button class="map-option" type="button" data-option="' + escapeHtml(name) + '" style="--i: ' + slot + '">' +
        '<span class="map-option-icon"><i class="f7-icons" aria-hidden="true">' + escapeHtml(look.icon) + '</i></span>' +
        '<span>' + escapeHtml(look.label) + '</span></button>';
    }
    this.stack.innerHTML = html;
  }

  /** A row is red when that switch is on. */
  showWhatIsOn() {
    const state = store.get();
    for (const row of this.stack.querySelectorAll('[data-option]')) {
      let on = false;
      if (row.dataset.option === 'home') {
        row.hidden = state.showTools; /* Home sits on the map while tools are on */
        continue;
      }
      if (row.dataset.option === 'names') {
        on = state.showNames;
      } else if (row.dataset.option === 'tools') {
        on = state.showTools;
      }
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-pressed', String(on));
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
    if (open) {
      this.showWhatIsOn();
    }
  }

  /**
   * @param {MouseEvent} event
   */
  onOptionTap(event) {
    event.stopPropagation();
    const row = event.target.closest('[data-option]');
    if (!row) {
      return;
    }
    const name = row.dataset.option;
    if (name === 'names') {
      store.setShowNames(!store.get().showNames);
    } else if (name === 'tools') {
      store.setShowTools(!store.get().showTools);
    } else if (name === 'home') {
      this.campusMap.goHome();
      this.setOpen(false);
    }
    this.showWhatIsOn();
  }
}
