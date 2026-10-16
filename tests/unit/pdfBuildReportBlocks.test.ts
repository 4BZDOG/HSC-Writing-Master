import { describe, it, expect } from 'vitest';
import { buildReportBlocks, attainmentBand, reportAccent } from '../../pdf/buildReportBlocks';
import { bandColor, COLORS } from '../../pdf/buildBlocks';
import { measureBlocks, computeGeometry } from '../../pdf/layout';
import { ALL_REPORT_SECTIONS, type ReportSections } from '../../pdf/reportModel';
import { reportMeasurer, makeReport, allFinite, trendOf } from './pdfReportHelpers';

const ids = (report: Parameters<typeof buildReportBlocks>[0]) =>
  buildReportBlocks(report).map((b) => b.id);
const kinds = (report: Parameters<typeof buildReportBlocks>[0]) =>
  buildReportBlocks(report).map((b) => b.kind);

const geo = computeGeometry({
  size: 'a4',
  columnsPerPage: 2,
  columnGap: 7,
  headerHeight: 10,
  footerHeight: 8,
  margin: 10,
});

describe('buildReportBlocks: page order', () => {
  it('builds the page order, with the empty breakdowns said once under the first', () => {
    // No answers in any breakdown: one heading and one line stand for all four.
    expect(kinds(makeReport())).toEqual([
      'masthead',
      'paragraph',
      'statStrip',
      'heading',
      'lineChart',
      'heading',
      'barList',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
    ]);
  });
  it('gives every report block the full width, so the flow spans the page', () => {
    const blocks = buildReportBlocks(makeReport());
    blocks.forEach((b) => expect(b.fullWidth).toBe(true));
  });

  it('gives every heading the full width too, so it sits over its chart, not in a column', () => {
    buildReportBlocks(makeReport())
      .filter((b) => b.kind === 'heading')
      .forEach((b) => expect(b.fullWidth).toBe(true));
  });
});

describe('buildReportBlocks: section toggles', () => {
  it('omits the chart and its heading when the trend section is off', () => {
    const out = ids(makeReport({ sections: { ...ALL_REPORT_SECTIONS, trend: false } }));
    expect(out).not.toContain('trend');
    expect(out).not.toContain('h-trend');
  });

  it('omits the tier bars and their heading when the tiers section is off', () => {
    const out = ids(makeReport({ sections: { ...ALL_REPORT_SECTIONS, tiers: false } }));
    expect(out).not.toContain('tiers');
    expect(out).not.toContain('h-tiers');
  });

  it('leaves only the masthead, scope, result strip and notes when every section is off', () => {
    const out = ids(
      makeReport({
        sections: {
          ...ALL_REPORT_SECTIONS,
          trend: false,
          tiers: false,
          courses: false,
          topics: false,
          verbs: false,
        },
      })
    );
    expect(out).toEqual(['mast', 'scope', 'stat', 'h-about', 'about-notes']);
  });
  it('prints the result strip whatever the sections say', () => {
    const allOff: ReportSections = {
      trend: false,
      tiers: false,
      courses: false,
      topics: false,
      verbs: false,
      recent: false,
      students: false,
      classes: false,
    };
    expect(ids(makeReport({ sections: allOff }))).toContain('stat');
  });

  it('prints a table only for a section that is on and has rows', () => {
    const rows = [{ label: 'Software Engineering', attempts: 3, avgBand: 4, markShare: 0.6 }];
    const report = makeReport({ byCourse: rows, byVerb: rows, byTopic: [] });
    const tables = buildReportBlocks(report)
      .filter((b) => b.kind === 'table')
      .map((b) => b.id);
    expect(tables).toEqual(['courses', 'verbs']);

    const off = buildReportBlocks(
      makeReport({
        byCourse: rows,
        byVerb: rows,
        sections: { ...ALL_REPORT_SECTIONS, courses: false },
      })
    )
      .filter((b) => b.kind === 'table')
      .map((b) => b.id);
    expect(off).toEqual(['verbs']);
  });
});

/** A report with no answers at all: the empty line the data side gives for it. */
const noAnswers = {
  answerCount: 0,
  trend: [],
  trendCaption: 'No marked answers in this period to plot yet.',
};

describe('buildReportBlocks: empty states', () => {
  it('replaces an empty chart with a sentence that says what would fill it, never an empty frame', () => {
    const blocks = buildReportBlocks(makeReport(noAnswers));
    expect(blocks.some((b) => b.kind === 'lineChart')).toBe(false);
    const note = blocks.find((b) => b.id === 'trend-empty');
    expect(note?.runs[0].text).toMatch(/No marked answers/);
    expect(note?.runs[0].text).toMatch(/one point on this line/);
  });

  it('words the empty note for a class and a school, not for one student', () => {
    const teacher = buildReportBlocks(makeReport({ ...noAnswers, audience: 'teacher' }));
    const school = buildReportBlocks(makeReport({ ...noAnswers, audience: 'school' }));
    const teacherText = teacher.find((b) => b.id === 'trend-empty')?.runs[0].text;
    expect(teacherText).toMatch(/^No marked answers in these classes/);
    expect(teacherText).toMatch(/The line fills in as answers are marked\.$/);
    expect(teacherText).not.toMatch(/one point on this line/);
    expect(school.find((b) => b.id === 'trend-empty')?.runs[0].text).toMatch(/in these classes/);
  });

  it('prints every tier as not attempted when nothing was attempted', () => {
    const report = makeReport({
      tiers: [1, 2, 3, 4, 5, 6].map((tier) => ({
        tier,
        label: `T${tier}`,
        attempts: 0,
        markShare: null,
      })),
    });
    const bars = buildReportBlocks(report).find((b) => b.kind === 'barList');
    expect(bars?.report?.type === 'barList' && bars.report.rows).toHaveLength(6);
    bars?.report?.type === 'barList' &&
      bars.report.rows.forEach((r) => {
        expect(r.attempts).toBe(0);
        expect(r.share).toBeNull();
      });
  });

  it('drops the tier section when there are no tiers at all', () => {
    const out = ids(makeReport({ tiers: [] }));
    expect(out).not.toContain('h-tiers');
    expect(out).not.toContain('tiers');
  });

  it('omits the About section when there are no notes', () => {
    const out = ids(makeReport({ notes: [] }));
    expect(out).not.toContain('h-about');
    expect(out).not.toContain('about-notes');
  });

  it('builds a report with no history, no headline and no notes without error', () => {
    const blocks = buildReportBlocks(
      makeReport({ ...noAnswers, headline: [], averageBand: null, notes: [] })
    );
    expect(blocks.map((b) => b.id)).toEqual([
      'mast',
      'scope',
      'h-trend',
      'trend-empty',
      'h-tiers',
      'tiers',
      'h-courses',
      'breakdowns-empty',
    ]);
  });
});

describe('buildReportBlocks: the empty chart never contradicts the headline', () => {
  const trendNote = (over: Parameters<typeof makeReport>[0]) =>
    buildReportBlocks(makeReport({ trend: [], ...over })).find((b) => b.id === 'trend-empty')
      ?.runs[0].text;

  it("says what is missing in the report's own scope when it has no answers", () => {
    expect(
      trendNote({ answerCount: 0, trendCaption: 'No marked answers in this period to plot yet.' })
    ).toBe(
      'No marked answers in the last 90 days. Each answer you mark in the app is one point on this line.'
    );
  });

  it('says there are no answers, not that the history is kept elsewhere, when a report has none', () => {
    const text = trendNote({
      answerCount: 0,
      scope: { ...makeReport().scope, windowLabel: 'All time' },
      trendCaption: 'Progress over time is kept for signed-in accounts.',
    });
    expect(text).toBe(
      'No marked answers. Each answer you mark in the app is one point on this line.'
    );
  });

  it('never says there are no answers when the report counts some', () => {
    const text = trendNote({
      answerCount: 23,
      trendCaption: 'No marked answers in this period to plot yet.',
    });
    expect(text).not.toMatch(/No marked answers/);
    expect(text).toMatch(/counted above/);
  });

  it('prints the caption that explains a stats-only report, under its answers', () => {
    expect(
      trendNote({
        answerCount: 23,
        trendCaption: 'Progress over time is kept for signed-in accounts.',
      })
    ).toBe('Progress over time is kept for signed-in accounts.');
  });

  it('does not repeat the points caption under an empty chart', () => {
    const text = trendNote({ answerCount: 0, trendCaption: 'Each point is one marked answer' });
    expect(text).not.toMatch(/^Each point/);
    expect(text).toMatch(/No marked answers/);
  });

  it('gives the average its window, so a 90-day mean is never captioned all-time', () => {
    const chart = buildReportBlocks(
      makeReport({
        scope: { ...makeReport().scope, windowLabel: 'Last 90 days' },
        averageBand: 4.2,
      })
    ).find((b) => b.kind === 'lineChart');
    expect(chart?.report?.type === 'lineChart' && chart.report.averageWindow).toBe('Last 90 days');
  });
});

describe('buildReportBlocks: bars on few answers', () => {
  const tierRows = (attempts: number) =>
    [1, 2, 3, 4, 5, 6].map((tier) => ({
      tier,
      label: `T${tier}`,
      attempts: tier === 3 ? attempts : 0,
      markShare: tier === 3 ? 0.25 : null,
    }));
  const aboutText = (report: ReturnType<typeof makeReport>) =>
    buildReportBlocks(report).find((b) => b.id === 'about-notes')?.runs[0].text ?? '';

  it('adds the lighter-bars note to About when a tier bar has fewer than three answers', () => {
    expect(aboutText(makeReport({ tiers: tierRows(1), notes: [] }))).toBe(
      'Bars with fewer than 3 answers are drawn lighter.'
    );
    expect(
      aboutText(makeReport({ tiers: tierRows(2), notes: ['History began on 14 Jul 2026.'] }))
    ).toBe('History began on 14 Jul 2026.\nBars with fewer than 3 answers are drawn lighter.');
  });

  it('does not add the note when every bar has three answers or more, or none', () => {
    expect(aboutText(makeReport({ tiers: tierRows(3), notes: ['A note.'] }))).toBe('A note.');
    expect(aboutText(makeReport({ tiers: tierRows(0), notes: ['A note.'] }))).toBe('A note.');
  });

  it('does not add the note when the tiers section is off, so no bar is drawn', () => {
    const report = makeReport({
      tiers: tierRows(1),
      notes: [],
      sections: { ...ALL_REPORT_SECTIONS, tiers: false },
    });
    expect(aboutText(report)).not.toMatch(/drawn lighter/);
  });
});

describe('buildReportBlocks: one point, not a line', () => {
  it('says why there is no line when the chart has a single point', () => {
    const chart = buildReportBlocks(makeReport({ trend: trendOf([4]) })).find(
      (b) => b.kind === 'lineChart'
    );
    expect(chart).toBeDefined();
    expect(chart?.report?.type === 'lineChart' && chart.report.caption).toMatch(
      /one point so far, so there is no line yet/
    );
  });

  it('keeps the plain caption once there are two points', () => {
    const chart = buildReportBlocks(makeReport({ trend: trendOf([4, 5]) })).find(
      (b) => b.kind === 'lineChart'
    );
    expect(chart?.report?.type === 'lineChart' && chart.report.caption).toBe(
      'Each point is one marked answer'
    );
  });
});

describe('buildReportBlocks: scope and masthead', () => {
  it('leads the scope line with the course, or "All courses"', () => {
    const all = buildReportBlocks(makeReport()).find((b) => b.id === 'scope');
    expect(all?.runs[0].text.startsWith('All courses')).toBe(true);
    const one = buildReportBlocks(
      makeReport({ scope: { ...makeReport().scope, courseName: 'Software Engineering' } })
    ).find((b) => b.id === 'scope');
    expect(one?.runs[0].text.startsWith('Software Engineering')).toBe(true);
  });

  it('names the class for a teacher or school report, and "All classes" when none is chosen', () => {
    const teacher = buildReportBlocks(makeReport({ audience: 'teacher' })).find(
      (b) => b.id === 'scope'
    );
    expect(teacher?.runs[0].text).toContain('All classes');
    const named = buildReportBlocks(
      makeReport({
        audience: 'teacher',
        scope: { ...makeReport().scope, className: 'Enterprise 12A' },
      })
    ).find((b) => b.id === 'scope');
    expect(named?.runs[0].text).toContain('Enterprise 12A');
  });

  it('prints the scope dates as a range, and the generated date', () => {
    const scope = buildReportBlocks(makeReport()).find((b) => b.id === 'scope')?.runs[0].text;
    expect(scope).toMatch(/14 Jul – \d{1,2} (Jul|Aug)/);
    expect(scope).toMatch(/Generated 11 Oct 2026/);
  });

  it('names the subject and the school in the masthead subtitle, and drops the name fields', () => {
    const mast = buildReportBlocks(makeReport())[0];
    expect(mast.kind).toBe('masthead');
    expect(mast.subText).toBe('Jordan Lee · Student · Northern Valley High School');
    expect(mast.fields).toBe(false);
    expect(mast.label).toBe('Progress report');
  });
});

describe('buildReportBlocks: the one accent', () => {
  it('takes the band colour of the all-time average', () => {
    expect(attainmentBand(makeReport({ averageBand: 4.3 }))).toBe(4);
    expect(reportAccent(makeReport({ averageBand: 4.3 }))).toEqual(bandColor(4));
  });

  it('falls back to the first headline band when there is no average', () => {
    const report = makeReport({
      averageBand: null,
      headline: [
        { label: 'Answers', value: '3' },
        { label: 'Latest', value: 'Band 2', band: 2 },
      ],
    });
    expect(attainmentBand(report)).toBe(2);
  });

  it('uses the structure colour, not an invented band, when there is no attainment at all', () => {
    const report = makeReport({
      averageBand: null,
      headline: [{ label: 'Classes', value: '5' }],
    });
    expect(attainmentBand(report)).toBeNull();
    expect(reportAccent(report)).toEqual(COLORS.slate);
  });

  it('draws the tier bars and the chart in that accent', () => {
    const blocks = buildReportBlocks(makeReport({ averageBand: 5.2 }));
    expect(blocks.find((b) => b.kind === 'barList')?.accent).toEqual(bandColor(5));
    expect(blocks.find((b) => b.kind === 'lineChart')?.accent).toEqual(bandColor(5));
  });
});

describe('buildReportBlocks: About this report', () => {
  it('carries each caveat on its own line inside one framed note', () => {
    const about = buildReportBlocks(
      makeReport({ notes: ['First caveat.', 'Second caveat.'] })
    ).find((b) => b.id === 'about-notes');
    expect(about?.panel).toBe(true);
    expect(about?.runs[0].text).toBe('First caveat.\nSecond caveat.');
  });
});

describe('buildReportBlocks: every computed coordinate is finite', () => {
  it('measures every report block with no NaN, across the empty and the full cases', () => {
    const cases = [
      makeReport(),
      makeReport({ trend: trendOf([4]) }),
      makeReport({ trend: [] }),
      makeReport({ averageBand: null, headline: [], tiers: [] }),
      makeReport({ trend: trendOf([null, null]) }),
    ];
    for (const report of cases) {
      const measured = measureBlocks(buildReportBlocks(report), reportMeasurer, geo, 1);
      measured.forEach((m) => {
        expect(Number.isFinite(m.height)).toBe(true);
        if (m.reportLayout) expect(allFinite(m.reportLayout)).toBe(true);
      });
    }
  });

  it('keeps the average, the points and the bars finite at a small scale', () => {
    const report = makeReport({
      trend: trendOf([1, 2, null, 6, 4.4]),
      averageBand: 3.7,
    });
    const scale = 0.75;
    const g = computeGeometry({
      size: 'letter',
      columnsPerPage: 2,
      columnGap: 7 * scale,
      headerHeight: 10 * scale,
      footerHeight: 8 * scale,
      margin: 10,
    });
    const measured = measureBlocks(buildReportBlocks(report), reportMeasurer, g, scale);
    expect(measured.some((m) => m.kind === 'lineChart')).toBe(true);
    measured.forEach((m) => {
      if (m.reportLayout) expect(allFinite(m.reportLayout)).toBe(true);
    });
  });
});
