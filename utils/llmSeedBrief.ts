import type { Course } from '../types';
import { bandMarkRanges, commandTermsList, TIER_GROUPS } from '../data/commandTerms';

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

/**
 * The exact rows a marking guide above 6 marks must have, by tier and mark
 * value — one per band the question can award, with that band's mark range.
 *
 * The same ladder `utils/markingGuideLadder.ts` holds every AI-written guide to
 * and the Content Audit Studio treats as standard, derived from `bandMarkRanges`
 * so the brief cannot drift from it. "Band-range lines" alone was not enough: a
 * model left to pick its own ranges wrote 8 / 6-7 / 4-5 / 2-3 / 1 for every
 * 8-mark question, which is right for no tier.
 */
const guideRowsOver6 = (): Record<string, string> => {
  const rows: Record<string, string> = {};
  for (const group of TIER_GROUPS) {
    const verbs = commandTermsList.filter((v) => v.tier === group.tier);
    const maxMarks = Math.max(0, ...verbs.map((v) => v.markRange[1]));
    for (const marks of [7, 8, 9, 10, 12, 15, 20].filter((m) => m <= maxMarks)) {
      rows[`tier ${group.tier}, ${marks} marks`] = bandMarkRanges(marks, group.tier)
        .map(({ lo, hi }) =>
          lo === hi ? `${lo} mark${lo === 1 ? '' : 's'}:` : `${lo}-${hi} marks:`
        )
        .join(' / ');
    }
  }
  return rows;
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
  DEPTH:
    'Write 2-4 questions for every dot point, each on a different verb and mark value, so a dot point can be practised from recall up to extended response. Across a topic: mostly 3-6 mark questions, some 2-mark recall questions, and at least one 7+ mark extended response on a tier 5-6 verb. Give most questions a "scenario": a realistic context paragraph (who, what, why — 2-4 sentences) the answer has to use.',
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
      "Exactly the rows in OVER_6_MARKS_ROWS for the verb's tier and the question's marks — one per band the question can award, with that band's mark range, top first. Discriminate them by QUALITY OF THINKING rather than length: the top row demands the verb's full cognitive level; middle rows show sound knowledge a step below it; the lowest is fragmentary.",
    OVER_6_MARKS_ROWS: guideRowsOver6(),
    NOT_ADDITIVE:
      'Describe a whole answer at each mark, not separate components that add up ("Makes a judgement (1 mark) • Applies criterion A (2 marks)…"). The app checks guides against the rows above and flags any other layout as non-standard.',
  },
  MARKER_NOTES:
    '"markerNotes": 2-4 short notes in a marker\'s own register on what separates a strong answer to THIS question ("A top-tier evaluation acknowledges that a combined strategy is superior"). The marker reads them after the marking criteria and they refine it — they never add marks the criteria do not award.',
  COMMON_STUDENT_ERRORS:
    '"commonStudentErrors": 2-4 specific mistakes students make on THIS question ("Describing the two approaches without judging their effectiveness"). Students see them as things to avoid, so write each as the mistake itself, not as advice.',
  SYLLABUS_TERMS: {
    WHAT: '"keywords" are the syllabus terminology a full-mark answer must use — technical terms, named concepts, processes, structures and examples an examiner expects. 6-10 of them, concise noun phrases of 1-3 words, lower case unless a proper noun or established acronym. No command verbs, no generic academic words ("process", "factor", "important"), no connectives ("therefore", "however").',
    MUST_USE_FIRST:
      'Order the list must-use terms first. A must-use term is one the question, its scenario, its dot point, its sub-topic or its topic NAMES ITSELF — the app re-derives that split by matching each term back against those five sources, and shows the ones it finds as must-use terms in the student\'s Syllabus Terms panel. So write a must-use term in the same words its source uses ("automated unit testing", not "automated testing methodologies"), or the app cannot see that the question is built on it.',
    THEN_SUPPORTING:
      'After those, add the supporting terms a strong answer would reach for even though nothing in the question names them ("credibility", "peer review"). These are what lifts an answer above merely restating the question.',
  },
  SAMPLE_ANSWERS: {
    LADDER:
      "Give each question three answers at DIFFERENT mark values — full marks, the middle of the range and the bottom (for a 5-mark question: 5, 3 and 1; for 2 marks: 2 and 1) — each with flaws that match that mark's line in the marking criteria. The marker is calibrated against these, so a question with only a full-mark answer gives it nothing to compare a weaker answer with. Never two answers with the same text.",
    MARK: '"mark" is a whole number from 0 to totalMarks — never a half mark (the database stores an integer and rejects 1.5). Do not write "band": the app works it out from the mark and the verb.',
    TERMS:
      "The full-mark exemplar must use EVERY must-use term from that question's keywords, each doing real work in a sentence rather than listed. A lower-mark answer uses proportionally fewer, taking must-use terms before supporting ones and falling back on general language for the rest — the terms it leaves out are part of why it earns less. Never bolt terms onto an answer that has not earned them.",
    LENGTH:
      'Realistic student length under exam pressure: roughly 40-60 words per mark. A lower mark means LESS material, not a full-length answer worded badly.',
    FEEDBACK:
      '"source" is always "AI". "feedback" explains, in marker language, exactly why the answer earns its mark and what would lift it.',
  },
  QUALITY_BAR:
    'Factually accurate and syllabus-authentic. No placeholder text, no duplicated questions. Before returning: every verb is on the list, every totalMarks is inside its verb\'s range, every linkedOutcomes code exists in the course\'s outcomes array, every markingCriteria line starts with "N marks:" or "N-M marks:" and has the rows MARKING_CRITERIA asks for, and every sample mark is a whole number no higher than totalMarks.',
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
