// pdf/reportModel.ts
//
// The data contract between the progress report's DATA side (what a student, a
// teacher or a school has done — aggregated, filtered, named) and its PRINT side
// (blocks, layout, drawing). Pure types: no jsPDF, no React, no services, so the
// two halves can be built and tested apart and meet here.
//
// Everything is already aggregated, already filtered by the drill-down the user
// chose, and already formatted-agnostic: shares are 0–1 fractions, bands are
// numbers, dates are ISO strings. The PRINT side formats; the DATA side never
// does. Where a value is genuinely unknown it is `null`, and the print side says
// "—" or "Not attempted" rather than printing a zero that reads as a result.

/** Who the report is about, which decides which sections exist. */
export type ReportAudience = 'student' | 'teacher' | 'school';

/** What the drill-down has narrowed the report to, in the words the page prints. */
export interface ReportScope {
  /** The one course the report is limited to, or null for every course. */
  courseName: string | null;
  /** "Last 90 days", "All time", "Term 3 2026" — printed verbatim. */
  windowLabel: string;
  /** The class a teacher or school report is limited to, or null for all. */
  className: string | null;
  /** First and last attempt actually in the report (ISO), for "12 Aug – 4 Oct". */
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
}

/** The person (or place) the report is about. */
export interface ReportSubject {
  /** A student's name, a teacher's name, or the school's name. */
  name: string;
  /** "Student", "Teacher", "Administrator" — see `roleLabel`. */
  roleLabel: string;
  /** The school, when known. */
  school: string | null;
}

/** One cell of the result strip at the head of the report. */
export interface ReportStat {
  label: string;
  /** Already formatted: "25", "84%", "4.3k", "Band 4". */
  value: string;
  /** A short second line under the value: "of the marks on offer". */
  hint?: string;
  /** When set, the value is drawn in this band's colour (attainment). */
  band?: number;
}

/** One point on the progress chart: a single attempt, or a week of them. */
export interface ReportTrendPoint {
  /** ISO timestamp (an attempt) or the start of the week. */
  at: string;
  /** Band for the point (a mean, for a week); null when unscored. */
  band: number | null;
  /** How many attempts the point stands for (1 for a single attempt). */
  attempts: number;
}

/** A row of any "by X" breakdown: a course, a topic, a command verb, a class. */
export interface ReportBreakdownRow {
  label: string;
  /** A quieter second line: the course a topic belongs to, the tier of a verb. */
  sublabel?: string;
  attempts: number;
  /** Distinct students, for teacher and school reports. */
  students?: number;
  /** Mean band; null when nothing in the row was scored. */
  avgBand: number | null;
  /** Mean share of the marks on offer (0–1); null when the questions carry none. */
  markShare: number | null;
}

/** One of the six cognitive tiers a command verb belongs to. */
export interface ReportTierRow {
  /** 1–6; the ladder's own order. */
  tier: number;
  /** "Remember", "Define", … from `tierShortLabel`. */
  label: string;
  attempts: number;
  /** Mean share of marks (0–1). Null when the tier was not attempted. */
  markShare: number | null;
}

/** One student on a teacher's or school's roster. */
export interface ReportStudentRow {
  /** The name to print — or "Student 3" when the report anonymises. */
  name: string;
  attempts: number;
  avgBand: number | null;
  markShare: number | null;
  /** Latest band minus earliest band across the window; null under two points. */
  bandChange: number | null;
  /** Up to ~12 weekly mean bands, oldest first, for the row's sparkline. */
  sparkline: (number | null)[];
  /** ISO of the latest attempt, or null. */
  lastActiveAt: string | null;
  /** Mark share per tier 1–6 (always six entries); null = not attempted. */
  tierShares: (number | null)[];
}

/** One class on a school report. */
export interface ReportClassRow {
  name: string;
  /** Year group (11 or 12), or null. */
  year: number | null;
  students: number;
  attempts: number;
  avgBand: number | null;
  markShare: number | null;
}

/** One recent attempt on a student's own report. */
export interface ReportAttemptRow {
  at: string;
  course: string | null;
  topic: string | null;
  verb: string | null;
  mark: number | null;
  totalMarks: number | null;
  band: number | null;
}

/** Which optional sections to print — the "include" toggles in the options panel. */
export interface ReportSections {
  trend: boolean;
  tiers: boolean;
  courses: boolean;
  topics: boolean;
  verbs: boolean;
  /** Student report: the recent-attempts table. */
  recent: boolean;
  /** Teacher and school report: the student table and tier heatmap. */
  students: boolean;
  /** School report: the class table. */
  classes: boolean;
}

export const ALL_REPORT_SECTIONS: ReportSections = {
  trend: true,
  tiers: true,
  courses: true,
  topics: true,
  verbs: true,
  recent: true,
  students: true,
  classes: true,
};

/** Everything the PDF needs. Built by `utils/progressReport.ts`. */
export interface ProgressReport {
  audience: ReportAudience;
  /** "Progress report", "Class report", "School report". */
  title: string;
  subject: ReportSubject;
  scope: ReportScope;
  /** ISO timestamp the data was read. */
  generatedAt: string;
  /**
   * The number of answers the report counts, as a number: the same figure as the
   * "Answers marked" headline, unformatted. A student's report counts every
   * attempt; a teacher's or school's counts the latest answer per question. Zero
   * means the report is empty; read this, not the formatted headline string.
   */
  answerCount: number;
  /** The result strip: 4–5 cells. */
  headline: ReportStat[];
  /** Progress over time, oldest first. Empty when there is no history. */
  trend: ReportTrendPoint[];
  /** "Each point is one marked answer" / "Each point is one week's mean band". */
  trendCaption: string;
  /** The all-time average band the chart's dashed line stands for, or null. */
  averageBand: number | null;
  /** Always six rows, so a gap reads as "not attempted". */
  tiers: ReportTierRow[];
  byCourse: ReportBreakdownRow[];
  byTopic: ReportBreakdownRow[];
  byVerb: ReportBreakdownRow[];
  /** Teacher and school only. */
  students?: ReportStudentRow[];
  /** School only. */
  classes?: ReportClassRow[];
  /** Student only; newest first, already capped. */
  recent?: ReportAttemptRow[];
  /** True when student names were replaced by "Student n". */
  anonymised: boolean;
  /**
   * Plain-language caveats, printed under "About this report": that history
   * began on a date, that a verb caps the band, that the list was capped.
   */
  notes: string[];
  sections: ReportSections;
}
