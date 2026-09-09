import { Course, Topic, SubTopic, DotPoint, Prompt, StatePath } from '../../../types';
import { outcomesForYear, yearOfTopic } from '../../../utils/syllabusYear';
import { SUBJECT_AREAS, subjectAreaOf, type SubjectArea } from '../../../utils/subjectAreas';
import { extractCommandVerb } from '../../../data/commandTerms';
import { createKeywordRegex } from '../../../utils/renderUtils';
import { promptHasExemplarMismatch } from '../../../utils/exemplarAudit';
import { dropNonSyllabusTerms } from '../../../services/geminiService';

/**
 * The audit tree's shared vocabulary — the node shape, the filter/action enums,
 * the "what counts as a gap" predicates, and the builder that turns the course
 * library into the annotated tree. Extracted from ContentAuditModal so the
 * predicates have a single home shared by the task assembly, the button target
 * counts, and the tree badges, and so the 2000-line modal is not also the
 * definition site for its data model.
 */

export type NodeType = 'faculty' | 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';

/**
 * What sits behind a faculty row. A faculty is not a syllabus level — there is
 * no NESA entity for it and nothing in the data model to point at — it is the
 * grouping a school already works in, so the node carries the grouping itself
 * rather than a reference to a stored thing.
 */
export interface FacultyGroup {
  area: SubjectArea;
  courses: Course[];
}

/** The id a faculty row is addressed by. Prefixed so it can never collide
 *  with a course id, which is what every other top-level node used to be. */
export const facultyNodeId = (area: SubjectArea): string => `faculty:${area}`;

export interface TreeNode {
  id: string;
  parentId?: string;
  type: NodeType;
  label: string;
  children?: TreeNode[];
  stats: {
    questions: number;
    samples: number;
    missingSamples: number;
    missingOutcomes: number;
    missingMarkingCriteria: number;
    rubricNotDescending: number;
    verbNotInQuestion: number;
    totalDotPoints: number;
    coveredDotPoints: number;
  };
  verbInfo?: {
    term: string;
    tier: number;
  };
  dataRef: Course | Topic | SubTopic | DotPoint | Prompt | FacultyGroup;
  /**
   * The syllabus path this node sits at. Empty for a faculty, which sits above
   * every path — anything reading `path.courseId` must handle that, and
   * `ContentAuditModal`'s `clearTargets` resolves a faculty to its courses
   * rather than pretending it has one.
   */
  path: StatePath;
}

/**
 * The gap filters the rail offers. Every one of them is declared once in
 * `AUDIT_FILTERS` below — the chip, the header count and "Select All Filtered"
 * all read that list, so a filter can no longer exist in one of the three and
 * be missing from the others.
 *
 * `unEnriched` used to be a member here and is gone: it had a predicate, a
 * count and a select branch, but no chip ever rendered it, so nothing could
 * reach it.
 */
export type AuditFilterId =
  | 'emptyDotPoints'
  | 'missingRubrics'
  | 'missingSamples'
  | 'missingOutcomes'
  | 'rubricNotDescending'
  | 'verbNotInQuestion'
  | 'lowQuality'
  | 'flagged'
  | 'exemplarMismatch'
  | 'offSyllabusTerms'
  | 'hasSamples';

export type VisibilityFilter = AuditFilterId | null;

export type BulkActionType =
  | 'generateQuestions'
  | 'generateSamples'
  | 'generateRubrics'
  | 'reviseRubrics'
  | 'linkOutcomes'
  | 'recalibrateSamples'
  | 'screenQuality'
  | 'fixAllGaps';

/**
 * The studio's one repair that needs no AI at all.
 *
 * Everything else on the action row is a generation call; this rewrites a
 * keyword list from a rule the app already owns, so it runs as a single edit
 * rather than through the batch runner — whose 1.5s pacing exists to keep a
 * provider happy and would spend five minutes doing nothing on two hundred
 * local writes.
 */
export type LocalActionType = 'tidyTerms';

// Gap predicates shared by the task assembly, the button target counts, and
// the tree badges — one definition of "what counts as a gap".
export const isEmptyDotPoint = (n: TreeNode) => n.type === 'dotPoint' && n.stats.questions === 0;
export const needsSamples = (n: TreeNode) => n.type === 'prompt' && n.stats.samples === 0;
export const needsRubric = (n: TreeNode) =>
  n.type === 'prompt' && (n.stats.missingMarkingCriteria > 0 || n.stats.rubricNotDescending > 0);
export const hasNonStandardRubric = (n: TreeNode) =>
  n.type === 'prompt' && n.stats.rubricNotDescending > 0;
/**
 * The recorded verb appears nowhere in the question it governs.
 *
 * Twelve shipped questions were tagged with a verb their own text never uses —
 * five that open with the word "Analyse" were tagged CLARIFY, a tier 2 term, so
 * a full-mark response could reach Band 2 and no further. Two things go wrong
 * at once, and the colour is the lesser: `renderFormattedText` builds its
 * highlighter from the recorded verb, so nothing is coloured, and the Verb Gate
 * reads the same tag for the band ceiling.
 *
 * `extractCommandVerb` agreed with all twelve, so it is the natural detector —
 * but it stays a FLAG rather than a fix. Which verb governs a two-part question
 * ("Convert this length … and justify …") is a marker's call, not a codemod's.
 */
export const verbNotInQuestion = (n: TreeNode) =>
  n.type === 'prompt' && n.stats.verbNotInQuestion > 0;
export const needsOutcomes = (n: TreeNode) => n.type === 'prompt' && n.stats.missingOutcomes > 0;
export const hasSamplesToRecalibrate = (n: TreeNode) => n.type === 'prompt' && n.stats.samples > 0;
export const qualityOf = (n: TreeNode): number | null =>
  n.type === 'prompt' ? ((n.dataRef as Prompt).qualityScore ?? null) : null;
// Thresholds match the Review Queue's QualityBadge: <50 needs a close look.
export const isLowQuality = (n: TreeNode) => {
  const q = qualityOf(n);
  return q !== null && q < 50;
};
// A question counts as flagged when it, or any of its sample answers, carries
// an OPEN user-raised content flag (see ContentFlag in types.ts).
export const isFlagged = (n: TreeNode): boolean => {
  if (n.type !== 'prompt') return false;
  const p = n.dataRef as Prompt;
  return (
    p.contentFlag?.status === 'open' ||
    (p.sampleAnswers || []).some((sa) => sa.contentFlag?.status === 'open')
  );
};

/**
 * The question's syllabus-terms list carries something that is not a syllabus
 * term — the command verb, a generic academic word, a connective, an over-long
 * phrase, or a duplicate.
 *
 * `dropNonSyllabusTerms` is the app's own rule, the one `keywordInstruction`
 * has always stated and `sanitiseKeywords` has always applied to newly
 * generated lists. This asks the same question of content that predates it:
 * 25 of the 418 shipped questions fail, most of them ending "… | because |
 * therefore | consequently", which is what a student is told to make sure
 * their answer contains.
 *
 * Memoised per prompt OBJECT for the same reason `hasExemplarMismatch` is:
 * this runs for the header counts and again for the filter, on every change to
 * the library, and Immer hands back the same object for anything a batch task
 * did not touch.
 */
const offSyllabusCache = new WeakMap<Prompt, boolean>();

export const offSyllabusTermCount = (prompt: Prompt): number => {
  const listed = (prompt.keywords ?? []).filter((k) => typeof k === 'string' && k.trim());
  return listed.length - dropNonSyllabusTerms(listed, prompt.verb).length;
};

export const hasOffSyllabusTerms = (n: TreeNode): boolean => {
  if (n.type !== 'prompt') return false;
  const prompt = n.dataRef as Prompt;
  const cached = offSyllabusCache.get(prompt);
  if (cached !== undefined) return cached;
  const result = offSyllabusTermCount(prompt) > 0;
  offSyllabusCache.set(prompt, result);
  return result;
};

// A question counts as having an exemplar mismatch when one of its sample
// answers is mechanically out of step with the band it claims — a warning-level
// finding from utils/exemplarAudit (e.g. a top-band exemplar far too short). A
// no-AI triage list, complementary to the AI quality screen behind `lowQuality`.
/**
 * Memoised per prompt OBJECT, not per id.
 *
 * `promptHasExemplarMismatch` word-counts and keyword-scans every sample answer
 * it is given — around 800 samples across the shipped courses. It is called
 * from the header counts and from the filter, and both re-run on every change
 * to `courses`, which during a batch run is once per completed task. Immer
 * hands back the SAME object for anything the task did not touch, so keying the
 * cache on identity re-audits exactly the prompts that actually changed and
 * nothing else. A WeakMap so a deleted prompt takes its entry with it.
 */
const exemplarMismatchCache = new WeakMap<Prompt, boolean>();

export const hasExemplarMismatch = (n: TreeNode): boolean => {
  if (n.type !== 'prompt') return false;
  const prompt = n.dataRef as Prompt;
  const cached = exemplarMismatchCache.get(prompt);
  if (cached !== undefined) return cached;
  const result = promptHasExemplarMismatch(prompt);
  exemplarMismatchCache.set(prompt, result);
  return result;
};

/**
 * The filter rail, declared once.
 *
 * There used to be three copies of these predicates — one in the header's
 * `counts`, one in the modal's `filterNode`, one in `handleSmartSelect` — and
 * they had already drifted: the third was missing `verbNotInQuestion`,
 * `flagged` and `exemplarMismatch`, so "Select All Filtered" silently selected
 * nothing for those three chips and reported "Selected 0 items". One list is
 * the fix, because it is the only shape in which the three cannot disagree.
 *
 * `tone` names the colour family rather than the classes, so the chip and the
 * matching row badge are coloured from one decision (see AUDIT_TONE in
 * AuditPieces.tsx).
 */
export type AuditTone =
  | 'red'
  | 'indigo'
  | 'amber'
  | 'pink'
  | 'orange'
  | 'rose'
  | 'fuchsia'
  | 'violet'
  | 'sky'
  | 'teal';

export interface AuditFilterDefinition {
  id: AuditFilterId;
  /** The chip's text, and the same words the row badge and the button use. */
  label: string;
  /** What the chip is for, in a sentence — shown on hover and to assistive tech. */
  title: string;
  tone: AuditTone;
  matches: (n: TreeNode) => boolean;
  /**
   * Missing content the studio can generate, versus content that exists but
   * looks wrong. The rail is ordered by this and ruled between the two.
   */
  group: 'missing' | 'review';
}

export const AUDIT_FILTERS: AuditFilterDefinition[] = [
  {
    id: 'emptyDotPoints',
    label: 'No Questions',
    title: 'Syllabus dot points that have no questions at all',
    tone: 'red',
    group: 'missing',
    matches: isEmptyDotPoint,
  },
  {
    id: 'missingRubrics',
    label: 'No Marking Guide',
    title: 'Questions with no marking guide to be scored against',
    tone: 'indigo',
    group: 'missing',
    matches: (n) => n.type === 'prompt' && n.stats.missingMarkingCriteria > 0,
  },
  {
    id: 'missingSamples',
    label: 'No Samples',
    title: 'Questions with no sample answer to show what the marks look like',
    tone: 'amber',
    group: 'missing',
    matches: needsSamples,
  },
  {
    id: 'missingOutcomes',
    label: 'No Outcomes',
    title: 'Questions with no syllabus outcome linked',
    tone: 'pink',
    group: 'missing',
    matches: needsOutcomes,
  },
  {
    id: 'rubricNotDescending',
    label: 'Guide Format',
    title: 'Marking guides whose mark bands do not run from highest to lowest',
    tone: 'orange',
    group: 'review',
    matches: hasNonStandardRubric,
  },
  {
    id: 'verbNotInQuestion',
    label: 'Verb Not In Question',
    title:
      'Questions tagged with a command verb their own text never uses — the tag sets the band ceiling, so this one changes what a student can score',
    tone: 'rose',
    group: 'review',
    matches: verbNotInQuestion,
  },
  {
    id: 'lowQuality',
    label: 'Low Quality',
    title:
      'Questions whose AI quality pre-screen scored below 50 (run Score Quality to score content)',
    tone: 'fuchsia',
    group: 'review',
    matches: isLowQuality,
  },
  {
    id: 'flagged',
    label: 'Flagged',
    title: 'Questions (or their sample answers) that a user flagged as looking off',
    tone: 'amber',
    group: 'review',
    matches: isFlagged,
  },
  {
    id: 'exemplarMismatch',
    label: 'Exemplar Mismatch',
    title:
      'Questions with a sample answer mechanically out of step with the band it claims (e.g. a top-band exemplar far too short) — a no-AI check',
    tone: 'violet',
    group: 'review',
    matches: hasExemplarMismatch,
  },
  {
    id: 'offSyllabusTerms',
    label: 'Off-Syllabus Terms',
    title:
      'Questions whose Syllabus Terms list carries something that is not a syllabus term — the command verb, a generic academic word, a connective like "therefore", an over-long phrase, or a duplicate. Tidy Terms removes them without touching the real terms, and needs no AI.',
    tone: 'sky',
    group: 'review',
    matches: hasOffSyllabusTerms,
  },
  {
    id: 'hasSamples',
    label: 'Has Samples',
    title: 'Questions that already carry sample answers — the targets for a re-mark',
    tone: 'teal',
    group: 'review',
    matches: hasSamplesToRecalibrate,
  },
];

const FILTER_BY_ID = new Map(AUDIT_FILTERS.map((f) => [f.id, f]));

/** Does this node match the active filter? A null filter matches everything. */
export const matchesFilter = (node: TreeNode, filter: VisibilityFilter): boolean =>
  filter === null ? true : (FILTER_BY_ID.get(filter)?.matches(node) ?? true);

/** How many nodes in the tree each chip would show, in one pass over the map. */
export const countFilterMatches = (nodes: Iterable<TreeNode>): Record<AuditFilterId, number> => {
  const counts = Object.fromEntries(AUDIT_FILTERS.map((f) => [f.id, 0])) as Record<
    AuditFilterId,
    number
  >;
  for (const node of nodes) {
    for (const f of AUDIT_FILTERS) if (f.matches(node)) counts[f.id]++;
  }
  return counts;
};

/** A band opening a line: "4 marks", "- 4-5 marks", "• 9–10 marks". */
const BAND_AT_LINE_START = /^\s*[-•*]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?/i;
/**
 * A band header found mid-line — "…investigation.4 marks: Provides…".
 *
 * The colon is required here and not at the start of a line, and the asymmetry
 * is deliberate. A line-initial number followed by "marks" is a band whatever
 * punctuation follows it ("5 marks - Provides…"), but mid-line the same words
 * appear in ordinary prose ("award 1 mark for each correct point"), and only a
 * header carries the colon. Without that the rule would flag guides whose band
 * descriptions happen to mention marks.
 */
const BAND_MID_LINE = /(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?\s*:/gi;

const topOfBand = (match: RegExpMatchArray): number =>
  match[2] ? parseInt(match[2]) : parseInt(match[1]);

/**
 * A marking guide that is not descending mark bands, one per line.
 *
 * Three ways to fail, and the second is the one this missed for as long as it
 * existed. It read only the START of each line, so a guide whose bands run
 * together on ONE line — "…as demonstrated in the investigation.4 marks:
 * Provides an accurate analysis…3 marks: Describes…" — showed it exactly one
 * band, which cannot be out of order and cannot be absent. Nine of the shipped
 * guides are written that way. Every one of them reported as well-formed, which
 * disabled both buttons that could have repaired it: "Reformat Guides" needs
 * this predicate, and "Write Marking Guides" needs it or a missing guide. A
 * curator who could see the guide was wrong had nothing in the studio to press.
 *
 * Widening the scan to bands anywhere in the text flags all nine, and re-running
 * it over the 418 shipped guides changed no other verdict.
 */
export const isNonStandardRubric = (criteria: string | undefined): boolean => {
  if (!criteria || criteria.trim().length <= 25) return false; // Handled by missing logic

  const bands: number[] = [];
  let bandsRunTogether = false;

  for (const line of criteria.split('\n')) {
    const head = line.match(BAND_AT_LINE_START);
    if (head) bands.push(topOfBand(head));

    // Anything after the line's own opening band is a band that should have
    // started a line of its own.
    const rest = head ? line.slice(head[0].length) : line;
    BAND_MID_LINE.lastIndex = 0;
    let inline: RegExpExecArray | null;
    while ((inline = BAND_MID_LINE.exec(rest)) !== null) {
      bandsRunTogether = true;
      bands.push(topOfBand(inline));
    }
  }

  // Text, but nothing that reads as a mark band at all.
  if (bands.length === 0) return true;
  // Bands present, but not laid out as bands.
  if (bandsRunTogether) return true;
  // Laid out, but climbing rather than descending.
  return bands.some((val, i) => i > 0 && val > bands[i - 1]);
};

/**
 * `createKeywordRegex` expands a term into its morphological variants and
 * compiles an alternation — real work, and it was being done once per prompt on
 * every rebuild of the tree, which is once per completed batch task. There are
 * about thirty distinct command verbs in the whole library, so the answer is
 * cached by verb.
 *
 * The `g` flag is dropped rather than carried: a global regex keeps `lastIndex`
 * between calls, so a shared instance would return alternating answers for the
 * same input. That is exactly why the call site used to rebuild the regex each
 * time; without `g` there is no state to share and the cache is safe.
 */
const verbTestCache = new Map<string, RegExp | null>();

const verbTestRegex = (verb: string): RegExp | null => {
  const cached = verbTestCache.get(verb);
  if (cached !== undefined) return cached;
  const source = createKeywordRegex([verb]);
  const compiled = source ? new RegExp(source.source, source.flags.replace(/g/g, '')) : null;
  verbTestCache.set(verb, compiled);
  return compiled;
};

/**
 * The library as an audit tree, grouped by faculty.
 *
 * Faculty is the top level because it is the unit a head teacher works in: the
 * ask that produced it was "let me fix all the science subjects at once", and
 * with courses at the top that meant ticking each one and hoping none was
 * missed. A faculty row selects its whole faculty in one click, rolls its
 * courses' coverage up into one figure, and collapses the rest of the library
 * out of the way while that faculty is being worked.
 *
 * Only faculties that actually have a course appear — an empty rail of the
 * eight NSW faculties would say nothing about this library — and they keep
 * `SUBJECT_AREAS` order rather than falling in import order, so a course
 * arriving does not reshuffle the tree under the cursor.
 */
export const buildAuditTree = (courses: Course[]): TreeNode[] => {
  const mapStats = (nodes: TreeNode[]): TreeNode['stats'] => {
    return nodes.reduce(
      (acc, node) => ({
        questions: acc.questions + node.stats.questions,
        samples: acc.samples + node.stats.samples,
        missingSamples: acc.missingSamples + node.stats.missingSamples,
        missingOutcomes: acc.missingOutcomes + node.stats.missingOutcomes,
        missingMarkingCriteria: acc.missingMarkingCriteria + node.stats.missingMarkingCriteria,
        rubricNotDescending: acc.rubricNotDescending + node.stats.rubricNotDescending,
        verbNotInQuestion: acc.verbNotInQuestion + node.stats.verbNotInQuestion,
        totalDotPoints: acc.totalDotPoints + node.stats.totalDotPoints,
        coveredDotPoints: acc.coveredDotPoints + node.stats.coveredDotPoints,
      }),
      {
        questions: 0,
        samples: 0,
        missingSamples: 0,
        missingOutcomes: 0,
        missingMarkingCriteria: 0,
        rubricNotDescending: 0,
        verbNotInQuestion: 0,
        totalDotPoints: 0,
        coveredDotPoints: 0,
      }
    );
  };

  const buildCourse = (course: Course): TreeNode => {
    const topics = (course.topics || []).map((topic) => {
      /**
       * The outcome codes a question in THIS topic may legitimately carry.
       *
       * A Year 11 question linked to an HSC outcome is a link that needs
       * fixing, and the audit exists to find exactly that — its own linking
       * task narrows to the year, so what it flags here it can also repair.
       * Lenient, so a course that has never labelled its outcomes is audited
       * precisely as it was before the years were split.
       */
      const validCodes = new Set(outcomesForYear(course, yearOfTopic(topic)).map((o) => o.code));
      const subTopics = (topic.subTopics || []).map((st) => {
        const dotPoints = (st.dotPoints || []).map((dp) => {
          const verbInfo = extractCommandVerb(dp.description);
          const prompts = (dp.prompts || []).map((p) => {
            // 1. Outcomes
            const validOutcomes = Array.isArray(p.linkedOutcomes)
              ? p.linkedOutcomes.filter(
                  (o) => typeof o === 'string' && o.trim().length > 0 && validCodes.has(o)
                )
              : [];

            // 2. Marking guide
            const hasRubric =
              typeof p.markingCriteria === 'string' && p.markingCriteria.trim().length > 25;
            const rubricNonStd = isNonStandardRubric(p.markingCriteria);

            // 3. Samples
            const validSamples = Array.isArray(p.sampleAnswers)
              ? p.sampleAnswers.filter(
                  (sa) => typeof sa.answer === 'string' && sa.answer.trim().length > 30
                )
              : [];

            // 4. The verb the question actually asks for. Matched with the
            //    SAME matcher that drives the highlighting, so the flag and the
            //    colour can never disagree about what counts as present.
            const verbRegex = p.verb ? verbTestRegex(p.verb) : null;
            const promptVerbIsAbsent =
              !!p.verb &&
              typeof p.question === 'string' &&
              p.question.trim().length > 0 &&
              !(verbRegex && verbRegex.test(p.question));

            return {
              id: p.id,
              parentId: dp.id,
              type: 'prompt' as NodeType,
              label: p.question,
              stats: {
                questions: 1,
                samples: validSamples.length,
                missingSamples: validSamples.length === 0 ? 1 : 0,
                missingOutcomes: validOutcomes.length === 0 ? 1 : 0,
                missingMarkingCriteria: !hasRubric ? 1 : 0,
                rubricNotDescending: rubricNonStd ? 1 : 0,
                verbNotInQuestion: promptVerbIsAbsent ? 1 : 0,
                totalDotPoints: 0,
                coveredDotPoints: 0,
              },
              dataRef: p,
              path: {
                courseId: course.id,
                topicId: topic.id,
                subTopicId: st.id,
                dotPointId: dp.id,
                promptId: p.id,
              },
            };
          });

          return {
            id: dp.id,
            parentId: st.id,
            type: 'dotPoint' as NodeType,
            label: dp.description,
            children: prompts,
            stats: {
              questions: prompts.length,
              samples: prompts.reduce((sum, p) => sum + p.stats.samples, 0),
              missingSamples: prompts.reduce((sum, p) => sum + p.stats.missingSamples, 0),
              missingOutcomes: prompts.reduce((sum, p) => sum + p.stats.missingOutcomes, 0),
              missingMarkingCriteria: prompts.reduce(
                (sum, p) => sum + p.stats.missingMarkingCriteria,
                0
              ),
              rubricNotDescending: prompts.reduce((sum, p) => sum + p.stats.rubricNotDescending, 0),
              verbNotInQuestion: prompts.reduce((sum, p) => sum + p.stats.verbNotInQuestion, 0),
              totalDotPoints: 1,
              coveredDotPoints: prompts.length > 0 ? 1 : 0,
            },
            verbInfo: verbInfo ? { term: verbInfo.term, tier: verbInfo.tier } : undefined,
            dataRef: dp,
            path: { courseId: course.id, topicId: topic.id, subTopicId: st.id, dotPointId: dp.id },
          };
        });

        return {
          id: st.id,
          parentId: topic.id,
          type: 'subTopic' as NodeType,
          label: st.name,
          children: dotPoints,
          stats: mapStats(dotPoints),
          dataRef: st,
          path: { courseId: course.id, topicId: topic.id, subTopicId: st.id },
        };
      });

      return {
        id: topic.id,
        parentId: course.id,
        type: 'topic' as NodeType,
        label: topic.name,
        children: subTopics,
        stats: mapStats(subTopics),
        dataRef: topic,
        path: { courseId: course.id, topicId: topic.id },
      };
    });

    return {
      id: course.id,
      parentId: facultyNodeId(subjectAreaOf(course)),
      type: 'course' as NodeType,
      label: course.name,
      children: topics,
      stats: mapStats(topics),
      dataRef: course,
      path: { courseId: course.id },
    };
  };

  const byArea = new Map<SubjectArea, Course[]>();
  courses.forEach((course) => {
    const area = subjectAreaOf(course);
    const bucket = byArea.get(area);
    if (bucket) bucket.push(course);
    else byArea.set(area, [course]);
  });

  return SUBJECT_AREAS.filter((area) => byArea.has(area)).map((area) => {
    const inArea = byArea.get(area) as Course[];
    const courseNodes = inArea.map(buildCourse);
    return {
      id: facultyNodeId(area),
      parentId: undefined,
      type: 'faculty' as NodeType,
      label: area,
      children: courseNodes,
      stats: mapStats(courseNodes),
      dataRef: { area, courses: inArea },
      path: {},
    };
  });
};
