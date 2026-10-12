/**
 * This file & what it does: opens one floor plan full screen.
 * Why we have it: a tap should make the plan bigger, like the Photos app.
 * Two fingers pinch to zoom. Two fingers sliding together pan when it is bigger, and so does a press-and-drag.
 * Control and the scroll wheel zoom too.
 * The view is thrown away when it closes, so the next one starts fresh.
 */

import { photoSrc } from '../core/store.js';
import { markRoom, roomFrom } from './infoSheetFloorPlan.js';
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_ZOOM = 2;

/**
 * Open building photos full screen. The picture keeps its own shape.
 * When there is more than one, < and > step through them and stop at each end.
 * @param {object[]} photos
 * @param {number} start
 */
export function openPhotoView(photos, start) {
  const already = document.querySelector('dialog.plan-full');
  if (already) {
    already.remove();
  }
  let index = start;
  const dialog = document.createElement('dialog');
  dialog.className = 'plan-full';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'plan-full-x';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const stage = document.createElement('div');
  stage.className = 'plan-full-stage';
  const image = document.createElement('img');
  image.className = 'plan-full-photo';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'plan-full-nav plan-full-prev';
  prev.setAttribute('aria-label', 'Previous photo');
  prev.textContent = '<';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'plan-full-nav plan-full-next';
  next.setAttribute('aria-label', 'Next photo');
  next.textContent = '>';
  const spin = document.createElement('div');
  spin.className = 'plan-full-spin';
  spin.setAttribute('role', 'status');
  spin.setAttribute('aria-label', 'Loading photo');
  let shown = '';

  function ready() {
    return image.complete && image.naturalWidth > 0 && image.currentSrc === shown;
  }

  function show() {
    const photo = photos[index];
    shown = photoSrc(photo);
    image.alt = photo.title || '';
    prev.hidden = index === 0;
    next.hidden = index === photos.length - 1;
    if (image.getAttribute('src') !== shown) {
      image.hidden = true; /* the last slide stays hidden until this address is the one on screen */
      image.src = shown;
    }
    image.hidden = !ready();
    spin.hidden = ready();
  }

  image.addEventListener('load', () => {
    if (!ready()) {
      return;
    }
    spin.hidden = true;
    image.hidden = false;
  });
  image.addEventListener('error', () => {
    if (image.getAttribute('src') !== shown) {
      return;
    }
    spin.hidden = true;
  });

  prev.addEventListener('click', () => {
    if (index > 0) {
      index -= 1;
      show();
    }
  });
  next.addEventListener('click', () => {
    if (index < photos.length - 1) {
      index += 1;
      show();
    }
  });

  show();
  stage.append(image);
  dialog.append(close, prev, next, spin, stage);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/**
 * Open a copy of this floor plan full screen.
 * @param {SVGElement|HTMLImageElement} picture
 */
export function openPlanFullView(picture) {
  const already = document.querySelector('dialog.plan-full');
  if (already) {
    already.remove(); /* a second tap replaces the open plan instead of stacking one */
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'plan-full';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'plan-full-x';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const stage = document.createElement('div');
  stage.className = 'plan-full-stage';
  const copy = picture.cloneNode(true);
  stage.append(copy);
  dialog.append(close, stage);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  watchPlan(dialog, stage, copy, picture);
}

/** New scale and position so one spot on the plan stays under the fingers or the cursor. */
function zoomAround(nextScale, focusX, focusY, anchorX, anchorY, from, box) {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  if (scale === MIN_SCALE) {
    return { scale: MIN_SCALE, x: 0, y: 0 };
  }
  const ratio = scale / from.scale;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return {
    scale: scale,
    x: focusX - cx - (anchorX - cx - from.x) * ratio,
    y: focusY - cy - (anchorY - cy - from.y) * ratio,
  };
}

/** Midpoint of the two fingers, or null. */
function pinchPoint(fingers) {
  if (fingers.size < 2) {
    return null;
  }
  const pair = [...fingers.values()];
  return {
    distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1,
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
  };
}

/** Pinch, drag, double-tap, and Control plus the scroll wheel. */
function watchPlan(dialog, stage, svg, picture) {
  let view = { scale: MIN_SCALE, x: 0, y: 0 };
  let lastTap = 0;
  const fingers = new Map();
  let pinch = null; /* where the fingers were when the pinch started */
  let grabX = 0;
  let grabY = 0;
  let box = stage.getBoundingClientRect();
  let frame = 0;

  /* one paint per frame, so fast drags do not restyle the plan more than the screen can show */
  function draw(next, animate) {
    if (next) {
      view = next;
    }
    svg.classList.toggle('is-anim', Boolean(animate));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      svg.style.transform = 'translate3d(' + view.x + 'px,' + view.y + 'px,0) scale(' + view.scale + ')';
    });
  }

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    box = stage.getBoundingClientRect();
    svg.dataset.moved = '';
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY, downY: event.clientY, moved: false });
    const point = pinchPoint(fingers);
    if (point) {
      pinch = { distance: point.distance, x: point.x, y: point.y, view: view };
      lastTap = 0;
    } else {
      grabX = event.clientX - view.x;
      grabY = event.clientY - view.y;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    const finger = fingers.get(event.pointerId);
    if (!finger) {
      return;
    }
    if (Math.hypot(event.clientX - finger.x, event.clientY - finger.y) > 8) {
      finger.moved = true;
      svg.dataset.moved = '1';
      lastTap = 0;
      stage.setPointerCapture(event.pointerId);
    }
    finger.x = event.clientX;
    finger.y = event.clientY;
    const point = pinchPoint(fingers);
    if (point && pinch) {
      draw(zoomAround(
        pinch.view.scale * (point.distance / pinch.distance),
        point.x, point.y, pinch.x, pinch.y, pinch.view, box
      ), false);
      return;
    }
    if (view.scale > MIN_SCALE) {
      draw({ scale: view.scale, x: event.clientX - grabX, y: event.clientY - grabY }, false);
    }
  });

  /** @param {PointerEvent} event */
  function lift(event) {
    const finger = fingers.get(event.pointerId);
    if (!finger) {
      return;
    }
    fingers.delete(event.pointerId);
    if (fingers.size === 0 && view.scale === MIN_SCALE && event.clientY - finger.downY > 90) {
      dialog.close(); /* slide the plan down to leave */
      return;
    }
    const left = [...fingers.values()][0];
    if (left) {
      grabX = left.x - view.x;
      grabY = left.y - view.y;
    }
    pinch = null;
    if (fingers.size > 0 || event.type === 'pointercancel' || finger.moved) {
      return;
    }
    const now = Date.now();
    if (now - lastTap < 280) {
      draw({ scale: view.scale > MIN_SCALE ? MIN_SCALE : TAP_ZOOM, x: 0, y: 0 }, true);
      lastTap = 0;
      return;
    }
    lastTap = now;
  }

  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      draw(zoomAround(
        view.scale * Math.exp(-event.deltaY * 0.01),
        event.clientX, event.clientY, event.clientX, event.clientY, view, box
      ), false);
      return;
    }
    /* a trackpad two-finger swipe. a mouse wheel still only zooms with Control held */
    if (view.scale === MIN_SCALE || event.deltaMode !== 0) {
      return;
    }
    event.preventDefault();
    draw({ scale: view.scale, x: view.x - event.deltaX, y: view.y - event.deltaY }, false);
  }, { passive: false });
  stage.addEventListener('click', (event) => {
    if (svg.dataset.moved === '1') {
      svg.dataset.moved = '';
      return;
    }
    let room = svg instanceof SVGElement ? roomFrom(event.target) : null;
    if (!room && svg instanceof SVGElement) {
      for (const hit of document.elementsFromPoint(event.clientX, event.clientY)) {
        room = roomFrom(hit);
        if (room && svg.contains(room)) {
          break;
        }
        room = null;
      }
    }
    if (room && svg.contains(room)) {
      markRoom(svg, room);
      if (picture instanceof SVGElement) {
        const index = [...svg.querySelectorAll('path, rect, .room')].indexOf(room);
        if (index >= 0) {
          markRoom(picture, picture.querySelectorAll('path, rect, .room')[index]);
        }
      }
      return;
    }
    if (event.target === stage && view.scale === MIN_SCALE) {
      dialog.close();
    }
  });
}
