import { Course, Topic, SubTopic, DotPoint, Prompt, StatePath } from '../../../types';
import { outcomesForYear, yearOfTopic } from '../../../utils/syllabusYear';
import { extractCommandVerb } from '../../../data/commandTerms';

/**
 * The audit tree's shared vocabulary — the node shape, the filter/action enums,
 * the "what counts as a gap" predicates, and the builder that turns the course
 * library into the annotated tree. Extracted from ContentAuditModal so the
 * predicates have a single home shared by the task assembly, the button target
 * counts, and the tree badges, and so the 2000-line modal is not also the
 * definition site for its data model.
 */

export type NodeType = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';

export interface TreeNode {
  id: string;
  parentId?: string;
  type: NodeType;
  label: string;
  children?: TreeNode[];
  stats: {
    questions: number;
    samples: number;
    enriched: number;
    missingOutcomes: number;
    missingMarkingCriteria: number;
    rubricNotDescending: number;
    totalDotPoints: number;
    coveredDotPoints: number;
  };
  verbInfo?: {
    term: string;
    tier: number;
  };
  dataRef: Course | Topic | SubTopic | DotPoint | Prompt;
  path: StatePath;
}

export type VisibilityFilter =
  | 'emptyDotPoints'
  | 'missingSamples'
  | 'unEnriched'
  | 'missingOutcomes'
  | 'missingRubrics'
  | 'rubricNotDescending'
  | 'hasSamples'
  | 'lowQuality'
  | 'flagged'
  | null;

export type BulkActionType =
  | 'generateQuestions'
  | 'generateSamples'
  | 'generateRubrics'
  | 'reviseRubrics'
  | 'linkOutcomes'
  | 'recalibrateSamples'
  | 'screenQuality'
  | 'fixAllGaps';

// Gap predicates shared by the task assembly, the button target counts, and
// the tree badges — one definition of "what counts as a gap".
export const isEmptyDotPoint = (n: TreeNode) => n.type === 'dotPoint' && n.stats.questions === 0;
export const needsSamples = (n: TreeNode) => n.type === 'prompt' && n.stats.samples === 0;
export const needsRubric = (n: TreeNode) =>
  n.type === 'prompt' && (n.stats.missingMarkingCriteria > 0 || n.stats.rubricNotDescending > 0);
export const hasNonStandardRubric = (n: TreeNode) =>
  n.type === 'prompt' && n.stats.rubricNotDescending > 0;
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

export const isNonStandardRubric = (criteria: string | undefined): boolean => {
  if (!criteria || criteria.trim().length <= 25) return false; // Handled by missing logic

  const lines = criteria.split('\n');
  let lastVal = Infinity;
  let foundAny = false;

  for (const line of lines) {
    // Look for lines starting with numbers (allowing bullets/dashes) followed by "mark"
    const match = line.match(/^\s*[-•*]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?/i);
    if (match) {
      foundAny = true;
      // Get the highest number in the range (e.g. "4-5 marks" -> 5)
      const val = match[2] ? parseInt(match[2]) : parseInt(match[1]);

      if (val > lastVal) return true; // Ascending order detected -> Non-standard
      lastVal = val;
    }
  }

  // If we have text but no standard "X marks" lines found, it's non-standard format
  return !foundAny;
};

export const buildAuditTree = (courses: Course[]): TreeNode[] => {
  const mapStats = (nodes: TreeNode[]): TreeNode['stats'] => {
    return nodes.reduce(
      (acc, node) => ({
        questions: acc.questions + node.stats.questions,
        samples: acc.samples + node.stats.samples,
        enriched: acc.enriched + node.stats.enriched,
        missingOutcomes: acc.missingOutcomes + node.stats.missingOutcomes,
        missingMarkingCriteria: acc.missingMarkingCriteria + node.stats.missingMarkingCriteria,
        rubricNotDescending: acc.rubricNotDescending + node.stats.rubricNotDescending,
        totalDotPoints: acc.totalDotPoints + node.stats.totalDotPoints,
        coveredDotPoints: acc.coveredDotPoints + node.stats.coveredDotPoints,
      }),
      {
        questions: 0,
        samples: 0,
        enriched: 0,
        missingOutcomes: 0,
        missingMarkingCriteria: 0,
        rubricNotDescending: 0,
        totalDotPoints: 0,
        coveredDotPoints: 0,
      }
    );
  };

  return courses.map((course) => {
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

            // 2. Keywords
            const validKeywords = Array.isArray(p.keywords)
              ? p.keywords.filter((k) => typeof k === 'string' && k.trim().length > 0)
              : [];

            // 3. Scenario
            const hasScenario = typeof p.scenario === 'string' && p.scenario.trim().length > 15;

            // 4. Rubric
            const hasRubric =
              typeof p.markingCriteria === 'string' && p.markingCriteria.trim().length > 25;
            const rubricNonStd = isNonStandardRubric(p.markingCriteria);

            // 5. Samples
            const validSamples = Array.isArray(p.sampleAnswers)
              ? p.sampleAnswers.filter(
                  (sa) => typeof sa.answer === 'string' && sa.answer.trim().length > 30
                )
              : [];

            const isEnriched = validKeywords.length > 0 && hasScenario;

            return {
              id: p.id,
              parentId: dp.id,
              type: 'prompt' as NodeType,
              label: p.question,
              stats: {
                questions: 1,
                samples: validSamples.length,
                enriched: isEnriched ? 1 : 0,
                missingOutcomes: validOutcomes.length === 0 ? 1 : 0,
                missingMarkingCriteria: !hasRubric ? 1 : 0,
                rubricNotDescending: rubricNonStd ? 1 : 0,
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
              enriched: prompts.reduce((sum, p) => sum + p.stats.enriched, 0),
              missingOutcomes: prompts.reduce((sum, p) => sum + p.stats.missingOutcomes, 0),
              missingMarkingCriteria: prompts.reduce(
                (sum, p) => sum + p.stats.missingMarkingCriteria,
                0
              ),
              rubricNotDescending: prompts.reduce((sum, p) => sum + p.stats.rubricNotDescending, 0),
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
      parentId: undefined,
      type: 'course' as NodeType,
      label: course.name,
      children: topics,
      stats: mapStats(topics),
      dataRef: course,
      path: { courseId: course.id },
    };
  });
};
