/**
 * What a student actually opened before writing.
 *
 * A question arrives surrounded by help — the outcomes it is marked against,
 * the syllabus terms, the marking guide, exemplars at every band, the command
 * verb's strategy. All of it is folded shut by default, which keeps the page
 * calm and makes it entirely possible to write an answer having read none of
 * it. The marking report then explains a lost mark that the marking guide,
 * sitting one tap away the whole time, had already named.
 *
 * This is the record that closes that loop: which supports were AVAILABLE for
 * a question, and which of them the student opened. The feedback reads it back
 * (see components/SupportUsageSummary.tsx) so "you did not check the marking
 * guide" can be said once, concretely, at the moment it means something.
 *
 * Deliberately in memory only. It is a coaching observation about one sitting,
 * not a record about a student: nothing here is persisted, synced or attached
 * to a saved result, and it dies with the tab.
 */

export type SupportResourceId =
  | 'outcomes'
  | 'outcomeBriefing'
  | 'keywords'
  | 'commonMistakes'
  | 'gradeStandards'
  | 'markingGuide'
  | 'sampleAnswers'
  | 'strategy';

export interface SupportResourceMeta {
  /** Panel name, matching what the workspace calls it on screen. */
  label: string;
  /** What opening it would have told them — used when it was skipped. */
  missed: string;
}

/**
 * Reading order, top to bottom, matching the workspace rail. The summary lists
 * supports in this order rather than in the order they happened to be opened,
 * so two reports of the same question are directly comparable.
 */
export const SUPPORT_RESOURCES: Record<SupportResourceId, SupportResourceMeta> = {
  outcomes: {
    label: 'What’s Assessed',
    missed: 'the syllabus outcomes this question is marked against',
  },
  outcomeBriefing: {
    label: 'Outcome briefing',
    missed: 'what each outcome is asking you to show in this question',
  },
  keywords: {
    label: 'Syllabus Terms',
    missed: 'the terminology the marker expects to see used',
  },
  commonMistakes: {
    label: 'Common mistakes',
    missed: 'what students most often get wrong on this question',
  },
  gradeStandards: {
    label: 'Grade Standards',
    missed: 'what separates one band from the next in this course',
  },
  markingGuide: {
    label: 'Marking Guide',
    missed: 'the criteria your answer is scored against, mark by mark',
  },
  sampleAnswers: {
    label: 'Sample Answers',
    missed: 'model responses at each band to compare your writing against',
  },
  strategy: {
    label: 'Command verb strategy',
    missed: 'how to structure an answer to this particular command verb',
  },
};

export const SUPPORT_ORDER = Object.keys(SUPPORT_RESOURCES) as SupportResourceId[];

interface QuestionRecord {
  available: Set<SupportResourceId>;
  opened: Set<SupportResourceId>;
}

/**
 * Insertion-ordered, and trimmed. A long session moving through a topic would
 * otherwise accumulate a record per question for the life of the tab; only the
 * recent ones can still be reported on.
 */
const MAX_QUESTIONS = 24;
const records = new Map<string, QuestionRecord>();

const recordFor = (promptId: string): QuestionRecord => {
  let record = records.get(promptId);
  if (!record) {
    record = { available: new Set(), opened: new Set() };
    records.set(promptId, record);
    if (records.size > MAX_QUESTIONS) {
      const oldest = records.keys().next().value;
      if (oldest !== undefined) records.delete(oldest);
    }
  }
  return record;
};

/** "This support exists for this question." Called as the panel mounts. */
export const registerSupport = (promptId: string, id: SupportResourceId): void => {
  if (!promptId) return;
  recordFor(promptId).available.add(id);
};

/** "The student opened it." Idempotent — opening twice is still once. */
export const markSupportOpened = (promptId: string, id: SupportResourceId): void => {
  if (!promptId) return;
  const record = recordFor(promptId);
  record.available.add(id);
  record.opened.add(id);
};

export interface SupportUsage {
  available: SupportResourceId[];
  opened: SupportResourceId[];
  skipped: SupportResourceId[];
}

/** What was on offer for this question, and what was taken up. */
export const readSupportUsage = (promptId: string): SupportUsage => {
  const record = records.get(promptId);
  if (!record) return { available: [], opened: [], skipped: [] };
  const available = SUPPORT_ORDER.filter((id) => record.available.has(id));
  return {
    available,
    opened: available.filter((id) => record.opened.has(id)),
    skipped: available.filter((id) => !record.opened.has(id)),
  };
};

/** Drop everything. Exists for tests and for a full data reset. */
export const resetSupportEngagement = (): void => {
  records.clear();
};
