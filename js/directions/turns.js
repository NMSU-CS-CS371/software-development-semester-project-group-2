/**
 * @file js/directions/turns.js
 * @summary Turns a route into spoken-style steps: "Turn left onto Williams Avenue".
 *
 * WHAT IT DOES : Takes the route's points (from js/directions/directions.js) and:
 *                1. groups them into legs: a new leg starts where the way's name
 *                   changes or the route bends sharply,
 *                2. names each turn by its angle (slight or full, left or right),
 *                3. formats distances (ft/mi or m/km) and the travel time,
 *                4. lists every step for the expanded directions card.
 *                All the words come from config.yml (the directions section).
 * DEPENDS ON   : ../core/config.js, ../logic/geo.js
 * USED BY      : js/directions/directions.js
 */

import { CONFIG } from '../core/config.js';
import { metresBetween } from '../logic/geo.js';

const MIN_LEG_METRES = 10; // bends on legs shorter than this are too small to announce
const FEET_PER_METRE = 3.28084;
const FEET_PER_MILE = 5280;

/**
 * The direction of travel from a to b, in degrees clockwise from north.
 * @param {number[]} a - [lng, lat]
 * @param {number[]} b - [lng, lat]
 * @returns {number} 0 to 360
 */
function bearing(a, b) {
  const east = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const north = b[1] - a[1];
  const degrees = (Math.atan2(east, north) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * How much you turn, going from one direction to another: + is right, - is left.
 * @param {number} from - degrees
 * @param {number} to - degrees
 * @returns {number} -180 to 180
 */
function turnAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * What to call a way: its name, or e.g. "the path" when it has none.
 * @param {{ name: string, highway: string }} way
 * @returns {string}
 */
function wayLabel(way) {
  const unnamed = CONFIG.directions.unnamedWays;
  return way.name || unnamed[way.highway] || unnamed.default;
}

/**
 * Split the route into legs: stretches along one way without a sharp bend.
 * @param {number[][]} path - the route's points
 * @param {(a: number[], b: number[]) => object} wayBetween - tells which way a piece of the route is on
 * @returns {object[]} [{ label, startBearing, endBearing, turn, metres }]
 */
function legsOf(path, wayBetween) {
  const legs = [];
  for (let i = 1; i < path.length; i += 1) {
    const label = wayLabel(wayBetween(path[i - 1], path[i]));
    const heading = bearing(path[i - 1], path[i]);
    const metres = metresBetween(path[i - 1], path[i]);
    const lastLeg = legs[legs.length - 1]; // undefined for the first piece

    let turn = 0;
    if (lastLeg) {
      turn = turnAngle(lastLeg.endBearing, heading);
    }
    const sameLeg = lastLeg && lastLeg.label === label && Math.abs(turn) < CONFIG.directions.slightTurnDegrees;
    const tinyPiece = lastLeg && metres < 1;

    if (sameLeg || tinyPiece) {
      lastLeg.metres += metres;
      lastLeg.endBearing = heading;
    } else {
      legs.push({ label: label, startBearing: heading, endBearing: heading, turn: turn, metres: metres });
    }
  }

  // Fold tiny legs into the one before, so a wiggle in a path isn't announced as a turn.
  const kept = [];
  for (const leg of legs) {
    const previous = kept[kept.length - 1];
    if (previous && leg.metres < MIN_LEG_METRES && leg.label === previous.label) {
      previous.metres += leg.metres;
      previous.endBearing = leg.endBearing;
    } else {
      kept.push(leg);
    }
  }
  return kept;
}

/**
 * The words and arrow icon for turning onto a leg ("Turn left onto Williams Avenue").
 * @param {object} leg - its .turn is the angle from the leg before
 * @returns {{ text: string, icon: string }}
 */
function describeTurn(leg) {
  const words = CONFIG.directions;
  const size = Math.abs(leg.turn);
  const right = leg.turn > 0;
  let text = words.continueText;
  let icon = 'arrow_up';

  if (size >= words.turnDegrees) {
    if (right) {
      text = words.turnRightText;
      icon = 'arrow_turn_up_right';
    } else {
      text = words.turnLeftText;
      icon = 'arrow_turn_up_left';
    }
  } else if (size >= words.slightTurnDegrees) {
    if (right) {
      text = words.slightRightText;
      icon = 'arrow_up_right';
    } else {
      text = words.slightLeftText;
      icon = 'arrow_up_left';
    }
  }
  return { text: text + ' ' + words.ontoText + ' ' + leg.label, icon: icon };
}

/**
 * Format a distance the way map apps do: "350 ft", "0.3 mi", "120 m", "1.2 km".
 * @param {number} metres
 * @param {'imperial'|'metric'} units - the Units setting
 * @returns {string}
 */
export function formatDistance(metres, units) {
  if (units === 'metric') {
    if (metres < 1000) {
      return Math.round(metres / 10) * 10 + ' m';
    }
    return (metres / 1000).toFixed(1) + ' km';
  }
  const feet = metres * FEET_PER_METRE;
  if (feet < 1000) {
    return Math.max(10, Math.round(feet / 10) * 10) + ' ft';
  }
  return (feet / FEET_PER_MILE).toFixed(1) + ' mi';
}

/**
 * Everything the directions card shows for a route from where you are now.
 * @param {number} connectorMetres - the straight walk from you to the start of the route
 * @param {number[][]} path - the route's points
 * @param {(a: number[], b: number[]) => object} wayBetween
 * @param {string} destination - e.g. "Hardman and Jacobs Undergraduate Learning Center"
 * @param {'walk'|'bike'|'drive'} mode - sets the travel speed for the time
 * @param {'imperial'|'metric'} units - the Units setting
 * @returns {{ instruction: string, icon: string, summary: string, steps: object[] }}
 *   instruction and icon: the next turn, e.g. "590 ft · Turn right onto the path"
 *   summary: e.g. "11 min · 0.6 mi · arrive 12:07 PM"
 *   steps: every step in order, [{ icon, text, distance }], ending with "Arrive at …"
 */
export function planTrip(connectorMetres, path, wayBetween, destination, mode, units) {
  const words = CONFIG.directions;
  const legs = legsOf(path, wayBetween);

  let routeMetres = 0;
  for (const leg of legs) {
    routeMetres += leg.metres;
  }
  const totalMetres = connectorMetres + routeMetres;
  const minutes = Math.max(1, Math.round(totalMetres / words.speeds[mode] / 60));
  const arrivalTime = new Date(Date.now() + minutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const summary = minutes + ' ' + words.minText + ' · ' + formatDistance(totalMetres, units) + ' · ' + words.arrivalTimeText + ' ' + arrivalTime;
  const arrive = { icon: 'flag_fill', text: words.arriveText + ' ' + destination, distance: '' };

  // The full list: which way to start, every turn, then arriving.
  const steps = [];
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    if (i === 0) {
      const compass = words.compass[Math.round(leg.startBearing / 45) % 8]; // e.g. "north"
      steps.push({
        icon: 'arrow_up',
        text: words.headText + ' ' + compass + ' ' + words.onText + ' ' + leg.label,
        distance: formatDistance(connectorMetres + leg.metres, units),
      });
    } else {
      const turn = describeTurn(leg);
      steps.push({ icon: turn.icon, text: turn.text, distance: formatDistance(leg.metres, units) });
    }
  }
  steps.push(arrive);

  // The card's big line is the next thing to do after the stretch you're on now.
  if (legs.length === 0) {
    return { instruction: arrive.text, icon: arrive.icon, summary: summary, steps: steps };
  }
  const untilNext = formatDistance(connectorMetres + legs[0].metres, units);
  const next = steps[1]; // the next turn, or arriving
  return { instruction: untilNext + ' · ' + next.text, icon: next.icon, summary: summary, steps: steps };
}
