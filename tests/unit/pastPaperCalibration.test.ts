import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNewPrompt } from '../../services/geminiService';
import { getCommandTermInfo } from '../../data/commandTerms';
import type { Course, CourseOutcome, Prompt } from '../../types';
import {
  buildGuideCalibrationBrief,
  buildQuestionCalibrationBrief,
  buildSampleCalibrationBrief,
  locatePrompt,
  NESA_SAMPLE_MEDIAN_WORDS,
  registerCalibrationLibrary,
  selectCalibrationExamples,
} from '../../utils/pastPaperCalibration';

/**
 * Real past HSC questions as calibration for the generators. These build small
 * in-memory libraries and check which examples are chosen, how the briefs read, and
 * that generateNewPrompt sends them. Each test registers its own library; the library
 * is cleared after every test.
 */

// ---------------------------------------------------------------------------
// Fixtures

const past = (id: string, overrides: Partial<Prompt> = {}): Prompt => ({
  id,
  question: `Past question ${id}?`,
  totalMarks: 5,
  verb: 'DESCRIBE',
  isPastHSC: true,
  hscYear: 2023,
  hscQuestionNumber: '1',
  ...overrides,
});

const generated = (id: string, overrides: Partial<Prompt> = {}): Prompt => ({
  id,
  question: `Generated question ${id}?`,
  totalMarks: 5,
  verb: 'DESCRIBE',
  ...overrides,
});

interface DotPointSpec {
  id: string;
  description: string;
  prompts: Prompt[];
}

interface TopicSpec {
  name: string;
  dotPoints: DotPointSpec[];
}

/** A course with one sub-topic per topic, so each topic is one level of the syllabus. */
const makeCourse = (name: string, topics: TopicSpec[], extra: Partial<Course> = {}): Course => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `course-${slug}`,
    name,
    outcomes: [],
    topics: topics.map((topic, ti) => ({
      id: `${slug}-topic-${ti}`,
      name: topic.name,
      subTopics: [
        {
          id: `${slug}-sub-${ti}`,
          name: `${topic.name} sub-topic`,
          dotPoints: topic.dotPoints.map((dp) => ({
            id: dp.id,
            description: dp.description,
            prompts: dp.prompts,
          })),
        },
      ],
    })),
    ...extra,
  };
};

/** One course, one topic, one dot point, holding the given prompts. */
const oneDotPoint = (
  courseName: string,
  description: string,
  prompts: Prompt[],
  topicName = 'Finance'
): Course =>
  makeCourse(courseName, [
    { name: topicName, dotPoints: [{ id: `dp-${description}`, description, prompts }] },
  ]);

const GUIDE_FIVE = [
  '5 marks: Explains how cash flow is managed thoroughly',
  '4 marks: Explains how cash flow is managed',
  '3 marks: Describes cash flow',
  '2 marks: Identifies a cash term',
  '1 mark: States a cash term',
].join('\n');

afterEach(() => registerCalibrationLibrary([]));

// ---------------------------------------------------------------------------
// An empty library

describe('with nothing to calibrate from', () => {
  it('selects no examples and borrows nothing from an empty library', () => {
    registerCalibrationLibrary([]);
    expect(selectCalibrationExamples({ courseName: 'HSC Business Studies', marks: 5 })).toEqual({
      examples: [],
      fromOtherCourses: false,
    });
  });

  it('gives empty briefs for an empty library', () => {
    registerCalibrationLibrary([]);
    const selection = selectCalibrationExamples({ courseName: 'HSC Business Studies', marks: 5 });
    expect(buildQuestionCalibrationBrief(selection)).toBe('');
    expect(buildGuideCalibrationBrief(selection)).toBe('');
  });

  it('selects nothing when the library holds courses but no past questions', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [generated('g1')]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    expect(selection).toEqual({ examples: [], fromOtherCourses: false });
    expect(buildQuestionCalibrationBrief(selection)).toBe('');
    expect(buildGuideCalibrationBrief(selection)).toBe('');
  });

  it('locates nothing in an empty library', () => {
    registerCalibrationLibrary([]);
    expect(locatePrompt('anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Which examples are chosen, and in what order

describe('selectCalibrationExamples: same course first', () => {
  it('prefers examples from the same course over other courses', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('bus-1')]),
      oneDotPoint('HSC Economics', 'Explain cash flow', [
        past('eco-1', { hscQuestionNumber: '2' }),
      ]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    expect(selection.fromOtherCourses).toBe(false);
    expect(selection.examples.map((e) => e.prompt.id)).toEqual(['bus-1']);
    expect(selection.examples[0].courseName).toBe('HSC Business Studies');
  });

  it('matches the course name without regard to case or spacing', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('bus-1')]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: '  hsc business studies ',
      marks: 5,
    });
    expect(selection.fromOtherCourses).toBe(false);
    expect(selection.examples.map((e) => e.prompt.id)).toEqual(['bus-1']);
  });
});

describe('selectCalibrationExamples: ordering', () => {
  it('orders dot point, then topic, then course, then nearest marks', () => {
    registerCalibrationLibrary([
      makeCourse('HSC Business Studies', [
        {
          name: 'Finance',
          dotPoints: [
            {
              id: 'dp-cash',
              description: 'Explain cash flow',
              prompts: [
                past('dp-far', { totalMarks: 15, hscQuestionNumber: '3' }),
                past('dp-near', { totalMarks: 5, hscQuestionNumber: '4' }),
              ],
            },
            {
              id: 'dp-budget',
              description: 'Analyse budgets',
              prompts: [past('topic-same', { totalMarks: 5, hscQuestionNumber: '5' })],
            },
          ],
        },
        {
          name: 'Marketing',
          dotPoints: [
            {
              id: 'dp-segments',
              description: 'Describe segments',
              prompts: [past('course-only', { totalMarks: 5, hscQuestionNumber: '6' })],
            },
          ],
        },
      ]),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      topicName: 'Finance',
      dotPoint: 'Explain cash flow',
      marks: 5,
      limit: 10,
    });
    // The same dot point beats a closer mark count in the topic: "dp-far" (15 marks)
    // comes before "topic-same" (5 marks) because its dot point matches.
    expect(examples.map((e) => e.prompt.id)).toEqual([
      'dp-near',
      'dp-far',
      'topic-same',
      'course-only',
    ]);
    expect(examples.map((e) => e.closeness)).toEqual(['dotPoint', 'dotPoint', 'topic', 'course']);
  });

  it('breaks a tie on marks by the newer paper', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('old', { hscYear: 2019, hscQuestionNumber: '1' }),
        past('new', { hscYear: 2023, hscQuestionNumber: '2' }),
      ]),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    expect(examples.map((e) => e.prompt.id)).toEqual(['new', 'old']);
  });

  it('returns at most three examples from a course by default', () => {
    registerCalibrationLibrary([
      oneDotPoint(
        'HSC Business Studies',
        'Explain cash flow',
        [1, 2, 3, 4].map((n) => past(`q${n}`, { hscQuestionNumber: String(n) }))
      ),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      marks: 5,
    });
    expect(examples).toHaveLength(3);
  });
});

describe('selectCalibrationExamples: one paper question counts once', () => {
  it('counts the text-specific variants of one paper question once', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('q1a-2023', { hscQuestionNumber: '1(a)' }),
        past('q1b-2023', { hscQuestionNumber: '1(b)' }),
        past('q1c-2023', { hscQuestionNumber: '1(c)' }),
        past('q2-2023', { hscQuestionNumber: '2' }),
        past('q1a-2022', { hscYear: 2022, hscQuestionNumber: '1(a)' }),
      ]),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
      limit: 10,
    });
    const ids = examples.map((e) => e.prompt.id);
    // Three 2023 variants of question 1 are one question; 2023 Q2 and the 2022 Q1 are others.
    expect(ids.filter((id) => /^q1[abc]-2023$/.test(id))).toHaveLength(1);
    expect(ids).toContain('q2-2023');
    expect(ids).toContain('q1a-2022');
    expect(examples).toHaveLength(3);
  });

  // NESA numbering is inconsistent ("12", "Q12", "q12(b)"), so the key drops the "Q".
  it('counts "Q1(a)" and "1(b)" from one paper as one question', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('qa', { hscQuestionNumber: 'Q1(a)' }),
        past('qb', { hscQuestionNumber: '1(b)' }),
      ]),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
      limit: 10,
    });
    expect(examples).toHaveLength(1);
  });
});

describe('selectCalibrationExamples: exclusions and superseded copies', () => {
  it('never offers the excluded prompt, even when it is the nearest', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('p1', { totalMarks: 5, hscQuestionNumber: '1' }),
        past('p2', { totalMarks: 5, hscQuestionNumber: '2' }),
        past('p3', { totalMarks: 9, hscQuestionNumber: '3' }),
      ]),
    ]);
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
      excludePromptId: 'p1',
      limit: 10,
    });
    expect(examples.map((e) => e.prompt.id)).toEqual(['p2', 'p3']);
  });

  it('selects nothing when the excluded prompt is the only past question', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('only')]),
    ]);
    expect(
      selectCalibrationExamples({
        courseName: 'HSC Business Studies',
        marks: 5,
        excludePromptId: 'only',
      })
    ).toEqual({ examples: [], fromOtherCourses: false });
  });

  it('ignores past questions in a superseded copy of a course', () => {
    const current = oneDotPoint('HSC Business Studies', 'Explain cash flow', [
      generated('new-gen'),
    ]);
    // The old copy stays in the library, marked as replaced, and must not be read.
    const superseded: Course = {
      ...oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('old-bus')]),
      id: 'course-business-old',
      supersededBy: current.id,
    };
    registerCalibrationLibrary([
      current,
      superseded,
      oneDotPoint('HSC Economics', 'Explain supply', [past('eco-1')]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    // The current copy has no past questions, so the course borrows, and the superseded
    // copy's question is not among the borrowed ones.
    expect(selection.fromOtherCourses).toBe(true);
    expect(selection.examples.map((e) => e.prompt.id)).toEqual(['eco-1']);
    expect(locatePrompt('old-bus')).toBeNull();
  });

  it('selects nothing when a superseded copy holds the only past questions', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [generated('new-gen')]),
      {
        ...oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('old-bus')]),
        id: 'course-old',
        supersededBy: 'course-hsc-business-studies',
      },
    ]);
    expect(selectCalibrationExamples({ courseName: 'HSC Business Studies', marks: 5 })).toEqual({
      examples: [],
      fromOtherCourses: false,
    });
  });
});

describe('selectCalibrationExamples: a course with no past questions', () => {
  /** Three past questions in Economics, one in Legal Studies, one in Geography. */
  const otherCourses = (): Course[] => [
    oneDotPoint(
      'HSC Economics',
      'Explain supply',
      [
        past('e1', { totalMarks: 5, hscQuestionNumber: '1' }),
        past('e2', { totalMarks: 5, hscQuestionNumber: '2' }),
        past('e3', { totalMarks: 5, hscQuestionNumber: '3' }),
      ],
      'Markets'
    ),
    oneDotPoint(
      'HSC Legal Studies',
      'Explain precedent',
      [past('l1', { totalMarks: 6, hscQuestionNumber: '4' })],
      'Law'
    ),
    oneDotPoint(
      'HSC Geography',
      'Explain land use',
      [past('g1', { totalMarks: 7, hscQuestionNumber: '5' })],
      'Places'
    ),
  ];

  it('borrows from other courses, spread over different courses first', () => {
    registerCalibrationLibrary(otherCourses());
    const selection = selectCalibrationExamples({
      courseName: 'HSC Biology',
      dotPoint: 'Explain cells',
      marks: 5,
    });
    expect(selection.fromOtherCourses).toBe(true);
    // Economics has three equally close questions, but only its best one is taken before
    // Legal Studies gets a place.
    expect(selection.examples.map((e) => e.courseName)).toEqual([
      'HSC Economics',
      'HSC Legal Studies',
    ]);
    expect(selection.examples.map((e) => e.closeness)).toEqual(['otherCourse', 'otherCourse']);
  });

  it('borrows at most two examples, even when more are allowed', () => {
    registerCalibrationLibrary(otherCourses());
    const { examples } = selectCalibrationExamples({
      courseName: 'HSC Biology',
      marks: 5,
      limit: 10,
    });
    expect(examples).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The briefs

describe('buildQuestionCalibrationBrief', () => {
  it('shows the question, its HSC label and the top of its guide for a course with past papers', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('q24', {
          totalMarks: 5,
          verb: 'EXPLAIN',
          hscYear: 2023,
          hscQuestionNumber: '24',
          question: 'Explain how a business manages its cash flow in a downturn.',
          markingCriteria: GUIDE_FIVE,
        }),
      ]),
    ]);
    const brief = buildQuestionCalibrationBrief(
      selectCalibrationExamples({
        courseName: 'HSC Business Studies',
        topicName: 'Finance',
        dotPoint: 'Explain cash flow',
        marks: 5,
      })
    );
    expect(brief).toContain('REAL PAST HSC QUESTIONS FROM THIS COURSE');
    expect(brief).not.toContain('OTHER COURSES');
    expect(brief).toContain('HSC 2023 · Q24');
    expect(brief).toContain('(this dot point)');
    expect(brief).toContain('Explain how a business manages its cash flow in a downturn.');
    expect(brief).toContain(
      'NESA marking guide (top … bottom): 5 marks: Explains how cash flow is managed thoroughly'
    );
    expect(brief).toContain('1 mark: States a cash term');
  });

  it('quotes the stimulus of a past question that has one', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('q3', {
          hscQuestionNumber: '3',
          scenario: 'Hypothetical: a regional council runs a small bus service.',
        }),
      ]),
    ]);
    const brief = buildQuestionCalibrationBrief(
      selectCalibrationExamples({
        courseName: 'HSC Business Studies',
        dotPoint: 'Explain cash flow',
        marks: 5,
      })
    );
    expect(brief).toContain(
      'Scenario/stimulus: Hypothetical: a regional council runs a small bus service.'
    );
  });

  it('says the examples are from OTHER COURSES and must not be borrowed from, for a course with none', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Economics', 'Explain supply', [
        past('e1', { question: 'Explain how a fall in supply raises prices.' }),
      ]),
    ]);
    const brief = buildQuestionCalibrationBrief(
      selectCalibrationExamples({ courseName: 'HSC Biology', dotPoint: 'Explain cells', marks: 5 })
    );
    expect(brief).toContain('REAL PAST HSC QUESTIONS FROM OTHER COURSES');
    expect(brief).toContain('Do NOT borrow');
    expect(brief).toContain('(HSC Economics)');
    expect(brief).not.toContain('FROM THIS COURSE');
  });
});

describe('buildGuideCalibrationBrief', () => {
  /** A past question with a two-row guide, so the guide's ends are both visible. */
  const withGuide = (id: string, n: number): Prompt =>
    past(id, {
      hscQuestionNumber: String(n),
      markingCriteria: `5 marks: Explains ${id}\n1 mark: States ${id}`,
    });

  it('gives at most two guides', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        withGuide('g1', 1),
        withGuide('g2', 2),
        withGuide('g3', 3),
      ]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    expect(selection.examples).toHaveLength(3);
    const brief = buildGuideCalibrationBrief(selection);
    expect(brief.split('\n').filter((line) => /^\d+\. /.test(line))).toHaveLength(2);
    expect(brief).toContain('REAL NESA MARKING GUIDES FROM THIS COURSE');
  });

  it('leaves out an example that has no guide', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [
        past('no-guide', { hscQuestionNumber: '1' }),
        withGuide('g2', 2),
        withGuide('g3', 3),
      ]),
    ]);
    const selection = selectCalibrationExamples({
      courseName: 'HSC Business Studies',
      dotPoint: 'Explain cash flow',
      marks: 5,
    });
    expect(selection.examples).toHaveLength(3);
    const brief = buildGuideCalibrationBrief(selection);
    expect(brief.split('\n').filter((line) => /^\d+\. /.test(line))).toHaveLength(2);
    expect(brief).not.toContain('Explains no-guide');
  });

  it('names the other course when the guides are borrowed', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Economics', 'Explain supply', [withGuide('e1', 1)]),
    ]);
    const brief = buildGuideCalibrationBrief(
      selectCalibrationExamples({ courseName: 'HSC Biology', marks: 5 })
    );
    expect(brief).toContain('REAL NESA MARKING GUIDES FROM OTHER COURSES');
    expect(brief).toContain('(5 marks, HSC Economics)');
  });

  it('is empty when no example has a guide', () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('no-guide')]),
    ]);
    const selection = selectCalibrationExamples({ courseName: 'HSC Business Studies', marks: 5 });
    expect(selection.examples).toHaveLength(1);
    expect(buildGuideCalibrationBrief(selection)).toBe('');
  });
});

describe('buildSampleCalibrationBrief', () => {
  it('says a past question is a real HSC question, with its label, and names the mark', () => {
    const brief = buildSampleCalibrationBrief(
      past('q24', { hscYear: 2023, hscQuestionNumber: '24', totalMarks: 5 }),
      3
    );
    expect(brief).toContain('This is a real HSC question (HSC 2023 · Q24)');
    expect(brief).toContain('write to the row of its marking guide that awards 3');
  });

  it('gives the NESA median length only for a full-mark answer', () => {
    const question = past('q', { totalMarks: 6, hscYear: 2024, hscQuestionNumber: '12' });
    expect(buildSampleCalibrationBrief(question, 3)).not.toMatch(/about \d+ words/);
    expect(buildSampleCalibrationBrief(question, 6)).toContain('about 125 words');
  });

  it.each(Object.entries(NESA_SAMPLE_MEDIAN_WORDS))(
    'gives the NESA median for a full-mark %s-mark answer (%s words)',
    (marks, words) => {
      const n = Number(marks);
      expect(buildSampleCalibrationBrief(generated('g', { totalMarks: n }), n)).toContain(
        `about ${words} words`
      );
    }
  );

  it('is empty for a generated question at a part mark', () => {
    expect(buildSampleCalibrationBrief(generated('g', { totalMarks: 5 }), 3)).toBe('');
  });

  it('is empty for a generated question at a full mark that NESA publishes no median for', () => {
    expect(buildSampleCalibrationBrief(generated('g', { totalMarks: 7 }), 7)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Registering and locating

describe('registerCalibrationLibrary and locatePrompt', () => {
  const sample = (): Course =>
    oneDotPoint('HSC Business Studies', 'Explain cash flow', [past('p1')]);

  it('locates a prompt by its course, topic and dot point', () => {
    registerCalibrationLibrary([sample()]);
    expect(locatePrompt('p1')).toEqual({
      courseName: 'HSC Business Studies',
      topicName: 'Finance',
      dotPoint: 'Explain cash flow',
    });
  });

  it('returns null for a prompt that is not in the library', () => {
    registerCalibrationLibrary([sample()]);
    expect(locatePrompt('nope')).toBeNull();
  });

  it('keeps the index when the same array is registered again', () => {
    const library = [sample()];
    registerCalibrationLibrary(library);
    expect(locatePrompt('p1')).not.toBeNull(); // builds the index
    // Added in place to the same array. Registering that array again is not a change, so the
    // index is kept and the new prompt is not found.
    library[0].topics[0].subTopics[0].dotPoints[0].prompts.push(past('late'));
    registerCalibrationLibrary(library);
    expect(locatePrompt('late')).toBeNull();
  });

  it('rebuilds the index when a new array is registered', () => {
    const library = [sample()];
    registerCalibrationLibrary(library);
    expect(locatePrompt('p1')).not.toBeNull();
    library[0].topics[0].subTopics[0].dotPoints[0].prompts.push(past('late'));
    registerCalibrationLibrary([...library]);
    expect(locatePrompt('late')).toEqual({
      courseName: 'HSC Business Studies',
      topicName: 'Finance',
      dotPoint: 'Explain cash flow',
    });
  });
});

// ---------------------------------------------------------------------------
// Through the question generator

/*
 * The same fetch mock as tests/unit/generateNewPrompt.test.ts, so the request text the
 * generator sends is what is asserted.
 */
describe('generateNewPrompt is calibrated by the library', () => {
  const makeProxyResponse = (json: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify(json),
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { totalTokenCount: 50 },
      }),
    }) as unknown as Response;

  const verbs = [getCommandTermInfo('DESCRIBE')];
  const outcomes: CourseOutcome[] = [{ code: 'SE-11-01', description: 'x' }];
  const LADDER =
    '4 marks: Describes a\n3 marks: Describes b\n2 marks: Outlines c\n1 mark: Identifies d';

  const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
    JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Describe X.',
        verb: 'DESCRIBE',
        scenario: 'Hypothetical: a cafe tracks its weekly takings.',
        markingCriteria: LADDER,
        keywords: ['cash flow'],
        linkedOutcomes: ['SE-11-01'],
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the real past HSC questions of this course with the request', async () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Business Studies', 'describe X', [
        past('bus-q24', {
          totalMarks: 4,
          hscYear: 2023,
          hscQuestionNumber: '24',
          question: 'Describe how a business manages its cash flow during a downturn.',
        }),
      ]),
    ]);
    await generateNewPrompt('HSC Business Studies', 'Finance', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('REAL PAST HSC QUESTIONS FROM THIS COURSE');
    expect(sent).toContain('Describe how a business manages its cash flow during a downturn.');
    expect(sent).not.toContain('FROM OTHER COURSES');
  });

  it('says the examples are from OTHER COURSES for a course with none', async () => {
    registerCalibrationLibrary([
      oneDotPoint('HSC Economics', 'describe supply', [
        past('eco-q3', {
          totalMarks: 4,
          question: 'Describe how a fall in supply raises prices.',
        }),
      ]),
    ]);
    await generateNewPrompt('HSC Biology', 'Cells', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('REAL PAST HSC QUESTIONS FROM OTHER COURSES');
    expect(sent).toContain('Describe how a fall in supply raises prices.');
    expect(sent).not.toContain('FROM THIS COURSE');
  });

  it('sends no calibration block when nothing is registered', async () => {
    await generateNewPrompt('HSC Business Studies', 'Finance', 'describe X', 4, verbs, outcomes);
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).not.toContain('REAL PAST HSC QUESTIONS');
  });
});
