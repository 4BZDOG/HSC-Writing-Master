import type { WritingInsight } from './writingAnalysis';

/**
 * The draft check as a checklist: one row per thing a student can clear, in
 * the order they meet them while writing.
 *
 * This is a re-cut of `buildWritingInsights`, not a second opinion about the
 * draft. Every row reads an insight the analysis has already produced, so the
 * checklist and the metrics beneath it cannot disagree about the same text.
 * `buildWritingInsights` itself is untouched.
 */

export type DraftCheckId = 'length' | 'terms' | 'sentences' | 'structure';

export interface DraftChecklistRow {
  id: DraftCheckId;
  label: string;
  state: 'done' | 'todo';
  /** The insight's own message where one fired, or a short line when clear. */
  detail: string;
  /** Still-missing syllabus terms to offer as chips. Only on a `todo` terms row. */
  terms?: string[];
}

export interface DraftChecklistInput {
  insights: WritingInsight[];
  wordCount: number;
  /** Still missing, ordered so the terms the question names come first. */
  missingTerms: string[];
}

/** How many missing terms a row offers. More than this is a list, not a nudge. */
export const MAX_CHECKLIST_TERMS = 5;
/** Below this there are too few words for a sentence check to mean anything. */
export const SENTENCE_CHECK_FROM_WORDS = 25;
/** Past this a single block of prose is a structure problem, so the row appears. */
export const STRUCTURE_CHECK_OVER_WORDS = 130;

const LABELS: Record<DraftCheckId, string> = {
  length: 'Length',
  terms: 'Syllabus terms',
  sentences: 'Sentences',
  structure: 'Structure',
};

const CLEAR_LENGTH = 'Nothing to flag on length yet.';
const CLEAR_SENTENCES = 'Sentences are a manageable length.';
const CLEAR_STRUCTURE = 'Broken into paragraphs.';

/**
 * The checks for a draft, most urgent first, or nothing at all for a blank one.
 *
 * - Length: whenever there is a draft. `all-good` is the analysis's fallback
 *   for a draft with nothing to flag and has no row of its own, so it clears
 *   this one — the row that is always present.
 * - Syllabus terms: only when the analysis has a keyword insight. Its chips are
 *   the still-missing terms, capped at `MAX_CHECKLIST_TERMS`.
 * - Sentences: from `SENTENCE_CHECK_FROM_WORDS` words.
 * - Structure: when the analysis has a paragraph prompt, or once the draft is
 *   long enough that it should have one.
 */
export const buildDraftChecklist = ({
  insights,
  wordCount,
  missingTerms,
}: DraftChecklistInput): DraftChecklistRow[] => {
  if (wordCount <= 0) return [];

  const find = (id: string) => insights.find((insight) => insight.id === id);
  const rows: DraftChecklistRow[] = [];

  const lengthFlag = find('length-short') ?? find('length-long') ?? find('chars-over');
  rows.push(
    lengthFlag
      ? { id: 'length', label: LABELS.length, state: 'todo', detail: lengthFlag.message }
      : {
          id: 'length',
          label: LABELS.length,
          state: 'done',
          detail: find('length-good')?.message ?? CLEAR_LENGTH,
        }
  );

  const keywordsMissing = find('keywords-missing');
  const keywordsAll = find('keywords-all');
  if (keywordsMissing || keywordsAll) {
    const termsTarget = find('terms-target');
    const offered = missingTerms.slice(0, MAX_CHECKLIST_TERMS);
    if (keywordsMissing) {
      rows.push({
        id: 'terms',
        label: LABELS.terms,
        state: 'todo',
        detail: keywordsMissing.message,
        ...(offered.length > 0 ? { terms: offered } : {}),
      });
    } else if (termsTarget) {
      // Every term the question names is in, but the band expects more than it
      // names. The target is the only thing left to say.
      rows.push({
        id: 'terms',
        label: LABELS.terms,
        state: 'todo',
        detail: termsTarget.message,
        ...(offered.length > 0 ? { terms: offered } : {}),
      });
    } else {
      rows.push({
        id: 'terms',
        label: LABELS.terms,
        state: 'done',
        detail: keywordsAll?.message ?? '',
      });
    }
  }

  if (wordCount >= SENTENCE_CHECK_FROM_WORDS) {
    const runOn = find('run-on');
    rows.push(
      runOn
        ? { id: 'sentences', label: LABELS.sentences, state: 'todo', detail: runOn.message }
        : { id: 'sentences', label: LABELS.sentences, state: 'done', detail: CLEAR_SENTENCES }
    );
  }

  const paragraphs = find('paragraphs');
  const structureHint = find('structure-hint');
  if (paragraphs || structureHint || wordCount > STRUCTURE_CHECK_OVER_WORDS) {
    const flag = paragraphs ?? structureHint;
    rows.push(
      flag
        ? { id: 'structure', label: LABELS.structure, state: 'todo', detail: flag.message }
        : { id: 'structure', label: LABELS.structure, state: 'done', detail: CLEAR_STRUCTURE }
    );
  }

  return rows;
};

export interface ChecklistSummary {
  cleared: number;
  total: number;
  allClear: boolean;
  /** The rows still to do, in the order they appear. */
  todo: DraftChecklistRow[];
}

/** How many of the rows are clear, and which are still to do. */
export const summariseChecklist = (rows: DraftChecklistRow[]): ChecklistSummary => {
  const todo = rows.filter((row) => row.state === 'todo');
  const cleared = rows.length - todo.length;
  return { cleared, total: rows.length, allClear: rows.length > 0 && todo.length === 0, todo };
};

/** More outstanding labels than this and the line names two and counts the rest. */
export const MAX_NAMED_TODO = 3;

/**
 * The draft check's header line. It names what is left rather than giving a
 * moving fraction, so a student can read it as a to-do list.
 *
 * - Work remains: `To do: Length, Syllabus terms`, or `To do: Length,
 *   Syllabus terms and 2 more` from four outstanding labels.
 * - Nothing outstanding: `All checks clear` once every check the draft can
 *   have has switched on (all four rows are present, or the draft is past
 *   `STRUCTURE_CHECK_OVER_WORDS`, when the structure row always appears);
 *   otherwise `All clear so far`. The inputs do not say whether a question has
 *   a syllabus terms row, so a three-row draft under the structure length is
 *   never called complete.
 * - A blank draft has no rows and no line: the component shows its resting copy.
 */
export const describeChecklist = (rows: DraftChecklistRow[], wordCount: number): string => {
  const { todo, allClear, total } = summariseChecklist(rows);
  if (todo.length > 0) {
    const names = todo.map((row) => row.label);
    const listed =
      names.length > MAX_NAMED_TODO
        ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
        : names.join(', ');
    return `To do: ${listed}`;
  }
  if (!allClear) return '';
  const complete = total === 4 || wordCount > STRUCTURE_CHECK_OVER_WORDS;
  return complete ? 'All checks clear' : 'All clear so far';
};
