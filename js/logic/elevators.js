/**
 * This file & what it does: how an elevator is recognised on a floor plan and what it is called.
 * Why we have it: the plan reader and the plan on screen must agree on which shape is an elevator
 * and on its name, so a tap on the drawing finds the same place the walk is worked out for.
 * An elevator is a core block drawn straight before its elevator icon.
 */

const ELEVATOR_ICON = 'm21 16-3-3h6z'; /* the start of the elevator icon's drawn path */
const NAME = /^Elevator \d+$/;

/**
 * Is this drawn path the elevator icon?
 * @param {string} path - the d attribute
 * @returns {boolean}
 */
export function isElevatorPath(path) {
  return String(path).trim().indexOf(ELEVATOR_ICON) === 0;
}

/**
 * The name of the nth elevator on a floor, counting from the first drawn.
 * @param {number} index
 * @returns {string}
 */
export function elevatorName(index) {
  return 'Elevator ' + (index + 1);
}

/**
 * Is this the name of an elevator rather than a room number?
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isElevatorName(text) {
  return NAME.test(String(text || ''));
}

/**
 * How a place reads in a sentence: "Room 118", or "Elevator 1".
 * @param {string} number - a room number or an elevator name
 * @param {string} roomText - the word for a room, like "Room"
 * @returns {string}
 */
export function placeLabel(number, roomText) {
  return isElevatorName(number) ? number : roomText + ' ' + number;
}
