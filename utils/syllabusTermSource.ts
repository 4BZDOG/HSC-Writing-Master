import { textContainsKeyword } from './renderUtils';
import { isWeakLoneTerm } from './syllabusTermGaps';

/**
 * Which of a question's syllabus surroundings names a listed term.
 *
 * The Syllabus Terms panel splits its chips into the terms an answer HAS to
 * contain and the ones that would merely strengthen it. That split used to be
 * decided against the dot point alone, and the dot point is the one place a
 * question's own vocabulary often is NOT: a question written for "apply testing
 * methodologies" asks about "automated unit testing" and "manual ad-hoc
 * testing", names both in its stem, and named neither in the dot point — so
 * every term on its list, including the two the question is built on, was
 * filed as merely supporting.
 *
 * A term is a must-use term if ANY level of the question's context names it:
 * the question, its scenario, the dot point, the sub-topic or the topic.
 * They are checked strongest first so a chip can say where it comes from.
 */
export type SyllabusTermSourceKind = 'question' | 'scenario' | 'dotPoint' | 'subTopic' | 'topic';

export interface SyllabusTermContext {
  question?: string;
  scenario?: string;
  dotPointText?: string;
  subTopicName?: string;
  topicName?: string;
}

/** How each source is named to a student, mid-sentence. */
export const SYLLABUS_TERM_SOURCE_LABEL: Record<SyllabusTermSourceKind, string> = {
  question: 'the question',
  scenario: 'the scenario',
  dotPoint: 'the syllabus dot point',
  subTopic: 'the sub-topic',
  topic: 'the topic',
};

const SOURCES: {
  kind: SyllabusTermSourceKind;
  read: (context: SyllabusTermContext) => string | undefined;
}[] = [
  { kind: 'question', read: (c) => c.question },
  { kind: 'scenario', read: (c) => c.scenario },
  { kind: 'dotPoint', read: (c) => c.dotPointText },
  { kind: 'subTopic', read: (c) => c.subTopicName },
  { kind: 'topic', read: (c) => c.topicName },
];

/**
 * A crude stem, applied to BOTH sides of every comparison.
 *
 * `textContainsKeyword` inflects a keyword as one string, so it only ever bends
 * the last word of a phrase, and only once: "automated unit testing" yields
 * "automated unit test" but never "automated unit tests", which is how the
 * scenario that says "a suite of automated unit tests" failed to name the term
 * the question was written on. Stemming both sides bends every word of the
 * phrase, in both directions, without adding a single variant to the matcher
 * that drives highlighting and the coverage meter — a false positive there
 * would credit a student for a term they never wrote.
 *
 * Accuracy as a stemmer is not the point; agreeing with itself is. "string" and
 * "strings" both reducing to "str" is fine, so the plural is stripped before
 * the verb endings — the other order sent one to "str" and the other to
 * "string".
 */
const stemWord = (word: string): string => {
  let s = word.toLowerCase();
  if (s.length <= 3) return s;

  // Plural first.
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us') && !s.endsWith('is'))
    s = s.slice(0, -1);

  // Then the verb endings. The length floors keep "ring" and "need" whole.
  if (s.endsWith('ied') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith('is') && s.length > 4) s = s.slice(0, -2); // analysis -> analys

  if (s.length > 3 && s.endsWith('e') && !s.endsWith('ee')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('y')) s = `${s.slice(0, -1)}i`;
  // "modelling" -> "modell" -> "model", and "process" -> "proces" so its own
  // plural ("processes" -> "process") lands in the same place.
  return s.length > 3 && /([^aeiou])\1$/.test(s) ? s.slice(0, -1) : s;
};

/**
 * Words of a text as stems. Apostrophes are deleted rather than spaced, so
 * "Peoples'" stays one word; everything else that is not a letter or digit
 * separates, which is what makes "ad-hoc" and "ad hoc" the same two words.
 */
const stemsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stemWord);

/** Do these stems appear in that order, with nothing in between? */
const containsRun = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((stem, j) => haystack[i + j] === stem)) return true;
  }
  return false;
};

/**
 * Each listed term, and the source that names it — absent from the map when
 * nothing does.
 *
 * Two matchers, and both are needed. The shared keyword matcher knows the
 * things a stem cannot: initialisms ("multi-factor authentication" ↔ "MFA"),
 * British/American spellings, and the coordination ellipsis a syllabus writes
 * ("supervised and unsupervised learning"). The stem run knows the one thing it
 * cannot: a phrase whose inflection moved.
 */
export const classifySyllabusTerms = (
  keywords: string[],
  context: SyllabusTermContext
): Map<string, SyllabusTermSourceKind> => {
  const sources = SOURCES.map((source) => ({
    kind: source.kind,
    text: (source.read(context) || '').trim(),
  }))
    .filter((source) => source.text.length > 0)
    .map((source) => ({ ...source, stems: stemsOf(source.text) }));

  const found = new Map<string, SyllabusTermSourceKind>();
  if (sources.length === 0) return found;

  for (const keyword of keywords) {
    const term = typeof keyword === 'string' ? keyword.trim() : '';
    if (!term) continue;
    const termStems = stemsOf(term);
    if (termStems.length === 0) continue;
    // The instruction, or a word the whole course is written in. A question
    // stem says "Evaluate" and is written in a subject that says "security" on
    // every page, so finding one there proves nothing about this question — and
    // "must-use" is a claim strong enough to need proof. Never must-use, from
    // any source; it stays on the list as a supporting term.
    if (isWeakLoneTerm(term)) continue;

    for (const source of sources) {
      if (textContainsKeyword(source.text, term) || containsRun(source.stems, termStems)) {
        found.set(keyword, source.kind);
        break;
      }
    }
  }

  return found;
};
