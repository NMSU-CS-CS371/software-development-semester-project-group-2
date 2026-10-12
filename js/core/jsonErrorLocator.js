/**
 * This file & what it does: finds the first mistake in a JSON file and says how to fix it.
 * Why we have it: Safari reports bad JSON as "The string did not match the expected pattern."
 * That names no file and no line. The startup screen uses this so a broken data file says where to look and why it failed.
 */

/**
 * Download one file from the data folder and parse it.
 * @param {string} fileName
 * @returns {Promise<object>}
 */
export async function loadJson(fileName) {
  const response = await fetch('data/' + fileName);
  if (!response.ok) {
    throw new Error('Could not load data/' + fileName + '. The server answered ' + response.status + '.');
  }
  return parseJsonText('data/' + fileName, await response.text());
}

/**
 * Parse JSON text. On failure, throw an error that names the file, the line, and the reason.
 * @param {string} where file path shown on the startup screen
 * @param {string} text
 * @returns {object}
 */
export function parseJsonText(where, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const problem = new Error(startupMessage(where, locateJsonError(text)));
    problem.name = 'JsonSyntaxError';
    problem.cause = error;
    throw problem;
  }
}

/**
 * The first place this text stops being JSON, or null when it is valid.
 * @param {string} text
 * @returns {{line: number, column: number, hint: string}|null}
 */
export function locateJsonError(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1); /* a byte-order mark is not part of the JSON */
  }
  const cursor = { text: text, i: 0, line: 1, column: 1, stack: [], key: null, lastString: null };
  const problem = parseValue(cursor);
  if (problem) {
    return problem;
  }
  skipSpace(cursor);
  if (cursor.i < cursor.text.length) {
    return at(cursor, 'There is extra text after the JSON value. The file should be one value.');
  }
  return null;
}

/**
 * Words for the red startup screen.
 * @param {string} where
 * @param {{line: number, column: number, hint: string}|null} found
 * @returns {string}
 */
function startupMessage(where, found) {
  if (!found) {
    return 'Broken JSON in ' + where + '.\n'
      + 'Open that file. A comma is missing, or a { was never closed with }.\n'
      + 'Save and refresh.';
  }
  const shown = found.lineText.length > 120 ? found.lineText.slice(0, 120) + '...' : found.lineText;
  return 'Broken JSON in ' + where + '.\n'
    + 'Open that file and go to line ' + found.line + '.\n'
    + shown + '\n'
    + ' '.repeat(Math.max(0, found.column - 1)) + '^\n'
    + found.hint + '\n'
    + 'Save and refresh.';
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @param {string} hint
 * @returns {{line: number, column: number, hint: string}}
 */
function at(cursor, hint) {
  const start = cursor.text.lastIndexOf('\n', Math.max(0, cursor.i - 1)) + 1;
  let end = cursor.text.indexOf('\n', cursor.i);
  if (end === -1) {
    end = cursor.text.length;
  }
  return {
    line: cursor.line,
    column: cursor.column,
    hint: stillOpen(cursor) + hint,
    lineText: cursor.text.slice(start, end),
  };
}

/**
 * The building or description entry that is still open, so the message can name it.
 * @param {{stack: {kind: string, line: number, key: string|null, name: string|null}[]}} cursor
 * @returns {string}
 */
function stillOpen(cursor) {
  for (let index = cursor.stack.length - 1; index >= 0; index -= 1) {
    const frame = cursor.stack[index];
    if (frame.name) {
      return frame.name + ' starts on line ' + frame.line + ' and was never closed. ';
    }
  }
  for (let index = cursor.stack.length - 1; index >= 0; index -= 1) {
    const frame = cursor.stack[index];
    if (frame.key && /^\d+$/.test(frame.key)) {
      return 'Entry "' + frame.key + '" starts on line ' + frame.line + ' and was never closed. ';
    }
  }
  return '';
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 */
function step(cursor) {
  if (cursor.text[cursor.i] === '\n') {
    cursor.line += 1;
    cursor.column = 1;
  } else {
    cursor.column += 1;
  }
  cursor.i += 1;
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 */
function skipSpace(cursor) {
  while (cursor.i < cursor.text.length && /\s/.test(cursor.text[cursor.i])) {
    step(cursor);
  }
}

/**
 * @param {string|undefined} character
 * @returns {boolean}
 */
function isDigit(character) {
  return character >= '0' && character <= '9';
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @returns {{line: number, column: number, hint: string}|null}
 */
function parseValue(cursor) {
  cursor.lastString = null;
  skipSpace(cursor);
  if (cursor.i >= cursor.text.length) {
    return at(cursor, 'The file ended early. A { or [ above this line is still open. Add the missing } or ].');
  }
  const character = cursor.text[cursor.i];
  if (character === '{') {
    return parseObject(cursor);
  }
  if (character === '[') {
    return parseArray(cursor);
  }
  if (character === '"') {
    return parseString(cursor);
  }
  if (character === '-' || isDigit(character)) {
    return parseNumber(cursor);
  }
  if (cursor.text.startsWith('true', cursor.i)) {
    return parseWord(cursor, 'true');
  }
  if (cursor.text.startsWith('false', cursor.i)) {
    return parseWord(cursor, 'false');
  }
  if (cursor.text.startsWith('null', cursor.i)) {
    return parseWord(cursor, 'null');
  }
  return at(cursor, 'This character is not valid JSON. Expected a {, [, ", number, true, false, or null.');
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @returns {{line: number, column: number, hint: string}|null}
 */
function parseString(cursor) {
  let value = '';
  step(cursor); /* opening quote */
  while (cursor.i < cursor.text.length) {
    const character = cursor.text[cursor.i];
    if (character === '"') {
      step(cursor);
      cursor.lastString = value;
      return null;
    }
    if (character !== '\\' && character !== '\n') {
      value += character;
    }
    if (character === '\\') {
      step(cursor);
      if (cursor.i >= cursor.text.length) {
        return at(cursor, 'The file ended inside a quote. Close the string with ".');
      }
      step(cursor);
      continue;
    }
    if (character === '\n') {
      return at(cursor, 'A quote was never closed. A JSON string cannot break onto the next line.');
    }
    step(cursor);
  }
  return at(cursor, 'The file ended inside a quote. Close the string with ".');
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @returns {{line: number, column: number, hint: string}|null}
 */
function parseNumber(cursor) {
  if (cursor.text[cursor.i] === '-') {
    step(cursor);
  }
  if (!isDigit(cursor.text[cursor.i])) {
    return at(cursor, 'Expected a number here.');
  }
  if (cursor.text[cursor.i] === '0' && isDigit(cursor.text[cursor.i + 1])) {
    return at(cursor, 'This number is not valid JSON. A number cannot have a leading zero.');
  }
  while (isDigit(cursor.text[cursor.i])) {
    step(cursor);
  }
  if (cursor.text[cursor.i] === '.') {
    step(cursor);
    if (!isDigit(cursor.text[cursor.i])) {
      return at(cursor, 'Expected digits after the decimal point.');
    }
    while (isDigit(cursor.text[cursor.i])) {
      step(cursor);
    }
  }
  if (cursor.text[cursor.i] === 'e' || cursor.text[cursor.i] === 'E') {
    step(cursor);
    if (cursor.text[cursor.i] === '+' || cursor.text[cursor.i] === '-') {
      step(cursor);
    }
    if (!isDigit(cursor.text[cursor.i])) {
      return at(cursor, 'Expected digits in the exponent.');
    }
    while (isDigit(cursor.text[cursor.i])) {
      step(cursor);
    }
  }
  return null;
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @param {string} word
 * @returns {{line: number, column: number, hint: string}|null}
 */
function parseWord(cursor, word) {
  for (let count = 0; count < word.length; count += 1) {
    step(cursor);
  }
  const next = cursor.text[cursor.i];
  if (next && /[A-Za-z0-9_]/.test(next)) {
    return at(cursor, word + ' has extra characters after it. JSON only allows true, false, and null.');
  }
  return null;
}

/**
 * After a value, the next token is a comma, the closer, or a mistake.
 * Returns 'closed' when the container ended, a problem, or null to keep going.
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @param {string} closer
 * @returns {{line: number, column: number, hint: string}|'closed'|null}
 */
function afterValue(cursor, closer) {
  skipSpace(cursor);
  if (cursor.i >= cursor.text.length) {
    const kind = closer === '}' ? 'an object' : 'a list';
    return at(cursor, 'The file ended while ' + kind + ' was still open. Add the missing ' + closer + '.');
  }
  if (cursor.text[cursor.i] === ',') {
    step(cursor);
    skipSpace(cursor);
    if (cursor.text[cursor.i] === closer) {
      return at(cursor, 'A comma has nothing after it. Delete that comma, or add the missing value.');
    }
    return null;
  }
  if (cursor.text[cursor.i] === closer) {
    step(cursor);
    return 'closed';
  }
  if (cursor.text[cursor.i] === '{') {
    return at(cursor, 'This new { is inside it. On the line above, add } to close it, then a comma, then this { can start the next one.');
  }
  if (cursor.text[cursor.i] === '"') {
    return at(cursor, 'The next entry was pasted inside it. On the line above, add } to close it, then a comma, then this line can start the next entry.');
  }
  if (cursor.text[cursor.i] === '-' || isDigit(cursor.text[cursor.i]) || cursor.text[cursor.i] === '[') {
    return at(cursor, 'A comma is missing before the next value. Add a comma at the end of the line above.');
  }
  return at(cursor, 'Expected a comma or ' + closer + ' after this value.');
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @returns {{line: number, column: number, hint: string}|null}
 */
function finishObject(cursor, frame) {
  cursor.stack.pop();
  cursor.lastString = null;
  const parent = cursor.stack[cursor.stack.length - 1];
  if (frame.name && parent && parent.kind === 'object' && !parent.name) {
    parent.name = frame.name; /* "name" lives inside properties; the building object needs it too */
  }
  return null;
}

function parseObject(cursor) {
  const frame = { kind: 'object', line: cursor.line, column: cursor.column, key: cursor.key, name: null };
  cursor.stack.push(frame);
  step(cursor);
  skipSpace(cursor);
  if (cursor.text[cursor.i] === '}') {
    step(cursor);
    return finishObject(cursor, frame);
  }
  while (cursor.i < cursor.text.length) {
    skipSpace(cursor);
    if (cursor.text[cursor.i] !== '"') {
      if (cursor.text[cursor.i] === '{') {
        return at(cursor, 'This new { is inside it. On the line above, add } to close it, then a comma, then this { can start the next one.');
      }
      return at(cursor, 'Expected a property name in double quotes here. The object above is missing its closing }.');
    }
    const badName = parseString(cursor);
    if (badName) {
      return badName;
    }
    const key = cursor.lastString;
    skipSpace(cursor);
    if (cursor.text[cursor.i] !== ':') {
      return at(cursor, 'Expected a colon after the property name.');
    }
    step(cursor);
    const savedKey = cursor.key;
    cursor.key = key;
    const badValue = parseValue(cursor);
    const valueText = cursor.lastString;
    cursor.key = savedKey;
    if (key === 'name' && valueText) {
      frame.name = valueText;
    }
    if (badValue) {
      return badValue;
    }
    const next = afterValue(cursor, '}');
    if (next === 'closed') {
      return finishObject(cursor, frame);
    }
    if (next) {
      return next;
    }
  }
  return at(cursor, 'The file ended while an object was still open. Add the missing } at the end.');
}

/**
 * @param {{text: string, i: number, line: number, column: number}} cursor
 * @returns {{line: number, column: number, hint: string}|null}
 */
function parseArray(cursor) {
  const frame = { kind: 'array', line: cursor.line, column: cursor.column, key: cursor.key, name: null };
  cursor.stack.push(frame);
  step(cursor);
  skipSpace(cursor);
  if (cursor.text[cursor.i] === ']') {
    step(cursor);
    cursor.stack.pop();
    cursor.lastString = null;
    return null;
  }
  while (cursor.i < cursor.text.length) {
    const savedKey = cursor.key;
    cursor.key = null;
    const badValue = parseValue(cursor);
    cursor.key = savedKey;
    if (badValue) {
      return badValue;
    }
    const next = afterValue(cursor, ']');
    if (next === 'closed') {
      cursor.stack.pop();
      cursor.lastString = null;
      return null;
    }
    if (next) {
      return next;
    }
  }
  return at(cursor, 'The file ended while a list was still open. Add the missing ].');
}
