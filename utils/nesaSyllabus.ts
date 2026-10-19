import type { CourseOutcome, SyllabusYear } from '../types';
import type { NesaPage } from '../services/geminiService';
import type { SyllabusPreviewNode } from './dataManagerUtils';
import { yearOfOutcomeCode } from './outcomeCodes';

/**
 * NESA's own structure for a syllabus page, turned into the import's shapes.
 *
 * A curriculum page carries its outcomes, its statements with their sub-points,
 * and its electives. Reading that structure keeps NESA's wording exactly. The AI
 * path it replaces paraphrased the dot points, dropped their sub-points, and
 * spent a paid call re-reading text the page had already described. Everything
 * here is pure, so the import modals and their tests agree on what "the same
 * dot point" and "the same focus area" mean.
 */

export interface SiblingItem {
  path: string;
  title: string;
}

/** The options of one options list, kept in the order the page gave them. */
export interface SiblingOptionsList {
  optionsList: string;
  paths: string[];
  /** Parallel to `paths`. An option's title is '' when its page did not name it. */
  titles: string[];
}

export interface SiblingYearGroup {
  year: SyllabusYear;
  /** Plain focus areas, each a row of its own. */
  items: SiblingItem[];
  /** Options lists, each a single row whose checkbox selects every option. */
  lists: SiblingOptionsList[];
}

const codeKey = (code: string): string => code.trim().toLowerCase();

/** Collapses a multi-line description onto one line, for a single dot point. */
const oneLine = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/**
 * One NESA statement as a dot point, with its sub-points in brackets:
 * "Describe … (x; y)". This is `dotPointText` in `api/_lib/nesaCurriculum.ts`,
 * which the server uses for the shipped course data, so an imported dot point
 * compares equal to the shipped one. Client code cannot import from `api/`, so
 * the rule is repeated here and the tests pin the same examples.
 */
export const nesaDotPoint = (statement: { text: string; including: string[] }): string => {
  let dotPoint = statement.text.trim().replace(/\.+$/, '');
  if (statement.including.length > 0) {
    const subPoints = statement.including.map((x) => x.trim().replace(/[.;]+$/, ''));
    dotPoint += ` (${subPoints.join('; ')})`;
  }
  return dotPoint;
};

/**
 * A focus area as one preview node: the page's title is the topic, each group
 * becomes a sub-topic holding its statements, and each elective becomes a
 * sub-topic with its description as the one dot point.
 *
 * A group with no title takes the page's title, because a sub-topic has to be
 * named and the page title is the nearest thing NESA gives it.
 */
export const nesaPageToPreviewNode = (
  page: NesaPage
): SyllabusPreviewNode & { year?: SyllabusYear } => {
  const topicName = page.title.trim();
  const groups = page.groups.map((group) => ({
    name: group.title.trim() || topicName,
    dotPoints: group.statements.map(nesaDotPoint),
  }));
  const electives = page.electives.map((elective) => {
    const description = oneLine(elective.description);
    return {
      name: elective.title.trim() || topicName,
      dotPoints: description ? [description] : [],
    };
  });
  return {
    name: topicName,
    subTopics: [...groups, ...electives],
    ...(page.year ? { year: page.year } : {}),
  };
};

/**
 * The page's outcomes, each stamped with the year its code names. An outcome
 * whose code says nothing about its year takes the page's year, and one with
 * neither carries no year at all, so the import's own year decides for it.
 */
export const nesaOutcomes = (page: NesaPage): CourseOutcome[] =>
  page.outcomes.map((outcome) => {
    const year = yearOfOutcomeCode(outcome.code) ?? page.year ?? undefined;
    return {
      code: outcome.code.trim(),
      description: outcome.description.trim(),
      ...(year ? { year } : {}),
    };
  });

/** Whether NESA sent any statements, which is what makes the structure worth using. */
export const hasNesaStatements = (page: Pick<NesaPage, 'groups'>): boolean =>
  page.groups.some((group) => group.statements.length > 0);

/**
 * The course a syllabus belongs to, named the way a teacher would name it:
 * "Health and Movement Science 11–12 (2023)" becomes "HSC Health and Movement
 * Science". The stage and the year of issue are stripped, because a course is
 * one subject across both years, and the year is already chosen in the modal.
 */
const TRAILING_STAGE = /\s*(?:\d{2}\s*[–-]\s*\d{2}|Stage\s*6)?\s*\(\d{4}\)\s*$/i;
export const courseNameFromSyllabus = (syllabus: string): string => {
  const subject = syllabus.trim().replace(TRAILING_STAGE, '').trim();
  if (!subject) return '';
  return /^HSC\b/i.test(subject) ? subject : `HSC ${subject}`;
};

/**
 * The other focus areas of a syllabus, grouped for the picker.
 *
 * Each year appears once, Year 11 before Year 12, and only when it has something
 * in it. Within a year, plain focus areas come first and each options list is
 * one row after them. A path the page listed twice is shown once.
 */
export const groupSiblings = (siblings: NesaPage['siblings']): SiblingYearGroup[] => {
  const seen = new Set<string>();
  const groups: SiblingYearGroup[] = [];
  for (const year of ['year11', 'year12'] as const) {
    const items: SiblingItem[] = [];
    const lists = new Map<string, SiblingOptionsList>();
    for (const sibling of siblings) {
      if (sibling.year !== year) continue;
      const key = comparablePath(sibling.path);
      if (seen.has(key)) continue;
      seen.add(key);
      const listName = sibling.optionsList?.trim();
      if (!listName) {
        items.push({ path: sibling.path, title: sibling.title });
        continue;
      }
      const list = lists.get(listName) ?? { optionsList: listName, paths: [], titles: [] };
      list.paths.push(sibling.path);
      list.titles.push(sibling.title);
      lists.set(listName, list);
    }
    if (items.length > 0 || lists.size > 0) {
      groups.push({ year, items, lists: [...lists.values()] });
    }
  }
  return groups;
};

/**
 * The picker without what is already in the import. An options list whose every
 * option has been added disappears, and a partly added one keeps the rest.
 */
export const pendingSiblings = (
  groups: SiblingYearGroup[],
  addedPaths: string[]
): SiblingYearGroup[] => {
  const added = new Set(addedPaths.map(comparablePath));
  return groups
    .map((group) => ({
      year: group.year,
      items: group.items.filter((item) => !added.has(comparablePath(item.path))),
      lists: group.lists
        .map((list) => {
          const kept = list.paths
            .map((path, index) => ({ path, title: list.titles[index] ?? '' }))
            .filter((option) => !added.has(comparablePath(option.path)));
          return {
            optionsList: list.optionsList,
            paths: kept.map((option) => option.path),
            titles: kept.map((option) => option.title),
          };
        })
        .filter((list) => list.paths.length > 0),
    }))
    .filter((group) => group.items.length > 0 || group.lists.length > 0);
};

/**
 * A page address reduced to the part that identifies it: host and path, without
 * the scheme, a trailing slash, or case. The page reader and the syllabus can
 * spell the same page slightly differently, and "already added" must still hold.
 */
export const comparablePath = (url: string): string => {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
};

/**
 * Outcomes to add to a list, skipping any whose code the list already has.
 * Codes are compared the way the rest of the app compares them, trimmed and
 * case-insensitive. Only the existing list is checked, so a parse that repeats a
 * code within itself keeps the repeat, as it always has, for the editor to flag.
 */
export const mergeOutcomesByCode = (
  existing: CourseOutcome[],
  incoming: CourseOutcome[]
): CourseOutcome[] => {
  const seen = new Set(existing.map((o) => codeKey(o.code)));
  const fresh = incoming.filter((o) => !seen.has(codeKey(o.code)));
  return [...existing, ...fresh];
};

/**
 * What is left of a list once a focus area is removed. The removed area's
 * outcomes go, unless another area still carries the same code.
 */
export const outcomesWithoutRemoved = (
  current: CourseOutcome[],
  removed: CourseOutcome[],
  stillHeld: CourseOutcome[]
): CourseOutcome[] => {
  const kept = new Set(stillHeld.map((o) => codeKey(o.code)));
  const dropped = new Set(removed.map((o) => codeKey(o.code)).filter((key) => !kept.has(key)));
  return current.filter((o) => !dropped.has(codeKey(o.code)));
};
