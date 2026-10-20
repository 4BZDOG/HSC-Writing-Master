import { verbTipFor } from './waitTips';
import { HSC_RESULTS_FACTS } from '../data/hscResultsFacts';

/**
 * A quick check to play while the AI works: one NESA command verb at a time,
 * three answers to choose from, and the verb's own wait tip as the reason once
 * an answer is picked.
 *
 * The margin notes (utils/waitTips.ts) are read and forgotten. A question the
 * reader has to answer is remembered, and a 20–40 second wait is exactly long
 * enough for two or three of them. So the waits a student sits through most
 * (marking above all) carry this instead of only a note.
 *
 * Every meaning paraphrases the NESA glossary of key words, which is also what
 * the marking prompts follow, so the quiz can never disagree with the marker.
 * The wrong answers are the verbs most often confused with the right one —
 * describe for explain, compare for contrast — because those are the mix-ups
 * that cost marks. Verbs whose glossary meanings are near-synonyms of another
 * verb's (assess and evaluate, account for and explain, outline and summarise)
 * are never offered against each other: a quiz that marks a fair answer wrong
 * would teach the wrong thing.
 */

export interface QuizVerb {
  /** The verb as the reader sees it, capitalised. */
  verb: string;
  /** What it asks of a student, completing "asks you to …". */
  meaning: string;
  /** Two verbs from this list it is often confused with — the wrong answers. */
  confusedWith: readonly [string, string];
}

export const QUIZ_VERBS: readonly QuizVerb[] = [
  {
    verb: 'Analyse',
    meaning: 'identify the parts and show how they relate to each other',
    confusedWith: ['Explain', 'Describe'],
  },
  {
    verb: 'Assess',
    meaning: 'make a judgement of value, quality, outcomes, results or size',
    confusedWith: ['Explain', 'Identify'],
  },
  {
    verb: 'Compare',
    meaning: 'show how things are similar and different',
    confusedWith: ['Contrast', 'Discuss'],
  },
  {
    verb: 'Contrast',
    meaning: 'show how things are different or opposite',
    confusedWith: ['Compare', 'Describe'],
  },
  {
    verb: 'Define',
    meaning: 'state the meaning of something and its essential qualities',
    confusedWith: ['Identify', 'Describe'],
  },
  {
    verb: 'Describe',
    meaning: 'give the characteristics and features of something',
    confusedWith: ['Explain', 'Analyse'],
  },
  {
    verb: 'Discuss',
    meaning: 'identify the issues and give points for and against',
    confusedWith: ['Evaluate', 'Compare'],
  },
  {
    verb: 'Distinguish',
    meaning: 'recognise something as distinct or different from something else',
    confusedWith: ['Compare', 'Identify'],
  },
  {
    verb: 'Evaluate',
    meaning: 'make a judgement based on criteria',
    confusedWith: ['Discuss', 'Describe'],
  },
  {
    verb: 'Explain',
    meaning: 'relate cause and effect, and say why or how',
    confusedWith: ['Describe', 'Outline'],
  },
  {
    verb: 'Identify',
    meaning: 'recognise and name',
    confusedWith: ['Describe', 'Outline'],
  },
  {
    verb: 'Interpret',
    meaning: 'draw meaning from a text, data or source',
    confusedWith: ['Predict', 'Describe'],
  },
  {
    verb: 'Justify',
    meaning: 'support an argument or conclusion',
    confusedWith: ['Explain', 'Discuss'],
  },
  {
    verb: 'Outline',
    meaning: 'sketch in general terms, giving the main features',
    confusedWith: ['Describe', 'Identify'],
  },
  {
    verb: 'Predict',
    meaning: 'suggest what may happen, based on the information available',
    confusedWith: ['Interpret', 'Justify'],
  },
  {
    verb: 'Recommend',
    meaning: 'give reasons in favour of a course of action',
    confusedWith: ['Discuss', 'Evaluate'],
  },
  {
    verb: 'Summarise',
    meaning: 'express the relevant details concisely',
    confusedWith: ['Explain', 'Discuss'],
  },
  {
    verb: 'Synthesise',
    meaning: 'put various elements together to make a whole',
    confusedWith: ['Analyse', 'Summarise'],
  },
];

/**
 * A question about the published HSC results, played between the verb
 * questions so a long wait is not eighteen glossary entries in a row.
 *
 * Each one is answered by a single published fact (data/hscResultsFacts.ts),
 * and the reason shown once it is answered is that fact's own wording, read
 * from the data at the time, so the quiz can never drift from the sourced
 * sentence or its year. Every question is about ALL students' results, never
 * the reader's: a band number here is how the state's results fell, not a
 * guess at anyone's mark. The wrong answers are plausible, not silly, because
 * the point is the surprise of the real figure.
 */
export interface QuizNumber {
  /** The `id` of the fact in HSC_RESULTS_FACTS that answers it. */
  factId: string;
  /** Which of the fact's sentences is the reason: its text, or its caveat. */
  reasonFrom: 'text' | 'caveat';
  prompt: string;
  /** The right answer first, then two wrong ones. */
  choices: readonly [string, string, string];
}

export const QUIZ_NUMBERS: readonly QuizNumber[] = [
  {
    factId: 'band6-about-one-in-ten',
    reasonFrom: 'text',
    prompt: 'Pooled across courses, about how many 2025 HSC results were a Band 6?',
    choices: ['About 1 in 10', 'About 1 in 25', 'About 1 in 4'],
  },
  {
    factId: 'band6-about-one-in-ten',
    reasonFrom: 'text',
    prompt: 'Pooled across courses, which band was the most common 2025 HSC result?',
    choices: ['Band 4', 'Band 5', 'Band 3'],
  },
  {
    factId: 'band-cutoffs',
    reasonFrom: 'text',
    prompt: 'In a non-Extension course, which marks does Band 1 cover?',
    choices: ['0 to 49', '0 to 29', '0 to 39'],
  },
  {
    factId: 'band-cutoffs',
    reasonFrom: 'caveat',
    prompt: 'In a non-Extension course, which marks make a Band 5?',
    choices: ['80 to 89', '85 to 94', '75 to 84'],
  },
  {
    factId: 'band6-varies-by-course',
    reasonFrom: 'text',
    prompt: 'Did every course give about the same share of Band 6 results in 2025?',
    choices: [
      'No. It ran from under 0.5% to 40%, by course.',
      'Yes. About 10% in every course.',
      'Yes. NESA sets a quota for each course.',
    ],
  },
  {
    factId: 'atar-is-a-rank',
    reasonFrom: 'text',
    prompt: 'Is an ATAR of 90 the same thing as a Band 6?',
    choices: [
      'No. An ATAR is a rank, not a mark.',
      'Yes. Both mean a mark of 90 or more.',
      'Only in 2-unit courses.',
    ],
  },
  {
    factId: 'median-mark-band-4',
    reasonFrom: 'text',
    prompt: 'For most 2-unit courses, which band did the median 2025 HSC mark fall in?',
    choices: ['Band 4', 'Band 5', 'Band 3'],
  },
];

/** One question on the card: a prompt, three choices, and which one is right. */
export interface QuizQuestion {
  /** The verb being tested, as in QUIZ_VERBS. Empty for a numbers question. */
  verb: string;
  /**
   * `meaning`: the prompt gives a meaning, and the choices are verbs.
   * `verb`: the prompt gives a verb, and the choices are meanings.
   * `number`: a question about the published HSC results (QUIZ_NUMBERS).
   */
  shape: 'meaning' | 'verb' | 'number';
  prompt: string;
  choices: readonly string[];
  answerIndex: number;
  /** Shown once an answer is picked: the verb's own wait tip, or the published fact. */
  reason: string;
  /** For a numbers question, the year of the results it is about. */
  year?: number;
}

const findVerb = (verb: string | undefined): QuizVerb | undefined => {
  const key = verb?.trim().replace(/\s+/g, ' ').toLowerCase();
  return QUIZ_VERBS.find((q) => q.verb.toLowerCase() === key);
};

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Fisher–Yates, on a copy, with an injectable random for tests. */
const shuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Builds one question about `entry` in the given shape, with its choices in a random order. */
export const buildQuestion = (
  entry: QuizVerb,
  shape: 'meaning' | 'verb',
  random: () => number = Math.random
): QuizQuestion => {
  const options = [entry.verb, ...entry.confusedWith];
  const order = shuffle([0, 1, 2], random);
  const choices = order.map((i) =>
    shape === 'meaning' ? options[i] : `${capitalise(findVerb(options[i])!.meaning)}.`
  );
  return {
    verb: entry.verb,
    shape,
    prompt:
      shape === 'meaning'
        ? `Which verb asks you to ${entry.meaning}?`
        : `What does “${entry.verb}” ask you to do?`,
    choices,
    answerIndex: order.indexOf(0),
    reason: verbTipFor(entry.verb) ?? '',
  };
};

/**
 * Builds one numbers question, with its choices in a random order. Returns
 * undefined when its fact is missing, so a fact retired from the data takes its
 * question with it rather than leaving one with no reason to give.
 */
export const buildNumberQuestion = (
  entry: QuizNumber,
  random: () => number = Math.random
): QuizQuestion | undefined => {
  const fact = HSC_RESULTS_FACTS.find((f) => f.id === entry.factId);
  const reason = entry.reasonFrom === 'caveat' ? fact?.caveat : fact?.text;
  if (!fact || !reason) return undefined;
  const order = shuffle([0, 1, 2], random);
  return {
    verb: '',
    shape: 'number',
    prompt: entry.prompt,
    choices: order.map((i) => entry.choices[i]),
    answerIndex: order.indexOf(0),
    reason,
    year: fact.year,
  };
};

/**
 * The questions a wait plays through, in order. When the wait is marking an
 * answer to a known verb, the first question is about that verb — the one the
 * student is waiting on — asked as "what does it ask you to do?". The rest are
 * every other verb in a random order, alternating the two shapes (a verb to
 * pick first), so a long wait never repeats a verb. A numbers question follows
 * every second verb question after that, in a random order of their own.
 *
 * Read the facts here, at call time, never at module scope: `npm run
 * check:eager-reads` holds the line against reading an import while the module
 * is still initialising.
 */
export const quizDeck = (verb?: string, random: () => number = Math.random): QuizQuestion[] => {
  const own = findVerb(verb);
  const rest = shuffle(
    QUIZ_VERBS.filter((q) => q !== own),
    random
  );
  const numbers = shuffle(QUIZ_NUMBERS, random)
    .map((entry) => buildNumberQuestion(entry, random))
    .filter((q): q is QuizQuestion => q !== undefined);
  const deck: QuizQuestion[] = [];
  if (own) deck.push(buildQuestion(own, 'verb', random));
  rest.forEach((entry, i) => {
    const shape = i % 2 === 0 ? 'meaning' : 'verb';
    deck.push(buildQuestion(entry, shape, random));
    if (i % 2 === 1 && numbers.length > 0) deck.push(numbers.shift()!);
  });
  return [...deck, ...numbers];
};
