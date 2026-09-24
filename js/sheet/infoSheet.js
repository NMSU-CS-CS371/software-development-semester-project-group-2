/**
 * This file & what it does: fills in the building info box with the name, facts, and link for the building you picked.
 * Why we have it: the box layout stays in index.html so every building uses the same shape.
 * This file only swaps the words. Empty parts get a short message so a building with missing data still looks finished.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml, safeUrl } from '../core/html.js';
import { waitOneFrame } from '../core/waitOneFrame.js';

export class InfoSheet {
  /**
   * @param {Object.<string, object>} buildingsById
   */
  constructor(buildingsById) {
    this.buildingsById = buildingsById;
    this.words = CONFIG.sheet;

    /* save these elements so we don't search the page every time */
    this.sheetElement = document.querySelector('#building-sheet');
    this.title = document.querySelector('#bs-name');
    this.aboutTitle = document.querySelector('#bs-about-title');
    this.description = document.querySelector('#bs-description');
    this.links = document.querySelector('#bs-links');
    this.planSection = document.querySelector('#bs-plan');
    this.planSlot = document.querySelector('#bs-plan-slot');
    this.facts = document.querySelector('#bs-facts');
    this.link = document.querySelector('#bs-link');
    this.source = document.querySelector('#bs-source');

    this.aboutTitle.textContent = this.words.aboutTitle;
    this.link.textContent = this.words.linkText;

    this.shownId = ''; /* which building is showing right now */
    this.sheetIsOpen = false;

    document.querySelector('#bs-close').addEventListener('click', () => store.closeSheet());
    store.subscribe((state) => this.update(state));
  }

  /** Fill the box again after descriptions load. */
  redraw() {
    this.shownId = '';
    this.update(store.get());
  }

  /**
   * List of facts: [label, value].
   * @param {object} building
   * @returns {Array[]}
   */
  factsFor(building) {
    const code = building.code || this.words.unknownText;
    return [
      [this.words.addressLabel, building.address],
      [this.words.buildingLabel, code + ' · ' + this.words.numberText + ' ' + building.propertyNumber],
      [this.words.builtLabel, building.built],
      [this.words.floorsLabel, String(building.floors.length)],
    ];
  }

  /**
   * Small text that says where the facts came from.
   * @param {object} building
   * @returns {string}
   */
  sourceTextFor(building) {
    /* add extra notes if the floors or year didn't come from NMSU */
    let notes = '';
    if (building.floorsSource !== 'NMSU Space Planning') {
      notes += ' (' + this.words.floorCountText + ': ' + building.floorsSource + ')';
    }
    if (building.builtSource && building.builtSource !== 'NMSU Space Planning') {
      notes += ' (' + this.words.builtYearText + ': ' + building.builtSource + ')';
    }
    return this.words.codeSourceText + ': ' + building.codeSource + '. ' +
      this.words.factsSourceText + notes + '. ' + this.words.plansNoteText;
  }

  /**
   * Put the description, facts, link, and source into the box.
   * @param {object} building
   */
  fillAbout(building) {
    const hasDescription = building.description.length > 0;

    let paragraphs = building.description;
    if (!hasDescription) {
      paragraphs = [this.words.noDescriptionText];
    }
    let descriptionHtml = '';
    for (const text of paragraphs) {
      descriptionHtml += '<p>' + escapeHtml(text) + '</p>';
    }
    this.description.innerHTML = descriptionHtml;
    this.description.classList.toggle('muted', !hasDescription);

    let linksHtml = '';
    for (const link of building.links || []) {
      linksHtml += '<p><a href="' + safeUrl(link.url) + '" target="_blank" rel="noopener">' + escapeHtml(link.label) + '</a></p>';
    }
    this.links.innerHTML = linksHtml;

    let factsHtml = '';
    for (const fact of this.factsFor(building)) {
      const value = fact[1] || this.words.unknownText; /* missing facts say "Unknown" */
      factsHtml += '<div class="bs-row"><dt>' + escapeHtml(fact[0]) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
    }
    this.facts.innerHTML = factsHtml;

    this.link.hidden = !building.nmsuUrl; /* hide the link if there isn't one */
    this.link.href = safeUrl(building.nmsuUrl || '');

    this.source.textContent = this.sourceTextFor(building);
    this.loadFloorPlans(building);
  }

  /**
   * Load each floor's SVG from data/floors, like hjlc-1.svg from FloorplanMaker.
   * A missing file is skipped. Scripts inside the SVG are started after it is on the page.
   * @param {object} building
   * @returns {Promise<void>}
   */
  async loadFloorPlans(building) {
    const loadedFor = building.id;
    this.planSlot.replaceChildren();
    this.planSection.hidden = true;
    const code = String(building.code || '').toLowerCase();
    if (!code) {
      return;
    }
    for (const floor of building.floors) {
      const response = await fetch('data/floors/' + code + '-' + floor + '.svg');
      if (this.shownId !== loadedFor) {
        return; /* a different building was opened while this was loading */
      }
      if (!response.ok) {
        continue;
      }
      const picture = document.createElement('div');
      picture.className = 'bs-plan-svg';
      picture.innerHTML = await response.text();
      for (const oldScript of picture.querySelectorAll('script')) {
        const script = document.createElement('script');
        script.textContent = oldScript.textContent;
        oldScript.replaceWith(script);
      }
      const label = document.createElement('p');
      label.className = 'bs-plan-label';
      label.textContent = 'Floor ' + floor;
      picture.append(label);
      this.planSlot.append(picture);
    }
    this.planSection.hidden = this.planSlot.childElementCount === 0;
  }

  /** Fill the box after the next frame, and only once. */
  showContentSoon() {
    if (this.contentWaiting) {
      return;
    }
    this.contentWaiting = true;
    waitOneFrame(() => {
      this.contentWaiting = false;
      this.showContent(store.get()); /* use whatever is picked by then */
    });
  }

  /**
   * Fill the box for the picked building.
   * @param {object} state
   */
  showContent(state) {
    const building = this.buildingsById[state.selectedId];
    if (!building || building.id === this.shownId) {
      return; /* nothing picked, or we already filled this one */
    }
    this.shownId = building.id;
    this.title.textContent = building.name;
    this.fillAbout(building);
  }

  /**
   * Show the picked building and open or close the box.
   * @param {object} state
   */
  update(state) {
    const building = this.buildingsById[state.selectedId];
    if (building && building.id !== this.shownId) {
      if (this.sheetIsOpen || state.sheetOpen) {
        this.showContent(state); /* box is open, so update it now */
      } else {
        this.showContentSoon(); /* box is still closed, so wait one frame */
      }
    }

    /* only open or close when it actually changes, so the slide doesn't replay */
    if (state.sheetOpen !== this.sheetIsOpen) {
      this.sheetIsOpen = state.sheetOpen;
      this.sheetElement.classList.toggle('is-open', this.sheetIsOpen);
      this.sheetElement.setAttribute('aria-hidden', String(!this.sheetIsOpen));
    }
  }
}
