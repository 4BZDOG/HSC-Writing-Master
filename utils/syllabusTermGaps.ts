import type { Prompt } from '../types';
import { commandTermsList } from '../data/commandTerms';

/**
 * Terms the syllabus dot point and the question itself are built on, that the
 * question's Syllabus Terms list leaves out.
 *
 * The panel is a scaffold for the ANSWER, so most of its terms are not supposed
 * to appear in the question — "Bioethics" is exactly right for a CRISPR ethics
 * question that never says the word. The reverse check is therefore useless: a
 * listed term absent from the question flags 96% of the shipped library.
 *
 * The rule that works is asymmetric, and the asymmetry is the whole design.
 * Measured over the 418 shipped questions:
 *
 * | What must use the term                    | Flagged |
 * | ----------------------------------------- | ------- |
 * | dot point + question                      | 78%     |
 * | dot point + question + scenario            | 14%     |
 * | **phrase: dot point + either; word: all three** | **36%** |
 *
 * The 78% is almost all VERBS — "Modify", "Select", "develop", "record" — dot
 * points open with an instruction and so do questions, so single words agree
 * for reasons that have nothing to do with subject matter. Requiring all three
 * fixes that and breaks something else: a well-written scenario PARAPHRASES.
 * The five shipped questions about big data have it in the dot point and the
 * question, and their scenarios say "billions of data points" and "a large
 * influx of data" — so the strict rule cannot see the very term that prompted
 * this check.
 *
 * Subject matter lives in NOUN PHRASES; the verbs hide among single words. So a
 * phrase needs the dot point and either the question or the scenario, and a
 * lone word needs all three. That finds "big data", "primary data", "peer
 * review", "alternative splicing", "ethical issues" and "safe work practices",
 * and leaves "Select" and "record" alone.
 */

/**
 * Command verbs never count: they are the instruction, not the subject.
 *
 * Built on first use rather than at module scope. Reading an imported value
 * while this module initialises is the chunk-cycle crash `check:eager-reads`
 * exists to catch: if the bundler ever puts this file and `data/commandTerms`
 * in chunks that import each other, the read runs before the definition and
 * the page goes blank in production only.
 */
let commandVerbs: Set<string> | null = null;
const commandVerbSet = (): Set<string> =>
  (commandVerbs ??= new Set(commandTermsList.map((t) => t.term.toLowerCase())));

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

/**
 * Apostrophes are DELETED rather than spaced.
 *
 * The syllabus writes "Aboriginal and Torres Strait Islander Peoples" and a
 * question writes "Torres Strait Islander Peoples' observations". Spacing the
 * apostrophe leaves a stray "s"; keeping it makes "peoples'" a different word
 * from "peoples", and the name stopped matching at three words out of four.
 */
const normalise = (text: string): string =>
  (text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(NORMALISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A command verb in any of the forms a syllabus writes it in.
 *
 * `commandTermsList` holds the imperative — "EVALUATE" — and dot points use the
 * participle: "evaluating test data", "analysing the roles". Without this the
 * longest-phrase rule proposed "evaluating test data" as a term, which is the
 * instruction and the subject glued together.
 */
const isCommandVerb = (word: string): boolean => {
  const verbs = commandVerbSet();
  if (verbs.has(word)) return true;
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    if (verbs.has(stem) || verbs.has(`${stem}e`)) return true;
  }
  if (word.endsWith('ed')) {
    if (verbs.has(word.slice(0, -2)) || verbs.has(word.slice(0, -1))) return true;
  }
  return word.endsWith('s') && verbs.has(word.slice(0, -1));
};

/** A word that could be part of a subject-matter term. */
const isContentWord = (word: string): boolean =>
  !!word && !NOT_SUBJECT_MATTER.has(word) && !isCommandVerb(word);

/** The longest phrase worth proposing. Past four words it is a clause. */
const MAX_PHRASE_WORDS = 4;

/**
 * Candidate terms drawn from the syllabus dot point, in its own words.
 *
 * Runs of adjacent content words, longest first, because the terms this is for
 * are usually more than one: "big data", "primary data", "alternative
 * splicing", "Torres Strait Islander Peoples". Taking every adjacent PAIR
 * instead shredded that last one into "Torres Strait", "Strait Islander" and
 * "Islander Peoples" — three overlapping fragments of one name.
 *
 * Original casing is carried through, so a term added to a list reads the way
 * the syllabus writes it rather than flattened to lower case.
 */
const candidateTerms = (dotPointText: string): { key: string; display: string }[] => {
  const found: { key: string; display: string }[] = [];

  /**
   * Punctuation ends a phrase. Flattening it to whitespace instead ran the
   * three adjectives of "primary, secondary, tertiary structures" together
   * into one candidate — a phrase the syllabus never wrote.
   */
  for (const segment of (dotPointText || '').replace(/['’]/g, '').split(/[^\p{L}\p{N}\s-]+/u)) {
    const raw = segment.trim().split(/\s+/).filter(Boolean);

    for (let start = 0; start < raw.length; start++) {
      if (!isContentWord(raw[start].toLowerCase())) continue;
      // How far the run of content words reaches from here.
      let end = start;
      while (
        end + 1 < raw.length &&
        end + 1 - start < MAX_PHRASE_WORDS &&
        isContentWord(raw[end + 1].toLowerCase())
      )
        end++;
      // Every length from the longest down, so a caller can keep the longest
      // its sources actually use and drop the fragments inside it.
      for (let last = end; last >= start; last--) {
        const words = raw.slice(start, last + 1);
        const key = words.join(' ').toLowerCase();
        const isPhrase = words.length > 1;
        if (!isPhrase && key.length < 4) continue;
        if (isPhrase && words.some((w) => w.length < 3)) continue;
        found.push({ key, display: words.join(' ') });
      }
    }
  }

  const seen = new Set<string>();
  return found.filter((t) => (seen.has(t.key) ? false : seen.add(t.key)));
};

/**
 * Whole words only.
 *
 * Substring matching read "model" as present in "modelling" and offered it as a
 * term the question uses. Both sides are already normalised to single-spaced
 * lower case, so padding turns `includes` into a word-boundary test that works
 * for phrases as well as words.
 */
const usesTerm = (normalisedText: string, key: string): boolean =>
  ` ${normalisedText} `.includes(` ${key} `);

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
  const question = (prompt.question || '').trim();
  if (!dotPointText || !question) return [];

  const listed = (prompt.keywords || []).filter((k) => typeof k === 'string' && k.trim());
  const inQuestion = normalise(question);
  const inScenario = normalise(prompt.scenario || '');
  const hasScenario = inScenario.length > 0;

  const wanted = candidateTerms(dotPointText).filter((term) => {
    if (alreadyListed(listed, term.key)) return false;
    const inQ = usesTerm(inQuestion, term.key);
    const inS = hasScenario && usesTerm(inScenario, term.key);
    // A phrase is subject matter wherever it turns up; a lone word has to be
    // corroborated by all three before it counts as more than a verb.
    return term.key.includes(' ') ? inQ || inS : inQ && inS;
  });

  // Longest wins: with "Torres Strait Islander Peoples" kept there is nothing
  // to be gained from "Torres Strait", and with "big data" kept, none from
  // "data".
  const kept: { key: string; display: string }[] = [];
  wanted
    .slice()
    .sort((a, b) => b.key.length - a.key.length)
    .forEach((term) => {
      const swallowed = kept.some(
        (k) => ` ${k.key} `.includes(` ${term.key} `) || k.key === term.key
      );
      if (!swallowed) kept.push(term);
    });

  // Back into the order the syllabus wrote them.
  const order = new Map(candidateTerms(dotPointText).map((t, i) => [t.key, i]));
  return kept
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
    .map((t) => t.display);
};
