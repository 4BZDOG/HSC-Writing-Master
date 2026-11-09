import { HSC_MINUTES_PER_MARK, getRecommendedTime } from '../data/commandTerms';
import { CommandTermInfo, DotPoint, Prompt, SubTopic, Topic } from '../types';

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

/**
 * True for a question the paper sets once per prescribed text ("6(a)–(n)",
 * "1(a), (b), (d), (j)") and the library holds once, to be answered on whichever
 * text the student studied. A part set on one named text carries `hscText`.
 */
export const isAnsweredOnOwnText = (
  prompt: Pick<Prompt, 'isPastHSC' | 'hscQuestionNumber' | 'hscText'>
): boolean =>
  !!prompt.isPastHSC &&
  !prompt.hscText &&
  /\([a-z]\)\s*(?:[–-]|,)\s*\(?[a-z]\)/.test(prompt.hscQuestionNumber ?? '');

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

/** "a", "a and b", "a, b and c" — for a line of words in a sentence. */
export const joinWords = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/**
 * The line that says which saved years this course's past papers do not carry.
 * A saved year is kept in storage on purpose (switching back restores it), so
 * the filter has to say when it is not applying one, rather than dropping it
 * without a word. Null when every saved year is available, or none is saved.
 */
export const missingPastHscYearsNote = (
  saved: readonly number[],
  available: readonly number[]
): string | null => {
  const have = new Set(available);
  const missing = [...new Set(saved.filter((y) => !have.has(y)))].sort((a, b) => a - b);
  if (missing.length === 0) return null;
  const applied = saved.filter((y) => have.has(y)).length;
  const names = joinWords(missing.map(String));
  const isOne = missing.length === 1;
  const notFound = `${names} ${isOne ? "isn't" : "aren't"} in this course's past papers`;
  if (applied === 0) return `${notFound}, so all years are shown.`;
  return `${notFound}, so ${isOne ? "it isn't" : "they aren't"} applied.`;
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

/*
 * The time a past HSC question carries.
 *
 * A paper prints one allowance per section ("Allow about 2 hours and 25 minutes
 * for this section") over the marks that section is worth, so a 3-mark part of
 * an 80-mark section read as 2h25m. The part's share of that allowance is the
 * time to give it: M × marks ÷ S, where M is the allowance and S the section's
 * marks. A part worth the whole section (or more) keeps the full allowance.
 * Where the heading prints no allowance, the HSC pace stands in for it.
 */

const ALLOWANCE_SENTENCE = /\s*Allow about\b[^.]*\.?\s*$/i;
const ALLOWANCE = /Allow about\s+(?:(\d+)\s+hours?)?(?:\s+and\s+)?(?:(\d+)\s+minutes?)?/i;
const SECTION_MARKS = /(\d+)\s+marks?\b/i;

/** Minutes the paper's "Allow about …" sentence gives, or null when there is none. */
const printedAllowance = (heading: string): number | null => {
  const match = ALLOWANCE.exec(heading);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours || minutes ? hours * 60 + minutes : null;
};

/**
 * Whole minutes under 15, then the nearest 5: a short part is read as exact, and
 * a longer one is not given a precision it cannot keep.
 */
const roundMinutes = (raw: number): number =>
  raw < 15 ? Math.max(1, Math.round(raw)) : Math.round(raw / 5) * 5;

export interface PastHscTiming {
  /** The heading as the card shows it: the paper's section allowance left out. */
  heading: string;
  /** The time this question should take, or null when it has no marks. */
  minutes: number | null;
  /** True when the minutes come from the paper's own allowance, not the HSC pace. */
  fromPaper: boolean;
}

export const pastHscTiming = (prompt: Pick<Prompt, 'hscSection' | 'totalMarks'>): PastHscTiming => {
  const raw = (prompt.hscSection ?? '').trim();
  const allowance = printedAllowance(raw);
  const withoutAllowance = raw.replace(ALLOWANCE_SENTENCE, '').trim();
  const heading =
    allowance === null || !withoutAllowance
      ? raw
      : /[.)]$/.test(withoutAllowance)
        ? withoutAllowance
        : `${withoutAllowance}.`;

  const total = prompt.totalMarks;
  if (!(total > 0)) return { heading, minutes: null, fromPaper: false };

  const sectionMarks = SECTION_MARKS.exec(raw);
  if (allowance !== null && sectionMarks) {
    const sectionTotal = Number(sectionMarks[1]);
    if (sectionTotal > 0) {
      const share = total < sectionTotal ? (allowance * total) / sectionTotal : allowance;
      return { heading, minutes: roundMinutes(share), fromPaper: true };
    }
  }
  return { heading, minutes: roundMinutes(HSC_MINUTES_PER_MARK * total), fromPaper: false };
};

/**
 * The seconds a question should take, as every surface of a question states it.
 * A past HSC question with marks uses its paper time (`pastHscTiming`); anything
 * else keeps the verb's `getRecommendedTime`, which is not changed here. The
 * card's chip, the writing timer and the marker's expected length all read this,
 * so one past question never quotes two times.
 */
export const getQuestionSeconds = (
  prompt: Pick<Prompt, 'isPastHSC' | 'hscSection' | 'totalMarks'>,
  verbInfo: CommandTermInfo
): number => {
  if (prompt.isPastHSC) {
    const { minutes } = pastHscTiming(prompt);
    if (minutes !== null) return minutes * 60;
  }
  return getRecommendedTime(prompt.totalMarks, verbInfo);
};
