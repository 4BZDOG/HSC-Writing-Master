/**
 * Asks the writing surface to add a word at the caret.
 *
 * The editor listens for `insert-text` on the window (see `Editor`), so anything
 * outside it — a term chip in the draft check, a word in the how-to-answer card —
 * reaches the draft the same way the metrics dashboard's "add word" does.
 */
export const insertIntoDraft = (word: string): void => {
  window.dispatchEvent(new CustomEvent('insert-text', { detail: word }));
};
