import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  countPastHsc,
  countPastHscInSubTopic,
  countPastHscInTopic,
  countPastHscInTopics,
  dotPointHasPastHsc,
  isPastHscInYears,
  pastHscYears,
  readPastHscNavigatorState,
  subTopicHasPastHsc,
  topicHasPastHsc,
  writePastHscNavigatorState,
} from '../../utils/pastHscUtils';
import type { DotPoint, Prompt, SubTopic, Topic } from '../../types';

const past = (id: string, hscYear?: number): Prompt =>
  ({
    id,
    question: `Question ${id}`,
    verb: 'ASSESS',
    totalMarks: 6,
    isPastHSC: true,
    ...(hscYear === undefined ? {} : { hscYear }),
  }) as Prompt;

const practice = (id: string): Prompt =>
  ({ id, question: `Practice ${id}`, verb: 'ASSESS', totalMarks: 6 }) as Prompt;

const dotPoint = (id: string, prompts: Prompt[]): DotPoint => ({
  id,
  description: `Dot point ${id}`,
  prompts,
});

const subTopic = (id: string, dotPoints: DotPoint[]): SubTopic => ({
  id,
  name: `Sub-topic ${id}`,
  dotPoints,
});

const topic = (id: string, subTopics: SubTopic[]): Topic => ({
  id,
  name: `Topic ${id}`,
  subTopics,
});

describe('isPastHscInYears', () => {
  it('rejects a practice question whatever the years say', () => {
    expect(isPastHscInYears({ isPastHSC: false, hscYear: 2023 }, [2023])).toBe(false);
    expect(isPastHscInYears({}, undefined)).toBe(false);
  });

  it('admits every past question when no year is chosen', () => {
    expect(isPastHscInYears({ isPastHSC: true, hscYear: 2019 }, [])).toBe(true);
    expect(isPastHscInYears({ isPastHSC: true, hscYear: 2019 }, undefined)).toBe(true);
    expect(isPastHscInYears({ isPastHSC: true }, [])).toBe(true);
  });

  it('admits only the chosen years once a year is chosen', () => {
    expect(isPastHscInYears({ isPastHSC: true, hscYear: 2023 }, [2023, 2024])).toBe(true);
    expect(isPastHscInYears({ isPastHSC: true, hscYear: 2019 }, [2023, 2024])).toBe(false);
  });

  it('holds back a past question with no recorded year once a year is chosen', () => {
    // It is a real HSC question, so "all years" keeps it; it has no year to
    // match, so a chosen year cannot.
    expect(isPastHscInYears({ isPastHSC: true }, [2023])).toBe(false);
  });
});

describe('countPastHsc', () => {
  const prompts = [past('a', 2023), past('b', 2024), past('c'), practice('d'), past('e', 2023)];

  it('counts every past question across all years', () => {
    expect(countPastHsc(prompts)).toBe(4);
    expect(countPastHsc(prompts, [])).toBe(4);
  });

  it('counts only the chosen years', () => {
    expect(countPastHsc(prompts, [2023])).toBe(2);
    expect(countPastHsc(prompts, [2023, 2024])).toBe(3);
    expect(countPastHsc(prompts, [2019])).toBe(0);
  });

  it('is zero for an empty list', () => {
    expect(countPastHsc([])).toBe(0);
  });
});

describe('navigator counts roll up the tree', () => {
  const tree = [
    topic('t1', [
      subTopic('s1', [dotPoint('d1', [past('a', 2023), practice('x')]), dotPoint('d2', [])]),
      subTopic('s2', [dotPoint('d3', [past('b', 2024), past('c', 2023)])]),
    ]),
    topic('t2', [subTopic('s3', [dotPoint('d4', [practice('y')])])]),
    topic('t3', []),
  ];

  it('counts a sub-topic across its dot points', () => {
    expect(countPastHscInSubTopic(tree[0].subTopics[0])).toBe(1);
    expect(countPastHscInSubTopic(tree[0].subTopics[1])).toBe(2);
  });

  it('counts a topic across its sub-topics, and a year at a time', () => {
    expect(countPastHscInTopic(tree[0])).toBe(3);
    expect(countPastHscInTopic(tree[0], [2023])).toBe(2);
    expect(countPastHscInTopic(tree[0], [2024])).toBe(1);
  });

  it('counts a whole year of topics', () => {
    expect(countPastHscInTopics(tree)).toBe(3);
    expect(countPastHscInTopics(tree, [2024])).toBe(1);
    expect(countPastHscInTopics([topic('t9', [])])).toBe(0);
  });

  it('states whether each node holds a matching past question', () => {
    expect(dotPointHasPastHsc(tree[0].subTopics[0].dotPoints[0])).toBe(true);
    expect(dotPointHasPastHsc(tree[0].subTopics[0].dotPoints[0], [2024])).toBe(false);
    expect(subTopicHasPastHsc(tree[0].subTopics[1], [2024])).toBe(true);
    expect(subTopicHasPastHsc(tree[1].subTopics[0])).toBe(false);
    expect(topicHasPastHsc(tree[0], [2024])).toBe(true);
    expect(topicHasPastHsc(tree[1])).toBe(false);
    expect(topicHasPastHsc(tree[2])).toBe(false);
  });

  it('tolerates a dot point with no prompts array', () => {
    const bare = { id: 'dx', description: '' } as unknown as DotPoint;
    expect(dotPointHasPastHsc(bare)).toBe(false);
    expect(countPastHscInSubTopic(subTopic('sx', [bare]))).toBe(0);
  });
});

describe('pastHscYears', () => {
  it('lists the distinct years present, oldest first', () => {
    const tree = [
      topic('t1', [subTopic('s1', [dotPoint('d1', [past('a', 2024), past('b', 2020)])])]),
      topic('t2', [subTopic('s2', [dotPoint('d2', [past('c', 2024), past('d', 2022)])])]),
    ];
    expect(pastHscYears(tree)).toEqual([2020, 2022, 2024]);
  });

  it('ignores past questions with no year and practice questions', () => {
    const tree = [topic('t1', [subTopic('s1', [dotPoint('d1', [past('a'), practice('b')])])])];
    expect(pastHscYears(tree)).toEqual([]);
  });

  it('is empty for a course with no past questions', () => {
    expect(pastHscYears([])).toEqual([]);
  });
});

describe('the saved navigator state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('starts off, with every year, for a course with nothing stored', () => {
    expect(readPastHscNavigatorState('course-a')).toEqual({ on: false, years: [] });
  });

  it('keeps the toggle and the years per course', () => {
    writePastHscNavigatorState('course-a', { on: true, years: [2023, 2024] });
    writePastHscNavigatorState('course-b', { on: false, years: [2019] });

    expect(readPastHscNavigatorState('course-a')).toEqual({ on: true, years: [2023, 2024] });
    expect(readPastHscNavigatorState('course-b')).toEqual({ on: false, years: [2019] });
  });

  it('falls back to the default for stored text that is not JSON', () => {
    window.localStorage.setItem('hsc.pastHscNavigator.course-a', '{not json');
    expect(readPastHscNavigatorState('course-a')).toEqual({ on: false, years: [] });
  });

  it('normalises hand-edited years: distinct, sorted, whole numbers only', () => {
    window.localStorage.setItem(
      'hsc.pastHscNavigator.course-a',
      JSON.stringify({ on: 'yes', years: [2024, 2023, 2024, 'x', 2023.5, null] })
    );
    // `on` must be the literal true to count, so a stray string does not switch it on.
    expect(readPastHscNavigatorState('course-a')).toEqual({ on: false, years: [2023, 2024] });
  });

  it('treats a store that throws on read as empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(readPastHscNavigatorState('course-a')).toEqual({ on: false, years: [] });
  });

  it('does not throw when the store refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writePastHscNavigatorState('course-a', { on: true, years: [] })).not.toThrow();
  });

  it('reads and writes nothing without a course to key it by', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    writePastHscNavigatorState('', { on: true, years: [2023] });
    expect(setItem).not.toHaveBeenCalled();
    expect(readPastHscNavigatorState('')).toEqual({ on: false, years: [] });
  });
});
