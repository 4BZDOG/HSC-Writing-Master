import { describe, it, expect } from 'vitest';
import { Course, Topic } from '../../types';
import { mergeCourseContents, mergeTopicContents } from '../../utils/dataManagerUtils';

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
});
