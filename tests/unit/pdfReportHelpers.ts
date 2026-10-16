// Shared fixtures for the progress-report tests: a deterministic text measurer,
// and a small report factory. Not a test file — the runner only picks up *.test.ts.

import { MM_PER_PT, type TextMeasurer } from '../../pdf/types';
import type { ProgressReport, ReportTrendPoint } from '../../pdf/reportModel';
import { ALL_REPORT_SECTIONS } from '../../pdf/reportModel';

/**
 * Every glyph half an em wide (bold a little wider), greedy word wrap. Close to
 * Inter for geometry, and exact enough that a test can state the number it wants.
 */
export const reportMeasurer: TextMeasurer = {
  measure: (text, fontPt, style) =>
    text.length * fontPt * MM_PER_PT * 0.5 * (style === 'bold' ? 1.08 : 1),
  lineHeight: (fontPt, factor = 1.15) => fontPt * factor * MM_PER_PT,
  wrap: (text, maxWidthMm, fontPt, style) => {
    const width = (t: string) => reportMeasurer.measure(t, fontPt, style);
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (line && width(trial) > maxWidthMm) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  },
};

/** Local noon on a day in July 2026, offset by `d` days from 14 July. */
export const dayAt = (d: number): string => new Date(2026, 6, 14 + d, 12).toISOString();

export const trendOf = (bands: (number | null)[]): ReportTrendPoint[] =>
  bands.map((band, i) => ({ at: dayAt(i * 3), band, attempts: 1 }));

/** A complete, valid student report. Overrides replace whole fields. */
export const makeReport = (over: Partial<ProgressReport> = {}): ProgressReport => ({
  audience: 'student',
  title: 'Progress report',
  subject: { name: 'Jordan Lee', roleLabel: 'Student', school: 'Northern Valley High School' },
  scope: {
    courseName: null,
    windowLabel: 'Last 90 days',
    className: null,
    firstAttemptAt: dayAt(0),
    lastAttemptAt: dayAt(30),
  },
  generatedAt: new Date(2026, 9, 11, 9, 30).toISOString(),
  answerCount: 5,
  headline: [
    { label: 'Marked answers', value: '5', hint: 'across 1 course' },
    { label: 'Average band', value: 'Band 4', band: 4, hint: 'mean 4.2' },
    { label: 'Marks earned', value: '60%', hint: 'of the marks on offer' },
    { label: 'Latest band', value: 'Band 5', band: 5 },
  ],
  trend: trendOf([3, 4, null, 4, 5]),
  trendCaption: 'Each point is one marked answer',
  averageBand: 4.2,
  tiers: [1, 2, 3, 4, 5, 6].map((tier) => ({
    tier,
    label: ['Remember', 'Define', 'Explain', 'Analyse', 'Discuss', 'Evaluate'][tier - 1],
    attempts: tier === 3 ? 5 : 0,
    markShare: tier === 3 ? 0.6 : null,
  })),
  byCourse: [],
  byTopic: [],
  byVerb: [],
  anonymised: false,
  notes: ['History began on 14 Jul 2026.'],
  sections: { ...ALL_REPORT_SECTIONS },
  ...over,
});

/** Walk every number in a value and report whether all of them are finite. */
export const allFinite = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === 'object') return Object.values(value).every(allFinite);
  return true;
};
