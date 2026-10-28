/**
 * This file & what it does: turns a floor plan into squares you can walk on.
 * Why we have it: the shortest walk is easier on a grid than on the raw drawing.
 * Only a drawn hallway is open. Rooms, stair cores, open-to-below voids, and the white floor between shapes are walls.
 * The room being walked to is a wall too, so the line stops at its door.
 * Every open square also knows how far it sits from a wall, so the search can keep to the middle of the hallway.
 * Old plans with no hallway shapes fall back to the building floor minus every room and core.
 */

const STEP = 8; /* grid square, in floor-plan units */
const MAX_SQUARES = 40000;
const DIAGONAL = Math.SQRT2;
export const CENTRE_PULL = 8; /* how strongly the walk prefers the middle of the hallway over a shorter edge */

/**
 * Is (x, y) inside the polygon? A ray to the right crosses an odd number of edges when it is.
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function inside(points, x, y) {
  let result = false;
  for (let i = 0; i < points.length; i += 1) {
    const x1 = points[i][0];
    const y1 = points[i][1];
    const next = points[(i + 1) % points.length];
    if ((y1 > y) !== (next[1] > y) && x < x1 + ((y - y1) * (next[0] - x1)) / (next[1] - y1)) {
      result = !result;
    }
  }
  return result;
}

/**
 * Is the point inside any of these shapes?
 * @param {number[][][]} shapes
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function pointIn(shapes, x, y) {
  for (const shape of shapes) {
    if (inside(shape, x, y)) {
      return true;
    }
  }
  return false;
}

/**
 * Can this plan point be walked? Only a hallway, and never a core, a void, or the room being walked to.
 * Old plans have no hallway shapes, so the open floor is the building minus every room and core.
 * @param {object} plan
 * @param {number} x
 * @param {number} y
 * @param {number[][]|null} blockedRoom
 * @returns {boolean}
 */
function walkableAt(plan, x, y, blockedRoom) {
  if (plan.halls.length === 0) {
    return pointIn(plan.outlines, x, y) && !pointIn(plan.blockers, x, y);
  }
  if (pointIn(plan.solids, x, y) || (blockedRoom && inside(blockedRoom, x, y))) {
    return false;
  }
  return pointIn(plan.halls, x, y);
}

/**
 * True when this grid square can be walked.
 * @param {object} grid
 * @param {number} row
 * @param {number} column
 * @returns {boolean}
 */
function openAt(grid, row, column) {
  if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) {
    return false;
  }
  return grid.walkable[row * grid.columns + column] === 1;
}

/**
 * The box around every outline, and a step size that keeps the grid small enough.
 * @param {object} plan
 * @returns {{ left: number, top: number, right: number, bottom: number, step: number }}
 */
function boundsOf(plan) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const outline of plan.outlines) {
    for (const point of outline) {
      left = Math.min(left, point[0]);
      top = Math.min(top, point[1]);
      right = Math.max(right, point[0]);
      bottom = Math.max(bottom, point[1]);
    }
  }
  let step = STEP;
  while (right > left && bottom > top && ((right - left) / step) * ((bottom - top) / step) > MAX_SQUARES) {
    step += 4;
  }
  return { left: left, top: top, right: right, bottom: bottom, step: step };
}

/**
 * Plan coordinates of a square's centre.
 * @param {object} grid
 * @param {number} index
 * @returns {number[]}
 */
export function centreOf(grid, index) {
  const row = Math.floor(index / grid.columns);
  const column = index - row * grid.columns;
  return [grid.left + (column + 0.5) * grid.step, grid.top + (row + 0.5) * grid.step];
}

/**
 * The open squares next to this one, each with its step length.
 * @param {object} grid
 * @param {number} index
 * @returns {number[][]} [index, length]
 */
export function neighboursOf(grid, index) {
  const row = Math.floor(index / grid.columns);
  const column = index - row * grid.columns;
  const found = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) {
        continue;
      }
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (!openAt(grid, nextRow, nextColumn)) {
        continue;
      }
      /* A diagonal step is only allowed when both side squares are open, so the line cannot clip a wall corner. */
      if (dr !== 0 && dc !== 0 && (!openAt(grid, nextRow, column) || !openAt(grid, row, nextColumn))) {
        continue;
      }
      found.push([nextRow * grid.columns + nextColumn, dr !== 0 && dc !== 0 ? DIAGONAL : 1]);
    }
  }
  return found;
}

/**
 * Distance in squares from each open square to the nearest wall, so 1 is right against it.
 * Two sweeps over the grid; the plan edge counts as a wall.
 * @param {object} grid
 * @returns {Float32Array}
 */
function measureClearance(grid) {
  const distance = new Float32Array(grid.walkable.length);
  for (let i = 0; i < distance.length; i += 1) {
    distance[i] = grid.walkable[i] ? Infinity : 0;
  }
  const read = (row, column) => {
    if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) {
      return 0;
    }
    return distance[row * grid.columns + column];
  };
  const sweep = (rowStep, columnStep, rowStart, rowEnd, columnStart, columnEnd) => {
    for (let row = rowStart; row !== rowEnd; row += rowStep) {
      for (let column = columnStart; column !== columnEnd; column += columnStep) {
        const index = row * grid.columns + column;
        if (!grid.walkable[index]) {
          continue;
        }
        distance[index] = Math.min(
          distance[index],
          read(row, column - columnStep) + 1,
          read(row - rowStep, column) + 1,
          read(row - rowStep, column - columnStep) + DIAGONAL,
          read(row - rowStep, column + columnStep) + DIAGONAL,
        );
      }
    }
  };
  sweep(1, 1, 0, grid.rows, 0, grid.columns);
  sweep(-1, -1, grid.rows - 1, -1, grid.columns - 1, -1);
  return distance;
}

/**
 * Open the squares a thin hallway still covers when the square's centre sits just outside it.
 * @param {object} grid
 * @param {object} plan
 * @param {number[][]|null} blockedRoom
 */
function stampHalls(grid, plan, blockedRoom) {
  const spacing = grid.step / 2;
  for (const hall of plan.halls) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const point of hall) {
      left = Math.min(left, point[0]);
      top = Math.min(top, point[1]);
      right = Math.max(right, point[0]);
      bottom = Math.max(bottom, point[1]);
    }
    for (let y = top; y <= bottom; y += spacing) {
      for (let x = left; x <= right; x += spacing) {
        if (!inside(hall, x, y)) {
          continue;
        }
        const column = Math.floor((x - grid.left) / grid.step);
        const row = Math.floor((y - grid.top) / grid.step);
        if (row < 0 || column < 0 || row >= grid.rows || column >= grid.columns) {
          continue;
        }
        const index = row * grid.columns + column;
        const centre = centreOf(grid, index);
        if (pointIn(plan.solids, centre[0], centre[1]) || (blockedRoom && inside(blockedRoom, centre[0], centre[1]))) {
          continue;
        }
        grid.walkable[index] = 1;
      }
    }
  }
}

/**
 * The floor as open and blocked squares.
 * @param {object} plan - from planFromMarkup()
 * @param {number[][]|null} [blockedRoom] - the destination room; the line stops at its door
 * @returns {object}
 */
export function makeGrid(plan, blockedRoom) {
  const box = boundsOf(plan);
  const room = blockedRoom || null;
  const grid = {
    step: box.step,
    left: box.left,
    top: box.top,
    columns: Math.max(1, Math.ceil((box.right - box.left) / box.step)),
    rows: Math.max(1, Math.ceil((box.bottom - box.top) / box.step)),
    walkable: null,
    solid: null,
    clearance: null,
  };
  grid.walkable = new Uint8Array(grid.rows * grid.columns);
  grid.solid = new Uint8Array(grid.rows * grid.columns);
  for (let i = 0; i < grid.walkable.length; i += 1) {
    const centre = centreOf(grid, i);
    grid.solid[i] = pointIn(plan.solids, centre[0], centre[1]) ? 1 : 0;
    grid.walkable[i] = walkableAt(plan, centre[0], centre[1], room) ? 1 : 0;
  }
  stampHalls(grid, plan, room);
  grid.clearance = measureClearance(grid);
  return grid;
}
