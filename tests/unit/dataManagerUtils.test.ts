import { describe, it, expect } from 'vitest';
import { Course, Topic } from '../../types';
import {
  mergeCourseContents,
  mergeTopicContents,
  buildTopicExportPayload,
  previewTopicMergePlan,
  safeClone,
} from '../../utils/dataManagerUtils';

const buildTopic = (): Topic => ({
  id: 'topic-cells',
  name: 'Cells',
  subTopics: [
    {
      id: 'subtopic-structure',
      name: 'Cell Structure',
      dotPoints: [
        {
          id: 'dp-membrane',
          description: 'Investigate membrane transport',
          prompts: [
            {
              id: 'prompt-transport',
              question: 'Explain membrane transport.',
              totalMarks: 5,
              verb: 'EXPLAIN',
              keywords: ['membrane'],
              sampleAnswers: [
                {
                  id: 'sa-existing',
                  band: 4,
                  answer: 'Transport occurs across membranes.',
                  mark: 4,
                  source: 'AI',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('dataManagerUtils merge helpers', () => {
  it('merges topic content without duplicating matching structures', () => {
    const existingTopic = buildTopic();
    const importedTopic: Topic = {
      id: 'topic-cells-import',
      name: 'Cells',
      subTopics: [
        {
          id: 'subtopic-structure-import',
          name: 'Cell Structure',
          dotPoints: [
            {
              id: 'dp-membrane-import',
              description: 'Investigate membrane transport',
              prompts: [
                {
                  id: 'prompt-transport-import',
                  question: 'Explain membrane transport.',
                  totalMarks: 5,
                  verb: 'EXPLAIN',
                  keywords: ['osmosis'],
                  sampleAnswers: [
                    {
                      id: 'sa-imported',
                      band: 5,
                      answer: 'Movement occurs by diffusion and osmosis.',
                      mark: 5,
                      source: 'AI',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const mergedTopic = mergeTopicContents(existingTopic, importedTopic);

    expect(mergedTopic.subTopics).toHaveLength(1);
    expect(mergedTopic.subTopics[0].dotPoints).toHaveLength(1);
    expect(mergedTopic.subTopics[0].dotPoints[0].prompts).toHaveLength(1);
    expect(mergedTopic.subTopics[0].dotPoints[0].prompts[0].keywords).toEqual([
      'membrane',
      'osmosis',
    ]);
    expect(mergedTopic.subTopics[0].dotPoints[0].prompts[0].sampleAnswers).toHaveLength(2);
  });

  it('merges course imports into existing topics and outcomes by semantic match', () => {
    const existingCourse: Course = {
      id: 'course-bio',
      name: 'Biology',
      outcomes: [{ code: 'BIO1', description: 'Existing outcome' }],
      topics: [buildTopic()],
    };

    const importedCourse: Course = {
      id: 'course-bio-import',
      name: 'Biology',
      outcomes: [
        { code: 'BIO1', description: 'Existing outcome' },
        { code: 'BIO2', description: 'Imported outcome' },
      ],
      topics: [
        {
          id: 'topic-cells-import',
          name: 'Cells',
          subTopics: [
            {
              id: 'subtopic-extra',
              name: 'Cell Division',
              dotPoints: [
                {
                  id: 'dp-mitosis',
                  description: 'Analyse mitosis',
                  prompts: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const mergedCourse = mergeCourseContents(existingCourse, importedCourse);

    expect(mergedCourse.topics).toHaveLength(1);
    expect(mergedCourse.topics[0].subTopics).toHaveLength(2);
    expect(mergedCourse.outcomes.map((outcome) => outcome.code)).toEqual(['BIO1', 'BIO2']);
  });

  /**
   * NSW syllabuses reuse topic names across the two years — "Working
   * Scientifically" is a Year 11 module and a Year 12 module. Matching on the
   * name alone would fold an imported Year 11 topic into the HSC topic that
   * happens to share it, and its content would appear under the wrong year with
   * nothing to show what happened.
   */
  it('does not merge a Year 11 topic into a Year 12 topic of the same name', () => {
    const shared = (year?: 'year11'): Topic =>
      ({
        id: year ? 'topic-ws-11' : 'topic-ws-12',
        name: 'Working Scientifically',
        ...(year ? { year } : {}),
        subTopics: [
          {
            id: year ? 'st-11' : 'st-12',
            name: year ? 'Questioning' : 'Communicating',
            dotPoints: [],
          },
        ],
      }) as Topic;

    const existingCourse: Course = {
      id: 'course-bio',
      name: 'Biology',
      outcomes: [{ code: 'BI-12-01', description: 'HSC outcome' }],
      topics: [shared()],
    };
    const importedCourse: Course = {
      id: 'course-bio',
      name: 'Biology',
      outcomes: [{ code: 'BI-11-01', description: 'Prelim outcome', year: 'year11' }],
      topics: [shared('year11')],
    };

    const merged = mergeCourseContents(existingCourse, importedCourse);

    expect(merged.topics).toHaveLength(2);
    expect(merged.topics.map((t) => t.year)).toEqual([undefined, 'year11']);
    // Each year keeps its own sub-topics rather than acquiring the other's.
    expect(merged.topics[0].subTopics.map((s) => s.name)).toEqual(['Communicating']);
    expect(merged.topics[1].subTopics.map((s) => s.name)).toEqual(['Questioning']);
    expect(merged.outcomes.map((o) => o.code)).toEqual(['BI-12-01', 'BI-11-01']);
  });

  /**
   * `undefined` vs `[]` is a meaningful distinction for DotPoint.focusAreas
   * (see the type's doc comment and handleUpdateFocusAreas in
   * hooks/useSyllabusData.ts): an explicit empty array is a teacher/tool
   * saying "this dot point has no focus areas", not "leave it alone".
   */
  it('merges imported focusAreas, letting an explicit [] win but leaving the existing value alone when the key is absent', () => {
    const buildTopicWithFocusAreas = (focusAreas: string[] | undefined, id: string): Topic => ({
      id,
      name: 'Cells',
      subTopics: [
        {
          id: 'subtopic-structure',
          name: 'Cell Structure',
          dotPoints: [
            {
              id: 'dp-membrane',
              description: 'Investigate membrane transport',
              ...(focusAreas !== undefined ? { focusAreas } : {}),
              prompts: [],
            },
          ],
        },
      ],
    });

    // (a) an explicit imported [] wins over an existing non-empty value.
    const existingA = buildTopicWithFocusAreas(['osmosis', 'diffusion'], 'topic-a');
    const importedA = buildTopicWithFocusAreas([], 'topic-a-import');
    const mergedA = mergeTopicContents(existingA, importedA);
    expect(mergedA.subTopics[0].dotPoints[0].focusAreas).toEqual([]);

    // (b) a non-empty imported value wins over the existing value.
    const existingB = buildTopicWithFocusAreas(['osmosis'], 'topic-b');
    const importedB = buildTopicWithFocusAreas(['active transport', 'passive transport'], 'topic-b-import');
    const mergedB = mergeTopicContents(existingB, importedB);
    expect(mergedB.subTopics[0].dotPoints[0].focusAreas).toEqual([
      'active transport',
      'passive transport',
    ]);

    // (c) no `focusAreas` key at all on the imported dot point leaves the
    // existing value untouched.
    const existingC = buildTopicWithFocusAreas(['osmosis'], 'topic-c');
    const importedC = buildTopicWithFocusAreas(undefined, 'topic-c-import');
    const mergedC = mergeTopicContents(existingC, importedC);
    expect(mergedC.subTopics[0].dotPoints[0].focusAreas).toEqual(['osmosis']);
  });
});

describe('buildTopicExportPayload', () => {
  const courses: Course[] = [
    {
      id: 'course-bio',
      name: 'Biology',
      outcomes: [{ code: 'BIO1', description: 'An outcome' }],
      topics: [buildTopic(), { ...buildTopic(), id: 'topic-genetics', name: 'Genetics' }],
    },
    {
      id: 'course-chem',
      name: 'Chemistry',
      outcomes: [],
      topics: [{ ...buildTopic(), id: 'topic-bonds', name: 'Bonds' }],
    },
  ];

  it('returns exactly one course containing exactly one topic, with prompts/sample answers/focusAreas intact', () => {
    const withFocusAreas: Course[] = [
      {
        ...courses[0],
        topics: [
          {
            ...buildTopic(),
            subTopics: [
              {
                ...buildTopic().subTopics[0],
                dotPoints: [
                  { ...buildTopic().subTopics[0].dotPoints[0], focusAreas: ['osmosis', 'diffusion'] },
                ],
              },
            ],
          },
          { ...buildTopic(), id: 'topic-genetics', name: 'Genetics' },
        ],
      },
    ];

    const result = buildTopicExportPayload(withFocusAreas, 'course-bio', 'topic-cells');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('course-bio');
    expect(result[0].topics).toHaveLength(1);
    expect(result[0].topics[0].id).toBe('topic-cells');

    const dp = result[0].topics[0].subTopics[0].dotPoints[0];
    expect(dp.focusAreas).toEqual(['osmosis', 'diffusion']);
    expect(dp.prompts).toHaveLength(1);
    expect(dp.prompts[0].question).toBe('Explain membrane transport.');
    expect(dp.prompts[0].sampleAnswers).toHaveLength(1);
    expect(dp.prompts[0].sampleAnswers?.[0].id).toBe('sa-existing');
  });

  it('is a no-op on an unknown topic id', () => {
    expect(buildTopicExportPayload(courses, 'course-bio', 'no-such-topic')).toEqual([]);
  });

  it('is a no-op on an unknown course id', () => {
    expect(buildTopicExportPayload(courses, 'no-such-course', 'topic-cells')).toEqual([]);
  });
});

describe('previewTopicMergePlan', () => {
  it('matches an existing topic by name and counts new vs matched sub-topics/dot points/prompts, including a prompt matched by normalized question text', () => {
    const existingTopic = buildTopic();
    const existingTopics: Topic[] = [existingTopic];

    const importedTopic: Topic = {
      id: 'topic-cells-import', // different id — the name match is what's exercised
      name: 'Cells',
      subTopics: [
        {
          id: 'subtopic-structure-import',
          name: 'Cell Structure', // matches by name
          dotPoints: [
            {
              id: 'dp-membrane-import',
              description: 'Investigate membrane transport', // matches by description
              prompts: [
                {
                  // Different id, but the SAME question text (case/whitespace
                  // aside) — must be counted as matched, not new.
                  id: 'prompt-transport-import',
                  question: '  explain MEMBRANE transport.  ',
                  totalMarks: 5,
                  verb: 'EXPLAIN',
                  keywords: [],
                  sampleAnswers: [],
                },
                {
                  id: 'prompt-new',
                  question: 'A brand-new question not seen before.',
                  totalMarks: 3,
                  verb: 'DESCRIBE',
                  keywords: [],
                  sampleAnswers: [],
                },
              ],
            },
            {
              id: 'dp-new',
              description: 'A brand-new dot point',
              prompts: [
                {
                  id: 'prompt-under-new-dp',
                  question: 'Question under the new dot point.',
                  totalMarks: 4,
                  verb: 'EXPLAIN',
                  keywords: [],
                  sampleAnswers: [],
                },
              ],
            },
          ],
        },
        {
          id: 'subtopic-new',
          name: 'A brand-new sub-topic',
          dotPoints: [
            {
              id: 'dp-under-new-st',
              description: 'A dot point under the new sub-topic',
              prompts: [],
            },
          ],
        },
      ],
    };

    const plan = previewTopicMergePlan(existingTopics, importedTopic);

    expect(plan.matchedTopic?.id).toBe('topic-cells');
    expect(plan.matchedSubTopics).toBe(1); // Cell Structure
    expect(plan.newSubTopics).toBe(1); // A brand-new sub-topic
    expect(plan.matchedDotPoints).toBe(1); // Investigate membrane transport
    expect(plan.newDotPoints).toBe(2); // dp-new + dp-under-new-st
    expect(plan.matchedPrompts).toBe(1); // the normalized-text-matched question
    expect(plan.newPrompts).toBe(2); // prompt-new + prompt-under-new-dp
  });

  it('reports no match (matchedTopic: null) when nothing in the course matches the imported topic', () => {
    const existingTopics: Topic[] = [buildTopic()];
    const importedTopic: Topic = {
      id: 'topic-unrelated',
      name: 'An Entirely Different Topic',
      subTopics: [
        {
          id: 'st-1',
          name: 'Sub 1',
          dotPoints: [
            { id: 'dp-1', description: 'Dot 1', prompts: [] },
          ],
        },
      ],
    };

    const plan = previewTopicMergePlan(existingTopics, importedTopic);

    expect(plan.matchedTopic).toBeNull();
    expect(plan.newSubTopics).toBe(1);
    expect(plan.matchedSubTopics).toBe(0);
    expect(plan.newDotPoints).toBe(1);
    expect(plan.matchedDotPoints).toBe(0);
    expect(plan.newPrompts).toBe(0);
    expect(plan.matchedPrompts).toBe(0);
  });

  it('matches a topic by id even when the name differs', () => {
    const existingTopics: Topic[] = [buildTopic()];
    const importedTopic: Topic = { ...buildTopic(), name: 'Renamed Cells' };

    const plan = previewTopicMergePlan(existingTopics, importedTopic);

    expect(plan.matchedTopic?.id).toBe('topic-cells');
  });
});

describe('safeClone', () => {
  it('deep-clones, so mutating the copy leaves the original untouched', () => {
    const original = buildTopic();
    const copy = safeClone(original);
    copy.subTopics[0].dotPoints[0].description = 'changed';
    expect(original.subTopics[0].dotPoints[0].description).toBe('Investigate membrane transport');
    expect(copy).not.toBe(original);
  });

  it('clones via structuredClone (regression: it used to recurse into itself)', () => {
    // The JSON fallback would turn a Date into a string; structuredClone keeps
    // it a Date. A regression to the old self-recursive body would stack-
    // overflow, fall through to the JSON path, and fail this assertion.
    const cloned = safeClone({ when: new Date('2020-01-01T00:00:00Z'), n: 1 });
    expect(cloned.when).toBeInstanceOf(Date);
    expect(cloned.when.getTime()).toBe(Date.UTC(2020, 0, 1));
  });
});
