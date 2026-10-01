/**
 * This file & what it does: fills in the building info box with the name, facts, and link for the building you picked.
 * Why we have it: the box layout stays in index.html so every building uses the same shape.
 * This file only swaps the words. Empty parts get a short message so a building with missing data still looks finished.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { escapeHtml, safeUrl } from '../core/html.js';
import { waitOneFrame } from '../core/waitOneFrame.js';
import { openPlanFullView } from './infoSheetFullView.js';
import { wireFloorPlan } from './infoSheetFloorPlan.js';

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
    this.photoSection = document.querySelector('#bs-photos');
    this.photoTitle = document.querySelector('#bs-photos-title');
    this.photoRow = document.querySelector('#bs-photo-row');
    this.facts = document.querySelector('#bs-facts');
    this.link = document.querySelector('#bs-link');
    this.source = document.querySelector('#bs-source');

    this.aboutTitle.textContent = this.words.aboutTitle;
    this.photoTitle.textContent = this.words.photosTitle;
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

    this.showPhotos(building);

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
   * Show the photos kept on the store. Built once per building.
   * @param {object} building
   */
  showPhotos(building) {
    const photos = store.photos[building.id];
    if (!photos) {
      return; /* descriptions have not loaded yet */
    }
    if (this.photoFor === building.id && this.photoRow.childElementCount === photos.length) {
      return; /* already on the page, so a redraw does not build them again */
    }
    this.photoFor = building.id;
    this.photoRow.replaceChildren();
    for (const photo of photos) {
      const image = document.createElement('img');
      image.src = photo.thumbUrl || photo.url;
      image.alt = photo.title || building.name;
      image.addEventListener('click', () => openPlanFullView(image));
      this.photoRow.append(image);
    }
    this.photoSection.hidden = photos.length === 0;
  }

  /**
   * Load each floor's SVG from data/floors, like hjlc-1.svg from FloorplanMaker.
   * A missing file is skipped. Scripts inside the SVG are started after it is on the page.
   * @param {object} building
   * @returns {Promise<void>}
   */
  async loadFloorPlans(building) {
    const loadedFor = building.id;
    const pass = (this.planPass = (this.planPass || 0) + 1);
    this.planSlot.replaceChildren();
    this.planSection.hidden = true;
    const code = String(building.code || '').toLowerCase();
    if (!code) {
      return;
    }
    const floors = [];
    const seen = new Set();
    for (const floor of building.floors) {
      if (!seen.has(floor)) {
        seen.add(floor);
        floors.push(floor);
      }
    }
    const responses = await Promise.all(floors.map((floor) => fetch('data/floors/' + code + '-' + floor + '.svg', { cache: 'reload' })));
    const texts = await Promise.all(responses.map((response) => response.ok ? response.text() : ''));
    if (this.shownId !== loadedFor || this.planPass !== pass) {
      return; /* a newer load started, so this one must not add another plan */
    }
    for (let index = 0; index < floors.length; index += 1) {
      const floor = floors[index];
      const text = texts[index];
      const plan = document.createElement('div');
      plan.className = 'bs-plan';
      plan.dataset.floor = String(floor);
      const label = document.createElement('p');
      label.className = 'bs-plan-label';
      label.textContent = 'Floor ' + floor;
      plan.append(label);
      if (text) {
        const picture = document.createElement('div');
        picture.className = 'bs-plan-svg';
        picture.innerHTML = text;
        for (const oldScript of picture.querySelectorAll('script')) {
          const script = document.createElement('script');
          script.textContent = oldScript.textContent;
          oldScript.replaceWith(script);
        }
        const drawn = picture.querySelector('svg');
        if (drawn) {
          wireFloorPlan(picture, drawn);
        }
        plan.append(picture);
      } else {
        const note = document.createElement('p');
        note.className = 'bs-plan-empty';
        note.textContent = this.words.noPlanText;
        plan.append(note);
      }
      if (this.planPass !== pass) {
        return;
      }
      this.planSlot.append(plan);
    }
    if (this.planPass !== pass) {
      return;
    }
    this.planSection.hidden = false;
    this.showActiveFloor(store.get());
  }

  /**
   * Show the picked floor. If that SVG never loaded, show the missing-plan note.
   * @param {object} state
   */
  showActiveFloor(state) {
    const building = this.buildingsById[state.selectedId];
    const floor = state.activeFloor != null ? state.activeFloor : (building && building.floors && building.floors[0]);
    const key = String(floor);
    for (const plan of this.planSlot.querySelectorAll('.bs-plan')) {
      const on = plan.dataset.floor === key;
      plan.hidden = !on;
      if (on && key !== this.shownFloor) {
        plan.classList.add('is-in');
      } else if (!on) {
        plan.classList.remove('is-in');
      }
      const drawn = on ? plan.querySelector('svg') : null;
      if (drawn && !drawn.dataset.fit) {
        const box = drawn.getBBox();
        const view = drawn.viewBox.baseVal;
        if (box.width > 0 && view.width > 0) {
          const left = Math.min(view.x, box.x);
          const top = Math.min(view.y, box.y);
          const right = Math.max(view.x + view.width, box.x + box.width);
          const bottom = Math.max(view.y + view.height, box.y + box.height);
          drawn.setAttribute('viewBox', left + ' ' + top + ' ' + (right - left) + ' ' + (bottom - top));
          drawn.dataset.fit = '1';
        }
      }
    }
    this.shownFloor = key;
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
    this.showActiveFloor(state);

    if (state.sheetOpen !== this.sheetIsOpen) {
      this.sheetIsOpen = state.sheetOpen;
      this.sheetElement.classList.toggle('is-open', this.sheetIsOpen);
      this.sheetElement.setAttribute('aria-hidden', String(!this.sheetIsOpen));
    }
  }
}
