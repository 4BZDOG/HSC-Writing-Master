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
  it('builds the page order, with one muted line for each section that is on but empty', () => {
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

describe('buildReportBlocks: empty states', () => {
  it('replaces an empty chart with a sentence that says what would fill it, never an empty frame', () => {
    const blocks = buildReportBlocks(makeReport({ trend: [] }));
    expect(blocks.some((b) => b.kind === 'lineChart')).toBe(false);
    const note = blocks.find((b) => b.id === 'trend-empty');
    expect(note?.runs[0].text).toMatch(/No marked answers/);
    expect(note?.runs[0].text).toMatch(/one point on this line/);
  });

  it('words the empty note for a class and a school, not for one student', () => {
    const teacher = buildReportBlocks(makeReport({ audience: 'teacher', trend: [] }));
    const school = buildReportBlocks(makeReport({ audience: 'school', trend: [] }));
    expect(teacher.find((b) => b.id === 'trend-empty')?.runs[0].text).toMatch(/these students/);
    expect(school.find((b) => b.id === 'trend-empty')?.runs[0].text).toMatch(/these classes/);
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
      makeReport({ headline: [], trend: [], averageBand: null, notes: [] })
    );
    expect(blocks.map((b) => b.id)).toEqual([
      'mast',
      'scope',
      'h-trend',
      'trend-empty',
      'h-tiers',
      'tiers',
      'h-courses',
      'courses-empty',
      'h-topics',
      'topics-empty',
      'h-verbs',
      'verbs-empty',
    ]);
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
