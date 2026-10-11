// pdf/buildReportBlocks.ts
//
// Pure transform: a ProgressReport (the data side's aggregated, filtered, named
// result) -> the ordered ContentBlock[] the layout engine flows. No DOM, no jsPDF.
//
// Page order, as the progress-report plan sets it:
//   masthead → scope line → result strip → progress over time → command-verb tiers
//   → [phase 2: by course · by topic · by verb · recent attempts / students and
//      tier heatmap / classes] → About this report
//
// Sections the user switched off are absent, not blank. A section with nothing to
// show says what is missing and what would fill it, rather than printing an empty
// frame. The result strip always prints when the data has one.

import type { ProgressReport, ReportAudience, ReportBreakdownRow } from './reportModel';
import type { ContentBlock, TextRun } from './types';
import type { TableColumn, TableRow } from './reportBlocks';
import type { IconName } from './icons';
import { bandColor, COLORS } from './buildBlocks';
import { normalizeContent } from './text';
import { formatDateRange, formatShortDate } from './reportFormat';
import { TIER_GROUPS } from '../data/commandTerms';

type Rgb = [number, number, number];

const clampBand = (band: number): number => Math.min(6, Math.max(1, Math.round(band)));

/**
 * The band the report's accent stands for: the all-time average, else the first
 * headline cell that carries a band. Null when the report has no attainment to
 * speak of (a class or a school with no single average), in which case the
 * structure colour is used instead of inventing one.
 */
export const attainmentBand = (report: ProgressReport): number | null => {
  if (typeof report.averageBand === 'number' && Number.isFinite(report.averageBand)) {
    return clampBand(report.averageBand);
  }
  const cell = report.headline.find((c) => typeof c.band === 'number');
  return typeof cell?.band === 'number' ? clampBand(cell.band) : null;
};

/** The one accent a report carries: attainment's band colour, or structure's slate. */
export const reportAccent = (report: ProgressReport): Rgb => {
  const band = attainmentBand(report);
  return band === null ? COLORS.slate : bandColor(band);
};

const run = (text: string, baseFontPt: number, extra: Partial<TextRun> = {}): TextRun => ({
  text: normalizeContent(text),
  baseFontPt,
  ...extra,
});

/** A section heading: icon, display label, rule underneath. Structure is slate. */
const heading = (id: string, label: string, icon: IconName): ContentBlock => ({
  kind: 'heading',
  id,
  // Spans the page like everything else in the report. A heading in one column
  // would flow as a column band of its own, apart from the chart it introduces.
  fullWidth: true,
  runs: [run(label, 9, { style: 'bold', color: COLORS.ink })],
  icon,
  display: true,
  accent: COLORS.slate,
  basePadTop: 4.6,
  basePadBottom: 2,
});

/** A quiet paragraph: an empty section's explanation, or a line of scope. */
const note = (id: string, text: string): ContentBlock => ({
  kind: 'paragraph',
  id,
  fullWidth: true,
  runs: [run(text, 8.5, { color: COLORS.muted, lineHeightFactor: 1.4 })],
  basePadBottom: 3,
});

/** The masthead's subtitle: who the report is about, and where they belong. */
const subjectLine = (report: ProgressReport): string => {
  const parts = [report.subject.name, report.subject.roleLabel];
  if (report.subject.school) parts.push(report.subject.school);
  return parts.filter(Boolean).join(' · ');
};

/**
 * The scope line under the masthead: what was narrowed and over what dates, and
 * when the report was made. The course leads in ink; the rest is quiet.
 */
const scopeBlock = (report: ProgressReport): ContentBlock => {
  const course = report.scope.courseName ?? 'All courses';
  const rest: string[] = [report.scope.windowLabel];
  if (report.audience !== 'student') rest.push(report.scope.className ?? 'All classes');
  else if (report.scope.className) rest.push(report.scope.className);
  const dates = formatDateRange(report.scope.firstAttemptAt, report.scope.lastAttemptAt);
  if (dates) rest.push(dates);
  rest.push(`Generated ${formatShortDate(report.generatedAt, true)}`);
  const tail = ` · ${rest.join(' · ')}`;
  return {
    kind: 'paragraph',
    id: 'scope',
    fullWidth: true,
    runs: [
      {
        text: course + tail,
        baseFontPt: 8,
        color: COLORS.muted,
        lineHeightFactor: 1.35,
        // Built as spans rather than parsed, so a course name containing an
        // asterisk or underscore is printed as it was given.
        spans: [
          { text: course, style: 'bold', color: COLORS.ink },
          { text: tail, style: 'normal', color: COLORS.muted },
        ],
      },
    ],
    basePadBottom: 4,
  };
};

const emptyTrendNote = (audience: ReportAudience): string =>
  audience === 'student'
    ? 'No marked answers in this period yet. Each answer you mark in the app is one point on this line.'
    : audience === 'teacher'
      ? 'No marked answers from these students in this period. The line fills in as answers are marked.'
      : 'No marked answers from these classes in this period. The line fills in as answers are marked.';

/** The progress chart, or the sentence that says why there is none. */
const trendBlocks = (report: ProgressReport): ContentBlock[] => {
  const blocks: ContentBlock[] = [heading('h-trend', 'Progress over time', 'trend')];
  if (!report.trend.length) {
    blocks.push(note('trend-empty', emptyTrendNote(report.audience)));
    return blocks;
  }
  // One point is a point, not a line. The caption says so rather than leaving a
  // lone dot to look like a chart that failed to draw.
  const caption =
    report.trend.length === 1
      ? `${report.trendCaption.replace(/\.\s*$/, '')} · one point so far, so there is no line yet`
      : report.trendCaption;
  blocks.push({
    kind: 'lineChart',
    id: 'trend',
    fullWidth: true,
    runs: [],
    report: {
      type: 'lineChart',
      points: report.trend,
      averageBand: report.averageBand,
      caption,
    },
    accent: reportAccent(report),
    basePadBottom: 4,
  });
  return blocks;
};

/** The full title of a command-verb tier, as the app names the group ("Define & Describe"). */
const tierTitle = (tier: number): string =>
  TIER_GROUPS.find((g) => g.tier === tier)?.title ?? `Tier ${tier}`;

/** The six command-verb tiers as bars: mark share, with the attempts beside it. */
const tierBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.tiers.length) return [];
  return [
    heading('h-tiers', 'Command verb tiers', 'tiers'),
    {
      kind: 'barList',
      id: 'tiers',
      fullWidth: true,
      runs: [],
      report: {
        type: 'barList',
        rows: report.tiers.map((t) => ({
          label: `${t.tier} ${tierTitle(t.tier)}`,
          share: t.markShare,
          attempts: t.attempts,
        })),
      },
      accent: reportAccent(report),
      basePadBottom: 4,
    },
  ];
};

// --- Tables -----------------------------------------------------------------

const column = (
  key: string,
  header: string,
  kind: TableColumn['kind'],
  widthWeight: number,
  align: TableColumn['align'] = 'left'
): TableColumn => ({ key, header, kind, widthWeight, align });

/** The phrase that says what was narrowed, for an empty section's sentence. */
const scopeWords = (report: ProgressReport, what: 'answers' | 'students' | 'classes'): string => {
  const head =
    what === 'students'
      ? 'No student has a marked answer'
      : what === 'classes'
        ? 'No class has a marked answer'
        : 'No marked answers';
  const place =
    what === 'classes'
      ? ''
      : report.scope.courseName
        ? 'in this course'
        : report.audience === 'student'
          ? ''
          : report.scope.className
            ? 'in this class'
            : 'in these classes';
  const when =
    report.scope.windowLabel === 'All time'
      ? ''
      : `in the ${report.scope.windowLabel.toLowerCase()}`;
  return `${[head, place, when].filter(Boolean).join(' ')}.`;
};

/** A section that is on but has nothing in scope: one muted sentence saying why, never an empty frame. */
const emptySection = (
  id: string,
  report: ProgressReport,
  what: 'answers' | 'students' | 'classes'
): ContentBlock => note(id, scopeWords(report, what));

/** Rows of a breakdown: a name, its answers, its marks earned and its band. */
const breakdownRows = (
  rows: ReportBreakdownRow[],
  options: { grouped: boolean; sublabel: boolean }
): TableRow[] => {
  const body = (r: ReportBreakdownRow): TableRow => ({
    type: 'body',
    cells: [
      {
        type: 'text',
        text: r.label,
        ...(options.sublabel && r.sublabel ? { sublabel: r.sublabel } : {}),
      },
      { type: 'number', value: r.attempts },
      { type: 'bar', value: r.markShare },
      { type: 'band', value: r.avgBand },
    ],
  });
  if (!options.grouped) return rows.map(body);
  // Under each course, in the order the rows already carry (weakest first).
  const groups = new Map<string, ReportBreakdownRow[]>();
  for (const r of rows) {
    const key = r.sublabel ?? 'Course not recorded';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].flatMap(([label, items]) => [
    { type: 'group', label } as TableRow,
    ...items.map(body),
  ]);
};

const breakdownColumns = (first: string): TableColumn[] => [
  column('name', first, 'text', 5),
  column('answers', 'Answers', 'number', 1.5, 'right'),
  column('marks', 'Marks earned', 'bar', 3.4),
  column('band', 'Avg band', 'band', 1.9, 'center'),
];

const tableBlock = (
  id: string,
  columns: TableColumn[],
  rows: TableRow[],
  accent: [number, number, number],
  zebra = false
): ContentBlock => ({
  kind: 'table',
  id,
  fullWidth: true,
  runs: [],
  report: { type: 'table', columns, rows, ...(zebra ? { zebra: true } : {}) },
  accent,
  breakable: true,
  basePadBottom: 4,
});

/** The by-course table: a student's courses, or a class's. */
const courseBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.sections.courses) return [];
  const blocks: ContentBlock[] = [heading('h-courses', 'By course', 'course')];
  if (!report.byCourse.length) {
    blocks.push(emptySection('courses-empty', report, 'answers'));
    return blocks;
  }
  blocks.push(
    tableBlock(
      'courses',
      breakdownColumns('Course'),
      breakdownRows(report.byCourse, { grouped: false, sublabel: false }),
      reportAccent(report)
    )
  );
  return blocks;
};

/** The by-topic table: grouped under course headings when no course is chosen, flat when one is. */
const topicBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.sections.topics) return [];
  const blocks: ContentBlock[] = [heading('h-topics', 'By topic', 'topic')];
  if (!report.byTopic.length) {
    blocks.push(emptySection('topics-empty', report, 'answers'));
    return blocks;
  }
  blocks.push(
    tableBlock(
      'topics',
      breakdownColumns('Topic'),
      breakdownRows(report.byTopic, {
        grouped: report.scope.courseName === null,
        sublabel: false,
      }),
      reportAccent(report)
    )
  );
  return blocks;
};

/** The by-verb table: each command verb, with its tier as the quieter line. */
const verbBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.sections.verbs) return [];
  const blocks: ContentBlock[] = [heading('h-verbs', 'By command verb', 'verb')];
  if (!report.byVerb.length) {
    blocks.push(emptySection('verbs-empty', report, 'answers'));
    return blocks;
  }
  blocks.push(
    tableBlock(
      'verbs',
      breakdownColumns('Command verb'),
      breakdownRows(report.byVerb, { grouped: false, sublabel: true }),
      reportAccent(report)
    )
  );
  return blocks;
};

/** A recent attempt's mark, as "3 / 5". The mark is printed; nothing is inferred. */
const markText = (mark: number | null, total: number | null): string => {
  if (mark === null) return '—';
  return total === null ? `${mark}` : `${mark} / ${total}`;
};

/** The student's recent attempts, newest first, as the data side caps them. */
const recentBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.sections.recent || report.recent === undefined) return [];
  const blocks: ContentBlock[] = [heading('h-recent', 'Recent attempts', 'clock')];
  if (!report.recent.length) {
    blocks.push(emptySection('recent-empty', report, 'answers'));
    return blocks;
  }
  const columns = [
    column('at', 'Date', 'date', 2.4),
    column('topic', 'Course and topic', 'text', 5),
    column('verb', 'Verb', 'text', 2.4),
    column('mark', 'Mark', 'text', 1.6, 'right'),
    column('band', 'Band', 'band', 1.8, 'center'),
  ];
  const rows: TableRow[] = report.recent.map((r) => ({
    type: 'body',
    cells: [
      { type: 'date', iso: r.at },
      {
        type: 'text',
        text: r.topic ?? 'Topic not recorded',
        // The course is named in the scope line when one is chosen, so it is not repeated per row.
        ...(r.course && report.scope.courseName === null ? { sublabel: r.course } : {}),
      },
      { type: 'text', text: r.verb ?? '—' },
      { type: 'text', text: markText(r.mark, r.totalMarks) },
      { type: 'band', value: r.band },
    ],
  }));
  blocks.push(tableBlock('recent', columns, rows, reportAccent(report)));
  return blocks;
};

/** The students a teacher or school sees: one row each, weakest first as the data side orders them. */
const studentBlocks = (report: ProgressReport): ContentBlock[] => {
  if (report.audience === 'student' || !report.sections.students || report.students === undefined)
    return [];
  const students = report.students;
  const blocks: ContentBlock[] = [heading('h-students', 'Students', 'people')];
  if (!students.length) {
    blocks.push(emptySection('students-empty', report, 'students'));
    return blocks;
  }
  const columns = [
    column('student', 'Student', 'text', 4.2),
    column('answers', 'Answers', 'number', 1.5, 'right'),
    column('marks', 'Marks earned', 'bar', 3.4),
    column('band', 'Avg band', 'band', 1.9, 'center'),
    column('trend', 'Trend, 12 weeks', 'sparkline', 2.6, 'center'),
    column('change', 'Change', 'change', 1.9, 'right'),
    column('last', 'Last active', 'date', 2.4),
  ];
  const rows: TableRow[] = students.map((s) => ({
    type: 'body',
    cells: [
      { type: 'text', text: s.name },
      { type: 'number', value: s.attempts },
      { type: 'bar', value: s.markShare },
      { type: 'band', value: s.avgBand },
      { type: 'sparkline', points: s.sparkline },
      { type: 'change', value: s.bandChange },
      { type: 'date', iso: s.lastActiveAt },
    ],
  }));
  blocks.push(tableBlock('students', columns, rows, reportAccent(report), true));

  // The tier heatmap, by student: the same students, six tiers across.
  blocks.push(heading('h-heatmap', 'Tiers by student', 'tiers'));
  blocks.push({
    kind: 'paragraph',
    id: 'heat-legend',
    fullWidth: true,
    keepWithNext: true,
    runs: [
      run('Share of marks earned by command-verb tier. — = not attempted.', 7.2, {
        color: COLORS.muted,
        lineHeightFactor: 1.3,
      }),
    ],
    basePadBottom: 2.5,
  });
  const heatColumns = [
    column('student', 'Student', 'text', 3.4),
    ...[1, 2, 3, 4, 5, 6].map((tier) =>
      column(`tier${tier}`, `${tier} ${tierTitle(tier)}`, 'heat', 1.25, 'center')
    ),
    column('overall', 'Overall', 'percent', 1.5, 'right'),
  ];
  const heatRows: TableRow[] = students.map((s) => ({
    type: 'body',
    cells: [
      { type: 'text', text: s.name },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ type: 'heat' as const, value: s.tierShares[i] ?? null })),
      { type: 'percent', value: s.markShare },
    ],
  }));
  blocks.push({
    kind: 'heatmap',
    id: 'heatmap',
    fullWidth: true,
    runs: [],
    report: { type: 'heatmap', columns: heatColumns, rows: heatRows },
    accent: reportAccent(report),
    breakable: true,
    basePadBottom: 4,
  });
  return blocks;
};

/** The school's classes: one row each, as the data side gives them. */
const classBlocks = (report: ProgressReport): ContentBlock[] => {
  if (!report.sections.classes || report.classes === undefined) return [];
  const blocks: ContentBlock[] = [heading('h-classes', 'Classes', 'class')];
  if (!report.classes.length) {
    blocks.push(emptySection('classes-empty', report, 'classes'));
    return blocks;
  }
  const columns = [
    column('class', 'Class', 'text', 3.6),
    column('year', 'Year', 'text', 1.4),
    column('students', 'Students', 'number', 1.6, 'right'),
    column('answers', 'Answers', 'number', 1.5, 'right'),
    column('marks', 'Marks earned', 'bar', 3.4),
    column('band', 'Avg band', 'band', 1.9, 'center'),
  ];
  const rows: TableRow[] = report.classes.map((c) => ({
    type: 'body',
    cells: [
      { type: 'text', text: c.name },
      { type: 'text', text: c.year === null ? '—' : `Year ${c.year}` },
      { type: 'number', value: c.students },
      { type: 'number', value: c.attempts },
      { type: 'bar', value: c.markShare },
      { type: 'band', value: c.avgBand },
    ],
  }));
  blocks.push(tableBlock('classes', columns, rows, reportAccent(report)));
  return blocks;
};

/**
 * Whether this report's PDF prints student names: the students table is drawn, and
 * the names are not replaced. Single source for the footer's privacy notice, so
 * the notice can never claim a table the document does not carry.
 */
export const studentsTableDrawn = (report: ProgressReport): boolean =>
  report.audience !== 'student' &&
  report.sections.students &&
  report.students !== undefined &&
  report.students.length > 0;

/** Whether the recent-attempts table is drawn, so its note can be printed. */
const recentTableDrawn = (report: ProgressReport): boolean =>
  report.sections.recent && report.recent !== undefined && report.recent.length > 0;

const RECENT_NOTE = /^The recent list shows the latest \d+ of \d+/;

/** About this report: the caveats, each on its own line inside one framed note. */
const aboutBlocks = (report: ProgressReport): ContentBlock[] => {
  // The recent-list note describes a table. Printed without one it would describe
  // nothing on the page, so it is kept only when the table is drawn.
  const notes = report.notes.filter((n) => !RECENT_NOTE.test(n) || recentTableDrawn(report));
  if (!notes.length) return [];
  const text = notes.join('\n');
  return [
    heading('h-about', 'About this report', 'info'),
    {
      kind: 'paragraph',
      id: 'about-notes',
      fullWidth: true,
      panel: true,
      panelAccent: COLORS.slate,
      breakable: true,
      runs: [
        {
          text,
          baseFontPt: 8.5,
          color: COLORS.body,
          lineHeightFactor: 1.4,
          spans: [{ text, style: 'normal', color: COLORS.body }],
        },
      ],
      basePadBottom: 2,
    },
  ];
};

/**
 * Build the progress report's block list. Sections switched off in
 * `report.sections` are not emitted at all.
 */
export const buildReportBlocks = (report: ProgressReport): ContentBlock[] => {
  const accent = reportAccent(report);
  const blocks: ContentBlock[] = [];

  blocks.push({
    kind: 'masthead',
    id: 'mast',
    fullWidth: true,
    label: report.title,
    subText: subjectLine(report),
    fields: false,
    accent,
    runs: [],
    basePadBottom: 3,
  });

  blocks.push(scopeBlock(report));

  if (report.headline.length) {
    blocks.push({
      kind: 'statStrip',
      id: 'stat',
      fullWidth: true,
      runs: [],
      report: { type: 'statStrip', cells: report.headline },
      accent,
      basePadBottom: 2,
    });
  }

  if (report.sections.trend) blocks.push(...trendBlocks(report));
  if (report.sections.tiers) blocks.push(...tierBlocks(report));

  // Page order: by course, by topic, by verb; then the student's recent attempts,
  // or a class's students and tier heatmap; then a school's classes; then the notes.
  blocks.push(...courseBlocks(report));
  blocks.push(...topicBlocks(report));
  blocks.push(...verbBlocks(report));
  blocks.push(...recentBlocks(report));
  blocks.push(...studentBlocks(report));
  blocks.push(...classBlocks(report));

  blocks.push(...aboutBlocks(report));
  return blocks;
};
