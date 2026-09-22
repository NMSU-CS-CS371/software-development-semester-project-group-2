/**
 * This file & what it does: waits until the next picture is on the screen, then runs extra work.
 * Why we have it: a tap should change the screen right away. Flying the map and filling
 * the info box can wait one frame. If the phone does all of that during the tap, the tap feels slow.
 */

/**
 * Run work right after the next frame is drawn.
 * @param {() => void} work
 */
export function afterNextPaint(work) {
  requestAnimationFrame(() => setTimeout(work, 0));
}
