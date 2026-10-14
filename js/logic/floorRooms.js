/**
 * This file & what it does: reads room numbers off the floor-plan drawings.
 * Why we have it: search needs a list of rooms, and those numbers live in data/floors, not in a separate file.
 * A room is a number such as 128, 118A, or R134. Words like "Hallway" are skipped.
 */

const ROOM_NUMBER = /^[A-Za-z]{0,3}\d+[A-Za-z]?$/;

/**
 * The words in a plan title that are not the room number.
 * "LECTURE HALL · 125" becomes "LECTURE HALL".
 * @param {string} title
 * @param {string} number
 * @returns {string}
 */
function nameBeside(title, number) {
  const kept = [];
  for (const part of title.split('·')) {
    const words = part.trim();
    if (!words) {
      continue;
    }
    if (words.toLowerCase() === number.toLowerCase()) {
      continue;
    }
    if (words.toLowerCase() === 'room ' + number.toLowerCase()) {
      continue;
    }
    kept.push(words);
  }
  return kept.join(' · ');
}

/**
 * Rooms drawn in one floor plan.
 * @param {string} svg
 * @param {string} buildingId
 * @param {number} floor
 * @returns {object[]}
 */
function roomsInPlan(svg, buildingId, floor) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const seen = new Set();
  const rooms = [];

  /**
   * @param {string} number
   * @param {string} name
   */
  function add(number, name) {
    const clean = String(number).trim();
    if (!ROOM_NUMBER.test(clean)) {
      return;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rooms.push({
      building: buildingId,
      floor: floor,
      number: clean,
      name: name || '',
    });
  }

  for (const shape of doc.querySelectorAll('[data-room-number]')) {
    const number = shape.getAttribute('data-room-number');
    const title = shape.querySelector('title');
    const name = title ? nameBeside(title.textContent, number) : '';
    add(number, name);
  }
  for (const label of doc.querySelectorAll('text')) {
    add(label.textContent, '');
  }
  return rooms;
}

/**
 * Every room on the floor plans we have for these buildings.
 * A missing drawing is skipped.
 * @param {object[]} buildings
 * @returns {Promise<object[]>}
 */
export async function roomsOnFloors(buildings) {
  const jobs = [];
  for (const building of buildings) {
    const code = String(building.code || '').toLowerCase();
    if (!code || !building.floors) {
      continue;
    }
    const seenFloors = new Set();
    for (const floor of building.floors) {
      if (seenFloors.has(floor)) {
        continue;
      }
      seenFloors.add(floor);
      jobs.push({
        buildingId: building.id,
        floor: floor,
        url: 'data/floors/' + code + '-' + floor + '.svg',
      });
    }
  }

  const lists = await Promise.all(jobs.map(async (job) => {
    const response = await fetch(job.url);
    if (!response.ok) {
      return [];
    }
    return roomsInPlan(await response.text(), job.buildingId, job.floor);
  }));

  const rooms = [];
  for (const list of lists) {
    for (const room of list) {
      rooms.push(room);
    }
  }
  return rooms;
}
