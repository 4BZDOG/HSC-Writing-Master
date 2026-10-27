import type { SampleAnswer } from '../types';
import { STORAGE_KEYS, safeGetItem, safeSetItem } from './storageUtils';

/**
 * Which prescribed text a reader wants to see the sample answers on.
 *
 * A question the paper sets once per text is held once, with a ladder of
 * exemplars for every text (`SampleAnswer.prescribedText`). Fourteen texts at
 * each mark is a long strip of tabs to read past for the one a student studied,
 * so the panel lets them choose a text once, shows every level on it, and
 * remembers the choice for the next question set on that text.
 */

const REMEMBERED = 12;

/** The texts these exemplars are written on, in the order they first appear. */
export const prescribedTextsOf = (answers: readonly SampleAnswer[]): string[] => [
  ...new Set(answers.map((a) => a.prescribedText).filter((t): t is string => !!t)),
];

/** The texts this reader has chosen, most recent first. */
export const rememberedTexts = (): string[] =>
  safeGetItem<string[]>(STORAGE_KEYS.MY_PRESCRIBED_TEXTS, [], (v) => Array.isArray(v));

/** The reader's text among these, if they have chosen one before. */
export const rememberedTextAmong = (texts: readonly string[]): string | null =>
  rememberedTexts().find((t) => texts.includes(t)) ?? null;

export const rememberText = (text: string): void => {
  safeSetItem(
    STORAGE_KEYS.MY_PRESCRIBED_TEXTS,
    [text, ...rememberedTexts().filter((t) => t !== text)].slice(0, REMEMBERED)
  );
};

/**
 * The exemplars on `text`, or all of them when no text is chosen or none at this
 * level is on it, so a level is never emptied by the choice.
 */
export const onText = <T extends Pick<SampleAnswer, 'prescribedText'>>(
  answers: T[],
  text: string | null
): T[] => {
  if (!text) return answers;
  const mine = answers.filter((a) => a.prescribedText === text);
  return mine.length > 0 ? mine : answers;
};
