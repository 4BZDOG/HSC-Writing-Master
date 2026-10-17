import type { AiTaskType } from '../components/LoadingIndicator';
import { HSC_RESULTS_FACTS } from '../data/hscResultsFacts';

/**
 * Something worth reading while the AI works.
 *
 * An AI wait in this app is 5–40 seconds of a student or teacher looking at a
 * card. It used to fill that time with invented pipeline jargon ("Optimising
 * heuristic constraints…") — words that sounded busy and taught nothing. These
 * are short, accurate notes about HSC writing instead, chosen for who is
 * waiting: a student waiting on a mark gets advice about command verbs and
 * answers; a teacher generating a question gets advice about question design.
 *
 * Every verb definition here paraphrases the NESA glossary of key words, which
 * the marking prompts also follow — a tip that disagreed with the marker would
 * be worse than no tip. Keep each one to a sentence or two: it is read in a
 * glance, and it rotates.
 *
 * These are the ADVICE notes. The HSC numbers (data/hscResultsFacts.ts) rotate
 * alongside them through `waitNotes()`, which is what a wait actually shows.
 */
/**
 * The tip for each command verb, keyed by the verb in lower case. A wait shows
 * only the tip for the verb it is marking (see `waitNotes`), so each one must
 * be true for that verb alone: a "describe" answer is never told what "justify"
 * means. Each paraphrases the NESA glossary of key words.
 */
export const VERB_TIPS: Record<string, string> = {
  evaluate:
    '“Evaluate” asks for a judgement against criteria. Say how far something is true, and on what grounds — not just whether.',
  explain:
    '“Explain” is cause and effect. Words like because, therefore and as a result are the joints of the answer.',
  analyse:
    '“Analyse” wants the parts and how they relate to each other. Naming the parts is only half of it.',
  discuss: '“Discuss” means points for and against. A one-sided answer tends to cap itself.',
  justify: '“Justify” means supporting a position. Take it in your first sentence, then earn it.',
  compare: '“Compare” asks for similarities and differences.',
  contrast:
    '“Contrast” asks only for differences. Set the two side by side and name each point where they part.',
  describe:
    '“Describe” asks for the characteristics and features of something. Stay with what it is like, and leave the reasons for another verb.',
  identify:
    '“Identify” asks you to recognise and name. One precise term, correctly placed, is usually all it needs.',
  outline:
    '“Outline” asks for a sketch in general terms, indicating the main features. Name the main points in order, and leave out the detail.',
  assess:
    '“Assess” asks for a judgement of value, quality, outcomes, results or size. Say how much, or how well, and what that rests on.',
  examine:
    '“Examine” asks you to inquire into something. Look closely at the evidence, and say what it reveals.',
  account:
    '“Account for” asks you to state the reasons for something, or report on it. Give the reasons, and show how they led to the result.',
  'account for':
    '“Account for” asks you to state the reasons for something, or report on it. Give the reasons, and show how they led to the result.',
  recommend:
    '“Recommend” asks for reasons in favour of a course of action. Name the option you back, then give the reasons it is the best choice.',
  propose:
    '“Propose” asks you to put forward a point of view, idea, argument or suggestion for consideration or action. State the proposal plainly, then give the case for it.',
  summarise:
    '“Summarise” asks you to express the relevant details concisely. Keep the main points and cut the examples.',
  define:
    '“Define” asks you to state the meaning of something and identify its essential qualities. Lead with the meaning, then the qualities that set it apart.',
  interpret:
    '“Interpret” asks you to draw meaning from something. Say what the text, data or source means, and support it with evidence.',
  predict:
    '“Predict” asks you to suggest what may happen, based on the information available. Say what you expect, and base it on the evidence in front of you.',
  apply:
    '“Apply” asks you to use knowledge in a particular situation. Name the principle, then show it working in the case the question gives you.',
  distinguish:
    '“Distinguish” asks you to recognise something as distinct or different from something else. Name the feature that separates the two, and say why it matters.',
  investigate:
    '“Investigate” asks you to plan an inquiry, carry it out and draw conclusions. Set out the question, the evidence, and what the evidence lets you conclude.',
  'critically analyse':
    '“Critically analyse” adds depth, accuracy and questioning to “Analyse”. Test each part you break out: ask what it shows, and whether it holds.',
  'critically evaluate':
    '“Critically evaluate” adds depth, accuracy and questioning to “Evaluate”. Test your criteria as well as your judgement, and say where the judgement could fail.',
  synthesise:
    '“Synthesise” asks you to put various elements together to make a whole. Bring the separate points into one account, rather than listing them in turn.',
};

/**
 * The tip for a command verb, or undefined when there is none. Matches the
 * verb case-insensitively and ignores surrounding space, so "DESCRIBE" and
 * " describe " both find the describe tip. Own keys only: a verb such as
 * "constructor" must not find the object prototype's property.
 */
export const verbTipFor = (verb: string | undefined): string | undefined => {
  const key = verb?.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key || !Object.prototype.hasOwnProperty.call(VERB_TIPS, key)) return undefined;
  return VERB_TIPS[key];
};

export const WAIT_TIPS: Record<AiTaskType, readonly string[]> = {
  evaluation: [
    'The marks are a guide to length. A two-mark answer rarely needs more than two or three sentences.',
    'Use the terms in the question. Markers look for the syllabus vocabulary the question was built from.',
    'A specific example does more work than a general claim. Name the case, the figure or the text.',
    'If the verb asks for a judgement, finish with one. A conclusion that summarises without deciding leaves marks behind.',
  ],
  generation: [
    'A question’s command verb sets its ceiling: a “describe” question cannot reward evaluation, however good the answer.',
    'Match the marks to the demand. A “discuss” question usually needs five or six marks to leave room for both sides.',
    'Marking guidelines read best as levels of quality, not a list of points to tick off.',
    'A scenario earns its place when the answer has to use one of its details.',
    'Sample answers work best as a set. One at each band shows students where the steps are.',
    '“Critically” in front of a verb asks for more depth and questioning, not more length.',
  ],
  enrichment: [
    'Outcomes say what a student can do by the end of the course. Dot points say what they learn on the way.',
    'The command verbs here follow the NESA glossary of key words.',
    '“Critically” in front of a verb asks for more depth and questioning, not more length.',
  ],
  default: [
    'The command verbs here follow the NESA glossary of key words.',
    '“Explain” is cause and effect. Words like because, therefore and as a result are the joints of the answer.',
    'A specific example does more work than a general claim. Name the case, the figure or the text.',
  ],
};

/** One note on a wait: a piece of advice about the task, or a number from the published HSC results. */
export type WaitNote =
  | { kind: 'advice'; text: string }
  | { kind: 'fact'; text: string; year: number };

/**
 * The notes a wait rotates through, in order: advice and HSC numbers
 * alternating, so neither a run of verbs nor a run of statistics reaches the
 * reader on its own.
 *
 * For an evaluation, the question's own verb leads the advice, because that is
 * the tip that applies to what the student is waiting on. A verb with no tip
 * (or no verb at all) gets the general advice only, never another verb's tip.
 *
 * A function rather than a module constant, on purpose: it reads the facts,
 * and `npm run check:eager-reads` holds the line against reading an import
 * while the module is still initialising.
 */
export const waitNotes = (task: AiTaskType, verb?: string): WaitNote[] => {
  const verbTip = task === 'evaluation' ? verbTipFor(verb) : undefined;
  const adviceTexts = verbTip ? [verbTip, ...WAIT_TIPS[task]] : [...WAIT_TIPS[task]];
  const advice = adviceTexts.map((text): WaitNote => ({ kind: 'advice', text }));
  const facts = HSC_RESULTS_FACTS.map(
    (fact): WaitNote => ({ kind: 'fact', text: fact.text, year: fact.year })
  );
  const notes: WaitNote[] = [];
  for (let i = 0; i < Math.max(advice.length, facts.length); i++) {
    if (i < advice.length) notes.push(advice[i]);
    if (i < facts.length) notes.push(facts[i]);
  }
  return notes;
};
