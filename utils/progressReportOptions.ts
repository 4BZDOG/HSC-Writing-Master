/**
 * The rules behind the progress report's options panel, kept out of the component
 * so each one can be read and tested on its own: which report a role reads, what
 * each report offers, who it is printed for, and the one-line summary of what will
 * print. No React and no network.
 *
 * Copy is British/Australian English, sentence case, and says what to do next.
 */
import type {
  ProgressReport,
  ReportAudience,
  ReportSections,
  ReportSubject,
} from '../pdf/reportModel';
import { ALL_REPORT_SECTIONS } from '../pdf/reportModel';
import type { TeachingClass } from '../services/responseService';
import type { UserRole } from '../types';
import { roleLabel } from './permissions';

/**
 * The report a role reads, or null for a role that has none. Exhaustive on
 * `UserRole`: a guest has no saved work to report on, and a parent reads a
 * child's progress on the guardian dashboard rather than printing a report. The
 * report RPC reads the caller's own data, so a parent has nothing of their own
 * to put in one.
 */
export const REPORT_AUDIENCE_FOR_ROLE: Record<UserRole, ReportAudience | null> = {
  admin: 'school',
  teacher: 'teacher',
  user: 'student',
  guest: null,
  parent: null,
};

export const reportAudienceFor = (role: UserRole): ReportAudience | null =>
  REPORT_AUDIENCE_FOR_ROLE[role];

/** The title a report is printed under: the header names the report type. */
export const REPORT_TITLES: Record<ReportAudience, string> = {
  student: 'Progress report',
  teacher: 'Class report',
  school: 'School report',
};

/** Days back from the read, or 'all' (students only). */
export type ReportPeriod = number | 'all';

export interface ChoiceOption<T> {
  value: T;
  label: string;
}

const TERM_PERIODS: ChoiceOption<ReportPeriod>[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '12 months' },
];

/**
 * Students can read their whole history. Teachers and schools cannot: the
 * `get_progress_report()` RPC caps the window at 365 days.
 */
export const periodChoicesFor = (audience: ReportAudience): ChoiceOption<ReportPeriod>[] =>
  audience === 'student' ? [...TERM_PERIODS, { value: 'all', label: 'All time' }] : TERM_PERIODS;

/** 90 days, the window the database reads when none is given. */
export const DEFAULT_PERIOD: ReportPeriod = 90;

/** The number of days a class or school report reads. */
export const rosterDays = (period: ReportPeriod): number => (period === 'all' ? 365 : period);

export interface SectionChoice {
  key: keyof ReportSections;
  label: string;
  hint: string;
  audiences: readonly ReportAudience[];
}

const EVERYONE: readonly ReportAudience[] = ['student', 'teacher', 'school'];

/** The section toggles, in the order the page prints them. */
const SECTION_CHOICES: readonly SectionChoice[] = [
  { key: 'trend', label: 'Progress chart', hint: 'Band over time', audiences: EVERYONE },
  {
    key: 'tiers',
    label: 'Tier strength',
    hint: 'Share of marks by verb tier',
    audiences: EVERYONE,
  },
  { key: 'courses', label: 'By course', hint: 'Weakest first', audiences: EVERYONE },
  { key: 'topics', label: 'By topic', hint: 'Weakest first', audiences: EVERYONE },
  { key: 'verbs', label: 'By command verb', hint: 'Weakest first', audiences: EVERYONE },
  {
    key: 'recent',
    label: 'Recent answers',
    hint: 'The latest marked answers',
    audiences: ['student'],
  },
  {
    key: 'students',
    label: 'Students table',
    hint: 'Weakest first, with a tier heatmap',
    audiences: ['teacher', 'school'],
  },
  { key: 'classes', label: 'Classes table', hint: 'One row per class', audiences: ['school'] },
];

/** The section toggles that apply to one audience. */
export const sectionChoicesFor = (audience: ReportAudience): SectionChoice[] =>
  SECTION_CHOICES.filter((choice) => choice.audiences.includes(audience));

/** Every section the audience can see, switched on; the rest are off. */
export const defaultSectionsFor = (audience: ReportAudience): ReportSections => {
  const offered = new Set(sectionChoicesFor(audience).map((choice) => choice.key));
  const sections: ReportSections = { ...ALL_REPORT_SECTIONS };
  for (const key of Object.keys(sections) as (keyof ReportSections)[]) {
    sections[key] = offered.has(key);
  }
  return sections;
};

/** The school a set of classes belongs to, when they all belong to one school. */
export const schoolNameFrom = (classes: readonly TeachingClass[]): string | null => {
  const names = new Set(classes.map((c) => (c.school ?? '').trim()).filter(Boolean));
  return names.size === 1 ? [...names][0] : null;
};

/**
 * Who the report is printed for. A student's or teacher's own name; for an
 * administrator, the school, which is read from the classes they can see. With no
 * school name known the fallback is "Your school", never a blank heading.
 */
export const reportSubjectFor = (
  audience: ReportAudience,
  role: UserRole,
  displayName: string,
  username: string,
  schoolName: string | null
): ReportSubject => {
  const person = displayName.trim() || username;
  if (audience === 'school') {
    return { name: schoolName ?? 'Your school', roleLabel: roleLabel(role), school: null };
  }
  return {
    name: person,
    roleLabel: roleLabel(role),
    school: audience === 'teacher' ? schoolName : null,
  };
};

const SYDNEY = 'Australia/Sydney';

const dayLabel = (ms: number, withYear: boolean): string =>
  new Date(ms).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: SYDNEY,
  });

const yearOf = (ms: number): string =>
  new Intl.DateTimeFormat('en-AU', { year: 'numeric', timeZone: SYDNEY }).format(ms);

/** The first and last answer as "12 Aug – 4 Oct", or null when either is unknown. */
export const periodLine = (first: string | null, last: string | null): string | null => {
  const a = first === null ? Number.NaN : Date.parse(first);
  const b = last === null ? Number.NaN : Date.parse(last);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const withYear = yearOf(a) !== yearOf(b);
  const start = dayLabel(a, withYear);
  const end = dayLabel(b, withYear);
  return start === end ? end : `${start} – ${end}`;
};

/** True when the scope the user chose has no marked answers to print. */
export const reportIsEmpty = (report: ProgressReport): boolean => report.answerCount === 0;

/** "25 answers across 2 courses · 12 Aug – 4 Oct", the line that says what will print. */
export const summaryLine = (report: ProgressReport): string => {
  const answers = report.answerCount;
  const courses = report.byCourse.length;
  const across =
    courses === 0 ? '' : ` across ${courses === 1 ? '1 course' : `${courses} courses`}`;
  const period = periodLine(report.scope.firstAttemptAt, report.scope.lastAttemptAt);
  const noun = answers === 1 ? 'answer' : 'answers';
  return `${answers} ${noun}${across}${period ? ` · ${period}` : ''}`;
};

export const EMPTY_SCOPE_MESSAGE =
  'No marked answers in this scope. Widen the period or choose another course.';

export const EMPTY_ALL_TIME_MESSAGE =
  'No marked answers yet. Answers appear here once they have been marked.';
