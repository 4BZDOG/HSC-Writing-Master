import type { CourseOutcome, SyllabusYear } from '../types';

/**
 * Which rows repeat a code already used above them.
 *
 * A question links to an outcome BY CODE, so two rows sharing one code make
 * every link through it ambiguous — and it is easy to end up with: parse a page
 * twice, paste a list that overlaps one already typed, or copy a row to edit it
 * and forget to change the code. The editors flag the later row rather than
 * silently dropping it, because which of the two the author meant to keep is
 * not something the code can know.
 *
 * Compared case-insensitively and trimmed: "BI-12-01" and "bi-12-01 " are the
 * same outcome to anyone reading them, and to any link that resolves them.
 * Blank codes are not duplicates of each other — they are just unfinished.
 */
export const duplicateCodeRows = (outcomes: CourseOutcome[]): Set<number> => {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  outcomes.forEach((outcome, index) => {
    const key = outcome.code.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) repeats.add(index);
    else seen.add(key);
  });
  return repeats;
};

/** The same list with those later rows removed — what actually gets stored. */
export const withoutDuplicateCodes = (outcomes: CourseOutcome[]): CourseOutcome[] => {
  const repeats = duplicateCodeRows(outcomes);
  return outcomes.filter((_, index) => !repeats.has(index));
};

/**
 * The most outcomes a question links. A question assesses the outcome its verb
 * and content most directly demand, and occasionally a second; a strip of three
 * to five codes said nothing about which one mattered and crowded the question's
 * footer. Shipped questions keep to it, the AI paths that link outcomes are told
 * it and held to it (`capOutcomeLinks`), and the question card shows no more.
 */
export const MAX_LINKED_OUTCOMES = 2;

/** What every AI path that links outcomes is told. One is usually right. */
export const OUTCOME_LINK_RULE =
  'Link the ONE outcome this question most directly assesses. Add a second only if the question genuinely assesses two distinct outcomes. Never link more than two.';

/** A list of linked codes held to `MAX_LINKED_OUTCOMES`, in the order given. */
export const capOutcomeLinks = (codes: string[]): string[] => codes.slice(0, MAX_LINKED_OUTCOMES);

/**
 * Which year a NESA outcome code names, when it names one.
 *
 * Current syllabuses put the year in the middle segment (HM-11-01, BI-12WS-03,
 * EE1-12-02); the 2017 sciences wrote it after the subject (BIO11-8); the
 * oldest syllabuses still in force use P for Preliminary and H for HSC (P1, H10,
 * H1.2). Anything else is left to the heading it sat under.
 */
export const yearOfOutcomeCode = (code: string): SyllabusYear | undefined => {
  const c = code.trim().toUpperCase();
  const middle = /(?:^|[-A-Z])(11|12)(?=[A-Z]*-\d)/.exec(c);
  if (middle) return middle[1] === '11' ? 'year11' : 'year12';
  if (/^P\d+(\.\d+)?$/.test(c)) return 'year11';
  if (/^H\d+(\.\d+)?$/.test(c)) return 'year12';
  return undefined;
};

// A code: capitals and digits, optionally joined by hyphens or dots, holding at
// least one digit and no longer than any NESA code (BI-12WS-01 is the longest form).
const CODE = /^([A-Z][A-Z0-9]*(?:[-.][A-Z0-9]+)*)$/;
const looksLikeCode = (token: string): boolean =>
  token.length <= 14 && CODE.test(token) && /\d/.test(token);
const YEAR_HEADING = /^(?:year\s*(11|12)|(preliminary)|(hsc))\b/i;

/**
 * Outcomes read straight from pasted text, with no AI.
 *
 * NESA lists outcomes as a code and a description: on one line ("HM-12-01
 * analyses…", with a space or a tab between, as a copied table gives), or the
 * code on a line of its own and the description on the next (as the
 * curriculum site's outcome cards copy). Headings such as "Year 11 outcomes"
 * place the codes under them that do not carry a year themselves; "A student:"
 * and other lead-ins are skipped. A description that wraps onto further lines
 * is joined back together.
 *
 * Returns [] when the text has no codes in it, so a caller can fall back to the
 * AI reader for prose it cannot parse.
 */
export const parseOutcomeList = (text: string): CourseOutcome[] => {
  const out: CourseOutcome[] = [];
  let heading: SyllabusYear | undefined;
  let open: CourseOutcome | null = null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•▪◦·*–-]+(?=[A-Z])/, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    const h = YEAR_HEADING.exec(line);
    if (h && line.length < 40 && !looksLikeCode(line.split(/\s+/)[0])) {
      heading = h[1] === '11' || h[2] ? 'year11' : 'year12';
      open = null;
      continue;
    }
    const [first, ...rest] = line.split(/[\s:]+/);
    if (looksLikeCode(first)) {
      const description = line.slice(line.indexOf(first) + first.length).replace(/^[\s:–-]+/, '');
      const year = yearOfOutcomeCode(first) ?? heading;
      open = {
        code: first,
        description: rest.length ? description.trim() : '',
        ...(year ? { year } : {}),
      };
      out.push(open);
      continue;
    }
    // A line with no code is the description of a code that stood alone, or
    // the wrapped end of one (NESA descriptions are lower-case throughout, so a
    // capitalised line is a heading or a note, not a continuation). Lead-ins
    // such as "A student:" are neither.
    if (!open || /^(a student|students?|outcomes?)\b.{0,12}:?$/i.test(line)) continue;
    if (!open.description) open.description = line;
    else if (/^[a-z(]/.test(line)) open.description = `${open.description} ${line}`;
    else open = null;
  }
  return out.filter((o) => o.description.length > 0);
};
