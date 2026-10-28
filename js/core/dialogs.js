/**
 * This file & what it does: every yes/no question and short message in the app.
 * Why we have it: the questions all look the same, so they are built in one place.
 */

import { CONFIG } from './config.js';

/**
 * Build a question box. Call open() to show it.
 * @param {{ title: string, text: string, buttons: object[], onDismiss?: function }} options
 * @returns {{ open: () => void, close: () => void }}
 */
function create(options) {
  let box = null;
  return {
    open() {
      box = document.createElement('dialog');
      box.className = 'ask-dialog';
      const title = document.createElement('h2');
      title.textContent = options.title;
      const text = document.createElement('p');
      text.textContent = options.text;
      const row = document.createElement('div');
      row.className = 'ask-dialog-row';
      for (const choice of options.buttons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = choice.text;
        button.addEventListener('click', () => {
          close();
          if (choice.onClick) {
            choice.onClick();
          }
        });
        row.append(button);
      }
      box.append(title, text, row);
      box.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
        if (options.onDismiss) {
          options.onDismiss();
        }
      });
      document.body.append(box);
      box.showModal();
    },
    close() {
      close();
    },
  };

  /** Take the box off the page. A second call does nothing. */
  function close() {
    if (!box) {
      return;
    }
    const node = box;
    box = null;
    node.close();
    node.remove();
  }
}

/**
 * Two buttons. The first is the quiet answer, the second confirms.
 * Escape does the same thing as the first button.
 * @param {string} title
 * @param {string} text
 * @param {string} noText
 * @param {string} yesText
 * @param {function} onYes
 * @param {function} [onNo]
 * @returns {{ open: () => void, close: () => void }}
 */
function askChoice(title, text, noText, yesText, onYes, onNo) {
  const dialog = create({
    title: title,
    text: text,
    onDismiss: onNo,
    buttons: [
      { text: noText, onClick: onNo },
      { text: yesText, onClick: onYes },
    ],
  });
  dialog.open();
  return dialog;
}

/**
 * One short message and an OK button.
 * @param {string} title
 * @param {string} text
 * @param {function} [onOk]
 * @returns {{ open: () => void, close: () => void }}
 */
export function tell(title, text, onOk) {
  const dialog = create({
    title: title,
    text: text,
    onDismiss: onOk,
    buttons: [{ text: CONFIG.directions.locationOk, onClick: onOk }],
  });
  dialog.open();
  return dialog;
}

/**
 * "Get directions to Foster Hall?" Yes starts the trip.
 * @param {string} title
 * @param {string} text
 * @param {string} noText
 * @param {string} yesText
 * @param {function} onYes
 * @returns {{ open: () => void, close: () => void }}
 */
export function askTrip(title, text, noText, yesText, onYes) {
  return askChoice(title, text, noText, yesText, onYes);
}

/**
 * "Start from Foster Hall?"
 * @param {string} name
 * @param {function} onYes
 * @param {function} onNo
 * @returns {{ open: () => void, close: () => void }}
 */
export function askStart(name, onYes, onNo) {
  const words = CONFIG.directions;
  const text = words.startFromText + ' ' + name + '?';
  return askChoice(words.startConfirmTitle, text, words.startConfirmNo, words.startConfirmYes, onYes, onNo);
}

/**
 * "Go to Foster Hall?"
 * @param {string} name
 * @param {function} onYes
 * @param {function} onNo
 * @returns {{ open: () => void, close: () => void }}
 */
export function askDestination(name, onYes, onNo) {
  const words = CONFIG.directions;
  const text = words.endGoText + ' ' + name + '?';
  return askChoice(words.endConfirmTitle, text, words.endConfirmNo, words.endConfirmYes, onYes, onNo);
}

/**
 * Location failed. OK leaves the map ready for a building tap.
 * @param {function} onOk
 * @returns {{ open: () => void, close: () => void }}
 */
export function askLocationFailed(onOk) {
  const words = CONFIG.directions;
  const dialog = create({
    title: words.locationTitle,
    text: words.locationAskText,
    onDismiss: onOk,
    buttons: [{ text: words.locationOk, onClick: onOk }],
  });
  dialog.open();
  return dialog;
}

/**
 * "Are you sure you want to end your trip?"
 * @param {function} onYes
 * @returns {{ open: () => void, close: () => void }}
 */
export function askEndTrip(onYes) {
  const words = CONFIG.directions;
  return askChoice(words.endTripTitle, words.endTripText, words.endTripNo, words.endTripYes, onYes);
}
