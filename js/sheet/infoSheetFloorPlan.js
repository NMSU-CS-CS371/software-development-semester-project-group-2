/**
 * This file & what it does: room taps and the button that enlarges one floor plan.
 * Why we have it: a tap on a room only selects that room. The plan grows from the corner button.
 */

import { openPlanFullView } from './infoSheetFullView.js';

/**
 * Listen for room taps and add the enlarge button.
 * @param {HTMLElement} picture
 * @param {SVGElement} svg
 */
export function wireFloorPlan(picture, svg) {
  let index = 0;
  for (const shape of svg.querySelectorAll('path, rect, .room')) {
    if (roomFrom(shape) === shape) {
      shape.dataset.room = String(index);
      index += 1;
    }
  }
  svg.addEventListener('click', (event) => {
    const room = roomFrom(event.target);
    if (!room) {
      return;
    }
    markRoom(svg, room);
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bs-plan-zoom';
  button.setAttribute('aria-label', 'Make bigger');
  button.textContent = '⤢';
  button.addEventListener('click', () => openPlanFullView(svg));
  picture.append(button);
}

/**
 * Mark one room and clear the previous mark on this plan.
 * @param {SVGElement} svg
 * @param {Element|undefined} room
 */
export function markRoom(svg, room) {
  const picked = svg.querySelector('.is-picked');
  if (picked) {
    picked.classList.remove('is-picked');
  }
  if (room) {
    room.classList.add('is-picked');
  }
}

/**
 * A room number such as 128, 128B, or R134. Names like "Hallway" are not rooms.
 * @param {string} words
 * @returns {boolean}
 */
function isRoomNumber(words) {
  return /^[A-Za-z]{0,3}\d+[A-Za-z]?$/.test(words.trim());
}

/**
 * The room number on this line, or on a name line just above it.
 * @param {Element} label
 * @returns {Element|null}
 */
function numberLine(label) {
  let line = label;
  while (line && line.tagName === 'text') {
    if (isRoomNumber(line.textContent)) {
      return line;
    }
    line = line.nextElementSibling;
  }
  return null;
}

/**
 * The smallest filled room that this label sits inside.
 * @param {Element} label
 * @returns {Element|null}
 */
function shapeUnder(label) {
  const number = numberLine(label);
  if (!number) {
    return null;
  }
  const spot = new DOMPoint(Number(number.getAttribute('x')), Number(number.getAttribute('y')));
  let best = null;
  let bestArea = Infinity;
  for (const shape of number.parentElement.children) {
    const tag = shape.tagName;
    if (tag !== 'path' && tag !== 'rect') {
      continue;
    }
    if (shape.getAttribute('fill') === 'none' || !shape.isPointInFill(spot)) {
      continue;
    }
    const box = shape.getBBox();
    const area = box.width * box.height;
    if (area < bestArea) {
      best = shape;
      bestArea = area;
    }
  }
  return best;
}

/**
 * The room shape under the tap, or null. The number sits beside the shape.
 * @param {EventTarget} target
 * @returns {Element|null}
 */
export function roomFrom(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  if (target.classList.contains('room')) {
    return target;
  }
  const beside = target.previousElementSibling;
  if (beside && beside.classList.contains('room') && target.classList.contains('lbl')) {
    return beside;
  }
  const label = target.closest('text');
  if (label) {
    return shapeUnder(label);
  }
  if ((target.tagName === 'path' || target.tagName === 'rect') && target.getAttribute('fill') !== 'none') {
    for (const child of target.parentElement.children) {
      if (child.tagName === 'text' && shapeUnder(child) === target) {
        return target;
      }
    }
  }
  return null;
}
