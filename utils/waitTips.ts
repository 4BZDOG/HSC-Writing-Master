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
export const WAIT_TIPS: Record<AiTaskType, readonly string[]> = {
  evaluation: [
    '“Evaluate” asks for a judgement against criteria. Say how far something is true, and on what grounds — not just whether.',
    '“Explain” is cause and effect. Words like because, therefore and as a result are the joints of the answer.',
    '“Analyse” wants the parts and how they relate to each other. Naming the parts is only half of it.',
    '“Discuss” means points for and against. A one-sided answer tends to cap itself.',
    '“Justify” means supporting a position. Take it in your first sentence, then earn it.',
    '“Compare” asks for similarities and differences. “Contrast” asks only for differences.',
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
 * A function rather than a module constant, on purpose: it reads the facts,
 * and `npm run check:eager-reads` holds the line against reading an import
 * while the module is still initialising.
 */
export const waitNotes = (task: AiTaskType): WaitNote[] => {
  const advice = WAIT_TIPS[task].map((text): WaitNote => ({ kind: 'advice', text }));
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
