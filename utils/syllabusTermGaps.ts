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
 * Measured over the 417 shipped questions:
 *
 * | What must use the term                          | Flagged |
 * | ----------------------------------------------- | ------- |
 * | dot point + question                            | 78%     |
 * | dot point + question + scenario                 | 14%     |
 * | phrase: dot point + either; word: all three     | 34%     |
 * | **the same, minus words too generic to stand alone** | **29%** |
 *
 * The 78% is almost all VERBS — "Modify", "Select", "develop", "record" — dot
 * points open with an instruction and so do questions, so single words agree
 * for reasons that have nothing to do with subject matter. Requiring all three
 * fixes that and breaks something else: a well-written scenario PARAPHRASES.
 * The shipped questions about big data have it in the dot point and the
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
    'across after before between during through while with without own same each every some many few ' +
    'against around away along outside inside towards toward above below beyond at have has had made make take taken give given get being been ' +
    'among amongst via per together makes takes gives having'
  ).split(/\s+/)
);

/**
 * Words that are real subject matter INSIDE a phrase and say nothing on their
 * own — "big data" and "data security" are terms, a bare "data" is not.
 *
 * Deliberately a second list rather than more entries in `NOT_SUBJECT_MATTER`,
 * and the separation is load-bearing: that one decides which words a phrase may
 * be BUILT from, so putting "data" in it would delete "big data", "primary
 * data" and "data security" along with the noise. This one is consulted only
 * where a single word is asking to stand as a term by itself.
 *
 * Every entry was observed. Over the shipped library the lone-word branch
 * offered 30 terms; 22 of them were these, a course's own wallpaper — a
 * Software Engineering dot point, question and scenario all say "software" and
 * "development", so agreeing across all three proves nothing about either.
 * Removing them leaves DevOps, front-end, back-end, chromosomes and
 * vulnerabilities, which are terms, and costs no phrase at all.
 *
 * Exported for the one other place asking the same question of a single word —
 * `classifySyllabusTerms`, deciding whether a topic heading is enough to make
 * one a must-use term. Two lists would drift, and the judgement is identical.
 */
export const TOO_GENERIC_ALONE = new Set(
  (
    'data development software system security file project solution success ethical application ' +
    'applications approach approaches practice practices method methods technique techniques tool ' +
    'tools user users design designs code testing test tests model models management'
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
export const normalise = (text: string): string =>
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

/**
 * A one-word term that says nothing on its own: the instruction ("Evaluate"),
 * or a word the whole course is written in ("security", "testing", "design").
 *
 * Measured over the shipped library, 40 of 418 questions carry one — and every
 * surface that treats terms as subject matter was believing them. The panel
 * marked "Evaluate" a must-use term because the question stem says it; the
 * exemplar brief then told the model to build a full-mark answer around it.
 *
 * A PHRASE containing a verb is not weak and is not caught here: the syllabus
 * writes "evaluating test data", and the subject matter is in the noun. Only a
 * keyword that IS one of these words, alone, fails.
 */
export const isWeakLoneTerm = (term: string): boolean => {
  const trimmed = (term || '').trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  return TOO_GENERIC_ALONE.has(lower) || isCommandVerb(lower);
};

/** The longest phrase worth proposing. Past four words it is a clause. */
const MAX_PHRASE_WORDS = 4;

/**
 * Common verbs that are NOT NESA command terms, but open dot points and
 * questions all the same: "develop", "promote", "shape". `isCommandVerb` cannot
 * see them, so "shape meaning" and "Gather data" were proposed as subject
 * matter.
 *
 * Left out on purpose: words that are as often nouns in a syllabus — "research",
 * "study", "report", "plan", "design", "test", "measure", "model", "change",
 * "trade", "control" — and words that are common nouns or adjectives in their
 * own right ("address", "face", "foster", "adopt", "estimate"). Dropping
 * "foster care" or "IP address" to stop "foster children" would cost more than
 * it saved.
 */
const NON_COMMAND_VERBS = new Set(
  (
    'develop produce generate prepare collect promote protect improve achieve gather infer suggest shape ' +
    'express provide ensure support create increase reduce maintain apply use include involve affect enable ' +
    'reflect represent consider determine establish contribute respond relate influence impact write name ' +
    'emit mitigate obtain organise move raise uphold avoid buy regulate enhance minimise manage interrupt ' +
    'negotiate resolve facilitate prevent encourage allow vary'
  ).split(/\s+/)
);

/**
 * A non-command verb in any form a dot point writes it in: base, +s/es,
 * +ed/d, +ing, with the e dropped before -ing and -ed ("shape" → "shaped",
 * "shaping"; "achieve" → "achieving").
 */
const isNonCommandVerbForm = (word: string): boolean => {
  if (NON_COMMAND_VERBS.has(word)) return true;
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    return NON_COMMAND_VERBS.has(stem) || NON_COMMAND_VERBS.has(`${stem}e`);
  }
  if (word.endsWith('ies') || word.endsWith('ied')) {
    if (NON_COMMAND_VERBS.has(`${word.slice(0, -3)}y`)) return true;
  }
  if (word.endsWith('ed') || word.endsWith('es')) {
    return NON_COMMAND_VERBS.has(word.slice(0, -2)) || NON_COMMAND_VERBS.has(word.slice(0, -1));
  }
  return word.endsWith('s') && NON_COMMAND_VERBS.has(word.slice(0, -1));
};

/**
 * What a word can be inside a candidate. `stop` is a function word or a command
 * verb, and ends a run. `verb` is a non-command verb form: it ends a run too,
 * with one exception (below). `content` is subject matter.
 */
type WordKind = 'content' | 'stop' | 'verb';

const wordKind = (word: string): WordKind => {
  if (!word || NOT_SUBJECT_MATTER.has(word) || isCommandVerb(word)) return 'stop';
  return isNonCommandVerbForm(word) ? 'verb' : 'content';
};

/**
 * Candidate terms drawn from the syllabus dot point, in its own words.
 *
 * Runs of adjacent content words, longest first, because the terms this is for
 * are usually more than one: "big data", "primary data", "alternative
 * splicing", "Torres Strait Islander Peoples". Taking every adjacent PAIR
 * instead shredded that last one into "Torres Strait", "Strait Islander" and
 * "Islander Peoples" — three overlapping fragments of one name.
 *
 * A verb form ends a run, so no candidate contains one: "achieving Australia's
 * economic" and "have shaped" were fragments that crossed a phrase boundary.
 * A final -ing word that is not itself a listed verb stays content, so "problem
 * solving", "decision making" and "data mining" survive. A listed one, such as
 * "particle moving", does not: it is the verb, not the noun.
 *
 * Original casing is carried through, so a term added to a list reads the way
 * the syllabus writes it rather than flattened to lower case. Apostrophes stay
 * in the display text: "Australia's" was once stripped to "Australias", and
 * that artefact was then proposed as a term. The key is `normalise(display)`,
 * which removes the apostrophe the same way the question text is compared.
 */
/**
 * An adjective by its ending: -al, -ic, -ive, -ous, -ful, -ian, -ish. Only ever
 * asked of the LAST word of a phrase the dot point carries on past, so a noun
 * with one of these endings ("capital", "chemical") costs only a fragment
 * ("working capital" of "working capital ratio"), never the full phrase.
 */
const looksAdjectival = (word: string): boolean =>
  word.length > 4 && /(?:al|ic|ive|ous|ful|ian|ish)$/.test(word);

/**
 * Words the phrase-builder will not take — so they end a run — that are still
 * part of the phrase they stand beside: "time" in "time series line graphs",
 * "long" in "long term". A candidate remembers them as neighbours, so a
 * question that writes the whole phrase is not read as using the fragment.
 */
const MODIFIER_STOPS = new Set(
  'time long term first second third final local potential ongoing new specific associated intended'.split(
    ' '
  )
);

const isNeighbour = (word: string, kind: WordKind | undefined): boolean =>
  !!word && (kind === 'content' || MODIFIER_STOPS.has(word));

interface Candidate {
  key: string;
  display: string;
  /** The content words the dot point writes either side of it, inside its phrase. */
  before: Set<string>;
  after: Set<string>;
}

const candidateTerms = (dotPointText: string): Candidate[] => {
  const found: Candidate[] = [];

  /**
   * Punctuation ends a phrase. Flattening it to whitespace instead ran the
   * three adjectives of "primary, secondary, tertiary structures" together
   * into one candidate — a phrase the syllabus never wrote.
   */
  for (const segment of (dotPointText || '').split(/[^\p{L}\p{N}\s'’-]+/u)) {
    const raw = segment
      .split(/\s+/)
      .map((w) => w.replace(/^['’]+|['’]+$/g, ''))
      .filter(Boolean);
    const lows = raw.map((w) => normalise(w));
    const kinds = lows.map(wordKind);

    for (let start = 0; start < raw.length; start++) {
      if (kinds[start] !== 'content') continue;
      // The whole run of content words this window sits in, uncapped, so a
      // window knows the words its own phrase continues with.
      let runEnd = start;
      while (runEnd + 1 < raw.length && kinds[runEnd + 1] === 'content') runEnd++;
      const before =
        start > 0 && isNeighbour(lows[start - 1], kinds[start - 1]) ? lows[start - 1] : '';
      // How far the run reaches from here.
      let end = start;
      while (
        end + 1 < raw.length &&
        end + 1 - start < MAX_PHRASE_WORDS &&
        kinds[end + 1] === 'content'
      )
        end++;
      // Every length from the longest down, so a caller can keep the longest
      // its sources actually use and drop the fragments inside it.
      for (let last = end; last >= start; last--) {
        const words = raw.slice(start, last + 1);
        const display = words.join(' ');
        const key = normalise(display);
        const isPhrase = words.length > 1;
        if (!key) continue;
        if (!isPhrase && key.length < 4) continue;
        if (isPhrase && words.some((w) => w.length < 3)) continue;
        const after =
          last < runEnd
            ? lows[last + 1]
            : isNeighbour(lows[runEnd + 1] ?? '', kinds[runEnd + 1]) &&
                kinds[runEnd + 1] !== 'content'
              ? lows[runEnd + 1]
              : '';
        // A phrase that stops on an adjective, where the dot point carries on,
        // is the front half of a longer one: "correct scientific" of "correct
        // scientific language", "South African" of "South African security
        // forces", and "high personal" of "high personal and ethical
        // standards", where "and" shares the noun. The longer phrase is still
        // offered in its own right; only the half is dropped.
        const continues = !!after || /^(?:and|or)$/.test(lows[runEnd + 1] ?? '');
        if (isPhrase && continues && looksAdjectival(lows[last])) continue;
        found.push({
          key,
          display,
          before: new Set(before ? [before] : []),
          after: new Set(after ? [after] : []),
        });
      }
    }
  }

  // One entry per term, with every place the dot point wrote it.
  const byKey = new Map<string, Candidate>();
  for (const t of found) {
    const prior = byKey.get(t.key);
    if (!prior) byKey.set(t.key, t);
    else {
      t.before.forEach((w) => prior.before.add(w));
      t.after.forEach((w) => prior.after.add(w));
    }
  }
  return [...byKey.values()];
};

/**
 * A word with its plural ending taken off: "graphs" → "graph", "policies" →
 * "policy", "stresses" → "stress", "prefixes" → "prefix". Not a full stemmer
 * ("analyses" → "analys"): both sides of every comparison go through it, so it
 * only has to be consistent.
 */
const singular = (w: string): string => {
  if (w.length <= 3 || w.endsWith('ss')) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
};

/** A key with each word made singular, so "time series line graphs" is "time series line graph". */
const singularKey = (key: string): string => key.split(' ').map(singular).join(' ');

/**
 * A year or a date is the question's setting, not a term: "1933", "the 1930s",
 * "September 1939". The reviewers of the November 2026 pass skipped every one.
 */
const isDateOnly = (key: string): boolean =>
  /^(?:(?:january|february|march|april|may|june|july|august|september|october|november|december) )?\d{3,4}s?$/.test(
    key
  );

/**
 * Is this term already spoken for by something on the list? Compared without
 * plurals: the list had "time series line graph" and the syllabus writes
 * "graphs", and the check proposed the fragment "series line graphs".
 */
const alreadyListed = (keywords: string[], key: string): boolean => {
  const k = ` ${singularKey(key)} `;
  return keywords.some((keyword) => {
    const listed = singularKey(normalise(keyword));
    return !!listed && (k.includes(` ${listed} `) || ` ${listed} `.includes(k));
  });
};

/**
 * Does the text use this phrase as a term of its own, and not only as part of
 * the longer phrase the dot point writes it in?
 *
 * The candidates are every window of a run of content words in the dot point,
 * so "long-term financial objectives" also offers "long-term financial", and
 * "total consumer spending" offers "total consumer". A question that says
 * "long-term financial objectives" contains both, and the fragment was
 * proposed as a term. So an occurrence does not count where the question
 * carries on with the word the dot point carries on with ("objectives"), or
 * opens with the word the dot point opens with ("time" before "series line
 * graphs"). Any other neighbour is fine: "big data changes the posture" still
 * uses "big data", because the dot point does not write "big data changes".
 * Measured over the shipped library in November 2026, fragments of this kind
 * were most of the 530 questions with a phrase proposed.
 */
const usesWholePhrase = (normalisedText: string, term: Candidate): boolean => {
  const words = normalisedText.split(' ');
  const parts = term.key.split(' ');
  for (let i = 0; i + parts.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < parts.length; j++)
      if (words[i + j] !== parts[j]) {
        match = false;
        break;
      }
    if (!match) continue;
    const prev = i > 0 ? words[i - 1] : '';
    const next = i + parts.length < words.length ? words[i + parts.length] : '';
    if (!term.before.has(prev) && !term.after.has(next)) return true;
  }
  return false;
};

/**
 * The terms this question should carry and does not, in the syllabus's own
 * words.
 *
 * A question with no scenario is still checked — on phrases only, which is what
 * the asymmetry above buys: 42 of the flagged questions have no scenario at
 * all, and "safe work practices" is no less missing from one of those.
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
    // Phrases only. A single word was offered when the dot point, question and
    // scenario all used it, and in November 2026 reviewers read 261 of those and
    // kept 36 — most of them only as part of a longer term ("aerobic" →
    // "aerobic training"). The rest were a course's wallpaper ("text",
    // "sources", "water", "conflict"). A lone word on a list is still a term;
    // it is only no longer proposed.
    if (!term.key.includes(' ')) return false;
    if (isDateOnly(term.key)) return false;
    // A phrase is subject matter wherever it turns up as a whole phrase.
    return usesWholePhrase(inQuestion, term) || (hasScenario && usesWholePhrase(inScenario, term));
  });

  // Longest wins: with "Torres Strait Islander Peoples" kept there is nothing
  // to be gained from "Torres Strait", and with "big data" kept, none from
  // "data".
  const kept: Candidate[] = [];
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
