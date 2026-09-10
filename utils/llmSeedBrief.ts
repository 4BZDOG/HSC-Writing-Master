import type { Course } from '../types';
import { commandTermsList, TIER_GROUPS } from '../data/commandTerms';

/**
 * The authoring rules an external LLM needs to write course data this app can
 * import — carried inside the exported JSON itself.
 *
 * Seeding a course at scale means handing a model an example of the shape and a
 * statement of the rules. An export is already the example; what it never
 * carried was the rules, so the rules lived in `docs/dataset-generation-prompt.md`
 * where a teacher exporting a file never sees them, and a model handed the file
 * alone had to infer them. Everything it can infer wrongly — which verbs are
 * legal, what a marking guide looks like line by line, which terms belong on a
 * question's list — is what this block states outright.
 *
 * The import path already skips it: `analyzeAndSanitizeImportData` unwraps
 * `{ _instructions_for_llm, data }` before validating, so a file that has been
 * through a model and back imports exactly as it left.
 *
 * The verb list is DERIVED from `data/commandTerms.ts` rather than written out
 * again. A hand-copied list is a list that drifts, and this one is the reason a
 * question gets the right tier colour, band ceiling and time guide.
 */
const verbsByTier = (): Record<string, string> => {
  const lines: Record<string, string> = {};
  for (const group of TIER_GROUPS) {
    const verbs = commandTermsList
      .filter((v) => v.tier === group.tier)
      .map((v) => `${v.term} ${v.markRange[0]}-${v.markRange[1]}`);
    if (verbs.length > 0) {
      lines[`tier${group.tier}_${group.title.split(/[\s,&]+/)[0].toLowerCase()}`] =
        verbs.join(', ');
    }
  }
  return lines;
};

export const buildLlmSeedInstructions = () => ({
  ROLE: 'You are an expert NESA HSC content writer extending a syllabus dataset for an AI writing-coach app. The "data" array below is the existing content and the exact shape to follow. Return a JSON document of the same shape and nothing else — no markdown fences, no commentary.',
  LANGUAGE:
    'British/Australian English throughout (analyse, colour, organisation, programme), including inside every sample answer.',
  IDS: 'Omit every "id" field on anything you write — the app generates them on import. Keep the ids that are already here on content you are not changing.',
  VERBS: {
    RULE: 'Every question\'s "verb" must be one of these, in UPPERCASE, exactly, and "totalMarks" must be an integer inside that verb\'s range. The verb decides the question\'s cognitive tier, its band ceiling, its colour and its time guide everywhere in the app.',
    STEM: "The question stem must begin with, or prominently use, its verb and genuinely demand that verb's thinking: an EVALUATE question needs a judgement against criteria, not a description.",
    TYPICAL_MARKS: verbsByTier(),
  },
  DOT_POINTS: {
    RULE: 'Each dot point "description" is the syllabus\'s own words and should begin with a command verb ("describe the OSI model…").',
    FOCUS_AREAS:
      'Where a dot point has enumerable parts, end it with "including <a>, <b> and <c>" (2-6 items, 1-4 words each). The app parses those into selectable focus areas.',
  },
  MARKING_CRITERIA: {
    SHAPE:
      'One string, lines separated by \\n, each line starting with a mark value or range and a colon. Never bullet points, headings or paragraphs — the marking accordion parses lines.',
    UP_TO_6_MARKS:
      'One line per mark value, descending, no ranges. "4 marks: … \\n3 marks: … \\n2 marks: … \\n1 mark: …"',
    OVER_6_MARKS:
      "Band-range lines, descending, discriminated by QUALITY OF THINKING rather than length. The top range demands the verb's full cognitive level; middle ranges show sound knowledge a step below it; the lowest is fragmentary.",
  },
  SYLLABUS_TERMS: {
    WHAT: '"keywords" are the syllabus terminology a full-mark answer must use — technical terms, named concepts, processes, structures and examples an examiner expects. 6-10 of them, concise noun phrases of 1-3 words, lower case unless a proper noun or established acronym. No command verbs, no generic academic words ("process", "factor", "important"), no connectives ("therefore", "however").',
    MUST_USE_FIRST:
      'Order the list must-use terms first. A must-use term is one the question, its scenario, its dot point, its sub-topic or its topic NAMES ITSELF — the app re-derives that split by matching each term back against those five sources, and shows the ones it finds as must-use terms in the student\'s Syllabus Terms panel. So write a must-use term in the same words its source uses ("automated unit testing", not "automated testing methodologies"), or the app cannot see that the question is built on it.',
    THEN_SUPPORTING:
      'After those, add the supporting terms a strong answer would reach for even though nothing in the question names them ("credibility", "peer review"). These are what lifts an answer above merely restating the question.',
  },
  SAMPLE_ANSWERS: {
    LADDER:
      "Give each question answers at DIFFERENT mark values: always a full-mark exemplar, plus at least one clearly weaker response (roughly half marks) whose flaws match that mark's line in the marking criteria. Never two answers with the same text.",
    TERMS:
      "The full-mark exemplar must use EVERY must-use term from that question's keywords, each doing real work in a sentence rather than listed. A lower-mark answer uses proportionally fewer, taking must-use terms before supporting ones and falling back on general language for the rest — the terms it leaves out are part of why it earns less. Never bolt terms onto an answer that has not earned them.",
    LENGTH:
      'Realistic student length under exam pressure: roughly 40-60 words per mark. A lower mark means LESS material, not a full-length answer worded badly.',
    FEEDBACK:
      '"source" is always "AI". "feedback" explains, in marker language, exactly why the answer earns its mark and what would lift it.',
  },
  QUALITY_BAR:
    'Factually accurate and syllabus-authentic. No placeholder text, no duplicated questions. Before returning: every verb is on the list, every totalMarks is inside its verb\'s range, every linkedOutcomes code exists in the course\'s outcomes array, and every markingCriteria line starts with "N marks:" or "N-M marks:".',
});

/**
 * A course export as it is written to disk: the rules, then the content.
 *
 * One definition of the file shape, so the export and the round-trip test are
 * looking at the same thing. The content sits under `data` because that is the
 * key the import unwraps.
 */
export const buildSeedExportFile = (courses: Course[]): string =>
  JSON.stringify({ _instructions_for_llm: buildLlmSeedInstructions(), data: courses }, null, 2);
