/**
 * This file & what it does: fills in the building info box with the name, facts, and link for the building you picked.
 * Why we have it: the box layout stays in index.html so every building uses the same shape.
 * This file only swaps the words. Empty parts get a short message so a building with missing data still looks finished.
 */

import { CONFIG } from '../core/config.js';
import { photoSrc, store } from '../core/store.js';
import { escapeHtml, safeUrl } from '../core/html.js';
import { waitOneFrame } from '../core/waitOneFrame.js';
import { routeLegs, walkWords } from '../directions/route.js';
import { openPhotoView } from './infoSheetFullView.js';
import { clearRoute, drawRoute, fillWalkNote, markRoom, shapeForNumber, wireFloorPlan } from './infoSheetFloorPlan.js';

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
    this.walkHint = document.querySelector('#bs-walk-hint');
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
    this.floorMarkup = {}; /* floor number -> the SVG text, for the walk */
    this.routeKey = ''; /* building and room the current walk is for */
    this.routeResult = null; /* { legs, main, blocked, via, canSwitch } */
    this.way = 'stairs'; /* the way up to try first when a room is on another floor */

    window.addEventListener('resize', () => this.resizePlan());

    document.querySelector('#bs-close').addEventListener('click', () => store.closeSheet());
    this.back = document.querySelector('#bs-back');
    this.back.addEventListener('click', () => {
      store.closeSheet();
      document.dispatchEvent(new CustomEvent('show-locations'));
    });
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
    photos.forEach((photo, index) => {
      const image = document.createElement('img');
      image.src = photoSrc(photo);
      image.alt = photo.title || building.name;
      image.addEventListener('click', () => openPhotoView(photos, index));
      this.photoRow.append(image);
    });
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
    this.floorMarkup = {};
    this.routeKey = '';
    this.routeResult = null;
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
    if (floors.length > 0) {
      this.planSlot.append(this.floorSwap(floors));
    }
    for (let index = 0; index < floors.length; index += 1) {
      const floor = floors[index];
      const text = texts[index];
      const plan = document.createElement('div');
      plan.className = 'bs-plan';
      plan.dataset.floor = String(floor);
      if (text) {
        this.floorMarkup[floor] = text;
        plan.markup = text; /* the full-screen copy reads this to draw the walk */
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
          const frame = document.createElement('div');
          frame.className = 'bs-plan-frame';
          drawn.replaceWith(frame);
          frame.append(drawn);
          drawn.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          wireFloorPlan(picture, drawn);
        }
        plan.append(picture);
        if (drawn) {
          plan.append(this.scaleRow(), this.enlargedNote());
        }
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
   * One control for the floors. One floor is just the words. Two or more can be tapped.
   * @param {number[]} floors
   * @returns {HTMLElement}
   */
  floorSwap(floors) {
    const swap = document.createElement('div');
    swap.className = 'bs-floor-swap';
    if (floors.length < 2) {
      const label = document.createElement('p');
      label.className = 'bs-plan-label';
      label.textContent = 'Floor ' + floors[0];
      swap.append(label);
      return swap;
    }
    for (const floor of floors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bs-plan-label';
      button.dataset.floor = String(floor);
      button.textContent = 'Floor ' + floor;
      button.addEventListener('click', () => {
        if (store.get().activeFloor !== floor) {
          store.showFloor(floor);
        }
      });
      swap.append(button);
    }
    return swap;
  }

  /**
   * Show the picked floor. If that SVG never loaded, show the missing-plan note.
   * @param {object} state
   */
  showActiveFloor(state) {
    const building = this.buildingsById[state.selectedId];
    const floor = state.activeFloor != null ? state.activeFloor : (building && building.floors && (building.floors.includes(1) ? 1 : building.floors[0]));
    const key = String(floor);
    for (const button of this.planSlot.querySelectorAll('.bs-floor-swap button')) {
      const on = button.dataset.floor === key;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
    for (const plan of this.planSlot.querySelectorAll('.bs-plan')) {
      const on = plan.dataset.floor === key;
      plan.hidden = !on;
      if (on && key !== this.shownFloor) {
        plan.classList.add('is-in');
      } else if (!on) {
        plan.classList.remove('is-in');
      }
      const drawn = on ? plan.querySelector('svg') : null;
      if (drawn && state.selectedRoom && drawn.dataset.markedRoom !== state.selectedRoom) {
        markRoom(drawn, shapeForNumber(drawn, state.selectedRoom));
        drawn.dataset.markedRoom = state.selectedRoom;
      }
      if (drawn) {
        this.paintWalk(drawn, floor, state);
      }
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
      if (drawn) {
        this.applyPlanSize(drawn);
      }
    }
    this.shownFloor = key;
    this.paintFullView(state);
    this.setWalkHint();
  }

  /**
   * Keep the full-screen copy of a plan in step with the sheet: the same picked place and the same walk.
   * @param {object} state
   */
  paintFullView(state) {
    const copy = document.querySelector('dialog.plan-full svg');
    if (!copy || !copy.dataset.floor) {
      return;
    }
    const number = pickedRoomNumber(state);
    markRoom(copy, number ? shapeForNumber(copy, number) : null);
    this.paintWalk(copy, Number(copy.dataset.floor), state);
  }

  /**
   * One sentence for the blue line, and a way to report a route that looks wrong.
   */
  setWalkHint() {
    const state = store.get();
    const floor = state.activeFloor;
    const number = pickedRoomNumber(state);
    if (!number) {
      this.walkHint.hidden = true;
      return;
    }
    fillWalkNote(this.walkHint, walkWords(this.routeResult, floor, number), this.words, this.otherWay());
  }

  /**
   * The button for the other way up, when both stairs and an elevator reach the room.
   * @returns {{ text: string, onClick: function(): void }|null}
   */
  otherWay() {
    const result = this.routeResult;
    if (!result || !result.canSwitch) {
      return null;
    }
    const toElevator = result.via === 'stairs';
    return {
      text: toElevator ? this.words.elevatorSwitchText : this.words.stairsSwitchText,
      onClick: () => {
        this.way = toElevator ? 'elevator' : 'stairs';
        this.routeKey = '';
        this.showActiveFloor(store.get());
      },
    };
  }

  /**
   * The walk for the picked room, worked out once, then drawn on the floor that is showing.
   * A room above the entry floor has one line on each floor: entrance to stairs (or the elevator), then on to the room.
   * @param {SVGElement} svg
   * @param {number} floor
   * @param {object} state
   */
  paintWalk(svg, floor, state) {
    const number = pickedRoomNumber(state);
    if (!number) {
      clearRoute(svg);
      return;
    }
    const building = this.buildingsById[state.selectedId];
    const roomFloor = pickedRoomFloor(state, floor);
    const key = state.selectedId + '|' + number + '|' + roomFloor + '|' + this.way;
    if (key !== this.routeKey) {
      this.routeKey = key;
      const entryFloor = building && building.floors && building.floors.includes(1) ? 1 : (building && building.floors && building.floors[0]);
      const entry = this.floorMarkup[entryFloor];
      const destination = this.floorMarkup[roomFloor];
      this.routeResult = entry && destination ? routeLegs(entry, destination, number, entryFloor, roomFloor, this.way) : null;
    }
    let points = null;
    const drawnLegs = this.routeResult && this.routeResult.legs;
    for (const leg of drawnLegs || []) {
      if (leg.floor === floor) {
        points = leg.points;
      }
    }
    drawRoute(svg, points);
  }

  /**
   * The line under the plan: a scale bar, and how wide the building is.
   * @returns {HTMLElement}
   */
  scaleRow() {
    const row = document.createElement('div');
    row.className = 'bs-plan-scale';
    row.hidden = true;
    const wrap = document.createElement('span');
    wrap.className = 'bs-plan-bar-wrap';
    const bar = document.createElement('span');
    bar.className = 'bs-plan-bar';
    bar.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'bs-plan-scale-label';
    wrap.append(bar, label);
    const across = document.createElement('span');
    across.className = 'bs-plan-across';
    row.append(wrap, across);
    return row;
  }

  /**
   * Shown when a small building is drawn larger than its real share, so the rooms stay tappable.
   * @returns {HTMLElement}
   */
  enlargedNote() {
    const note = document.createElement('div');
    note.className = 'bs-plan-enlarged';
    note.hidden = true;
    note.textContent = this.words.planEnlargedText;
    return note;
  }

  /**
   * Size the visible plan again after the sheet width changes.
   */
  resizePlan() {
    const drawn = this.planSlot.querySelector('.bs-plan:not([hidden]) svg');
    if (drawn) {
      this.applyPlanSize(drawn);
    }
  }

  /**
   * Draw the plan across the sheet. Floor plans fill the stage.
   * @param {SVGElement} svg
   */
  applyPlanSize(svg) {
    const frame = svg.parentElement;
    const plan = svg.closest('.bs-plan');
    if (!frame || !plan || !frame.classList.contains('bs-plan-frame')) {
      return;
    }
    frame.style.width = '100%';
    frame.style.height = 'auto';
    frame.classList.add('is-fallback');
    const row = plan.querySelector('.bs-plan-scale');
    const note = plan.querySelector('.bs-plan-enlarged');
    if (row) {
      row.hidden = true;
    }
    if (note) {
      note.hidden = true;
    }
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

    /* Back only when this building was opened from the Locations page */
    const fromLocations = state.selectedVia === 'locations';
    this.back.classList.toggle('is-on', fromLocations);
    this.back.setAttribute('aria-hidden', String(!fromLocations));
    this.back.tabIndex = fromLocations ? 0 : -1;

    /* only open or close when it actually changes, so the slide doesn't replay */
    this.showActiveFloor(state);

    if (state.sheetOpen !== this.sheetIsOpen) {
      this.sheetIsOpen = state.sheetOpen;
      this.sheetElement.classList.toggle('is-open', this.sheetIsOpen);
      this.sheetElement.setAttribute('aria-hidden', String(!this.sheetIsOpen));
    }
  }
}

/**
 * The room picked from search or a floor plan, or ''.
 * @param {object} state
 * @returns {string}
 */
function pickedRoomNumber(state) {
  const room = state.selectedRoom;
  if (!room) {
    return '';
  }
  return typeof room === 'string' ? room : room.number || '';
}

/**
 * The floor the picked room is on.
 * @param {object} state
 * @param {number} floor - the floor showing now, used when the room's floor is unknown
 * @returns {number}
 */
function pickedRoomFloor(state, floor) {
  return state.selectedRoomFloor != null ? state.selectedRoomFloor : floor;
}
