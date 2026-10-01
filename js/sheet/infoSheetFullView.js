/**
 * This file & what it does: opens one floor plan full screen.
 * Why we have it: a tap should make the plan bigger, like the Photos app.
 * Two fingers pinch to zoom, Control and the scroll wheel do the same, and a drag pans when it is bigger.
 * The view is thrown away when it closes, so the next one starts fresh.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_ZOOM = 2;

/**
 * Open a copy of this floor plan full screen.
 * @param {SVGElement} svg
 */
export function openPlanFullView(svg) {
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
  const copy = svg.cloneNode(true);
  stage.append(copy);
  dialog.append(close, stage);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  watchPlan(dialog, stage, copy);
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
function watchPlan(dialog, stage, svg) {
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
    stage.setPointerCapture(event.pointerId);
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
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
      lastTap = 0;
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
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    draw(zoomAround(
      view.scale * Math.exp(-event.deltaY * 0.01),
      event.clientX, event.clientY, event.clientX, event.clientY, view, box
    ), false);
  }, { passive: false });
  stage.addEventListener('click', (event) => {
    if (event.target === stage && view.scale === MIN_SCALE) {
      dialog.close();
    }
  });
}
