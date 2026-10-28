/**
 * This file & what it does: picks how big a floor plan should be drawn.
 * Why we have it: the drawings were traced from photos, so their pixel sizes are not the buildings' real sizes.
 * The widest building we have a plan for sets the scale. A smaller building is drawn smaller, down to about three quarters of that size, so the room numbers stay big enough to tap.
 */

const MIN_SHARE = 0.75; /* smallest plan, as a share of the widest plan. low enough that a small building still looks small, high enough that its rooms can be tapped */
const FEET_PER_METRE = 3.28084;
const NICE_FEET = [10, 20, 50, 100, 200, 500];
const NICE_METRES = [5, 10, 20, 50, 100, 200];

/**
 * On-screen box for one floor plan.
 * The long side of the drawing matches the long side of the building, and that long side is a share of the sheet width.
 * A portrait plan and a landscape plan of the same building keep that same long side.
 * @param {{ width: number, depth: number }} footprint metres
 * @param {number} widestMetres long side of the widest building that has a plan
 * @param {number} viewWidth viewBox width, after the drawing has been fitted
 * @param {number} viewHeight viewBox height
 * @param {number} stageWidth px available across the sheet
 * @param {number} maxHeight px the drawing may stand before it is shrunk to stay on screen
 * @returns {{ width: number, height: number, enlarged: boolean, metresPerPixel: number, across: number }|null}
 */
export function planBox(footprint, widestMetres, viewWidth, viewHeight, stageWidth, maxHeight) {
  if (!footprint || !(footprint.width > 0) || !(footprint.depth > 0)) {
    return null;
  }
  if (!(widestMetres > 0) || !(viewWidth > 0) || !(viewHeight > 0) || !(stageWidth > 0) || !(maxHeight > 0)) {
    return null;
  }
  const longM = Math.max(footprint.width, footprint.depth);
  const trueLong = longM * (stageWidth / widestMetres);
  let longPx = trueLong;
  if (longPx < stageWidth * MIN_SHARE) {
    longPx = stageWidth * MIN_SHARE;
  }
  if (longPx > stageWidth) {
    longPx = stageWidth;
  }
  const landscape = viewWidth >= viewHeight;
  let width = landscape ? longPx : longPx * (viewWidth / viewHeight);
  let height = landscape ? longPx * (viewHeight / viewWidth) : longPx;
  const fit = Math.min(1, stageWidth / width, maxHeight / height);
  if (fit < 1) {
    width *= fit;
    height *= fit;
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const drawnLong = Math.max(width, height);
  return {
    width: width,
    height: height,
    enlarged: drawnLong > trueLong * fit + 1,
    metresPerPixel: longM / drawnLong,
    across: longM,
  };
}

/**
 * A scale bar that matches the drawing. The length is a round number of feet or metres.
 * @param {number} metresPerPixel
 * @param {number} framePx the drawing's long side, in px
 * @param {'imperial'|'metric'} units
 * @returns {{ px: number, label: string }|null}
 */
export function scaleBar(metresPerPixel, framePx, units) {
  if (!(metresPerPixel > 0) || !(framePx > 0)) {
    return null;
  }
  const metric = units === 'metric';
  const amounts = metric ? NICE_METRES : NICE_FEET;
  let chosen = 0;
  for (let i = 0; i < amounts.length; i += 1) {
    const metres = metric ? amounts[i] : amounts[i] / FEET_PER_METRE;
    if (metres / metresPerPixel <= framePx * 0.62) {
      chosen = i;
    }
  }
  const metres = metric ? amounts[chosen] : amounts[chosen] / FEET_PER_METRE;
  const px = Math.round(metres / metresPerPixel);
  if (px < 24) {
    return null;
  }
  const label = metric ? amounts[chosen] + ' m' : amounts[chosen] + ' ft';
  return { px: px, label: label };
}
