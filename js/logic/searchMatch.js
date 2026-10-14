/**
 * This file & what it does: decides which buildings and rooms match what was typed.
 * Why we have it: the search page only draws rows. The matching stays here, with no page code.
 * A word with a number can be a room ("205", "118a", or "sh205"). Every other word must match
 * the building from the start of a word ("sci" finds Science Hall), with a small typo allowed
 * in longer words ("harmon" finds Hardman).
 */

/**
 * How many typos a typed word may have. Short words allow none.
 * @param {string} typed
 * @returns {number}
 */
function allowedTypos(typed) {
  if (typed.length >= 6) {
    return 2;
  }
  if (typed.length >= 4) {
    return 1;
  }
  return 0;
}

/* answers for this key press: "typed|word" -> true or false. Shared words are only checked once. */
const answers = new Map();

/** Forget the remembered answers. Call once at the start of every search. */
export function startNewSearch() {
  answers.clear();
}

/**
 * Does one typed word match one word of a building?
 * @param {string} typed
 * @param {string} word
 * @returns {boolean}
 */
function wordMatches(typed, word) {
  const key = typed + '|' + word;
  let answer = answers.get(key);
  if (answer === undefined) {
    answer = checkWord(typed, word);
    answers.set(key, answer);
  }
  return answer;
}

/**
 * The start of the word, or close to it when a typo is allowed.
 * @param {string} typed
 * @param {string} word
 * @returns {boolean}
 */
function checkWord(typed, word) {
  if (word.startsWith(typed)) {
    return true;
  }
  const typos = allowedTypos(typed);
  if (typos === 0) {
    return false;
  }
  return startIsClose(typed, word, typos);
}

/* two rows reused for every comparison, so typing does not build thousands of arrays */
let previousRow = new Int32Array(64);
let currentRow = new Int32Array(64);

/**
 * Is the start of word within `typos` single-letter changes of `typed`?
 * One table answers a start that is one letter shorter, the same length, or one letter longer.
 * @param {string} typed
 * @param {string} word
 * @param {number} typos
 * @returns {boolean}
 */
function startIsClose(typed, word, typos) {
  const b = word.slice(0, typed.length + 1);
  if (b.length + 1 > previousRow.length) {
    previousRow = new Int32Array(b.length + 1);
    currentRow = new Int32Array(b.length + 1);
  }
  for (let j = 0; j <= b.length; j += 1) {
    previousRow[j] = j;
  }
  for (let i = 1; i <= typed.length; i += 1) {
    currentRow[0] = i;
    let smallest = i;
    for (let j = 1; j <= b.length; j += 1) {
      let change = 1;
      if (typed[i - 1] === b[j - 1]) {
        change = 0;
      }
      const cell = Math.min(previousRow[j] + 1, currentRow[j - 1] + 1, previousRow[j - 1] + change);
      currentRow[j] = cell;
      if (cell < smallest) {
        smallest = cell;
      }
    }
    if (smallest > typos) {
      return false;
    }
    const swap = previousRow;
    previousRow = currentRow;
    currentRow = swap;
  }
  for (let length = typed.length - 1; length <= typed.length + 1; length += 1) {
    if (previousRow[Math.min(length, b.length)] <= typos) {
      return true;
    }
  }
  return false;
}

/**
 * Lowercase words of letters and numbers: "SH-205 Hall" -> ["sh", "205", "hall"].
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoWords(text) {
  const words = [];
  for (const word of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word !== '') {
      words.push(word);
    }
  }
  return words;
}

/**
 * Every searchable word of a building, lowercase.
 * @param {object} building
 * @returns {string[]}
 */
export function buildingWords(building) {
  const parts = [building.code, building.id, building.name, building.address, building.propertyNumber];
  if (building.aka) {
    for (const otherName of building.aka) {
      parts.push(otherName);
    }
  }
  return splitIntoWords(parts.join(' '));
}

/**
 * The typed text as lowercase words.
 * @param {string} typed
 * @returns {string[]}
 */
export function typedWords(typed) {
  return splitIntoWords(typed);
}

/**
 * Does every typed word match some word of this building?
 * @param {string[]} words
 * @param {string[]} ownWords
 * @returns {boolean}
 */
export function buildingMatches(words, ownWords) {
  if (words.length === 0) {
    return false;
  }
  for (const typed of words) {
    let found = false;
    for (const word of ownWords) {
      if (wordMatches(typed, word)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
  }
  return true;
}

/**
 * How well a room matches: 2 = the exact number, 1 = the start of it, 0 = no match.
 * One typed word with a number must be the room. The other words must match its building.
 * @param {string[]} words
 * @param {object} room
 * @param {object} building
 * @param {string[]} ownWords
 * @returns {number}
 */
export function roomScore(words, room, building, ownWords) {
  const number = String(room.number).toLowerCase();
  const code = (building.code || '').toLowerCase();
  let best = 0;

  for (let index = 0; index < words.length; index += 1) {
    const typed = words[index];
    if (!/\d/.test(typed)) {
      continue;
    }
    let roomPart = typed;
    if (code && typed.startsWith(code) && typed.length > code.length) {
      roomPart = typed.slice(code.length);
    }
    if (!number.startsWith(roomPart)) {
      continue;
    }

    const otherWords = [];
    for (let other = 0; other < words.length; other += 1) {
      if (other !== index) {
        otherWords.push(words[other]);
      }
    }
    if (otherWords.length > 0 && !buildingMatches(otherWords, ownWords)) {
      continue;
    }

    if (roomPart === number) {
      best = Math.max(best, 2);
    } else {
      best = Math.max(best, 1);
    }
  }
  return best;
}
