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
 * One year's outcomes, stamped with that year.
 *
 * The editor holds a tab per year, and a row inside a tab carries no year of
 * its own — the tab it is in is the only thing that says which syllabus it
 * belongs to. This is where that becomes a fact on the object, and the one
 * place the "only ever write 'year11'" rule is applied to an outcome, so
 * Year 12 keeps meaning the absence of a year.
 */
export const tagOutcomesForYear = (
  outcomes: CourseOutcome[],
  year: SyllabusYear
): CourseOutcome[] =>
  outcomes.map(({ year: _ignored, ...rest }) =>
    year === 'year11' ? { ...rest, year } : (rest as CourseOutcome)
  );

/** Both years of an outcome editor, as one list ready to store. */
export const outcomesFromYearTabs = (
  tabs: Record<SyllabusYear, CourseOutcome[]>
): CourseOutcome[] => [
  ...tagOutcomesForYear(tabs.year12, 'year12'),
  ...tagOutcomesForYear(tabs.year11, 'year11'),
];

/** What a parse put where, so the editor can say so rather than just changing. */
export interface ParsedOutcomeMerge {
  tabs: Record<SyllabusYear, CourseOutcome[]>;
  added: Record<SyllabusYear, number>;
  duplicates: number;
}

/**
 * Fold freshly parsed outcomes into the editor's two tabs.
 *
 * A NESA outcomes page lists both years at once, which is the whole reason the
 * editor has two tabs: one fetch fills them both. An outcome the parse could
 * not place goes to the tab in front of the user, because that is the year they
 * came here for — never silently to Year 12, which would be a guess wearing the
 * default's clothes.
 *
 * Duplicates are matched by code within a year only: the same code in the other
 * year is a different outcome, and re-parsing the same page must not double
 * every row.
 */
export const mergeParsedOutcomes = (
  tabs: Record<SyllabusYear, CourseOutcome[]>,
  parsed: CourseOutcome[],
  fallbackYear: SyllabusYear
): ParsedOutcomeMerge => {
  const next: Record<SyllabusYear, CourseOutcome[]> = {
    year11: [...tabs.year11],
    year12: [...tabs.year12],
  };
  const seen: Record<SyllabusYear, Set<string>> = {
    year11: new Set(next.year11.map((o) => o.code.trim().toLowerCase())),
    year12: new Set(next.year12.map((o) => o.code.trim().toLowerCase())),
  };
  const added: Record<SyllabusYear, number> = { year11: 0, year12: 0 };
  let duplicates = 0;

  for (const outcome of parsed) {
    const year = outcome.year ?? fallbackYear;
    const key = outcome.code.trim().toLowerCase();
    if (!key) continue;
    if (seen[year].has(key)) {
      duplicates += 1;
      continue;
    }
    seen[year].add(key);
    next[year].push({ code: outcome.code.trim(), description: outcome.description.trim() });
    added[year] += 1;
  }

  return { tabs: next, added, duplicates };
};

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
