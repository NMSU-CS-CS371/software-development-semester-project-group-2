/**
 * This file & what it does: remembers a few short values on this device.
 * Why we have it: private browsing can block storage and throw. These functions catch that,
 * so the app keeps working and simply does not remember.
 */

/**
 * Read a remembered value.
 * @param {string} key
 * @returns {string|null}
 */
export function readSaved(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Remember a value until it is cleared.
 * @param {string} key
 * @param {string} value
 */
export function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the choice still works for this visit */
  }
}

/**
 * Forget a remembered value.
 * @param {string} key
 */
export function forget(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing was saved */
  }
}
