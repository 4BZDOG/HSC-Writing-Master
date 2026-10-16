import { describe, it, expect } from 'vitest';
import { buildReportBlocks, studentsTableDrawn } from '../../pdf/buildReportBlocks';
import { measureBlocks, computeGeometry } from '../../pdf/layout';
import {
  ALL_REPORT_SECTIONS,
  type ProgressReport,
  type ReportSections,
} from '../../pdf/reportModel';
import type { ContentBlock } from '../../pdf/types';
import { reportMeasurer, makeReport, allFinite, trendOf } from './pdfReportHelpers';

/**
 * The phase-two sections: which of them the builder draws, in what order, what it
 * prints when a section is on but has nothing in scope, and how the notes follow
 * the tables they describe.
 */

const geo = computeGeometry({
  size: 'a4',
  columnsPerPage: 2,
  columnGap: 7,
  headerHeight: 10,
  footerHeight: 8,
  margin: 10,
});

const ids = (report: ProgressReport): string[] => buildReportBlocks(report).map((b) => b.id);
const find = (report: ProgressReport, id: string): ContentBlock | undefined =>
  buildReportBlocks(report).find((b) => b.id === id);

const row = (label: string, attempts = 3) => ({
  label,
  attempts,
  avgBand: 4,
  markShare: 0.6,
});

const student = (
  name: string,
  over: Partial<NonNullable<ProgressReport['students']>[number]> = {}
) => ({
  name,
  attempts: 6,
  avgBand: 4,
  markShare: 0.6,
  bandChange: 1,
  sparkline: [3, null, 4, 4, 5, null, null, 5, 5, 4, 4, 5],
  lastActiveAt: new Date(2026, 8, 20, 12).toISOString(),
  tierShares: [null, 0.5, 0.6, null, 0.7, 0.8],
  ...over,
});

/** A teacher's report with every section on and rows in each. */
const fullTeacher = (over: Partial<ProgressReport> = {}): ProgressReport =>
  makeReport({
    audience: 'teacher',
    byCourse: [row('Enterprise Computing'), row('Software Engineering')],
    byTopic: [
      { ...row('Requirements'), sublabel: 'Software Engineering' },
      { ...row('Data visualisation'), sublabel: 'Enterprise Computing' },
    ],
    byVerb: [{ ...row('Explain'), sublabel: 'Tier 3' }],
    students: [student('Ava Nguyen'), student('Liam Chen', { bandChange: null })],
    ...over,
  });

describe('sections: which tables are drawn, and in what order', () => {
  it('draws the phase-two tables in the plan order, after the tiers and before the notes', () => {
    const order = ids(fullTeacher());
    const at = (id: string) => order.indexOf(id);
    expect(at('tiers')).toBeGreaterThan(-1);
    expect(at('courses')).toBeGreaterThan(at('tiers'));
    expect(at('topics')).toBeGreaterThan(at('courses'));
    expect(at('verbs')).toBeGreaterThan(at('topics'));
    expect(at('students')).toBeGreaterThan(at('verbs'));
    expect(at('heatmap')).toBeGreaterThan(at('students'));
    expect(at('h-about')).toBeGreaterThan(at('heatmap'));
  });

  it('draws the student recent attempts after the verbs, and no students or heatmap for a student', () => {
    const student = makeReport({
      audience: 'student',
      byCourse: [row('Software Engineering')],
      byTopic: [row('Requirements')],
      byVerb: [row('Explain')],
      recent: [
        {
          at: new Date(2026, 8, 9, 12).toISOString(),
          course: 'Software Engineering',
          topic: 'Requirements',
          verb: 'Explain',
          mark: 3,
          totalMarks: 4,
          band: 4,
        },
      ],
    });
    const order = ids(student);
    expect(order.indexOf('recent')).toBeGreaterThan(order.indexOf('verbs'));
    expect(order).not.toContain('students');
    expect(order).not.toContain('heatmap');
    expect(order).not.toContain('h-classes');
  });

  it('draws the classes table for a school only, after the students and the heatmap', () => {
    const school = makeReport({
      audience: 'school',
      students: [student('Student 1')],
      classes: [
        {
          name: 'Enterprise 11A',
          year: 11,
          students: 24,
          attempts: 90,
          avgBand: 4,
          markShare: 0.6,
        },
      ],
    });
    const order = ids(school);
    expect(order.indexOf('classes')).toBeGreaterThan(order.indexOf('heatmap'));
    expect(order).toContain('h-classes');
    expect(ids(fullTeacher())).not.toContain('classes');
  });

  it('gates each section on its own flag, and draws nothing for a switched-off one', () => {
    const cases: [keyof ReportSections, string[]][] = [
      ['courses', ['h-courses', 'courses']],
      ['topics', ['h-topics', 'topics']],
      ['verbs', ['h-verbs', 'verbs']],
    ];
    for (const [flag, gone] of cases) {
      const out = ids(fullTeacher({ sections: { ...ALL_REPORT_SECTIONS, [flag]: false } }));
      gone.forEach((id) => expect(out).not.toContain(id));
    }
    const noStudents = ids(
      fullTeacher({ sections: { ...ALL_REPORT_SECTIONS, students: false }, students: undefined })
    );
    expect(noStudents).not.toContain('students');
    expect(noStudents).not.toContain('heatmap');
  });

  it('draws the recent table only when its section is on and the list is given', () => {
    const base = makeReport({
      recent: [
        {
          at: new Date(2026, 8, 9, 12).toISOString(),
          course: null,
          topic: 'Requirements',
          verb: null,
          mark: 2,
          totalMarks: 4,
          band: 3,
        },
      ],
    });
    expect(ids(base)).toContain('recent');
    expect(ids({ ...base, sections: { ...base.sections, recent: false } })).not.toContain('recent');
    expect(ids({ ...base, recent: undefined })).not.toContain('recent');
  });

  it('draws the students and the heatmap, with the heatmap legend kept with its table', () => {
    const report = fullTeacher();
    const legend = find(report, 'heat-legend');
    expect(legend?.kind).toBe('paragraph');
    expect(legend?.keepWithNext).toBe(true);
    expect(legend?.runs[0].text).toMatch(/Share of marks earned by command-verb tier/);
    expect(find(report, 'heatmap')?.kind).toBe('heatmap');
  });
});

describe('sections on with nothing in scope: one muted line, never a frame', () => {
  it('says the empty breakdowns once, under the first, and no table', () => {
    const report = makeReport({ audience: 'student', byCourse: [], byTopic: [], byVerb: [] });
    const line = find(report, 'breakdowns-empty');
    expect(line?.kind).toBe('paragraph');
    expect(line?.runs[0].text).toMatch(/^No marked answers/);
    expect(ids(report)).toContain('h-courses');
    expect(ids(report)).not.toContain('h-topics');
    expect(ids(report)).not.toContain('h-verbs');
    expect(ids(report)).not.toContain('courses-empty');
    expect(ids(report)).not.toContain('topics-empty');
    expect(ids(report)).not.toContain('verbs-empty');
    expect(ids(report)).not.toContain('courses');
    expect(ids(report)).not.toContain('topics');
    expect(ids(report)).not.toContain('verbs');
  });

  it('keeps a line under each empty breakdown when another breakdown has rows', () => {
    const report = makeReport({ byCourse: [row('Software Engineering')], byTopic: [], byVerb: [] });
    expect(ids(report)).not.toContain('breakdowns-empty');
    expect(find(report, 'topics-empty')?.runs[0].text).toMatch(/^No marked answers/);
    expect(find(report, 'verbs-empty')?.runs[0].text).toMatch(/^No marked answers/);
    expect(ids(report)).toContain('courses');
  });

  it('says what was narrowed: the course, and the period', () => {
    const report = makeReport({
      audience: 'student',
      byCourse: [],
      scope: {
        ...makeReport().scope,
        courseName: 'Software Engineering',
        windowLabel: 'Last 30 days',
      },
    });
    expect(find(report, 'breakdowns-empty')?.runs[0].text).toBe(
      'No marked answers in this course in the last 30 days.'
    );
  });

  it('omits the period when it is all time', () => {
    const report = makeReport({
      audience: 'student',
      byCourse: [],
      scope: { ...makeReport().scope, courseName: null, windowLabel: 'All time' },
    });
    expect(find(report, 'breakdowns-empty')?.runs[0].text).toBe('No marked answers.');
  });

  it('words the empty students and classes lines for a class and a school', () => {
    const teacher = fullTeacher({ students: [] });
    expect(find(teacher, 'students-empty')?.runs[0].text).toMatch(
      /^No student has a marked answer/
    );
    const school = makeReport({
      audience: 'school',
      classes: [],
      scope: { ...makeReport().scope, windowLabel: 'Last 90 days' },
    });
    expect(find(school, 'classes-empty')?.runs[0].text).toBe(
      'No class has a marked answer in the last 90 days.'
    );
  });

  it('prints no table of rows for a section it has nothing to show in', () => {
    const report = fullTeacher({ students: [] });
    expect(ids(report)).not.toContain('students');
    expect(ids(report)).not.toContain('heatmap');
  });
});

describe('grouping the topics', () => {
  it('groups topics under their course when no course is chosen', () => {
    const topics = find(fullTeacher(), 'topics');
    expect(topics?.kind).toBe('table');
    const rows = topics?.report?.type === 'table' ? topics.report.rows : [];
    expect(
      rows.filter((r) => r.type === 'group').map((r) => r.type === 'group' && r.label)
    ).toEqual(['Software Engineering', 'Enterprise Computing']);
  });

  it('lays topics flat when a course is chosen, with no course headings', () => {
    const report = fullTeacher({
      scope: { ...makeReport().scope, courseName: 'Software Engineering' },
    });
    const rows = find(report, 'topics')?.report;
    expect(rows?.type === 'table' && rows.rows.some((r) => r.type === 'group')).toBe(false);
  });
});

describe('labels', () => {
  it('names each tier by its full group title, with its number', () => {
    const bars = find(makeReport(), 'tiers');
    const labels = bars?.report?.type === 'barList' ? bars.report.rows.map((r) => r.label) : [];
    expect(labels).toEqual([
      '1 Remember & List',
      '2 Define & Describe',
      '3 Explain & Compare',
      '4 Analyse & Apply',
      '5 Discuss, Assess & Justify',
      '6 Evaluate, Synthesise & Create',
    ]);
  });

  it('gives a verb its tier and the most that tier can earn as the quieter second line', () => {
    const verbs = find(fullTeacher(), 'verbs');
    const first = verbs?.report?.type === 'table' ? verbs.report.rows[0] : null;
    expect(first?.type === 'body' && first.cells[0]).toEqual({
      type: 'text',
      text: 'Explain',
      sublabel: 'Tier 3 · up to Band 3',
    });
  });

  it('reads a tier-1 verb as capped at Band 1, never a higher band it cannot reach', () => {
    const report = makeReport({ byVerb: [{ ...row('State'), sublabel: 'Tier 1' }] });
    const verbs = find(report, 'verbs');
    const first = verbs?.report?.type === 'table' ? verbs.report.rows[0] : null;
    expect(first?.type === 'body' && first.cells[0]).toMatchObject({
      sublabel: 'Tier 1 · up to Band 1',
    });
  });

  it('leaves a sublabel that is not a tier as it was given', () => {
    const report = makeReport({ byVerb: [{ ...row('Explain'), sublabel: 'Something else' }] });
    const verbs = find(report, 'verbs');
    const first = verbs?.report?.type === 'table' ? verbs.report.rows[0] : null;
    expect(first?.type === 'body' && first.cells[0]).toMatchObject({ sublabel: 'Something else' });
  });

  it('shows one heatmap column per tier, in order, with the tier number', () => {
    const heat = find(fullTeacher(), 'heatmap');
    const cols = heat?.report?.type === 'heatmap' ? heat.report.columns : [];
    expect(cols.slice(1, 7).map((c) => c.header)).toEqual([
      '1 Remember & List',
      '2 Define & Describe',
      '3 Explain & Compare',
      '4 Analyse & Apply',
      '5 Discuss, Assess & Justify',
      '6 Evaluate, Synthesise & Create',
    ]);
  });

  it('gives a heatmap row one cell per tier, with the overall as a percentage', () => {
    const heat = find(fullTeacher(), 'heatmap');
    const rows = heat?.report?.type === 'heatmap' ? heat.report.rows : [];
    expect(rows).toHaveLength(2);
    rows.forEach((r) => {
      if (r.type !== 'body') throw new Error('heatmap rows are body rows');
      expect(r.cells).toHaveLength(8);
      expect(r.cells.slice(1, 7).every((c) => c.type === 'heat')).toBe(true);
      expect(r.cells[7].type).toBe('percent');
    });
  });
});

describe('notes that describe a table', () => {
  const recentNote =
    'The recent list shows the latest 25 of 40 marked answers. The summary and breakdowns cover all of them.';

  it('prints the recent-list note only when a recent list is drawn', () => {
    const withList = makeReport({
      notes: [recentNote],
      recent: [
        {
          at: new Date(2026, 8, 9, 12).toISOString(),
          course: null,
          topic: null,
          verb: null,
          mark: 2,
          totalMarks: 4,
          band: 3,
        },
      ],
    });
    expect(find(withList, 'about-notes')?.runs[0].text).toBe(recentNote);

    const switchedOff = makeReport({
      notes: [recentNote],
      sections: { ...makeReport().sections, recent: false },
    });
    expect(find(switchedOff, 'about-notes')).toBeUndefined();

    const noRows = makeReport({ notes: [recentNote], recent: [] });
    expect(find(noRows, 'about-notes')).toBeUndefined();
  });

  it('keeps the other notes when the recent-list note is dropped', () => {
    const report = makeReport({
      notes: [recentNote, 'History began on 14 Jul 2026.'],
      sections: { ...makeReport().sections, recent: false },
    });
    expect(find(report, 'about-notes')?.runs[0].text).toBe('History began on 14 Jul 2026.');
  });
});

describe('studentsTableDrawn: the rule the privacy notice follows', () => {
  it('is true only for a teacher or school with students listed and the section on', () => {
    expect(studentsTableDrawn(fullTeacher())).toBe(true);
    expect(
      studentsTableDrawn(makeReport({ audience: 'school', students: [student('Student 1')] }))
    ).toBe(true);
    expect(studentsTableDrawn(makeReport({ audience: 'student' }))).toBe(false);
    expect(studentsTableDrawn(fullTeacher({ students: [] }))).toBe(false);
    expect(studentsTableDrawn(fullTeacher({ students: undefined }))).toBe(false);
    expect(
      studentsTableDrawn(fullTeacher({ sections: { ...ALL_REPORT_SECTIONS, students: false } }))
    ).toBe(false);
  });
});

describe('the built tables measure with no NaN, including the gaps', () => {
  it('measures a full class, its sparkline gaps and its unscored rows, with every number finite', () => {
    const report = fullTeacher({
      students: [
        student('Ava Nguyen'),
        student('No Scores', {
          avgBand: null,
          markShare: null,
          bandChange: null,
          sparkline: [null, null],
          tierShares: [null, null, null, null, null, null],
          lastActiveAt: null,
        }),
      ],
      trend: trendOf([null, 3, null, 5]),
      averageBand: null,
    });
    const measured = measureBlocks(buildReportBlocks(report), reportMeasurer, geo, 1);
    measured.forEach((m) => {
      expect(Number.isFinite(m.height)).toBe(true);
      if (m.reportLayout) expect(allFinite(m.reportLayout)).toBe(true);
    });
  });
});
