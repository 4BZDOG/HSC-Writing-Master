/**
 * The demo progress-report samples are only worth looking at if their numbers
 * are right. These tests pin the get_progress_report() emulator against the
 * SQL's rules (scope, window, latest answer per question, weeks, rounding) and
 * check the sample set against an independent calculation from the raw cohort.
 * If a check here fails, the sample PDFs were rendered from a wrong payload.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PromptVerb } from '../../types';
import type { DemoAttempt } from '../../utils/demoCohort';
import { DEMO_CLASS_NAME } from '../../utils/demoCohort';
import {
  buildDemoReportSamples,
  DEMO_CLASS_IDS,
  DEMO_COURSE_FILES,
  demoClassRosters,
  demoUserDirectory,
  emulateProgressReportPayload,
  generateDemoCohort,
  indexCurriculum,
  roundNumeric,
  type DemoCourseKey,
  type DemoCourseTree,
  type DemoReportSample,
  type EmulateProgressInput,
} from '../../scripts/pdfSamples/demoReports';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-11T02:00:00.000Z');

const loadTree = (file: string): DemoCourseTree => {
  const parsed: unknown = JSON.parse(
    readFileSync(join(process.cwd(), 'public/courseData', file), 'utf8')
  );
  return (Array.isArray(parsed) ? parsed[0] : parsed) as DemoCourseTree;
};

const trees: Record<DemoCourseKey, DemoCourseTree> = {
  enterprise: loadTree(DEMO_COURSE_FILES.enterprise),
  software: loadTree(DEMO_COURSE_FILES.software),
};
const cohort = generateDemoCohort(trees);
const ENTERPRISE_ID = trees.enterprise.id;
const SOFTWARE_ID = trees.software.id;

const baseInput = (over: Partial<EmulateProgressInput> = {}): EmulateProgressInput => ({
  attempts: cohort.attempts,
  userDirectory: demoUserDirectory(),
  classes: demoClassRosters(trees),
  courseTree: [trees.enterprise, trees.software],
  windowDays: 90,
  classId: null,
  courseId: null,
  now: NOW,
  asAdmin: false,
  viewerUsername: 'demo.teacher',
  ...over,
});

/** Distinct (student, question) pairs whose latest attempt falls in the window. */
const expectedLatestCount = (
  attempts: DemoAttempt[],
  windowDays: number,
  keep: (a: DemoAttempt) => boolean = () => true
): number => {
  const latest = new Map<string, number>();
  for (const a of attempts.filter(keep)) {
    const key = `${a.username}|${a.promptId}`;
    latest.set(key, Math.min(latest.get(key) ?? Infinity, a.daysAgo));
  }
  return [...latest.values()].filter((daysAgo) => daysAgo <= windowDays).length;
};

const usernamesOf = (payload: ReturnType<typeof emulateProgressReportPayload>): string[] =>
  payload.byStudent.map((s) => s.username).sort();

const STUDENTS_ENTERPRISE_ACTIVE = [
  'demo.aisha',
  'demo.tom',
  'demo.priya',
  'demo.jayden',
  'demo.mei',
  'demo.harry',
  'demo.olivia',
  'demo.noah',
  'demo.zara',
  'demo.liam',
  'demo.chen',
  'demo.kayla',
  'demo.ethan',
  'demo.hana',
  'demo.free',
  'demo.plus',
].sort();
const STUDENTS_SOFTWARE_ACTIVE = [
  'demo.amara',
  'demo.dylan',
  'demo.ethan',
  'demo.hana',
  'demo.mateo',
  'demo.plus',
  'demo.sofia',
].sort();

describe('emulateProgressReportPayload: who is in scope', () => {
  it('Ms Bennett sees the Enterprise class students and nobody from the Software class alone', () => {
    const payload = emulateProgressReportPayload(baseInput());
    expect(usernamesOf(payload)).toEqual(STUDENTS_ENTERPRISE_ACTIVE);
    expect(payload.totals.active_students).toBe(16);
    for (const software of ['demo.sofia', 'demo.mateo', 'demo.dylan', 'demo.amara']) {
      expect(usernamesOf(payload)).not.toContain(software);
    }
  });

  it('Ms Bennett with no class named gets byClass for her own class only', () => {
    const payload = emulateProgressReportPayload(baseInput());
    expect(payload.byClass?.map((c) => c.name)).toEqual([DEMO_CLASS_NAME]);
  });

  it('Mr Okafor, who co-teaches Enterprise and owns Software, sees all 20 active students', () => {
    const payload = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    expect(payload.totals.active_students).toBe(20);
    const byClass = Object.fromEntries((payload.byClass ?? []).map((c) => [c.class_id, c]));
    expect(byClass[DEMO_CLASS_IDS.enterprise].students).toBe(16);
    expect(byClass[DEMO_CLASS_IDS.software].students).toBe(7);
  });

  it('a named class narrows the scope to that class and drops byClass', () => {
    const payload = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', classId: DEMO_CLASS_IDS.software })
    );
    expect(usernamesOf(payload)).toEqual(STUDENTS_SOFTWARE_ACTIVE);
    expect('byClass' in payload).toBe(false);
  });

  it('a class the viewer does not teach is refused, as visible_student_ids raises', () => {
    expect(() =>
      emulateProgressReportPayload(
        baseInput({ viewerUsername: 'demo.teacher', classId: DEMO_CLASS_IDS.software })
      )
    ).toThrow('You do not teach that class');
  });

  it('an administrator with no class named sees every student, and every answer Mr Okafor sees', () => {
    const admin = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.admin', asAdmin: true })
    );
    const okafor = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    expect(admin.totals.active_students).toBe(20);
    expect(admin.totals.attempts).toBe(okafor.totals.attempts);
  });

  it('a viewer with no classes gets the empty shape', () => {
    const payload = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.nobody' }));
    expect(payload).toEqual({
      days: 90,
      weeks: 13,
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
      byClass: [],
      classCourse: null,
    });
  });
});

describe('emulateProgressReportPayload: the course filter', () => {
  it('narrows every collection, not only the totals', () => {
    const payload = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', courseId: SOFTWARE_ID })
    );
    expect(payload.byCourse.map((c) => c.label)).toEqual([trees.software.name]);
    expect(payload.byTopic.every((t) => t.course === trees.software.name)).toBe(true);
    const sum = (rows: { attempts: number }[]) => rows.reduce((s, r) => s + r.attempts, 0);
    expect(sum(payload.byVerb)).toBe(payload.totals.attempts);
    expect(sum(payload.byStudentVerb)).toBe(payload.totals.attempts);
    expect(sum(payload.byStudentWeek)).toBe(payload.totals.attempts);
    expect(sum(payload.weekly)).toBe(payload.totals.attempts);
    expect(sum(payload.byStudent)).toBe(payload.totals.attempts);
  });

  it('the two courses partition the unfiltered answers', () => {
    const all = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    const software = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', courseId: SOFTWARE_ID })
    );
    const enterprise = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', courseId: ENTERPRISE_ID })
    );
    expect(software.totals.attempts + enterprise.totals.attempts).toBe(all.totals.attempts);
  });
});

describe('emulateProgressReportPayload: the latest answer per question', () => {
  it('counts each (student, question) once, at its latest attempt, inside the window', () => {
    for (const windowDays of [30, 90]) {
      const payload = emulateProgressReportPayload(
        baseInput({ viewerUsername: 'demo.coteacher', windowDays })
      );
      expect(payload.totals.attempts).toBe(expectedLatestCount(cohort.attempts, windowDays));
    }
  });

  it('matches an independent mean band and mark share for the whole cohort', () => {
    const payload = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    const latest = new Map<string, DemoAttempt>();
    for (const a of cohort.attempts.filter((x) => x.daysAgo <= 90)) {
      const key = `${a.username}|${a.promptId}`;
      const held = latest.get(key);
      if (!held || a.daysAgo < held.daysAgo) latest.set(key, a);
    }
    const rows = [...latest.values()];
    const bandMean = rows.reduce((s, a) => s + a.band, 0) / rows.length;
    const shareMean = rows.reduce((s, a) => s + a.mark / a.totalMarks, 0) / rows.length;
    expect(payload.totals.avg_band).toBe(roundNumeric(bandMean, 2));
    expect(payload.totals.avg_mark_frac).toBe(roundNumeric(shareMean, 3));
  });
});

describe('emulateProgressReportPayload: weeks and the window', () => {
  /** Four questions, one attempt each, for Aisha, at the given ages in days. */
  const attemptsAged = (ages: number[]): DemoAttempt[] => {
    const ids = indexCurriculum([trees.enterprise]).keys();
    const pool = [...ids];
    return ages.map((daysAgo, i) => ({
      username: 'demo.aisha',
      promptId: pool[i],
      daysAgo,
      draft: '',
      wordCount: 0,
      mark: 2,
      totalMarks: 4,
      band: 3,
      evaluation: {} as DemoAttempt['evaluation'],
    }));
  };

  it('buckets from the oldest week (0) to the newest, with the window edge counted', () => {
    // 90 days -> 13 weeks. 90 days ago sits exactly on the edge (in, week 0); 91 is out.
    const payload = emulateProgressReportPayload(
      baseInput({ attempts: attemptsAged([90, 89, 83, 0, 91]) })
    );
    expect(payload.days).toBe(90);
    expect(payload.weeks).toBe(13);
    expect(payload.weekly).toEqual([
      expect.objectContaining({ week: 0, attempts: 2 }),
      expect.objectContaining({ week: 1, attempts: 1 }),
      expect.objectContaining({ week: 12, attempts: 1 }),
    ]);
    expect(payload.totals.attempts).toBe(4);
  });

  it('gives a 12-month window 53 weeks, with the newest answer in the last', () => {
    const payload = emulateProgressReportPayload(
      baseInput({ attempts: attemptsAged([0, 364]), windowDays: 365 })
    );
    expect(payload.weeks).toBe(53);
    expect(payload.weekly.map((w) => w.week)).toEqual([0, 52]);
  });

  it('clamps the window to 1-365 days, as the SQL does', () => {
    expect(emulateProgressReportPayload(baseInput({ windowDays: 500 })).days).toBe(365);
    expect(emulateProgressReportPayload(baseInput({ windowDays: 0 })).days).toBe(1);
  });

  it('reads the answer timestamp back from the cohort clock', () => {
    const payload = emulateProgressReportPayload(
      baseInput({ attempts: attemptsAged([3]), viewerUsername: 'demo.coteacher' })
    );
    expect(Date.parse(payload.totals.last_attempt_at ?? '')).toBe(NOW.getTime() - 3 * DAY_MS);
  });
});

describe('emulateProgressReportPayload: rounding and labels', () => {
  it('rounds halves away from zero, as numeric round() does', () => {
    expect(roundNumeric(2.345, 2)).toBe(2.35);
    expect(roundNumeric(1.6666, 2)).toBe(1.67);
    expect(roundNumeric(0.0625, 3)).toBe(0.063);
    expect(roundNumeric(3, 2)).toBe(3);
  });

  it('labels a question with no verb "Unspecified" and leaves a zero-mark question out of mark share', () => {
    const tree: DemoCourseTree = {
      id: 'test-course',
      name: 'Test course',
      topics: [
        {
          name: 'Test topic',
          subTopics: [
            {
              dotPoints: [
                {
                  prompts: [
                    { id: 'test-q1', question: 'Q1', verb: 'EXPLAIN', totalMarks: 4 },
                    { id: 'test-q2', question: 'Q2', verb: '  ' as PromptVerb, totalMarks: 0 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const attempt = (promptId: string, mark: number, band: number): DemoAttempt => ({
      username: 'demo.aisha',
      promptId,
      daysAgo: 1,
      draft: '',
      wordCount: 0,
      mark,
      totalMarks: 4,
      band,
      evaluation: {} as DemoAttempt['evaluation'],
    });
    // An administrator: the synthetic course is bound to no demo class, so only the
    // whole-school view counts its answers.
    const payload = emulateProgressReportPayload(
      baseInput({
        courseTree: [tree],
        asAdmin: true,
        attempts: [attempt('test-q1', 2, 3), attempt('test-q2', 1, 1)],
      })
    );
    const byLabel = Object.fromEntries(payload.byVerb.map((v) => [v.label, v]));
    expect(Object.keys(byLabel).sort()).toEqual(['EXPLAIN', 'Unspecified']);
    expect(byLabel.Unspecified.avg_mark_frac).toBeNull();
    expect(byLabel.EXPLAIN.avg_mark_frac).toBe(0.5);
    expect(payload.totals.avg_mark_frac).toBe(0.5);
    expect(payload.totals.attempts).toBe(2);
  });
});

describe('demo sample set', () => {
  let samples: DemoReportSample[];
  const byName = (prefix: string): DemoReportSample => {
    const hit = samples.find((s) => s.name.startsWith(`${prefix}-`));
    if (!hit) throw new Error(`no sample ${prefix}`);
    return hit;
  };
  const headline = (sample: DemoReportSample, label: string): string | undefined =>
    sample.report.headline.find((stat) => stat.label === label)?.value;

  beforeAll(() => {
    samples = buildDemoReportSamples({ trees, now: NOW });
  });

  it('has 24 uniquely named, file-safe samples, with 12b and the Letter paper for 11', () => {
    expect(samples).toHaveLength(24);
    const names = samples.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(byName('11').pageSize).toBe('letter');
    expect(samples.filter((s) => s.pageSize === 'letter')).toHaveLength(1);
  });

  it('gives Ethan two filtered reports whose answers add up to the unfiltered one', () => {
    const total = Number(headline(byName('08'), 'Answers marked'));
    const software = Number(headline(byName('09'), 'Answers marked'));
    const enterprise = Number(headline(byName('10'), 'Answers marked'));
    expect(total).toBeGreaterThan(0);
    expect(software + enterprise).toBe(total);
    expect(byName('09').report.scope.courseName).toBe(trees.software.name);
    expect(byName('10').report.scope.courseName).toBe(trees.enterprise.name);
  });

  it("gives a student's own count every attempt, and a teacher's count one per question", () => {
    const sam = cohort.attempts.filter((a) => a.username === 'demo.free' && a.daysAgo <= 30);
    expect(Number(headline(byName('13'), 'Answers marked'))).toBe(sam.length);
    expect(Number(headline(byName('07'), 'Answers marked'))).toBeGreaterThanOrEqual(1);
    expect(Number(headline(byName('07'), 'Answers marked'))).toBeLessThanOrEqual(2);
  });

  it('has the head counts the teachers and the school should see', () => {
    expect(headline(byName('15'), 'Students')).toBe('16');
    expect(headline(byName('17'), 'Students')).toBe('20');
    expect(headline(byName('18'), 'Students')).toBe('7');
    expect(headline(byName('21'), 'Students')).toBe('20');
    expect(headline(byName('21'), 'Classes')).toBe('2');
    expect(headline(byName('21'), 'Answers marked')).toBe(headline(byName('17'), 'Answers marked'));
  });

  it('keeps the school course slice and the rest of the school adding up to the whole', () => {
    const whole = Number(headline(byName('17'), 'Answers marked'));
    const software = Number(headline(byName('19'), 'Answers marked'));
    const enterprise = Number(headline(byName('22'), 'Answers marked'));
    expect(software + enterprise).toBe(whole);
  });

  it('anonymises names in 16 and 23, and prints them in 15', () => {
    const names = (sample: DemoReportSample) => (sample.report.students ?? []).map((s) => s.name);
    expect(names(byName('16'))).toHaveLength(16);
    for (const name of names(byName('16'))) expect(name).toMatch(/^Student \d+$/);
    for (const name of names(byName('23'))) expect(name).toMatch(/^Student \d+$/);
    expect(names(byName('15'))).toContain('Aisha (Demo)');
  });

  it('gives Ben an empty report, and 12b the stored-totals fallback for Sam, the same student', () => {
    expect(headline(byName('12'), 'Answers marked')).toBe('0');
    expect(headline(byName('12'), 'Avg band')).toBe('—');
    expect(byName('12').report.trend).toEqual([]);
    expect(byName('12b').report.subject.name).toBe('Sam (Demo, Free)');
    expect(headline(byName('12b'), 'Answers marked')).toBe(
      String(cohort.stats['demo.free'].questionsAnswered)
    );
    expect(byName('12b').report.recent ?? []).toEqual([]);
  });

  it('shows only the charts and tiers for Hana (14)', () => {
    const sections = byName('14').report.sections;
    expect([sections.trend, sections.tiers]).toEqual([true, true]);
    expect([sections.courses, sections.topics, sections.verbs, sections.recent]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('gives Ms Bennett the Enterprise class, and the school the two classes', () => {
    expect(byName('15').report.scope.className).toBe(DEMO_CLASS_NAME);
    expect(byName('15').report.audience).toBe('teacher');
    expect(byName('21').report.audience).toBe('school');
    expect(byName('21').report.classes?.map((c) => c.name)).toEqual(
      demoClassRosters(trees).map((c) => c.name)
    );
  });
});

describe('emulateProgressReportPayload: course-bound classes', () => {
  const SOFTWARE_CLASS = DEMO_CLASS_IDS.software;
  const ENTERPRISE_CLASS = DEMO_CLASS_IDS.enterprise;

  it("a named class counts only the course it studies, so a dual student's other course is out", () => {
    const named = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', classId: SOFTWARE_CLASS })
    );
    const softwareOnly = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', courseId: SOFTWARE_ID })
    );
    expect(named.totals).toEqual(softwareOnly.totals);
    expect(named.byCourse.every((r) => r.course_id === SOFTWARE_ID)).toBe(true);
    expect(named.byStudent.map((r) => r.username).sort()).toEqual(
      [...STUDENTS_SOFTWARE_ACTIVE].sort()
    );
  });

  it('names the course a bound class studies, and matches nothing for a different course filter', () => {
    const named = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', classId: SOFTWARE_CLASS })
    );
    expect(named.classCourse).toEqual({ course_id: SOFTWARE_ID, name: trees.software.name });

    const mismatch = emulateProgressReportPayload(
      baseInput({
        viewerUsername: 'demo.coteacher',
        classId: SOFTWARE_CLASS,
        courseId: ENTERPRISE_ID,
      })
    );
    expect(mismatch.totals.attempts).toBe(0);
    expect(mismatch.byStudent).toEqual([]);
    expect(mismatch.classCourse?.name).toBe(trees.software.name);
  });

  it('gives the Enterprise class its own course, and no course to an unnamed view', () => {
    const enterprise = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.teacher', classId: ENTERPRISE_CLASS })
    );
    expect(enterprise.classCourse).toEqual({
      course_id: ENTERPRISE_ID,
      name: trees.enterprise.name,
    });
    expect(enterprise.byCourse.every((r) => r.course_id === ENTERPRISE_ID)).toBe(true);
    expect(emulateProgressReportPayload(baseInput()).classCourse).toBeNull();
  });

  it('counts every answer once across the course-bound classes: the class rows add up to the totals', () => {
    const all = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    const rows = all.byClass ?? [];
    expect(rows.map((r) => r.course).sort()).toEqual(
      [trees.enterprise.name, trees.software.name].sort()
    );
    expect(rows.reduce((sum, r) => sum + r.attempts, 0)).toBe(all.totals.attempts);
  });

  it("a class with no course keeps the old rule: its students' answers in every course", () => {
    const rosters = demoClassRosters(trees).map((c) =>
      c.id === SOFTWARE_CLASS ? { ...c, courseId: null, courseName: null } : c
    );
    const unbound = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', classId: SOFTWARE_CLASS, classes: rosters })
    );
    const bound = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.coteacher', classId: SOFTWARE_CLASS })
    );
    expect(unbound.classCourse).toBeNull();
    expect(unbound.totals.attempts).toBeGreaterThan(bound.totals.attempts);
  });
});

describe('emulateProgressReportPayload: whose answers a viewer sees', () => {
  const ENTERPRISE_CLASS = DEMO_CLASS_IDS.enterprise;

  it("Ms Bennett, who teaches only the Enterprise class, sees none of a dual student's Software answers", () => {
    const unnamed = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.teacher' }));
    expect(unnamed.byCourse.every((r) => r.course_id === ENTERPRISE_ID)).toBe(true);
    expect(unnamed.byStudent.some((r) => r.username === 'demo.ethan')).toBe(true);
    // Her unnamed view is exactly her Enterprise course: nothing else is in it.
    const enterpriseOnly = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.teacher', courseId: ENTERPRISE_ID })
    );
    expect(unnamed.totals).toEqual(enterpriseOnly.totals);
  });

  it('Mr Okafor, who teaches both classes, sees both courses, and his class rows add up to his totals', () => {
    const payload = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    expect((payload.byClass ?? []).map((c) => c.name).sort()).toEqual(
      demoClassRosters(trees)
        .map((c) => c.name)
        .sort()
    );
    const rowSum = (payload.byClass ?? []).reduce((sum, c) => sum + c.attempts, 0);
    expect(rowSum).toBe(payload.totals.attempts);
    expect(payload.byCourse.map((c) => c.course_id).sort()).toEqual(
      [ENTERPRISE_ID, SOFTWARE_ID].sort()
    );
  });

  it("an administrator with no class named sees every answer, which Mr Okafor's view is a subset of", () => {
    const admin = emulateProgressReportPayload(
      baseInput({ asAdmin: true, viewerUsername: 'demo.admin' })
    );
    const okafor = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.coteacher' }));
    expect(admin.totals.attempts).toBeGreaterThanOrEqual(okafor.totals.attempts);
    expect(admin.classCourse).toBeNull();
  });

  it("a class with no course shows all of its students' answers when the viewer teaches it", () => {
    const rosters = demoClassRosters(trees).map((c) =>
      c.id === ENTERPRISE_CLASS ? { ...c, courseId: null, courseName: null } : c
    );
    const unbound = emulateProgressReportPayload(
      baseInput({ viewerUsername: 'demo.teacher', classes: rosters })
    );
    const bound = emulateProgressReportPayload(baseInput({ viewerUsername: 'demo.teacher' }));
    expect(unbound.totals.attempts).toBeGreaterThan(bound.totals.attempts);
    expect(unbound.byCourse.some((r) => r.course_id === SOFTWARE_ID)).toBe(true);
  });
});
