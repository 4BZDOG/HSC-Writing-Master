/**
 * Read path: load the approved curriculum library from Supabase and map the
 * relational rows back into the app's nested `Course[]` shape (the inverse of
 * supabase/seed.mjs). The fetch filters to `status = 'approved'` so the shared
 * library shows only published content — pending/private drafts (which RLS
 * would still surface to their author or a reviewer) stay out of the tree and
 * live in the review queue instead.
 *
 * IndexedDB stays the offline cache; useSyllabusData treats Supabase as the
 * source of truth when configured and falls back to the cache on failure.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  Course,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  SampleAnswer,
  CourseOutcome,
  PromptVerb,
  PerformanceBandDescriptor,
} from '../types';

// --- Raw row shapes (snake_case, as stored in Postgres) ----------------------

interface CourseRow {
  id: string;
  legacy_id: string | null;
  name: string;
  subject: string | null;
}
interface OutcomeRow {
  course_id: string;
  code: string;
  description: string;
  position: number;
}
interface TopicRow {
  id: string;
  course_id: string;
  legacy_id: string | null;
  name: string;
  position: number;
  band_descriptors: PerformanceBandDescriptor[] | null;
}
interface SubTopicRow {
  id: string;
  topic_id: string;
  legacy_id: string | null;
  name: string;
  position: number;
}
interface DotPointRow {
  id: string;
  sub_topic_id: string;
  legacy_id: string | null;
  description: string;
  position: number;
}
interface PromptRow {
  id: string;
  dot_point_id: string;
  legacy_id: string | null;
  question: string;
  highlighted_question: string | null;
  total_marks: number;
  verb: string | null;
  scenario: string | null;
  marking_criteria: string | null;
  linked_outcomes: string[];
  related_topics: string[];
  prerequisite_knowledge: string[];
  marker_notes: string[];
  common_student_errors: string[];
  keywords: string[];
  target_performance_bands: number[];
  estimated_time: string | null;
  is_past_hsc: boolean;
  hsc_year: number | null;
  hsc_question_number: string | null;
}
interface SampleAnswerRow {
  id: string;
  prompt_id: string;
  legacy_id: string | null;
  band: number;
  mark: number;
  answer: string;
  source: SampleAnswer['source'] | null;
  feedback: string | null;
  quick_tip: string | null;
}

export interface CurriculumRows {
  courses: CourseRow[];
  outcomes: OutcomeRow[];
  topics: TopicRow[];
  subTopics: SubTopicRow[];
  dotPoints: DotPointRow[];
  prompts: PromptRow[];
  sampleAnswers: SampleAnswerRow[];
}

// --- Mapping helpers ---------------------------------------------------------

// App-facing id preserves the original JSON id (`legacy_id`) when present so
// deep links / cached data keep matching; otherwise the DB uuid is used.
const appId = (row: { legacy_id?: string | null; id: string }): string => row.legacy_id || row.id;

const groupBy = <T, K extends string>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
};

const byPosition = <T extends { position?: number }>(a: T, b: T): number =>
  (a.position ?? 0) - (b.position ?? 0);

// Guard against duplicate app-facing ids (React keys). Two rows can share a
// legacy_id if, e.g., a user contributes a copy of already-seeded content and
// both get approved; keep the first so the UI never renders duplicate keys.
const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
};

const mapSampleAnswer = (row: SampleAnswerRow): SampleAnswer => ({
  id: appId(row),
  band: row.band,
  mark: row.mark,
  answer: row.answer,
  source: row.source ?? 'AI',
  feedback: row.feedback ?? undefined,
  quickTip: row.quick_tip ?? undefined,
});

const mapPrompt = (row: PromptRow, answers: SampleAnswerRow[]): Prompt => ({
  id: appId(row),
  question: row.question,
  // Prototype content always carries a verb; fall back to a neutral one rather
  // than emit an invalid empty value if a row somehow lacks it.
  verb: (row.verb || 'EXPLAIN') as PromptVerb,
  totalMarks: row.total_marks ?? 0,
  highlightedQuestion: row.highlighted_question ?? undefined,
  scenario: row.scenario ?? undefined,
  markingCriteria: row.marking_criteria ?? undefined,
  linkedOutcomes: row.linked_outcomes ?? [],
  relatedTopics: row.related_topics ?? [],
  prerequisiteKnowledge: row.prerequisite_knowledge ?? [],
  markerNotes: row.marker_notes ?? [],
  commonStudentErrors: row.common_student_errors ?? [],
  keywords: row.keywords ?? [],
  targetPerformanceBands: row.target_performance_bands ?? [],
  estimatedTime: row.estimated_time ?? undefined,
  isPastHSC: row.is_past_hsc ?? false,
  hscYear: row.hsc_year ?? undefined,
  hscQuestionNumber: row.hsc_question_number ?? undefined,
  sampleAnswers: dedupeById(
    answers
      .slice()
      .sort((a, b) => a.band - b.band)
      .map(mapSampleAnswer)
  ),
});

/**
 * Pure assembler: turns the seven flat row sets into the nested `Course[]`
 * tree, wiring children to parents by foreign key and ordering by `position`.
 * Kept free of any Supabase/IO dependency so it can be unit-tested directly.
 */
export const assembleCourses = (rows: CurriculumRows): Course[] => {
  const answersByPrompt = groupBy(rows.sampleAnswers, (r) => r.prompt_id);
  const promptsByDot = groupBy(rows.prompts, (r) => r.dot_point_id);
  const dotsBySub = groupBy(rows.dotPoints, (r) => r.sub_topic_id);
  const subsByTopic = groupBy(rows.subTopics, (r) => r.topic_id);
  const topicsByCourse = groupBy(rows.topics, (r) => r.course_id);
  const outcomesByCourse = groupBy(rows.outcomes, (r) => r.course_id);

  const buildDotPoint = (row: DotPointRow): DotPoint => ({
    id: appId(row),
    description: row.description,
    // The prompts table has no position column; sort by id for a stable order.
    prompts: dedupeById(
      (promptsByDot.get(row.id) ?? [])
        .slice()
        .sort((a, b) => appId(a).localeCompare(appId(b)))
        .map((p) => mapPrompt(p, answersByPrompt.get(p.id) ?? []))
    ),
  });

  const buildSubTopic = (row: SubTopicRow): SubTopic => ({
    id: appId(row),
    name: row.name,
    dotPoints: (dotsBySub.get(row.id) ?? []).slice().sort(byPosition).map(buildDotPoint),
  });

  const buildTopic = (row: TopicRow): Topic => ({
    id: appId(row),
    name: row.name,
    performanceBandDescriptors: row.band_descriptors ?? [],
    subTopics: (subsByTopic.get(row.id) ?? []).slice().sort(byPosition).map(buildSubTopic),
  });

  const buildOutcome = (row: OutcomeRow): CourseOutcome => ({
    code: row.code,
    description: row.description,
  });

  return rows.courses.map((row) => ({
    id: appId(row),
    name: row.name,
    subject: row.subject ?? undefined,
    outcomes: (outcomesByCourse.get(row.id) ?? []).slice().sort(byPosition).map(buildOutcome),
    topics: (topicsByCourse.get(row.id) ?? []).slice().sort(byPosition).map(buildTopic),
  }));
};

// --- Remote fetch ------------------------------------------------------------

export const isCurriculumRemote = (): boolean => isSupabaseConfigured && Boolean(supabase);

/**
 * Loads the full visible curriculum from Supabase and assembles it into
 * `Course[]`. Fetches each table in parallel and joins in memory (rather than
 * deep PostgREST embeds) so ordering and RLS filtering stay simple. Throws on
 * any query error so the caller can fall back to the local cache.
 */
export const fetchRemoteCourses = async (): Promise<Course[]> => {
  if (!supabase) return [];
  const client = supabase;

  // The shared library view is the APPROVED content only. RLS would also return
  // a reviewer's view of every pending/private draft (and a user's own drafts),
  // which would pollute the curriculum tree — so filter to approved explicitly
  // on the status-bearing tables. Unpublished contributions live in the review
  // queue, not the library.
  const [courses, outcomes, topics, subTopics, dotPoints, prompts, sampleAnswers] =
    await Promise.all([
      client.from('courses').select('id, legacy_id, name, subject').eq('status', 'approved'),
      client.from('course_outcomes').select('course_id, code, description, position'),
      client.from('topics').select('id, course_id, legacy_id, name, position, band_descriptors'),
      client.from('sub_topics').select('id, topic_id, legacy_id, name, position'),
      client.from('dot_points').select('id, sub_topic_id, legacy_id, description, position'),
      client.from('prompts').select('*').eq('status', 'approved'),
      client.from('sample_answers').select('*').eq('status', 'approved'),
    ]);

  const results = [courses, outcomes, topics, subTopics, dotPoints, prompts, sampleAnswers];
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error(`Curriculum load failed: ${failed.error.message}`);
  }

  return assembleCourses({
    courses: (courses.data ?? []) as CourseRow[],
    outcomes: (outcomes.data ?? []) as OutcomeRow[],
    topics: (topics.data ?? []) as TopicRow[],
    subTopics: (subTopics.data ?? []) as SubTopicRow[],
    dotPoints: (dotPoints.data ?? []) as DotPointRow[],
    prompts: (prompts.data ?? []) as PromptRow[],
    sampleAnswers: (sampleAnswers.data ?? []) as SampleAnswerRow[],
  });
};
