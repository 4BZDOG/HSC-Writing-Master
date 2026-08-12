import type { Course, CommandTermInfo, StatePath, Topic } from '../types';
import { extractCommandVerb, getCommandTermsForMarks } from '../data/commandTerms';
import { outcomesForYear, yearOfTopic } from './syllabusYear';

/**
 * Seeding a course does not finish at the structure.
 *
 * An imported syllabus gives topics, sub-topics and dot points — and no
 * questions, which is the one thing a student actually opens the app for. Until
 * now the only way to fill that in was the admin audit studio, reached
 * separately and built for auditing an existing library rather than finishing a
 * new one, or generating questions a dot point at a time through the picker.
 *
 * This module is the shared middle: which dot points still have nothing, and
 * what a sensible first question for one looks like.
 */

/** A dot point with no question yet, and everything needed to write one. */
export interface StarterTarget {
  path: StatePath;
  /** The syllabus point itself — what the question has to be about. */
  description: string;
  topicName: string;
  subTopicName: string;
}

export interface StarterPlan {
  targetMarks: number;
  verbs: CommandTermInfo[];
}

/**
 * The mark range a syllabus point's own command verb implies.
 *
 * NESA writes the demand into the dot point: "identify" is a two-mark ask and
 * "critically evaluate" is not. Generating every starter question at the same
 * weight would produce a course where the marks say nothing.
 */
const TIER_MARK_RANGES: Record<number, [number, number]> = {
  1: [1, 2],
  2: [3, 4],
  3: [4, 6],
  4: [5, 8],
  5: [6, 10],
  6: [8, 12],
};

/**
 * What to ask for a given syllabus point.
 *
 * `random` is injectable so a test can pin the mark rather than assert a range,
 * and so a batch does not have to be deterministic to be testable.
 */
export const planStarterQuestion = (
  description: string,
  random: () => number = Math.random
): StarterPlan => {
  const syllabusVerb = extractCommandVerb(description);
  if (!syllabusVerb) {
    // No verb to read: five marks is the middle of the range and the safest
    // default demand for a first question.
    return { targetMarks: 5, verbs: getCommandTermsForMarks(5).terms };
  }

  const [low, high] = TIER_MARK_RANGES[syllabusVerb.tier] || [4, 8];
  const targetMarks = Math.floor(random() * (high - low + 1)) + low;
  const { terms } = getCommandTermsForMarks(targetMarks);
  // The dot point's own verb leads, even when the mark band would not have
  // offered it — the syllabus said what kind of thinking this point is for.
  const verbs = terms.find((v) => v.term === syllabusVerb.term) ? terms : [syllabusVerb, ...terms];
  return { targetMarks, verbs };
};

/**
 * Every dot point in scope that has no question at all.
 *
 * Dot points that already have one are skipped rather than topped up: this is
 * the "make the course usable" pass, not the "make it deep" one, and running it
 * twice should be free rather than doubling the bank.
 */
export const findStarterTargets = (
  course: Course | undefined,
  scope?: { topicId?: string }
): StarterTarget[] => {
  if (!course) return [];
  const topics = scope?.topicId
    ? course.topics.filter((t) => t.id === scope.topicId)
    : course.topics;

  const targets: StarterTarget[] = [];
  for (const topic of topics) {
    for (const subTopic of topic.subTopics || []) {
      for (const dotPoint of subTopic.dotPoints || []) {
        if ((dotPoint.prompts || []).length > 0) continue;
        targets.push({
          path: {
            courseId: course.id,
            topicId: topic.id,
            subTopicId: subTopic.id,
            dotPointId: dotPoint.id,
          },
          description: dotPoint.description,
          topicName: topic.name,
          subTopicName: subTopic.name,
        });
      }
    }
  }
  return targets;
};

/** The outcomes a starter question for this topic may be linked to. */
export const starterOutcomes = (course: Course, topic: Topic | undefined) =>
  outcomesForYear(course, yearOfTopic(topic));

/** How much of a course already has questions, as a fraction of its dot points. */
export interface CoverageCount {
  dotPoints: number;
  withQuestions: number;
}

export const questionCoverage = (
  course: Pick<Course, 'topics'> | undefined,
  scope?: { topicId?: string }
): CoverageCount => {
  const topics = scope?.topicId
    ? (course?.topics ?? []).filter((t) => t.id === scope.topicId)
    : (course?.topics ?? []);

  let dotPoints = 0;
  let withQuestions = 0;
  for (const topic of topics) {
    for (const subTopic of topic.subTopics || []) {
      for (const dotPoint of subTopic.dotPoints || []) {
        dotPoints += 1;
        if ((dotPoint.prompts || []).length > 0) withQuestions += 1;
      }
    }
  }
  return { dotPoints, withQuestions };
};
