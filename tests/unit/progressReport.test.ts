import { describe, it, expect } from 'vitest';
import { ALL_REPORT_SECTIONS, type ProgressReport } from '../../pdf/reportModel';
import type { ProgressReportPayload } from '../../services/responseService';
import type { OwnAttempt, OwnAttemptCourse } from '../../utils/profileHistory';
import {
  BAND_CAP_NOTE,
  buildSchoolReport,
  buildStudentReport,
  buildTeacherReport,
  COHORT_TREND_CAPTION,
  courseMatches,
  formatCount,
  formatPercent,
  formatWindowLabel,
  LOCAL_TREND_CAPTION,
  NO_TREND_CAPTION,
  REPORT_ROW_CAP,
  STUDENT_TREND_CAPTION,
  verbTier,
  type ReportOptions,
} from '../../utils/progressReport';

/**
 * The progress report's builders, on hand-made inputs. Every expectation below is
 * worked out from the fixture rather than read back from the code, so a builder
 * that drifts from the rules fails here. The reference "now" is fixed, so window
 * edges and week starts are the same on every run.
 */

const GENERATED = '2026-10-11T00:00:00.000Z';

const EC: OwnAttemptCourse = {
  id: 'uuid-ec',
  legacyId: 'course-ec-01',
  name: 'Enterprise Computing',
};
const PHYSICS: OwnAttemptCourse = { id: 'uuid-ps', legacyId: 'course-ps-01', name: 'Physics' };

const options = (over: Partial<ReportOptions> = {}): ReportOptions => ({
  audience: 'student',
  windowDays: 'all',
  courseFilter: null,
  className: null,
  includeStudentNames: true,
  sections: { ...ALL_REPORT_SECTIONS },
  subject: { name: 'Sam Nguyen', roleLabel: 'Student', school: 'Test High' },
  generatedAt: GENERATED,
  ...over,
});

const attempt = (over: Partial<OwnAttempt> = {}): OwnAttempt => ({
  at: '2026-10-05T09:00:00Z',
  band: 3,
  mark: 3,
  totalMarks: 6,
  verb: 'EXPLAIN',
  wordCount: 100,
  course: EC,
  topic: { name: 'Networks', course: EC },
  ...over,
});

/** Three answers in Enterprise Computing: a Tier 3, a Tier 4 and a Tier 1 verb. */
const threeAnswers = (): OwnAttempt[] => [
  attempt({
    at: '2026-10-01T09:00:00Z',
    band: 3,
    mark: 3,
    totalMarks: 6,
    verb: 'EXPLAIN',
    wordCount: 100,
  }),
  attempt({
    at: '2026-10-05T09:00:00Z',
    band: 4,
    mark: 4,
    totalMarks: 6,
    verb: 'ANALYSE',
    wordCount: 200,
  }),
  attempt({
    at: '2026-10-08T09:00:00Z',
    band: 1,
    mark: 4,
    totalMarks: 4,
    verb: 'IDENTIFY',
    wordCount: 50,
  }),
];

const values = (report: ProgressReport): string[] => report.headline.map((h) => h.value);
const labels = (report: ProgressReport): string[] => report.headline.map((h) => h.label);
const noBadValues = (report: ProgressReport): void => {
  const text = JSON.stringify(report);
  expect(text).not.toContain('NaN');
  expect(text).not.toContain('undefined');
};

const stats = {
  xp: 0,
  level: 1,
  questionsAnswered: 3,
  totalWordsWritten: 4300,
  averageBand: 2.67,
  markShareMean: 0.72,
  markShareCount: 3,
  lastActive: 0,
  streakDays: 4,
};

describe('student report, from history', () => {
  it('computes the headline from the answers in scope, with the totals-only figures where they hold', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });

    expect(report.audience).toBe('student');
    expect(report.title).toBe('Progress report');
    expect(labels(report)).toEqual([
      'Answers marked',
      'Avg mark share',
      'Avg band',
      'Words written',
      'Streak',
    ]);
    // Shares 0.5, 0.667, 1.0 → mean 0.722 → "72%". Bands 3, 4, 1 → 2.67 → "2.7".
    expect(values(report)).toEqual(['3', '72%', '2.7', '4.3k', '4']);
    expect(report.headline[2].band).toBe(3);
    noBadValues(report);
  });

  it('draws one trend point per scored answer, oldest first, with the all-time average', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.trend.map((p) => p.band)).toEqual([3, 4, 1]);
    expect(report.trend.map((p) => p.attempts)).toEqual([1, 1, 1]);
    expect(report.trend[0].at).toBe('2026-10-01T09:00:00Z');
    expect(report.averageBand).toBeCloseTo(8 / 3, 10);
    expect(report.trendCaption).toBe(STUDENT_TREND_CAPTION);
  });

  it('folds the answers into six tiers with the same tier table the profile uses', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.tiers).toHaveLength(6);
    expect(report.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(report.tiers[0]).toMatchObject({
      tier: 1,
      label: 'Remember',
      attempts: 1,
      markShare: 1,
    });
    expect(report.tiers[1]).toMatchObject({ tier: 2, attempts: 0, markShare: null });
    expect(report.tiers[2]).toMatchObject({ tier: 3, attempts: 1, markShare: 0.5 });
    expect(report.tiers[3].attempts).toBe(1);
    expect(report.tiers[3].markShare).toBeCloseTo(2 / 3, 10);
  });

  it('orders the verb and course rows weakest first by share of marks, as the screen does', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.byVerb.map((r) => r.label)).toEqual(['Explain', 'Analyse', 'Identify']);
    expect(report.byVerb[0]).toMatchObject({ sublabel: 'Tier 3', attempts: 1, markShare: 0.5 });
    expect(report.byCourse).toHaveLength(1);
    expect(report.byCourse[0]).toMatchObject({ label: 'Enterprise Computing', attempts: 3 });
    expect(report.byTopic[0]).toMatchObject({
      label: 'Networks',
      sublabel: 'Enterprise Computing',
    });
  });

  it('lists recent answers newest first, with the course and topic names and the verb as a label', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.recent?.map((r) => r.at)).toEqual([
      '2026-10-08T09:00:00Z',
      '2026-10-05T09:00:00Z',
      '2026-10-01T09:00:00Z',
    ]);
    expect(report.recent?.[0]).toEqual({
      at: '2026-10-08T09:00:00Z',
      course: 'Enterprise Computing',
      topic: 'Networks',
      verb: 'Identify',
      mark: 4,
      totalMarks: 4,
      band: 1,
    });
  });

  it('gives the scope the first and last answer, and says a verb caps the band', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.scope).toEqual({
      courseName: null,
      windowLabel: 'All time',
      className: null,
      firstAttemptAt: '2026-10-01T09:00:00Z',
      lastAttemptAt: '2026-10-08T09:00:00Z',
    });
    expect(report.notes).toContain(BAND_CAP_NOTE);
    expect(report.notes.join(' ')).toContain('caps the band');
  });

  it('does not claim a history start when the totals and the history agree', () => {
    const report = buildStudentReport({ stats, history: threeAnswers(), options: options() });
    expect(report.notes.some((n) => n.startsWith('Answer history starts'))).toBe(false);
  });

  it('says where history begins when the totals count answers the history does not hold', () => {
    const report = buildStudentReport({
      stats: { ...stats, questionsAnswered: 5 },
      history: [attempt({ at: '2026-10-05T09:00:00Z' })],
      options: options(),
    });
    expect(report.notes).toContain(
      'Answer history starts on 5 Oct 2026. Answers marked before then count in your totals but not in this report.'
    );
  });
});

describe('student report, filters', () => {
  const withPhysics = (): OwnAttempt[] => [
    ...threeAnswers(),
    attempt({
      at: '2026-10-06T09:00:00Z',
      band: 5,
      mark: 6,
      totalMarks: 6,
      verb: 'DESCRIBE',
      wordCount: 80,
      course: PHYSICS,
      topic: { name: 'Motion', course: PHYSICS },
    }),
  ];

  it('narrows every figure to the course, drops the all-time streak and words, and names the course', () => {
    const report = buildStudentReport({
      stats,
      history: withPhysics(),
      options: options({
        courseFilter: { id: 'course-ec-01', name: 'Enterprise Computing' },
      }),
    });
    expect(labels(report)).toEqual([
      'Answers marked',
      'Avg mark share',
      'Avg band',
      'Words written',
    ]);
    expect(values(report)).toEqual(['3', '72%', '2.7', '350']);
    expect(report.headline[0].hint).toBe('in this report');
    expect(report.trend).toHaveLength(3);
    expect(report.byCourse.map((r) => r.label)).toEqual(['Enterprise Computing']);
    expect(report.recent?.every((r) => r.course === 'Enterprise Computing')).toBe(true);
    expect(report.scope.courseName).toBe('Enterprise Computing');
    expect(JSON.stringify(report)).not.toContain('Physics');
    noBadValues(report);
  });

  it('matches a course by its database id as well as its app id', () => {
    const byUuid = buildStudentReport({
      stats,
      history: withPhysics(),
      options: options({ courseFilter: { id: 'uuid-ec', name: 'Enterprise Computing' } }),
    });
    expect(byUuid.headline[0].value).toBe('3');
  });

  it('computes the period from the answers in the window, not from the totals', () => {
    const history = [
      ...threeAnswers(),
      attempt({
        at: '2026-08-01T09:00:00Z',
        band: 6,
        mark: 6,
        totalMarks: 6,
        verb: 'EVALUATE',
        wordCount: 1000,
      }),
    ];
    const report = buildStudentReport({
      stats,
      history,
      options: options({ windowDays: 30 }),
    });
    // 30 days back from 11 Oct is 11 Sep, so the August answer is out.
    expect(values(report)).toEqual(['3', '72%', '2.7', '350']);
    expect(report.scope.windowLabel).toBe('Last 30 days');
    expect(report.trend.map((p) => p.band)).toEqual([3, 4, 1]);
    expect(labels(report)).not.toContain('Streak');
  });

  it('names only the filter that is actually set when nothing matches', () => {
    const course = { id: 'course-none', name: 'Nothing' };
    const wording = (over: Parameters<typeof options>[0]) =>
      buildStudentReport({ stats, history: withPhysics(), options: options(over) }).notes;
    expect(wording({ courseFilter: course, windowDays: 'all' })).toContain(
      'No marked answers match this course.'
    );
    expect(wording({ courseFilter: null, windowDays: 1 })).toContain(
      'No marked answers match this period.'
    );
  });

  it('says so when a filter matches nothing, rather than showing the unfiltered report', () => {
    const report = buildStudentReport({
      stats,
      history: withPhysics(),
      options: options({ courseFilter: { id: 'course-none', name: 'Nothing' } }),
    });
    expect(values(report)[0]).toBe('0');
    expect(values(report)[1]).toBe('—');
    expect(report.trend).toEqual([]);
    expect(report.trendCaption).toBe(NO_TREND_CAPTION);
    expect(report.notes).toContain('No marked answers match this course.');
    noBadValues(report);
  });

  it('keeps answers whose course is hidden out of a course-filtered report', () => {
    const hidden = attempt({ course: null, topic: null, at: '2026-10-07T09:00:00Z' });
    const report = buildStudentReport({
      stats,
      history: [...threeAnswers(), hidden],
      options: options({ courseFilter: { id: 'course-ec-01', name: 'Enterprise Computing' } }),
    });
    expect(report.headline[0].value).toBe('3');
  });
});

describe('student report, the rest of the rules', () => {
  it('shows one answer as one point, with its band as the average and no NaN anywhere', () => {
    const report = buildStudentReport({
      stats: { ...stats, questionsAnswered: 1 },
      history: [attempt({ band: 4, mark: 5, totalMarks: 6, verb: 'ANALYSE' })],
      options: options(),
    });
    expect(report.trend).toEqual([{ at: '2026-10-05T09:00:00Z', band: 4, attempts: 1 }]);
    expect(report.averageBand).toBe(4);
    expect(report.tiers.filter((t) => t.attempts > 0)).toHaveLength(1);
    expect(values(report)[0]).toBe('1');
    noBadValues(report);
  });

  it('shows an unmarked question as an em dash and drops it from the mark share', () => {
    const report = buildStudentReport({
      stats,
      history: [
        attempt({ totalMarks: null, mark: 3 }),
        attempt({ at: '2026-10-06T09:00:00Z', totalMarks: null, mark: 2 }),
      ],
      options: options(),
    });
    expect(report.headline[1].value).toBe('—');
    expect(report.byVerb[0].markShare).toBeNull();
    noBadValues(report);
  });

  it('labels a question with no verb, or no course or topic recorded, rather than dropping it', () => {
    const report = buildStudentReport({
      stats,
      history: [
        attempt({ verb: null, course: null, topic: null }),
        attempt({ at: '2026-10-06T09:00:00Z' }),
      ],
      options: options(),
    });
    expect(report.byVerb.map((r) => r.label)).toContain('No command verb');
    expect(report.byCourse.map((r) => r.label)).toContain('Course not recorded');
    expect(report.byTopic.map((r) => r.label)).toContain('Topic not recorded');
    expect(report.recent?.[1]).toMatchObject({ course: null, topic: null, verb: null });
    noBadValues(report);
  });

  it('caps the recent list at 25, newest first, and says how many there were', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      attempt({
        at: new Date(Date.parse(GENERATED) - (i + 1) * 3_600_000).toISOString(),
        band: 2,
        mark: 2,
        totalMarks: 4,
        verb: 'DESCRIBE',
      })
    );
    const report = buildStudentReport({
      stats: { ...stats, questionsAnswered: 30 },
      history: many,
      options: options(),
    });
    expect(report.recent).toHaveLength(REPORT_ROW_CAP);
    expect(report.recent?.[0].at).toBe(many[0].at);
    expect(report.notes).toContain(
      'The recent list shows the latest 25 of 30 marked answers. The summary and breakdowns cover all of them.'
    );
  });

  it('omits the recent list when that section is switched off', () => {
    const report = buildStudentReport({
      stats,
      history: threeAnswers(),
      options: options({ sections: { ...ALL_REPORT_SECTIONS, recent: false } }),
    });
    expect(report.recent).toBeUndefined();
    expect(report.sections.recent).toBe(false);
  });

  it('says when the history is capped at the read limit, so the oldest may be missing', () => {
    const full = Array.from({ length: 1000 }, (_, i) =>
      attempt({ at: new Date(Date.parse(GENERATED) - (i + 1) * 60_000).toISOString() })
    );
    const report = buildStudentReport({
      stats: { ...stats, questionsAnswered: 1000 },
      history: full,
      options: options(),
    });
    expect(report.notes.some((n) => n.startsWith('Only your latest 1,000 answers'))).toBe(true);
  });
});

describe('student report, local mode and no history', () => {
  it('reports the stored totals when there is no online account, and says why', () => {
    const report = buildStudentReport({
      stats: {
        ...stats,
        questionsAnswered: 12,
        averageBand: 3.4,
        markShareMean: 0.75,
        markShareCount: 12,
        totalWordsWritten: 4500,
        streakDays: 2,
      },
      history: null,
      options: options(),
    });
    expect(values(report)).toEqual(['12', '75%', '3.4', '4.5k', '2']);
    expect(report.scope).toMatchObject({
      windowLabel: 'All time',
      courseName: null,
      firstAttemptAt: null,
    });
    expect(report.trend).toEqual([]);
    expect(report.trendCaption).toBe(LOCAL_TREND_CAPTION);
    expect(report.averageBand).toBeNull();
    expect(report.tiers).toHaveLength(6);
    expect(report.tiers.every((t) => t.attempts === 0)).toBe(true);
    expect(report.byVerb).toEqual([]);
    expect(report.notes[0]).toContain('kept for signed-in accounts');
    noBadValues(report);
  });

  it('says a filter cannot apply without history, rather than applying it to totals it cannot split', () => {
    const report = buildStudentReport({
      stats,
      history: null,
      options: options({
        windowDays: 30,
        courseFilter: { id: 'course-ec-01', name: 'Enterprise Computing' },
      }),
    });
    expect(report.scope.courseName).toBeNull();
    expect(report.notes.join(' ')).toContain('need your answer history');
  });

  it('treats an empty history as no history, with its own note', () => {
    const report = buildStudentReport({ stats, history: [], options: options() });
    expect(values(report)[0]).toBe('3');
    expect(report.notes[0]).toContain('no marked answers in your history yet');
  });

  it('reads zero everywhere for a new account with nothing in it, with no NaN', () => {
    const report = buildStudentReport({ stats: undefined, history: null, options: options() });
    expect(values(report)).toEqual(['0', '—', '—', '0', '0']);
    expect(report.headline[2].band).toBeUndefined();
    noBadValues(report);
  });
});

// --- Teacher and school ------------------------------------------------------

const payload = (over: Partial<ProgressReportPayload> = {}): ProgressReportPayload => ({
  days: 90,
  weeks: 13,
  totals: {
    attempts: 6,
    active_students: 2,
    avg_band: 3.5,
    avg_mark_frac: 0.6,
    first_attempt_at: '2026-07-20T00:00:00Z',
    last_attempt_at: '2026-10-09T00:00:00Z',
  },
  byVerb: [
    { label: 'EXPLAIN', attempts: 4, students: 2, avg_band: 3, avg_mark_frac: 0.7 },
    { label: 'IDENTIFY', attempts: 2, students: 1, avg_band: 1, avg_mark_frac: 0.5 },
  ],
  byCourse: [
    {
      course_id: 'c1',
      label: 'Enterprise Computing',
      attempts: 6,
      students: 2,
      avg_band: 3.5,
      avg_mark_frac: 0.6,
    },
  ],
  byTopic: [
    {
      topic_id: 't2',
      course_id: 'c1',
      course: 'Enterprise Computing',
      label: 'Databases',
      attempts: 3,
      students: 2,
      avg_band: 4,
      avg_mark_frac: 0.7,
    },
    {
      topic_id: 't1',
      course_id: 'c1',
      course: 'Enterprise Computing',
      label: 'Networks',
      attempts: 3,
      students: 2,
      avg_band: 3,
      avg_mark_frac: 0.5,
    },
  ],
  byStudent: [
    {
      username: 'ava',
      display_name: 'Ava Lee',
      attempts: 4,
      avg_band: 4,
      avg_mark_frac: 0.8,
      last_active: '2026-10-09T10:00:00Z',
    },
    {
      username: 'ben',
      display_name: '',
      attempts: 2,
      avg_band: 2,
      avg_mark_frac: 0.4,
      last_active: '2026-09-01T10:00:00Z',
    },
  ],
  byStudentVerb: [
    { username: 'ava', verb: 'EXPLAIN', attempts: 2, avg_band: 4, avg_mark_frac: 0.9 },
    { username: 'ava', verb: 'IDENTIFY', attempts: 2, avg_band: 1, avg_mark_frac: 0.7 },
    { username: 'ben', verb: 'EXPLAIN', attempts: 2, avg_band: 2, avg_mark_frac: 0.4 },
  ],
  byStudentWeek: [
    { username: 'ava', week: 0, attempts: 1, avg_band: 2, avg_mark_frac: 0.5 },
    { username: 'ava', week: 12, attempts: 3, avg_band: 4, avg_mark_frac: 0.9 },
    { username: 'ben', week: 6, attempts: 2, avg_band: 2, avg_mark_frac: 0.4 },
  ],
  weekly: [
    { week: 0, attempts: 1, avg_band: 2, avg_mark_frac: 0.5 },
    { week: 6, attempts: 2, avg_band: 2, avg_mark_frac: 0.4 },
    { week: 12, attempts: 3, avg_band: 4, avg_mark_frac: 0.9 },
  ],
  ...over,
});

describe('teacher report', () => {
  it('builds the class report headline, trend and tiers from the payload', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });

    expect(report.audience).toBe('teacher');
    expect(report.title).toBe('Class report');
    expect(labels(report)).toEqual(['Students', 'Answers marked', 'Avg mark share', 'Avg band']);
    expect(values(report)).toEqual(['2', '6', '60%', '3.5']);
    expect(report.scope).toMatchObject({
      windowLabel: 'Last 90 days',
      courseName: null,
      className: null,
    });
    expect(report.scope.firstAttemptAt).toBe('2026-07-20T00:00:00Z');
    expect(report.trendCaption).toBe(COHORT_TREND_CAPTION);
    expect(report.averageBand).toBe(3.5);
    noBadValues(report);
  });

  it('lays the trend out one point per week, oldest first, dated from the window start', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });
    expect(report.trend).toHaveLength(13);
    // 11 Oct less 90 days is 13 Jul.
    expect(report.trend[0]).toEqual({ at: '2026-07-13T00:00:00.000Z', band: 2, attempts: 1 });
    expect(report.trend[1]).toEqual({ at: '2026-07-20T00:00:00.000Z', band: null, attempts: 0 });
    expect(report.trend[6].attempts).toBe(2);
    expect(report.trend[12]).toEqual({ at: '2026-10-05T00:00:00.000Z', band: 4, attempts: 3 });
  });

  it('orders students weakest first, with a sparkline, a band change and their tier shares', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });
    const [first, second] = report.students ?? [];
    expect(first.name).toBe('ben');
    expect(first).toMatchObject({
      attempts: 2,
      avgBand: 2,
      markShare: 0.4,
      bandChange: null,
      lastActiveAt: '2026-09-01T10:00:00Z',
    });
    expect(first.sparkline).toHaveLength(12);
    expect(first.sparkline.filter((v) => v !== null)).toEqual([2]);
    expect(first.tierShares).toEqual([null, null, 0.4, null, null, null]);

    expect(second.name).toBe('Ava Lee');
    expect(second.bandChange).toBe(2);
    expect(second.sparkline).toHaveLength(12);
    expect(second.sparkline[11]).toBe(4);
    expect(second.sparkline[0]).toBeNull();
    expect(second.tierShares).toEqual([0.7, null, 0.9, null, null, null]);
    noBadValues(report);
  });

  it('names students by number when names are off, numbered alphabetically and kept the same in every table', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({ audience: 'teacher', windowDays: 90, includeStudentNames: false }),
    });
    expect(report.anonymised).toBe(true);
    expect(report.students?.map((s) => s.name)).toEqual(['Student 2', 'Student 1']);
    const text = JSON.stringify(report);
    expect(text).not.toContain('Ava Lee');
    expect(text).not.toContain('"ben"');
    expect(report.notes.join(' ')).toContain('replaced by numbers');
  });

  it('gives the tier profile of the whole cohort, always six rows, and the verb and topic rows weakest first', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });
    expect(report.tiers).toHaveLength(6);
    expect(report.tiers[0]).toMatchObject({ tier: 1, attempts: 2, markShare: 0.5 });
    expect(report.tiers[2]).toMatchObject({ tier: 3, attempts: 4, markShare: 0.7 });
    expect(report.tiers[1]).toMatchObject({ tier: 2, attempts: 0, markShare: null });

    expect(report.byVerb.map((r) => r.label)).toEqual(['Identify', 'Explain']);
    expect(report.byVerb[0]).toMatchObject({ sublabel: 'Tier 1', markShare: 0.5 });
    expect(report.byTopic.map((r) => r.label)).toEqual(['Networks', 'Databases']);
    expect(report.byTopic[0].sublabel).toBe('Enterprise Computing');
    expect(report.byCourse[0]).toMatchObject({
      label: 'Enterprise Computing',
      students: 2,
      markShare: 0.6,
    });
  });

  it('leaves the student table out when that section is switched off', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({
        audience: 'teacher',
        windowDays: 90,
        sections: { ...ALL_REPORT_SECTIONS, students: false },
      }),
    });
    expect(report.students).toBeUndefined();
  });

  it('never has classes or recent attempts: those are school and student sections', () => {
    const report = buildTeacherReport({
      payload: payload({ byClass: [] }),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });
    expect(report.classes).toBeUndefined();
    expect(report.recent).toBeUndefined();
  });

  it('shows an empty class as an empty report that says why, with no NaN and no trend', () => {
    const report = buildTeacherReport({
      payload: payload({
        days: 30,
        weeks: 5,
        totals: {
          attempts: 0,
          active_students: 0,
          avg_band: null,
          avg_mark_frac: null,
          first_attempt_at: null,
          last_attempt_at: null,
        },
        byVerb: [],
        byCourse: [],
        byTopic: [],
        byStudent: [],
        byStudentVerb: [],
        byStudentWeek: [],
        weekly: [],
      }),
      options: options({ audience: 'teacher', windowDays: 30 }),
    });
    expect(values(report)).toEqual(['0', '0', '—', '—']);
    expect(report.headline[3].band).toBeUndefined();
    expect(report.trend).toEqual([]);
    expect(report.trendCaption).toBe(NO_TREND_CAPTION);
    expect(report.notes[0]).toContain('No marked answers in these classes');
    expect(report.students).toEqual([]);
    expect(report.tiers.every((t) => t.attempts === 0 && t.markShare === null)).toBe(true);
    noBadValues(report);
  });

  it('handles one student with one week: no band change under two points, and a one-value sparkline', () => {
    const report = buildTeacherReport({
      payload: payload({
        totals: {
          attempts: 1,
          active_students: 1,
          avg_band: 3,
          avg_mark_frac: 0.5,
          first_attempt_at: '2026-10-01T00:00:00Z',
          last_attempt_at: '2026-10-01T00:00:00Z',
        },
        byVerb: [{ label: 'EXPLAIN', attempts: 1, students: 1, avg_band: 3, avg_mark_frac: 0.5 }],
        byCourse: [],
        byTopic: [],
        byStudent: [
          {
            username: 'solo',
            display_name: 'Solo Student',
            attempts: 1,
            avg_band: 3,
            avg_mark_frac: 0.5,
            last_active: '2026-10-01T00:00:00Z',
          },
        ],
        byStudentVerb: [
          { username: 'solo', verb: 'EXPLAIN', attempts: 1, avg_band: 3, avg_mark_frac: 0.5 },
        ],
        byStudentWeek: [
          { username: 'solo', week: 12, attempts: 1, avg_band: 3, avg_mark_frac: 0.5 },
        ],
        weekly: [{ week: 12, attempts: 1, avg_band: 3, avg_mark_frac: 0.5 }],
      }),
      options: options({ audience: 'teacher', windowDays: 90 }),
    });
    expect(report.students).toHaveLength(1);
    expect(report.students?.[0]).toMatchObject({ name: 'Solo Student', bandChange: null });
    expect(report.students?.[0].sparkline.filter((v) => v !== null)).toEqual([3]);
    noBadValues(report);
  });

  it('scopes the scope line to the course the teacher picked', () => {
    const report = buildTeacherReport({
      payload: payload(),
      options: options({
        audience: 'teacher',
        windowDays: 90,
        courseFilter: { id: 'course-ec-01', name: 'Enterprise Computing' },
      }),
    });
    expect(report.scope.courseName).toBe('Enterprise Computing');
  });
});

describe('school report', () => {
  const schoolPayload = () =>
    payload({
      byClass: [
        {
          class_id: 'k1',
          name: 'Year 12 A',
          year: 12,
          students: 2,
          attempts: 6,
          avg_band: 3.5,
          avg_mark_frac: 0.6,
        },
        {
          class_id: 'k2',
          name: 'Year 11 B',
          year: 11,
          students: 0,
          attempts: 0,
          avg_band: null,
          avg_mark_frac: null,
        },
      ],
    });

  it('adds the school headline and the class table, with a note about students in two classes', () => {
    const report = buildSchoolReport({
      payload: schoolPayload(),
      options: options({ audience: 'school', windowDays: 90 }),
    });
    expect(report.audience).toBe('school');
    expect(report.title).toBe('School report');
    expect(labels(report)).toEqual([
      'Students',
      'Classes',
      'Answers marked',
      'Avg mark share',
      'Avg band',
    ]);
    expect(values(report)[1]).toBe('1');
    expect(report.classes).toEqual([
      { name: 'Year 12 A', year: 12, students: 2, attempts: 6, avgBand: 3.5, markShare: 0.6 },
      { name: 'Year 11 B', year: 11, students: 0, attempts: 0, avgBand: null, markShare: null },
    ]);
    expect(report.notes.join(' ')).toContain('counted in each of those classes');
    noBadValues(report);
  });

  it('leaves the class table out when that section is switched off', () => {
    const report = buildSchoolReport({
      payload: schoolPayload(),
      options: options({
        audience: 'school',
        windowDays: 90,
        sections: { ...ALL_REPORT_SECTIONS, classes: false },
      }),
    });
    expect(report.classes).toBeUndefined();
  });

  it('drops the classes headline and table when the report is limited to one class', () => {
    const report = buildSchoolReport({
      payload: payload(),
      options: options({ audience: 'school', windowDays: 90, className: 'Year 12 A' }),
    });
    expect(report.classes).toBeUndefined();
    expect(labels(report)).not.toContain('Classes');
    expect(report.scope.className).toBe('Year 12 A');
  });
});

describe('formatting helpers', () => {
  it('formats a share as a whole percentage, or an em dash when unknown', () => {
    expect(formatPercent(0.84)).toBe('84%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('formats a count in plain digits, then thousands and millions to one decimal place', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(25)).toBe('25');
    expect(formatCount(999.4)).toBe('999');
    expect(formatCount(4300)).toBe('4.3k');
    expect(formatCount(4000)).toBe('4k');
    expect(formatCount(999.6)).toBe('1k');
    expect(formatCount(1_234_567)).toBe('1.2M');
  });

  it('reads an unknown or negative count as zero, never NaN', () => {
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount(-5)).toBe('0');
  });

  it('labels the window the way the page prints it', () => {
    expect(formatWindowLabel('all')).toBe('All time');
    expect(formatWindowLabel(1)).toBe('Last 1 day');
    expect(formatWindowLabel(30)).toBe('Last 30 days');
    expect(formatWindowLabel(90)).toBe('Last 90 days');
    expect(formatWindowLabel(365)).toBe('Last 12 months');
  });

  it('looks a verb up in the command-term table, and answers null for an unknown or missing one', () => {
    expect(verbTier('IDENTIFY')).toBe(1);
    // Exact, like the screens: a lower-case verb is untiered there, so it is here.
    expect(verbTier('explain')).toBeNull();
    expect(verbTier('EVALUATE')).toBe(6);
    expect(verbTier('Unspecified')).toBeNull();
    expect(verbTier('NOT A VERB')).toBeNull();
  });

  it('tells a course by its app id, or by its database id, and never by a name', () => {
    expect(courseMatches(EC, { id: 'course-ec-01', name: 'x' })).toBe(true);
    expect(courseMatches(EC, { id: 'uuid-ec', name: 'x' })).toBe(true);
    expect(courseMatches(EC, { id: 'Enterprise Computing', name: 'x' })).toBe(false);
    expect(courseMatches(null, { id: 'course-ec-01', name: 'x' })).toBe(false);
  });
});
