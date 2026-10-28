/**
 * This file & what it does: room taps and the button that enlarges one floor plan.
 * Why we have it: a tap on a room marks that room. The Full screen button opens the plan bigger.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { elevatorName, isElevatorName, isElevatorPath } from '../logic/elevators.js';
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
    const room = placeFrom(event.target);
    if (!room) {
      return;
    }
    markRoom(svg, room);
    const number = numberOf(room);
    const plan = svg.closest('[data-floor]');
    if (number && plan) {
      store.pickRoom(number, Number(plan.dataset.floor));
    }
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bs-plan-zoom';
  button.append(fullScreenIcon(), fullScreenLabel());
  button.addEventListener('click', () => openPlanFullView(svg));
  picture.append(button);
}

/** The four-corner mark people already know means full screen. */
function fullScreenIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('bs-plan-zoom-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  return icon;
}

/** The words next to the icon, from config.yml. */
function fullScreenLabel() {
  const label = document.createElement('span');
  label.textContent = CONFIG.sheet.planFullText;
  return label;
}

/**
 * The drawn room or elevator with this number, or null.
 * @param {SVGElement} svg
 * @param {string} number
 * @returns {Element|null}
 */
export function shapeForNumber(svg, number) {
  if (isElevatorName(number)) {
    return elevatorShapes(svg)[Number(String(number).slice('Elevator '.length)) - 1] || null;
  }
  const want = String(number).toLowerCase();
  for (const shape of svg.querySelectorAll('[data-room-number]')) {
    if (String(shape.getAttribute('data-room-number')).toLowerCase() !== want) {
      continue;
    }
    if (shape.classList.contains('room')) {
      return shape;
    }
    const inner = shape.querySelector('.room');
    if (inner) {
      return inner;
    }
  }
  for (const label of svg.querySelectorAll('text')) {
    if (label.textContent.trim().toLowerCase() !== want) {
      continue;
    }
    const beside = label.previousElementSibling;
    if (beside && beside.classList.contains('room')) {
      return beside;
    }
  }
  return null;
}

/**
 * Mark one room and clear the previous mark on this plan.
 * @param {SVGElement} svg
 * @param {Element|null|undefined} room
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_GAP = 28; /* plan units between one chevron and the next */

/**
 * Draw the walk on this plan. A later call replaces the previous line.
 * Blue chevrons follow the hallway. A crimson dot sits on the door or the stairs.
 * @param {SVGElement} svg
 * @param {number[][]|null} points
 */
export function drawRoute(svg, points) {
  clearRoute(svg);
  if (!points || points.length < 2) {
    return;
  }
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'indoor-route');
  layer.append(routeLine(points));
  for (const spot of arrowSpots(points)) {
    layer.append(arrowAt(spot));
  }
  layer.append(startMark(points[0]));
  svg.append(layer);
}

/**
 * Take the walk off this plan.
 * @param {SVGElement} svg
 */
export function clearRoute(svg) {
  const layer = svg.querySelector('.indoor-route');
  if (layer) {
    layer.remove();
  }
}

/**
 * One solid line under the arrows, so the walk does not break between chevrons.
 * @param {number[][]} points
 * @returns {SVGPolylineElement}
 */
function routeLine(points) {
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('class', 'indoor-route-line');
  const pairs = [];
  for (const point of points) {
    pairs.push(point[0] + ',' + point[1]);
  }
  line.setAttribute('points', pairs.join(' '));
  return line;
}

/**
 * Where each chevron sits, and which way it points.
 * @param {number[][]} points
 * @returns {{ x: number, y: number, angle: number }[]}
 */
function arrowSpots(points) {
  const spans = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    spans.push(length);
    total += length;
  }
  const spots = [];
  for (let distance = ARROW_GAP * 0.7; distance < total - 10; distance += ARROW_GAP) {
    const spot = spotAt(points, spans, distance);
    if (spot) {
      spots.push(spot);
    }
  }
  if (spots.length === 0 && total > 0) {
    const spot = spotAt(points, spans, total * 0.55);
    if (spot) {
      spots.push(spot);
    }
  }
  return spots;
}

/**
 * The point that far along the line, and the segment's angle in degrees.
 * @param {number[][]} points
 * @param {number[]} spans
 * @param {number} distance
 * @returns {{ x: number, y: number, angle: number }|null}
 */
function spotAt(points, spans, distance) {
  let left = distance;
  for (let i = 0; i < spans.length; i += 1) {
    if (left > spans[i]) {
      left -= spans[i];
      continue;
    }
    const share = spans[i] === 0 ? 0 : left / spans[i];
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    return {
      x: points[i][0] + dx * share,
      y: points[i][1] + dy * share,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    };
  }
  return null;
}

/**
 * One ">" turned to follow the hallway.
 * @param {{ x: number, y: number, angle: number }} spot
 * @returns {SVGPathElement}
 */
function arrowAt(spot) {
  const arrow = document.createElementNS(SVG_NS, 'path');
  arrow.setAttribute('class', 'indoor-arrow');
  arrow.setAttribute('d', 'M -7 -9 L 8 0 L -7 9');
  arrow.setAttribute('transform', 'translate(' + spot.x + ' ' + spot.y + ') rotate(' + spot.angle + ')');
  return arrow;
}

/**
 * Crimson dot with a white ring, on the door or the stairs.
 * @param {number[]} point
 * @returns {SVGGElement}
 */
function startMark(point) {
  const mark = document.createElementNS(SVG_NS, 'g');
  mark.setAttribute('class', 'indoor-start');
  mark.setAttribute('transform', 'translate(' + point[0] + ' ' + point[1] + ')');
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('class', 'indoor-start-ring');
  ring.setAttribute('r', '13');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'indoor-start-dot');
  dot.setAttribute('r', '6');
  mark.append(ring, dot);
  return mark;
}

/**
 * The walk sentence, a way to take the other way up when both work, and a quiet link for a route that looks wrong.
 * @param {HTMLElement} note
 * @param {string} sentence
 * @param {{ reportText?: string, reportUrl?: string }} words
 * @param {{ text: string, onClick: function(): void }|null} [swap] - the other way up, when there is one
 */
export function fillWalkNote(note, sentence, words, swap) {
  note.replaceChildren();
  const text = document.createElement('span');
  text.className = 'walk-note-text';
  text.textContent = sentence;
  note.append(text);
  if (swap) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'walk-switch';
    button.textContent = swap.text;
    button.addEventListener('click', swap.onClick);
    note.append(button);
  }
  if (words && words.reportUrl) {
    const link = document.createElement('a');
    link.className = 'walk-report';
    link.href = words.reportUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = words.reportText || 'Report a problem';
    note.append(link);
  }
  note.hidden = false;
}

/**
 * The room number written beside this shape, the elevator's name for an elevator, or ''.
 * @param {Element} room
 * @returns {string}
 */
export function numberOf(room) {
  if (isElevatorShape(room)) {
    return elevatorName(elevatorShapes(room.ownerSVGElement).indexOf(room));
  }
  const label = room.nextElementSibling;
  if (label && label.tagName === 'text' && isRoomNumber(label.textContent)) {
    return label.textContent.trim();
  }
  return '';
}

/**
 * A room number such as 128, 128B, or R134. Names like "Hallway" are not rooms.
 * @param {string} words
 * @returns {boolean}
 */
function isRoomNumber(words) {
  return /^[A-Za-z]{0,4}\s*\d+[A-Za-z]?$/.test(words.trim());
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

/**
 * Is this drawn shape an elevator? A core block with the elevator icon straight after it.
 * @param {Element} shape
 * @returns {boolean}
 */
function isElevatorShape(shape) {
  if (!shape.classList.contains('core')) {
    return false;
  }
  const icon = shape.nextElementSibling;
  const path = icon && icon.tagName === 'g' && icon.classList.contains('icon') ? icon.querySelector('path') : null;
  return Boolean(path) && isElevatorPath(path.getAttribute('d') || '');
}

/**
 * Every elevator drawn on this plan, in the order they are drawn.
 * @param {SVGElement} svg
 * @returns {Element[]}
 */
function elevatorShapes(svg) {
  return [...svg.querySelectorAll('.core')].filter(isElevatorShape);
}

/**
 * The elevator under the tap: its block, or its icon. Null when the tap is on anything else.
 * @param {EventTarget} target
 * @returns {Element|null}
 */
export function elevatorFrom(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const icon = target.closest('g.icon');
  const shape = icon ? icon.previousElementSibling : target;
  return shape && isElevatorShape(shape) ? shape : null;
}

/**
 * The room or elevator under the tap, or null.
 * @param {EventTarget} target
 * @returns {Element|null}
 */
export function placeFrom(target) {
  return roomFrom(target) || elevatorFrom(target);
}
