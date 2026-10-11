// scripts/pdfSamples/demoReports.ts
//
// The progress-report sample set, built from the demo accounts' own data rather
// than from invented fixtures, so a sample says what a real demo teacher or
// administrator would see. Everything here is pure: the course files are passed
// in, nothing is read from disk, and the clock is injected.
//
// Three parts:
//
//   * the cohort, exactly as supabase/demoSeed.mjs generates it (same course
//     order, same students, same PRNG seed), so the attempts match the database;
//   * `emulateProgressReportPayload`, a faithful port of `get_progress_report()`
//     (supabase/schema.sql §26) that reads the cohort instead of the database.
//     Every rule it applies is cited to the SQL line it mirrors;
//   * the sample definitions: 23 reports across the student, teacher and school
//     audiences, each built with the same builders and ReportOptions the UI uses.
//
// Driven by ./generateDemoReports (the runner), which renders each sample with the
// real exporter. Tested in tests/unit/demoReports.test.ts.

import type { PromptVerb, UserStats } from '../../types';
import type { ProgressReport, ReportSections, ReportSubject } from '../../pdf/reportModel';
import type {
  CohortVerbRow,
  CohortWeekRow,
  ProgressReportPayload,
  ProgressReportWeekRow,
} from '../../services/responseService';
import type { OwnAttempt } from '../../utils/profileHistory';
import {
  buildSchoolReport,
  buildStudentReport,
  buildTeacherReport,
  type ReportCourseFilter,
  type ReportOptions,
} from '../../utils/progressReport';
import { defaultSectionsFor } from '../../utils/progressReportOptions';
import {
  DEMO_CLASSES,
  DEMO_PLAN_STUDENT_HISTORY,
  DEMO_SCHOOL_NAME,
  DEMO_STUDENTS,
  generateCohort,
  latestPerPrompt,
  promptPoolFromCourse,
  type DemoAttempt,
  type DemoCohort,
  type DemoPromptRef,
  type DemoStudentSpec,
} from '../../utils/demoCohort';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** The label `get_progress_report()` gives a question with no command verb. */
const UNSPECIFIED = 'Unspecified';
/** The label it gives a course or topic with no usable name. */
const UNCATEGORISED = 'Uncategorised';

// --- Demo identity -----------------------------------------------------------

/** The two demo courses, by the key demoCohort.ts uses for them. */
export type DemoCourseKey = 'enterprise' | 'software';

/** The course file each key is read from. Mirrors COURSE_FILES in supabase/demoSeed.mjs. */
export const DEMO_COURSE_FILES: Record<DemoCourseKey, string> = {
  enterprise: 'HSCEnterpriseComputing09122025.json',
  software: 'HSCSoftwareEngineering09122025.json',
};

/** The two demo classes' stable ids. They stand in for `classes.id`, which is a database uuid. */
export const DEMO_CLASS_IDS = {
  enterprise: 'class-enterprise',
  software: 'class-software',
} as const;

/**
 * The plan-state accounts that are enrolled in classes. Mirrors PLAN_STATE_STUDENTS
 * in supabase/demoSeed.mjs; that file runs its seed when imported, so its list is
 * copied here rather than imported. Ben (demo.capped) is enrolled but has no
 * history, which is why he is absent from DEMO_PLAN_STUDENT_HISTORY.
 */
const PLAN_STATE_ENROLMENTS: { username: string; classKeys: string[] }[] = [
  { username: 'demo.free', classKeys: ['enterprise'] },
  { username: 'demo.plus', classKeys: ['enterprise', 'software'] },
  { username: 'demo.capped', classKeys: ['enterprise'] },
];

/** Display names the seed gives the staff and Ben. Mirrors demoSeed.mjs. */
const STAFF_DISPLAY_NAMES: Record<string, string> = {
  'demo.admin': 'Demo Administrator',
  'demo.teacher': 'Ms Bennett (Demo)',
  'demo.coteacher': 'Mr Okafor (Demo)',
};
const BEN_DISPLAY_NAME = 'Ben (Demo, Capped)';

/** Everyone who writes answers in the demo, cohort and plan-state alike. */
export const DEMO_HISTORY_STUDENTS: DemoStudentSpec[] = [
  ...DEMO_STUDENTS,
  ...DEMO_PLAN_STUDENT_HISTORY,
];

// --- Course trees ------------------------------------------------------------

/** The part of a course JSON file the emulator and the question pool read. */
export interface DemoCourseTree {
  id: string;
  name: string;
  topics?: DemoTopicNode[];
}

interface DemoTopicNode {
  id?: string;
  name: string;
  subTopics?: { dotPoints?: { prompts?: DemoPromptNode[] }[] }[];
}

interface DemoPromptNode {
  id: string;
  question: string;
  verb?: PromptVerb;
  totalMarks?: number;
}

/** One question as the database holds it after supabase/seed.mjs has imported its course. */
export interface CurriculumPrompt {
  courseId: string;
  courseName: string;
  topicId: string;
  topicName: string;
  /** The trimmed verb as stored, or null when the question has none. */
  verb: string | null;
  /** `prompts.total_marks`: the JSON's totalMarks, or 0 when absent. */
  totalMarks: number;
}

const textOr = (value: string | undefined, fallback: string): string =>
  value !== undefined && value.trim() !== '' ? value.trim() : fallback;

/**
 * Every question in the course trees, keyed by its id. Throws on a duplicate id,
 * because the database keys questions by legacy id and a clash would make the
 * emulation pick one of two questions silently.
 */
export const indexCurriculum = (trees: DemoCourseTree[]): Map<string, CurriculumPrompt> => {
  const index = new Map<string, CurriculumPrompt>();
  for (const tree of trees) {
    for (const topic of tree.topics ?? []) {
      for (const sub of topic.subTopics ?? []) {
        for (const dotPoint of sub.dotPoints ?? []) {
          for (const prompt of dotPoint.prompts ?? []) {
            if (index.has(prompt.id)) {
              throw new Error(`demoReports: question id ${prompt.id} appears twice`);
            }
            const verb = prompt.verb?.trim() ? prompt.verb.trim() : null;
            index.set(prompt.id, {
              courseId: tree.id,
              courseName: textOr(tree.name, UNCATEGORISED),
              topicId: topic.id ?? topic.name,
              topicName: textOr(topic.name, UNCATEGORISED),
              verb,
              totalMarks: prompt.totalMarks ?? 0,
            });
          }
        }
      }
    }
  }
  return index;
};

/**
 * The question pool the cohort draws from, in the order supabase/demoSeed.mjs
 * builds it: enterprise first, then software, each in course-file order. The order
 * is load-bearing: the PRNG picks questions by index, so a different order
 * produces different attempts.
 */
export const buildQuestionPool = (trees: Record<DemoCourseKey, DemoCourseTree>): DemoPromptRef[] =>
  (Object.keys(DEMO_COURSE_FILES) as DemoCourseKey[]).flatMap((key) =>
    promptPoolFromCourse(trees[key], key)
  );

// --- Cohort -------------------------------------------------------------------

/** The cohort the seed writes: the same students, the same seed, the same question pool. */
export const generateDemoCohort = (trees: Record<DemoCourseKey, DemoCourseTree>): DemoCohort =>
  generateCohort({ prompts: buildQuestionPool(trees), students: DEMO_HISTORY_STUDENTS });

/** A demo class as the emulator reads it: who owns it, co-teaches it and is enrolled in it. */
export interface DemoClassRoster {
  id: string;
  name: string;
  year: number | null;
  /** The course the class studies (`classes.course_id`), by its app id, and its name. */
  courseId: string | null;
  courseName: string | null;
  ownerUsername: string;
  coTeacherUsernames: string[];
  /** Enrolled as role 'student'. Students with no answers are listed too. */
  studentUsernames: string[];
}

/**
 * The two demo classes with their enrolments, read from the same lists the seed uses.
 * Each is bound to the course it studies, as the seed binds `classes.course_id`.
 */
export const demoClassRosters = (
  trees: Record<DemoCourseKey, DemoCourseTree>
): DemoClassRoster[] => {
  const enrolled: { username: string; classKeys?: string[] }[] = [
    ...DEMO_STUDENTS,
    ...PLAN_STATE_ENROLMENTS,
  ];
  return DEMO_CLASSES.map((spec) => ({
    id: DEMO_CLASS_IDS[spec.key as DemoCourseKey],
    name: spec.name,
    year: spec.year,
    courseId: trees[spec.course as DemoCourseKey].id,
    courseName: trees[spec.course as DemoCourseKey].name,
    ownerUsername: spec.ownerUsername,
    coTeacherUsernames: spec.coTeacherUsername ? [spec.coTeacherUsername] : [],
    studentUsernames: enrolled
      .filter((s) => s.classKeys?.includes(spec.key))
      .map((s) => s.username),
  }));
};

/** Profile display names by username: what `profiles.display_name` holds. */
export const demoUserDirectory = (): Record<string, { displayName: string }> => {
  const directory: Record<string, { displayName: string }> = {};
  for (const s of [...DEMO_STUDENTS, ...DEMO_PLAN_STUDENT_HISTORY]) {
    directory[s.username] = { displayName: s.displayName };
  }
  directory['demo.capped'] = { displayName: BEN_DISPLAY_NAME };
  for (const [username, displayName] of Object.entries(STAFF_DISPLAY_NAMES)) {
    directory[username] = { displayName };
  }
  return directory;
};

/**
 * One answer as `response_events` holds it: every attempt, not only the latest.
 * The `at` is `now` minus whole days, as the seed writes it (isoDaysAgo).
 */
export const toOwnAttempt = (
  attempt: DemoAttempt,
  curriculum: Map<string, CurriculumPrompt>,
  now: Date
): OwnAttempt => {
  const q = curriculum.get(attempt.promptId);
  if (!q) throw new Error(`demoReports: question ${attempt.promptId} is not in the course files`);
  const course = { id: q.courseId, legacyId: q.courseId, name: q.courseName };
  return {
    at: new Date(now.getTime() - attempt.daysAgo * DAY_MS).toISOString(),
    band: attempt.band,
    mark: attempt.mark,
    totalMarks: q.totalMarks > 0 ? q.totalMarks : null,
    verb: q.verb ? q.verb.toUpperCase() : null,
    wordCount: attempt.wordCount,
    course,
    topic: { name: q.topicName, course },
  };
};

/** A student's full history, oldest first, as `fetchMyReportHistory` returns it. */
export const ownHistoryOf = (
  cohort: DemoCohort,
  username: string,
  curriculum: Map<string, CurriculumPrompt>,
  now: Date
): OwnAttempt[] =>
  cohort.attempts
    .filter((a) => a.username === username)
    .map((a) => toOwnAttempt(a, curriculum, now))
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));

// --- The get_progress_report() emulator ---------------------------------------

/** What the emulator needs. Each field names the database input it stands in for. */
export interface EmulateProgressInput {
  /** Every attempt, as the seed writes them. The emulator keeps the latest per (student, question), as `responses` does. */
  attempts: DemoAttempt[];
  /** Display name by username: the `profiles` join. */
  userDirectory: Record<string, { displayName: string }>;
  /** Every class in the school, with its staff and students. */
  classes: DemoClassRoster[];
  /** The course trees the questions come from: the curriculum joins. */
  courseTree: DemoCourseTree[];
  /** Days back from `now`. Clamped to 1–365, as the SQL does. */
  windowDays: number;
  /** The class the report is limited to, or null for every class the viewer can see. */
  classId: string | null;
  /** The course the report is limited to, by its app id, or null for every course. */
  courseId: string | null;
  now: Date;
  /** The viewer is an administrator (`is_admin()`). */
  asAdmin: boolean;
  /** The viewer's username (`auth.uid()`), for class visibility. */
  viewerUsername: string;
}

interface ScopedAnswer {
  username: string;
  createdMs: number;
  band: number;
  /** mark / total_marks, or null when the question carries no marks. */
  markFrac: number | null;
  verb: string;
  courseId: string;
  courseName: string;
  topicId: string;
  topicName: string;
  week: number;
}

/**
 * Postgres `round(x::numeric, places)`: half away from zero. The value is first
 * rounded to 12 significant digits so a float such as 62.49999999999999 does not
 * round down where the exact decimal is 62.5.
 */
export const roundNumeric = (x: number, places: number): number => {
  const scale = 10 ** places;
  const scaled = Number((x * scale).toPrecision(12));
  return (Math.sign(scaled) * Math.round(Math.abs(scaled))) / scale;
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const roundedMean = (values: number[], places: number): number | null => {
  const m = mean(values);
  return m === null ? null : roundNumeric(m, places);
};

const isoOrNull = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString();

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const groupBy = <T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
};

interface Metrics {
  attempts: number;
  students: number;
  avg_band: number | null;
  avg_mark_frac: number | null;
}

/** The count and averages every collection in the payload carries. */
const metricsOf = (rows: ScopedAnswer[]): Metrics => ({
  attempts: rows.length,
  students: new Set(rows.map((r) => r.username)).size,
  avg_band: roundedMean(
    rows.map((r) => r.band),
    2
  ),
  avg_mark_frac: roundedMean(
    rows.flatMap((r) => (r.markFrac === null ? [] : [r.markFrac])),
    3
  ),
});

/**
 * A port of `get_progress_report()` (supabase/schema.sql §26) that reads the demo
 * cohort. The rules, each cited to the SQL it mirrors:
 *
 *   - the window: `p_days` clamped to 1–365; `weeks` = ceil(days / 7); `since` = now
 *     minus the window (analytics_window_start). An answer counts when created_at >=
 *     since (`r.created_at >= v_since`).
 *   - the answers: one per (student, question), the latest attempt (`responses` has
 *     a unique index on that pair), with a band (`overall_band is not null`).
 *   - the scope: an admin with no class sees every answer (`v_all`); anyone else sees
 *     the students enrolled as 'student' in the classes they can view (owner or
 *     co-teacher), or in the named class (`visible_student_ids`, which raises for a
 *     class the viewer cannot see).
 *   - the course filter narrows every collection, not only the totals.
 *   - `week` is min(weeks - 1, floor((created_at - since) / 7 days)), so week 0 is the
 *     oldest.
 *   - `byClass` is present only when no class is named. It lists every class the
 *     viewer can see, including empty ones, and a student in two classes is counted in
 *     each (`left join` on the class's students).
 *   - averages are rounded half away from zero: `avg_band` to 2 places, `avg_mark_frac`
 *     to 3. A null mark share is left out of its average; a question with no marks
 *     contributes nothing to `avg_mark_frac`.
 *
 * The result is shaped as `normaliseProgressPayload` would hand it to the builders.
 */
export const emulateProgressReportPayload = (
  input: EmulateProgressInput
): ProgressReportPayload => {
  const nowMs = input.now.getTime();
  const curriculum = indexCurriculum(input.courseTree);

  const days = Math.min(365, Math.max(1, Math.trunc(input.windowDays)));
  const weeks = Math.ceil(days / 7);
  const sinceMs = nowMs - days * DAY_MS;

  const canView = (c: DemoClassRoster): boolean =>
    input.asAdmin ||
    c.ownerUsername === input.viewerUsername ||
    c.coTeacherUsernames.includes(input.viewerUsername);

  const vAll = input.asAdmin && input.classId === null;
  if (input.classId !== null) {
    const named = input.classes.find((c) => c.id === input.classId);
    if (!named) throw new Error(`emulateProgressReportPayload: no class ${input.classId}`);
    if (!canView(named)) throw new Error('You do not teach that class');
  }
  // Per answer, as get_progress_report() scopes it: a class the viewer can see (and
  // the named one, when a class is named), in which the student is enrolled, whose
  // course is none or this answer's own course. An admin with no class named sees all.
  const inScope = (username: string, courseId: string): boolean =>
    vAll ||
    input.classes.some(
      (c) =>
        canView(c) &&
        (input.classId === null || c.id === input.classId) &&
        c.studentUsernames.includes(username) &&
        (c.courseId === null || c.courseId === courseId)
    );

  // A named class bound to a course fixes the course (classes.course_id), and a
  // different course filter matches nothing. Mirrors get_progress_report().
  const namedClass =
    input.classId === null ? null : (input.classes.find((c) => c.id === input.classId) ?? null);
  const classCourseId = namedClass?.courseId ?? null;
  const classCourseName = namedClass?.courseName ?? null;
  const courseId = classCourseId ?? input.courseId;
  const mismatch =
    classCourseId !== null && input.courseId !== null && input.courseId !== classCourseId;

  const scoped: ScopedAnswer[] = [];
  for (const attempt of latestPerPrompt(input.attempts)) {
    const q = curriculum.get(attempt.promptId);
    if (!q) continue; // every join in the SQL is inner
    const createdMs = nowMs - attempt.daysAgo * DAY_MS;
    if (createdMs < sinceMs) continue;
    if (!inScope(attempt.username, q.courseId)) continue;
    if (mismatch) continue;
    if (courseId !== null && q.courseId !== courseId) continue;
    scoped.push({
      username: attempt.username,
      createdMs,
      band: attempt.band,
      markFrac: q.totalMarks > 0 ? attempt.mark / q.totalMarks : null,
      verb: q.verb ?? UNSPECIFIED,
      courseId: q.courseId,
      courseName: q.courseName,
      topicId: q.topicId,
      topicName: q.topicName,
      week: Math.min(weeks - 1, Math.floor((createdMs - sinceMs) / WEEK_MS)),
    });
  }

  const displayNameOf = (username: string): string => {
    const entry = input.userDirectory[username];
    if (!entry) throw new Error(`emulateProgressReportPayload: no profile for ${username}`);
    return entry.displayName;
  };

  const overall = metricsOf(scoped);
  const totals: ProgressReportPayload['totals'] = {
    attempts: overall.attempts,
    active_students: overall.students,
    avg_band: overall.avg_band,
    avg_mark_frac: overall.avg_mark_frac,
    first_attempt_at: isoOrNull(scoped.length ? Math.min(...scoped.map((r) => r.createdMs)) : null),
    last_attempt_at: isoOrNull(scoped.length ? Math.max(...scoped.map((r) => r.createdMs)) : null),
  };

  const byVerb = [...groupBy(scoped, (r) => r.verb)]
    .map(([label, rows]) => ({ label, ...metricsOf(rows) }))
    .sort((a, b) => compareText(a.label, b.label));

  const byCourse = [...groupBy(scoped, (r) => r.courseId)]
    .map(([courseId, rows]) => ({
      course_id: courseId,
      label: rows[0].courseName,
      ...metricsOf(rows),
    }))
    .sort((a, b) => compareText(a.label, b.label));

  const byTopic = [...groupBy(scoped, (r) => `${r.courseId}\u0000${r.topicId}`)]
    .map(([, rows]) => ({
      topic_id: rows[0].topicId,
      course_id: rows[0].courseId,
      course: rows[0].courseName,
      label: rows[0].topicName,
      ...metricsOf(rows),
    }))
    .sort((a, b) => compareText(a.label, b.label) || compareText(a.course, b.course));

  const byStudent = [...groupBy(scoped, (r) => r.username)]
    .map(([username, rows]) => {
      const m = metricsOf(rows);
      return {
        username,
        display_name: displayNameOf(username),
        attempts: m.attempts,
        avg_band: m.avg_band,
        avg_mark_frac: m.avg_mark_frac,
        last_active: isoOrNull(Math.max(...rows.map((r) => r.createdMs))),
      };
    })
    .sort((a, b) => compareText(a.username, b.username));

  const byStudentVerb: CohortVerbRow[] = [...groupBy(scoped, (r) => `${r.username}\u0000${r.verb}`)]
    .map(([, rows]) => {
      const m = metricsOf(rows);
      return {
        username: rows[0].username,
        verb: rows[0].verb,
        attempts: m.attempts,
        avg_band: m.avg_band,
        avg_mark_frac: m.avg_mark_frac,
      };
    })
    .sort((a, b) => compareText(a.username, b.username) || compareText(a.verb, b.verb));

  const byStudentWeek: CohortWeekRow[] = [...groupBy(scoped, (r) => `${r.username}\u0000${r.week}`)]
    .map(([, rows]) => {
      const m = metricsOf(rows);
      return {
        username: rows[0].username,
        week: rows[0].week,
        attempts: m.attempts,
        avg_band: m.avg_band,
        avg_mark_frac: m.avg_mark_frac,
      };
    })
    .sort((a, b) => compareText(a.username, b.username) || a.week - b.week);

  const weekly: ProgressReportWeekRow[] = [...groupBy(scoped, (r) => String(r.week))]
    .map(([, rows]) => {
      const m = metricsOf(rows);
      return {
        week: rows[0].week,
        attempts: m.attempts,
        avg_band: m.avg_band,
        avg_mark_frac: m.avg_mark_frac,
      };
    })
    .sort((a, b) => a.week - b.week);

  const payload: ProgressReportPayload = {
    days,
    weeks,
    totals,
    byVerb,
    byCourse,
    byTopic,
    byStudent,
    byStudentVerb,
    byStudentWeek,
    weekly,
  };

  payload.classCourse =
    classCourseId !== null && classCourseName !== null
      ? { course_id: classCourseId, name: classCourseName }
      : null;

  if (input.classId === null) {
    payload.byClass = input.classes
      .filter(canView)
      .map((c) => {
        const members = new Set(c.studentUsernames);
        // A class bound to its course counts only that course's answers.
        const own = scoped.filter(
          (r) => members.has(r.username) && (c.courseId === null || r.courseId === c.courseId)
        );
        return {
          class_id: c.id,
          name: c.name,
          year: c.year,
          course: c.courseName,
          ...metricsOf(own),
        };
      })
      .sort((a, b) => compareText(a.name, b.name) || compareText(a.class_id, b.class_id));
  }

  return payload;
};

/**
 * The result strip as the page prints it, in one line: "Answers marked: 42 · Avg
 * band: 3.4 · …". The runner prints it beside each page count, so the numbers can
 * be checked without opening the PDF.
 */
export const sampleSummary = (report: ProgressReport): string =>
  report.headline.map((stat) => `${stat.label}: ${stat.value}`).join(' · ');

// --- Sample set ---------------------------------------------------------------

export type DemoPageSize = 'a4' | 'letter';

/** One sample: the file stem, the paper, and the report the exporter draws. */
export interface DemoReportSample {
  name: string;
  pageSize: DemoPageSize;
  report: ProgressReport;
}

const STUDENT_ROLE = 'Student';
const TEACHER_ROLE = 'Teacher';
const ADMIN_ROLE = 'Administrator';

/** The course filter for a demo course, by its app id and name. */
const courseFilterOf = (tree: DemoCourseTree): ReportCourseFilter => ({
  id: tree.id,
  name: tree.name,
});

interface SampleContext {
  cohort: DemoCohort;
  curriculum: Map<string, CurriculumPrompt>;
  trees: Record<DemoCourseKey, DemoCourseTree>;
  classes: DemoClassRoster[];
  directory: Record<string, { displayName: string }>;
  now: Date;
  generatedAt: string;
}

/** Options shared by every sample: the report's clock and the viewer's sections. */
const baseOptions = (
  ctx: SampleContext,
  audience: ReportOptions['audience'],
  subject: ReportSubject,
  overrides: Partial<ReportOptions>
): ReportOptions => ({
  audience,
  windowDays: 90,
  courseFilter: null,
  className: null,
  includeStudentNames: true,
  sections: defaultSectionsFor(audience),
  subject,
  generatedAt: ctx.generatedAt,
  ...overrides,
});

const studentSubject = (displayName: string): ReportSubject => ({
  name: displayName,
  roleLabel: STUDENT_ROLE,
  school: DEMO_SCHOOL_NAME,
});

const teacherSubject = (username: string, ctx: SampleContext): ReportSubject => ({
  name: ctx.directory[username].displayName,
  roleLabel: TEACHER_ROLE,
  school: DEMO_SCHOOL_NAME,
});

const schoolSubject: ReportSubject = {
  name: DEMO_SCHOOL_NAME,
  roleLabel: ADMIN_ROLE,
  school: null,
};

interface StudentSampleSpec {
  username: string;
  windowDays: number | 'all';
  course?: DemoCourseKey;
  sections?: ReportSections;
  /** 'local' is an offline copy with no online history; 'stored' reads the history. */
  source?: 'stored' | 'local';
}

const studentReport = (ctx: SampleContext, spec: StudentSampleSpec): ProgressReport => {
  const displayName = ctx.directory[spec.username].displayName;
  const history =
    spec.source === 'local'
      ? null
      : ownHistoryOf(ctx.cohort, spec.username, ctx.curriculum, ctx.now);
  const stats: UserStats | undefined = ctx.cohort.stats[spec.username];
  return buildStudentReport({
    stats,
    history,
    options: baseOptions(ctx, 'student', studentSubject(displayName), {
      windowDays: spec.windowDays,
      courseFilter: spec.course ? courseFilterOf(ctx.trees[spec.course]) : null,
      sections: spec.sections ?? defaultSectionsFor('student'),
    }),
  });
};

interface RosterSampleSpec {
  /** The viewer: demo.teacher, demo.coteacher or demo.admin. */
  viewer: string;
  windowDays: number;
  classKey?: DemoCourseKey;
  course?: DemoCourseKey;
  includeStudentNames?: boolean;
}

/** The class a roster sample is limited to, as the UI names it (ReportOptions.className). */
const classNameOf = (ctx: SampleContext, key: DemoCourseKey): string => {
  const roster = ctx.classes.find((c) => c.id === DEMO_CLASS_IDS[key]);
  if (!roster) throw new Error(`demoReports: no class for ${key}`);
  return roster.name;
};

const rosterPayload = (ctx: SampleContext, spec: RosterSampleSpec): ProgressReportPayload =>
  emulateProgressReportPayload({
    attempts: ctx.cohort.attempts,
    userDirectory: ctx.directory,
    classes: ctx.classes,
    courseTree: [ctx.trees.enterprise, ctx.trees.software],
    windowDays: spec.windowDays,
    classId: spec.classKey ? DEMO_CLASS_IDS[spec.classKey] : null,
    courseId: spec.course ? ctx.trees[spec.course].id : null,
    now: ctx.now,
    asAdmin: spec.viewer === 'demo.admin',
    viewerUsername: spec.viewer,
  });

const teacherReport = (ctx: SampleContext, spec: RosterSampleSpec): ProgressReport => {
  const className = spec.classKey ? classNameOf(ctx, spec.classKey) : null;
  return buildTeacherReport({
    payload: rosterPayload(ctx, spec),
    options: baseOptions(ctx, 'teacher', teacherSubject(spec.viewer, ctx), {
      windowDays: spec.windowDays,
      courseFilter: spec.course ? courseFilterOf(ctx.trees[spec.course]) : null,
      className,
      includeStudentNames: spec.includeStudentNames ?? true,
    }),
  });
};

const schoolReport = (ctx: SampleContext, spec: RosterSampleSpec): ProgressReport =>
  buildSchoolReport({
    payload: rosterPayload(ctx, spec),
    options: baseOptions(ctx, 'school', schoolSubject, {
      windowDays: spec.windowDays,
      courseFilter: spec.course ? courseFilterOf(ctx.trees[spec.course]) : null,
      includeStudentNames: spec.includeStudentNames ?? true,
    }),
  });

/** Every sample, in the order the report lists them. */
export const buildDemoReportSamples = ({
  trees,
  now,
}: {
  trees: Record<DemoCourseKey, DemoCourseTree>;
  now: Date;
}): DemoReportSample[] => {
  const cohort = generateDemoCohort(trees);
  const curriculum = indexCurriculum([trees.enterprise, trees.software]);
  const ctx: SampleContext = {
    cohort,
    curriculum,
    trees,
    classes: demoClassRosters(trees),
    directory: demoUserDirectory(),
    now,
    generatedAt: now.toISOString(),
  };

  const sectionsWithout = (...keys: (keyof ReportSections)[]): ReportSections => {
    const sections = { ...defaultSectionsFor('student') };
    for (const key of keys) sections[key] = false;
    return sections;
  };

  const student = (
    name: string,
    spec: StudentSampleSpec
  ): { name: string; pageSize: DemoPageSize; report: ProgressReport } => ({
    name,
    pageSize: 'a4',
    report: studentReport(ctx, spec),
  });

  return [
    student('01-student-aisha-improver-90d', { username: 'demo.aisha', windowDays: 90 }),
    student('02-student-jayden-plateaued-90d', { username: 'demo.jayden', windowDays: 90 }),
    student('03-student-olivia-verb-blocked-90d', { username: 'demo.olivia', windowDays: 90 }),
    student('04-student-zara-sporadic-90d', { username: 'demo.zara', windowDays: 90 }),
    student('05-student-chen-strong-all-time', { username: 'demo.chen', windowDays: 'all' }),
    student('06-student-kayla-at-risk-90d', { username: 'demo.kayla', windowDays: 90 }),
    student('07-student-mateo-newcomer-30d', { username: 'demo.mateo', windowDays: 30 }),
    student('08-student-ethan-both-courses-90d', { username: 'demo.ethan', windowDays: 90 }),
    student('09-student-ethan-software-filter-90d', {
      username: 'demo.ethan',
      windowDays: 90,
      course: 'software',
    }),
    student('10-student-ethan-enterprise-filter-90d', {
      username: 'demo.ethan',
      windowDays: 90,
      course: 'enterprise',
    }),
    {
      name: '11-student-ava-plus-all-time-letter',
      pageSize: 'letter',
      report: studentReport(ctx, { username: 'demo.plus', windowDays: 'all' }),
    },
    student('12-student-ben-empty-history', { username: 'demo.capped', windowDays: 'all' }),
    student('12b-student-sam-local-stats-only', {
      username: 'demo.free',
      windowDays: 'all',
      source: 'local',
    }),
    student('13-student-sam-light-history-30d', { username: 'demo.free', windowDays: 30 }),
    student('14-student-hana-charts-and-tiers', {
      username: 'demo.hana',
      windowDays: 90,
      sections: sectionsWithout('courses', 'topics', 'verbs', 'recent'),
    }),
    {
      name: '15-teacher-bennett-enterprise-named-90d',
      pageSize: 'a4',
      report: teacherReport(ctx, {
        viewer: 'demo.teacher',
        windowDays: 90,
        classKey: 'enterprise',
      }),
    },
    {
      name: '16-teacher-bennett-enterprise-anonymised-90d',
      pageSize: 'a4',
      report: teacherReport(ctx, {
        viewer: 'demo.teacher',
        windowDays: 90,
        classKey: 'enterprise',
        includeStudentNames: false,
      }),
    },
    {
      name: '17-teacher-okafor-all-classes-named-90d',
      pageSize: 'a4',
      report: teacherReport(ctx, { viewer: 'demo.coteacher', windowDays: 90 }),
    },
    {
      name: '18-teacher-okafor-software-class-90d',
      pageSize: 'a4',
      report: teacherReport(ctx, {
        viewer: 'demo.coteacher',
        windowDays: 90,
        classKey: 'software',
      }),
    },
    {
      name: '19-teacher-okafor-software-course-90d',
      pageSize: 'a4',
      report: teacherReport(ctx, {
        viewer: 'demo.coteacher',
        windowDays: 90,
        course: 'software',
      }),
    },
    {
      name: '20-teacher-okafor-all-classes-30d',
      pageSize: 'a4',
      report: teacherReport(ctx, { viewer: 'demo.coteacher', windowDays: 30 }),
    },
    {
      name: '21-school-whole-90d',
      pageSize: 'a4',
      report: schoolReport(ctx, { viewer: 'demo.admin', windowDays: 90 }),
    },
    {
      name: '22-school-enterprise-course-90d',
      pageSize: 'a4',
      report: schoolReport(ctx, {
        viewer: 'demo.admin',
        windowDays: 90,
        course: 'enterprise',
      }),
    },
    {
      name: '23-school-anonymised-12m',
      pageSize: 'a4',
      report: schoolReport(ctx, {
        viewer: 'demo.admin',
        windowDays: 365,
        includeStudentNames: false,
      }),
    },
  ];
};
