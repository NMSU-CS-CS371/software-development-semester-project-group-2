/**
 * This file & what it does: turns text from the data files into safe HTML.
 * Why we have it: building names and facts get pasted into the page as HTML.
 * If one of them has a < or a bad link, the browser could treat it as code. These functions stop that.
 */

/**
 * Turn special characters into safe text.
 * @param {string|number} text
 * @returns {string}
 */
export function escapeHtml(text) {
  let safe = String(text);
  safe = safe.replace(/&/g, '&amp;'); /* do & first */
  safe = safe.replace(/</g, '&lt;');
  safe = safe.replace(/>/g, '&gt;');
  safe = safe.replace(/"/g, '&quot;');
  safe = safe.replace(/'/g, '&#39;');
  return safe;
}

/**
 * Only allow https links. Anything else becomes "#".
 * @param {string} url
 * @returns {string} a safe link for href
 */
export function safeUrl(url) {
  if (String(url).startsWith('https://')) { /* String() so a missing link is just not allowed */
    return escapeHtml(url);
  }
  return '#';
}
