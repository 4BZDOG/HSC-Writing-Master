/**
 * Year 11 and Year 12 as two syllabuses under one course name.
 *
 * A NSW senior course is not one syllabus a student walks through over two
 * years. Year 11 (Preliminary) and Year 12 (HSC) have entirely separate topics,
 * sub-topics, syllabus points and outcomes; the only thing they share is the
 * course. So the app models them as two populations of topics inside one
 * `Course`, selected by a control beside the course name, rather than as two
 * courses that would double the course list and split a teacher's content in
 * two places.
 *
 * The default is Year 12 and the absence of a year MEANS Year 12. That is not a
 * convenience: every topic authored before this existed is HSC content, so a
 * course that has never heard of Year 11 keeps working unchanged, a saved path
 * restores where it was, and an import from an older export lands where it
 * belongs. Nothing needed migrating.
 *
 * The same rule governs outcomes, one level up: they are filtered by year only
 * when at least one of them says which year it belongs to. A course whose
 * outcomes are unlabelled shows all of them in both years, which is better than
 * showing none and is exactly what every shipped course does today.
 */
import type { Course, CourseOutcome, SyllabusYear, Topic } from '../types';

export const DEFAULT_SYLLABUS_YEAR: SyllabusYear = 'year12';

/**
 * The two years, in the order a course is taught.
 *
 * Labelled the way a NSW teacher says it. "Preliminary" is the formal name for
 * Year 11 and nobody uses it out loud; spelled out in a control this narrow it
 * also wrapped to two lines, which made the year taller than the course name
 * beside it.
 */
export const SYLLABUS_YEARS: { id: SyllabusYear; label: string; short: string }[] = [
  { id: 'year11', label: 'Year 11', short: 'Year 11' },
  { id: 'year12', label: 'Year 12 · HSC', short: 'Year 12' },
];

export const yearLabel = (year: SyllabusYear): string =>
  SYLLABUS_YEARS.find((y) => y.id === year)?.label ?? 'Year 12 · HSC';

export const yearShortLabel = (year: SyllabusYear): string =>
  SYLLABUS_YEARS.find((y) => y.id === year)?.short ?? 'Year 12';

/** A topic's year. Unlabelled content is Year 12 — see the note above. */
export const yearOfTopic = (topic: Pick<Topic, 'year'> | undefined): SyllabusYear =>
  topic?.year ?? DEFAULT_SYLLABUS_YEAR;

/** The topics of one year, in their existing order. */
export const topicsForYear = (
  course: Pick<Course, 'topics'> | undefined,
  year: SyllabusYear
): Topic[] => (course?.topics ?? []).filter((t) => yearOfTopic(t) === year);

/** Whether a course holds any content for a year at all. */
export const hasContentForYear = (
  course: Pick<Course, 'topics'> | undefined,
  year: SyllabusYear
): boolean => (course?.topics ?? []).some((t) => yearOfTopic(t) === year);

/**
 * The year to actually show, given what the reader asked for and what exists.
 *
 * Asking for a year a course has nothing in would leave the picker empty with
 * no explanation, so it falls back — to the default when that has content, and
 * otherwise to whichever year does, which is what makes a Year-11-only course
 * open on Year 11 without anyone configuring it. A course with nothing at all
 * resolves to the default, so the control still has something to display.
 *
 * `allowEmpty` turns the fallback off, and exists for exactly one reader: the
 * curator who is going there to CREATE the first Year 11 topic. Without it the
 * feature could never be populated through the UI — every empty year would
 * bounce back to Year 12, including the one someone was trying to fill.
 */
export const resolveSyllabusYear = (
  course: Pick<Course, 'topics'> | undefined,
  requested: SyllabusYear | undefined,
  options?: { allowEmpty?: boolean }
): SyllabusYear => {
  const wanted = requested ?? DEFAULT_SYLLABUS_YEAR;
  if (options?.allowEmpty && requested) return requested;
  if (hasContentForYear(course, wanted)) return wanted;
  if (hasContentForYear(course, DEFAULT_SYLLABUS_YEAR)) return DEFAULT_SYLLABUS_YEAR;
  const other = SYLLABUS_YEARS.find((y) => hasContentForYear(course, y.id));
  return other?.id ?? DEFAULT_SYLLABUS_YEAR;
};

/** An outcome's year. Unlabelled outcomes are Year 12, as topics are. */
export const yearOfOutcome = (outcome: Pick<CourseOutcome, 'year'> | undefined): SyllabusYear =>
  outcome?.year ?? DEFAULT_SYLLABUS_YEAR;

/**
 * The outcomes to SHOW for a year. Lenient.
 *
 * Filtered only when the course actually distinguishes them: an outcome list
 * where nothing is labelled is a list from before this feature, and hiding all
 * of it would take working content away for the sake of a rule. So an
 * unlabelled course shows all of its outcomes in both years — which is what
 * every shipped course does today, and what it did before any of this existed.
 */
export const outcomesForYear = (
  course: Pick<Course, 'outcomes'> | undefined,
  year: SyllabusYear
): CourseOutcome[] => {
  const outcomes = course?.outcomes ?? [];
  if (!outcomes.some((o) => o.year)) return outcomes;
  return outcomes.filter((o) => yearOfOutcome(o) === year);
};

/**
 * The outcomes that ARE that year. Exact.
 *
 * Reading is lenient; writing is not. The editor and the save path must use
 * this one, and the difference is not academic: on a course whose outcomes are
 * unlabelled, the lenient filter answers "all of them" for Year 11 too. Editing
 * through that list and saving would stamp every HSC outcome `year11` and empty
 * Year 12 in a single click.
 */
export const outcomesOfYear = (
  course: Pick<Course, 'outcomes'> | undefined,
  year: SyllabusYear
): CourseOutcome[] => (course?.outcomes ?? []).filter((o) => yearOfOutcome(o) === year);

/**
 * One year's outcomes replaced, the other year's left exactly as they were.
 *
 * The editor only ever holds one year, so a save that wrote the whole array
 * would delete the year that was not on screen. The replacements are tagged on
 * the way in, so an outcome typed while Year 11 is on screen is a Year 11
 * outcome without anything else having to remember that.
 */
export const replaceOutcomesForYear = (
  existing: CourseOutcome[],
  year: SyllabusYear,
  replacement: CourseOutcome[]
): CourseOutcome[] => [
  ...existing.filter((o) => yearOfOutcome(o) !== year),
  ...replacement.map(({ year: _ignored, ...rest }) =>
    year === 'year11' ? { ...rest, year } : (rest as CourseOutcome)
  ),
];

/**
 * The year the app is working in — the one answer every surface must agree on.
 *
 * There are three of them: the navigator that draws the control, the modals
 * that create and import into it, and the path validation that decides which
 * topic still resolves. They were each resolving separately, and a topic
 * created while a curator stood in an EMPTY Year 11 came out tagged Year 12 and
 * appeared in the HSC list — the navigator was showing Year 11 (`allowEmpty`)
 * while the creation path resolved without it. One function, one rule.
 */
export const activeSyllabusYear = (
  course: Pick<Course, 'topics'> | undefined,
  requested: SyllabusYear | undefined,
  canCurate: boolean
): SyllabusYear => resolveSyllabusYear(course, requested, { allowEmpty: canCurate });

/**
 * Whether the year control is worth showing at all.
 *
 * A course with only Year 12 content shows the control with Year 11 offered but
 * unavailable — the point is that a teacher can SEE the year exists and needs
 * filling. It is only pointless where there is no course selected.
 */
export const shouldOfferYearChoice = (course: Pick<Course, 'topics'> | undefined): boolean =>
  !!course;
