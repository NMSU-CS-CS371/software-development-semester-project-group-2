/**
 * This file & what it does: reads config.yml and copies the settings into CONFIG and into CSS variables.
 * Why we have it: colors and sizes live in one file so you can change them without searching the code.
 * CSS cannot read a yml file, so each value is copied to a name like --theme-crimson.
 */

/** Settings from config.yml. Empty until loadConfig() runs. */
export const CONFIG = {};

/**
 * Turn textMuted into text-muted so CSS can use it.
 * @param {string} name
 * @returns {string}
 */
function toDashedName(name) {
  return name.replace(/[A-Z]/g, (capital) => '-' + capital.toLowerCase());
}

/**
 * Put one section of the config on the html tag as CSS variables.
 * @param {object} section
 * @param {string} prefix
 */
function addCssVariables(section, prefix) {
  for (const key of Object.keys(section)) {
    const value = section[key];
    const name = prefix + '-' + toDashedName(key);
    if (Array.isArray(value)) {
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      addCssVariables(value, name); /* go one level deeper */
    } else {
      document.documentElement.style.setProperty(name, String(value));
    }
  }
}

/**
 * Load config.yml and apply it. Call this before anything else.
 * @returns {Promise<void>}
 */
export async function loadConfig() {
  /* no-cache so a saved edit shows up when you refresh */
  const response = await fetch('config.yml', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Could not load config.yml (' + response.status + ')');
  }

  /* if the yaml has a typo, this throws an error with a line number */
  const settings = jsyaml.load(await response.text()) || {}; /* empty file means no settings */
  for (const section of Object.keys(settings)) {
    CONFIG[section] = settings[section];
  }

  for (const section of Object.keys(CONFIG)) {
    addCssVariables(CONFIG[section], '--' + toDashedName(section));
  }

  /* set the phone address bar color */
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', CONFIG.theme.crimson);
  }

  /* show the page now that the styles are ready */
  document.documentElement.classList.add('config-ready');
}
