/**
 * This file & what it does: the search that drops down under the top bar.
 * Why we have it: the search icon opens a field. Results show once you type, with the typed
 * letters highlighted. Rooms come first, then buildings. A tap flies to that building and opens
 * its sheet. Tapping the icon again, or Escape, closes search. What you type is remembered
 * on this device until you clear it.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/html.js';
import { readSaved, save, forget } from '../core/storage.js';
import { waitOneFrame } from '../core/waitOneFrame.js';
import { buildingWords, typedWords, buildingMatches, roomScore, startNewSearch } from '../logic/searchMatch.js';

/**
 * Wrap each place a typed word appears in <mark>.
 * @param {string} text
 * @param {string[]} words
 * @returns {string}
 */
function highlight(text, words) {
  const lower = text.toLowerCase();
  const marked = [];
  for (let i = 0; i < text.length; i += 1) {
    marked.push(false);
  }
  for (const word of words) {
    if (!word) {
      continue;
    }
    let at = lower.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length && i < text.length; i += 1) {
        marked[i] = true;
      }
      at = lower.indexOf(word, at + 1);
    }
  }

  let html = '';
  for (let i = 0; i < text.length; i += 1) {
    const opens = marked[i] && !marked[i - 1];
    const closes = marked[i] && !marked[i + 1];
    if (opens) {
      html += '<mark class="search-hit">';
    }
    html += escapeHtml(text[i]);
    if (closes) {
      html += '</mark>';
    }
  }
  return html;
}

/**
 * Join the parts that are not empty with " · ".
 * @param {Array<string|null|undefined>} parts
 * @returns {string}
 */
function joinWithDots(parts) {
  const kept = [];
  for (const part of parts) {
    if (part) {
      kept.push(part);
    }
  }
  return kept.join(' · ');
}

export class Search {
  /**
   * @param {object[]} buildings
   * @param {object[]} rooms
   * @param {Object.<string, object>} buildingsById
   */
  constructor(buildings, rooms, buildingsById) {
    this.buildings = buildings;
    this.rooms = rooms;
    this.buildingsById = buildingsById;
    this.words = CONFIG.search;
    this.drop = document.querySelector('#search-drop');
    this.input = document.querySelector('#search-input');
    this.searchButton = document.querySelector('#search-btn');
    this.results = document.querySelector('#search-results');
    this.list = this.results.querySelector('ul');
    this.clearButton = document.querySelector('#search-clear');
    this.showing = false;
    this.wordsOf = {};
    this.picks = [];
    this.directs = [];

    this.input.placeholder = this.words.placeholder;
    this.input.setAttribute('aria-label', this.words.placeholder);
    this.listen();
    store.subscribe((state) => this.update(state));
  }

  /**
   * Rooms can arrive after the map. Pass the list once it is loaded.
   * @param {object[]} rooms
   */
  addRooms(rooms) {
    this.rooms = rooms;
    if (this.showing && this.input.value) {
      this.showResults(this.input.value);
    }
  }

  /** Wire the icon, the field, the clear button, and Escape and Enter. */
  listen() {
    this.list.addEventListener('click', (event) => {
      const direct = event.target.closest('[data-direct]');
      if (direct) {
        event.preventDefault();
        event.stopPropagation();
        this.directs[Number(direct.dataset.direct)]();
        return;
      }
      const row = event.target.closest('[data-pick]');
      if (!row) {
        return;
      }
      event.preventDefault();
      this.picks[Number(row.dataset.pick)]();
    });
    this.searchButton.addEventListener('click', () => {
      if (store.get().searching) {
        store.endSearch();
      } else {
        store.startSearch();
      }
    });
    this.input.addEventListener('input', () => {
      this.saveText(this.input.value);
      this.clearButton.hidden = !this.input.value;
      this.showResults(this.input.value);
    });
    this.clearButton.addEventListener('click', (event) => {
      event.preventDefault();
      this.saveText('');
      this.fill('');
      this.input.focus();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        store.endSearch();
      }
      if (event.key === 'Enter') {
        const firstResult = this.list.querySelector('a');
        if (firstResult) {
          firstResult.click();
        }
      }
    });
  }

  /**
   * One result row.
   * @param {string} title
   * @param {string} subtitle
   * @param {string[]} typed
   * @param {number} index
   * @returns {string}
   */
  resultRow(title, subtitle, typed, index) {
    return '<li class="search-item"><a href="#" class="search-row" data-pick="' + index + '">' +
      '<div class="search-name">' + highlight(title, typed) + '</div>' +
      '<div class="search-sub">' + highlight(subtitle, typed) + '</div></a>' +
      '<button type="button" class="search-direct f7-icons" data-direct="' + index + '" aria-label="Directions">arrow_up_right_diamond_fill</button></li>';
  }

  /**
   * A room row: "Room 225" and "Floor 2 · Classroom · HA · Hardman…".
   * @param {object} room
   * @param {string[]} typed
   * @returns {string}
   */
  roomRow(room, typed) {
    const building = this.buildingsById[room.building];
    const floor = room.floor == null ? '' : CONFIG.pill.floorText + ' ' + room.floor;
    const subtitle = joinWithDots([floor, room.name, building.code, building.name]);
    const index = this.picks.length;
    this.picks.push(() => store.selectBuilding(building, 'search', room.floor, room.number));
    this.directs.push(() => {
      store.selectBuilding(building, 'search', room.floor, room.number);
      document.dispatchEvent(new CustomEvent('ask-directions'));
    });
    return this.resultRow(this.words.roomText + ' ' + room.number, subtitle, typed, index);
  }

  /**
   * A building row: its name, then "code · address".
   * @param {object} building
   * @param {string[]} typed
   * @returns {string}
   */
  buildingRow(building, typed) {
    const subtitle = joinWithDots([building.code, building.address]);
    const index = this.picks.length;
    this.picks.push(() => store.selectBuilding(building, 'search'));
    this.directs.push(() => {
      store.selectBuilding(building, 'search');
      document.dispatchEvent(new CustomEvent('ask-directions'));
    });
    return this.resultRow(building.name, subtitle, typed, index);
  }

  /** Work out searchable words for any building that does not have them yet. */
  readyWords() {
    for (const building of this.buildings) {
      if (!this.wordsOf[building.id]) {
        this.wordsOf[building.id] = buildingWords(building);
      }
    }
  }

  /**
   * Show the results for the typed text. Nothing typed means no panel.
   * @param {string} text
   */
  showResults(text) {
    this.readyWords();
    startNewSearch();
    const typed = typedWords(text);
    this.picks = [];
    this.directs = [];
    this.results.hidden = typed.length === 0;
    if (typed.length === 0) {
      this.list.innerHTML = '';
      return;
    }

    const exactRooms = [];
    const partialRooms = [];
    for (const room of this.rooms) {
      const building = this.buildingsById[room.building];
      if (!building) {
        continue;
      }
      const score = roomScore(typed, room, building, this.wordsOf[building.id]);
      if (score === 2) {
        exactRooms.push(room);
      } else if (score === 1) {
        partialRooms.push(room);
      }
    }

    const max = this.words.maxResults;
    let html = '';
    let count = 0;
    for (const room of exactRooms.concat(partialRooms)) {
      if (count === max) {
        break;
      }
      html += this.roomRow(room, typed);
      count += 1;
    }
    for (const building of this.buildings) {
      if (count === max) {
        break;
      }
      if (buildingMatches(typed, this.wordsOf[building.id])) {
        html += this.buildingRow(building, typed);
        count += 1;
      }
    }

    if (count === 0) {
      html = '<li class="search-empty">' + escapeHtml(this.words.noMatchText + ' "' + text.trim() + '"') + '</li>';
    }
    this.list.innerHTML = html;
  }

  /**
   * @returns {string}
   */
  savedText() {
    return readSaved(this.words.storageKey) || '';
  }

  /**
   * @param {string} text
   */
  saveText(text) {
    if (text) {
      save(this.words.storageKey, text);
    } else {
      forget(this.words.storageKey);
    }
  }

  /**
   * @param {string} text
   */
  fill(text) {
    this.input.value = text;
    this.clearButton.hidden = !text;
    this.showResults(text);
  }

  /**
   * Open or close the drop-down to match the store.
   * @param {object} state
   */
  update(state) {
    if (state.searching === this.showing) {
      return;
    }
    this.showing = state.searching;
    this.drop.classList.toggle('is-open', this.showing);
    this.drop.setAttribute('aria-hidden', String(!this.showing));
    this.searchButton.setAttribute('aria-expanded', String(this.showing));

    if (!this.showing) {
      this.fill('');
      waitOneFrame(() => {
        if (!this.showing) {
          this.input.blur();
        }
      });
      return;
    }
    this.fill(this.savedText());
    setTimeout(() => {
      this.input.focus();
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }, this.words.focusDelay);
  }
}
