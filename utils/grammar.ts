/**
 * Small English-grammar helpers for words the app puts into sentences.
 *
 * The command verbs are written in capitals ("EXPLAIN", "IDENTIFY"), so a naive
 * `a ${verb}` reads "a IDENTIFY" and "a EXPLAIN". The article follows the SOUND
 * of the next word, not its spelling, so the rule is a letter test with the
 * exceptions a verb list can actually hit.
 */

/** A vowel letter that opens a word with a consonant sound: "a unit", "a usage". */
const CONSONANT_SOUND_VOWEL = /^(uni|us[aeiou]|uti|eu|one|once)/i;

/** A silent h: "an hour", "an honest answer". */
const SILENT_H = /^(hour|honest|honour|heir)/i;

/**
 * The indefinite article and the word together: "an EXPLAIN", "a DESCRIBE".
 * The case of the word is kept, so the caller decides how it is written.
 */
export const withIndefiniteArticle = (word: string): string => {
  const trimmed = word.trim();
  if (!trimmed) return '';
  const vowelSound = /^[aeiou]/i.test(trimmed) && !CONSONANT_SOUND_VOWEL.test(trimmed);
  const article = vowelSound || SILENT_H.test(trimmed) ? 'an' : 'a';
  return `${article} ${trimmed}`;
};
