import { DotPoint, Prompt, SubTopic, Topic } from '../types';

/**
 * Provenance label for a question lifted from a past NESA HSC examination.
 *
 * The three fields behind it (`isPastHSC`, `hscYear`, `hscQuestionNumber`) are
 * set by the import flows, where a whole paper is tagged with its year at once,
 * so a question can legitimately be marked as past-HSC with no year and no
 * number attached. Every combination therefore has to produce something a
 * student can read — "Past HSC" on its own is still worth saying, because it
 * tells them this is the real thing rather than a generated practice question.
 *
 * Returns `null` when the question is not from a past paper, so callers can
 * render the chip conditionally on a single value.
 */
export interface PastHscLabel {
  /** Chip copy, e.g. "HSC 2023 · Q12". */
  text: string;
  /** Long form for the chip's tooltip. */
  title: string;
}

/** NESA numbering is inconsistent — "12", "Q12", "q12(b)" all appear. */
const normaliseQuestionNumber = (raw: string): string => {
  const trimmed = raw.trim().replace(/^q(uestion)?\s*/i, '');
  return trimmed ? `Q${trimmed}` : '';
};

export const getPastHscLabel = (prompt: Prompt): PastHscLabel | null => {
  if (!prompt.isPastHSC) return null;

  const year =
    typeof prompt.hscYear === 'number' && Number.isFinite(prompt.hscYear)
      ? String(prompt.hscYear)
      : '';
  const question = prompt.hscQuestionNumber
    ? normaliseQuestionNumber(prompt.hscQuestionNumber)
    : '';

  const text = [year ? `HSC ${year}` : 'Past HSC', question].filter(Boolean).join(' · ');
  const title = year
    ? `From the ${year} HSC examination${question ? `, question ${question.slice(1)}` : ''}`
    : `From a past HSC examination${question ? `, question ${question.slice(1)}` : ''}`;

  return { text, title };
};

/*
 * The past-HSC navigator filter.
 *
 * The question list can already be narrowed to past papers, but that only helps
 * once the reader is standing under a dot point. These helpers answer the
 * question one level up: which topics, sub-topics and syllabus points hold any
 * real exam question at all, and how many. They are pure, so the navigator's
 * option lists and its counts are computed from one definition.
 *
 * A question is "in the selection" when it is a past-HSC question AND either no
 * years are chosen or its year is one of the chosen years. A past question with
 * no recorded year is still a real HSC question, so it counts under "all years",
 * but it has no year to match and is held back as soon as a year is chosen.
 */

/** The fields of a question that provenance is read from. */
export type PastHscCandidate = Pick<Prompt, 'isPastHSC' | 'hscYear'>;

/**
 * Whether one question is a past HSC question that the chosen years admit. An
 * empty or missing `years` means every year.
 */
export const isPastHscInYears = (prompt: PastHscCandidate, years?: readonly number[]): boolean => {
  if (!prompt.isPastHSC) return false;
  if (!years || years.length === 0) return true;
  return typeof prompt.hscYear === 'number' && years.includes(prompt.hscYear);
};

/** How many of these questions are past HSC questions in the chosen years. */
export const countPastHsc = (
  prompts: readonly PastHscCandidate[],
  years?: readonly number[]
): number => prompts.reduce((n, p) => (isPastHscInYears(p, years) ? n + 1 : n), 0);

export const countPastHscInSubTopic = (
  subTopic: Pick<SubTopic, 'dotPoints'>,
  years?: readonly number[]
): number => subTopic.dotPoints.reduce((n, dp) => n + countPastHsc(dp.prompts ?? [], years), 0);

export const countPastHscInTopic = (
  topic: Pick<Topic, 'subTopics'>,
  years?: readonly number[]
): number => topic.subTopics.reduce((n, st) => n + countPastHscInSubTopic(st, years), 0);

/** The count across a whole year's topics. Zero means the course has no past HSC here. */
export const countPastHscInTopics = (
  topics: readonly Pick<Topic, 'subTopics'>[],
  years?: readonly number[]
): number => topics.reduce((n, t) => n + countPastHscInTopic(t, years), 0);

/**
 * The predicates the navigator filters on. A node stays visible when it holds
 * at least one question the selection admits.
 */
export const dotPointHasPastHsc = (
  dotPoint: Pick<DotPoint, 'prompts'>,
  years?: readonly number[]
): boolean => countPastHsc(dotPoint.prompts ?? [], years) > 0;

export const subTopicHasPastHsc = (
  subTopic: Pick<SubTopic, 'dotPoints'>,
  years?: readonly number[]
): boolean => countPastHscInSubTopic(subTopic, years) > 0;

export const topicHasPastHsc = (
  topic: Pick<Topic, 'subTopics'>,
  years?: readonly number[]
): boolean => countPastHscInTopic(topic, years) > 0;

/**
 * The distinct years that past HSC questions in these topics carry, oldest
 * first. Questions with no year do not contribute one.
 */
export const pastHscYears = (topics: readonly Pick<Topic, 'subTopics'>[]): number[] => {
  const years = new Set<number>();
  for (const topic of topics) {
    for (const st of topic.subTopics) {
      for (const dp of st.dotPoints) {
        for (const p of dp.prompts ?? []) {
          if (p.isPastHSC && typeof p.hscYear === 'number' && Number.isFinite(p.hscYear)) {
            years.add(p.hscYear);
          }
        }
      }
    }
  }
  return [...years].sort((a, b) => a - b);
};

/**
 * What the navigator remembers for one course. `years` is empty for "All years",
 * which is also where a course with nothing stored starts.
 */
export interface PastHscNavigatorState {
  on: boolean;
  years: number[];
}

export const DEFAULT_PAST_HSC_NAVIGATOR: PastHscNavigatorState = { on: false, years: [] };

const pastHscNavigatorKey = (courseId: string): string => `hsc.pastHscNavigator.${courseId}`;

/**
 * Read a course's saved navigator state. Anything missing, mistyped or
 * hand-edited falls back to the default, and an unreadable store is the same as
 * an empty one: the filter simply starts off.
 */
export const readPastHscNavigatorState = (courseId: string): PastHscNavigatorState => {
  if (!courseId || typeof window === 'undefined') return { ...DEFAULT_PAST_HSC_NAVIGATOR };
  try {
    const raw = window.localStorage.getItem(pastHscNavigatorKey(courseId));
    if (!raw) return { ...DEFAULT_PAST_HSC_NAVIGATOR };
    const parsed = JSON.parse(raw) as Partial<PastHscNavigatorState>;
    const years = Array.isArray(parsed.years)
      ? [...new Set(parsed.years.filter((y): y is number => Number.isInteger(y)))].sort(
          (a, b) => a - b
        )
      : [];
    return { on: parsed.on === true, years };
  } catch {
    return { ...DEFAULT_PAST_HSC_NAVIGATOR };
  }
};

/** Save a course's navigator state. Storage being unavailable is not worth an error. */
export const writePastHscNavigatorState = (
  courseId: string,
  state: PastHscNavigatorState
): void => {
  if (!courseId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(pastHscNavigatorKey(courseId), JSON.stringify(state));
  } catch {
    /* Private browsing, or a full quota. The filter still works for this visit. */
  }
};
