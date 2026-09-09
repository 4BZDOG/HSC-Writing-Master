import type { Prompt } from '../types';
import { commandTermsList } from '../data/commandTerms';

/**
 * Terms the syllabus, the question AND its scenario all use, that the
 * question's Syllabus Terms list leaves out.
 *
 * The panel is a scaffold for the ANSWER, so most of its terms are not supposed
 * to appear in the question — "Bioethics" is exactly right for a CRISPR ethics
 * question that never says the word. That is why looser versions of this check
 * are useless: measured against the 418 shipped questions, "a dot point term the
 * question uses" flags 77% of them and "a listed term the question does not use"
 * flags 96%. Neither tells a curator anything.
 *
 * Agreement between all three sources is what makes it a signal. If the
 * syllabus dot point says it, the question says it, and the scenario says it,
 * it is what the question is ABOUT — and a student told which terms to use
 * should be told that one. That lands on 21% of the questions that have a
 * scenario, at about one term each.
 *
 * **A scenario is required, and that is not an accident.** Without one the
 * comparison falls back to the dot point against the question alone, which
 * flags 92% — the two of them are both describing the same syllabus point in
 * the same words, so almost everything matches. A question with no scenario is
 * not checked rather than checked badly.
 */

/** Command verbs never count: they are the instruction, not the subject. */
const COMMAND_VERBS = new Set(commandTermsList.map((t) => t.term.toLowerCase()));

/**
 * Words that carry no subject matter. Deliberately broader than the keyword
 * generator's own stop list, because this one is deciding what to ADD: a term
 * wrongly left out costs a curator nothing, a generic one wrongly added shows
 * up in the student's panel.
 */
const NOT_SUBJECT_MATTER = new Set(
  (
    'the a an and or of to in for on with by from as is are was were be been being that this these those ' +
    'their its it can may could would should must using use uses used about into over under such which what ' +
    'how why when where who student students response answer answers question questions mark marks including ' +
    'include includes different various specific example examples both each other others more most also than ' +
    'then them they you your not no all any one two three four five process processes factor factors concept ' +
    'concepts important importance feature features idea ideas thing things point points aspect aspects ' +
    'information because therefore consequently however furthermore moreover thus hence new within during ' +
    'following given based upon ensure ensuring provide providing support supporting type types role roles ' +
    'impact impacts long term time year years first second third final phase phases appropriate effective ' +
    'effectiveness reflect show shows showing relevant intended local associated potential ongoing able ' +
    'across after before between during through while with without own same each every some many few'
  ).split(/\s+/)
);

const NORMALISE = /[^\p{L}\p{N}\s'-]/gu;

const normalise = (text: string): string =>
  (text || '').toLowerCase().replace(NORMALISE, ' ').replace(/\s+/g, ' ').trim();

/** A word that could be part of a subject-matter term. */
const isContentWord = (word: string): boolean =>
  !!word && !NOT_SUBJECT_MATTER.has(word) && !COMMAND_VERBS.has(word);

/**
 * Candidate terms drawn from the syllabus dot point, in its own words.
 *
 * Adjacent pairs as well as single words, because the terms this is for are
 * usually two: "test data", "bug data", "maintenance documentation". Original
 * casing is carried through so a term added to a list reads the way the
 * syllabus writes it rather than flattened to lower case.
 */
const candidateTerms = (dotPointText: string): { key: string; display: string }[] => {
  const raw = (dotPointText || '').replace(NORMALISE, ' ').replace(/\s+/g, ' ').trim().split(' ');
  const pairs: { key: string; display: string }[] = [];
  const singles: { key: string; display: string }[] = [];

  raw.forEach((word, i) => {
    const lower = word.toLowerCase();
    const next = raw[i + 1];
    const nextLower = (next || '').toLowerCase();

    if (
      next &&
      lower.length >= 3 &&
      nextLower.length >= 3 &&
      isContentWord(lower) &&
      isContentWord(nextLower)
    )
      pairs.push({ key: `${lower} ${nextLower}`, display: `${word} ${next}` });

    if (lower.length >= 4 && isContentWord(lower)) singles.push({ key: lower, display: word });
  });

  const seen = new Set<string>();
  return [...pairs, ...singles].filter((t) => (seen.has(t.key) ? false : seen.add(t.key)));
};

/** Is this term already spoken for by something on the list? */
const alreadyListed = (keywords: string[], key: string): boolean =>
  keywords.some((keyword) => {
    const listed = normalise(keyword);
    return !!listed && (listed === key || listed.includes(key) || key.includes(listed));
  });

/**
 * The terms this question should carry and does not, in the syllabus's own
 * words. Empty unless the question has a scenario — see the note above.
 */
export const missingSyllabusTerms = (
  dotPointText: string | undefined,
  prompt: Pick<Prompt, 'question' | 'scenario' | 'keywords'>
): string[] => {
  const scenario = (prompt.scenario || '').trim();
  const question = (prompt.question || '').trim();
  if (!dotPointText || !scenario || !question) return [];

  const listed = (prompt.keywords || []).filter((k) => typeof k === 'string' && k.trim());
  const inQuestion = normalise(question);
  const inScenario = normalise(scenario);

  const usedByAll = candidateTerms(dotPointText).filter(
    (term) =>
      inQuestion.includes(term.key) &&
      inScenario.includes(term.key) &&
      !alreadyListed(listed, term.key)
  );

  // Maximal phrases only: with "practical investigation" kept, neither
  // "practical" nor "investigation" is worth adding on its own.
  const keptPairs = usedByAll.filter((t) => t.key.includes(' '));
  return usedByAll
    .filter((t) => t.key.includes(' ') || !keptPairs.some((p) => p.key.split(' ').includes(t.key)))
    .map((t) => t.display);
};
