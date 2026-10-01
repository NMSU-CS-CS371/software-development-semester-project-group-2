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
  const picked = svg.querySelector('.room.is-picked');
  if (picked) {
    picked.classList.remove('is-picked');
  }
  if (room) {
    room.classList.add('is-picked');
  }
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
  return null;
}
