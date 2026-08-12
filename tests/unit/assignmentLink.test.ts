import { describe, it, expect } from 'vitest';
import {
  buildAssignmentLink,
  parseAssignmentParam,
  resolveAssignmentPath,
  ASSIGNMENT_PARAM,
} from '../../utils/assignmentLink';
import type { Course, StatePath } from '../../types';

const fullPath: StatePath = {
  courseId: 'course-1',
  topicId: 'topic-1',
  subTopicId: 'sub-1',
  dotPointId: 'dp-1',
  promptId: 'prompt-1',
};

const courses: Course[] = [
  {
    id: 'course-1',
    name: 'HSC Biology',
    outcomes: [],
    topics: [
      {
        id: 'topic-1',
        name: 'Genetics',
        subTopics: [
          {
            id: 'sub-1',
            name: 'DNA',
            dotPoints: [
              {
                id: 'dp-1',
                description: 'model DNA',
                prompts: [
                  {
                    id: 'prompt-1',
                    question: 'Explain the structure of DNA.',
                    totalMarks: 5,
                    verb: 'EXPLAIN',
                    keywords: [],
                    linkedOutcomes: [],
                    sampleAnswers: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
] as unknown as Course[];

describe('buildAssignmentLink', () => {
  it('builds a link encoding the full path', () => {
    const link = buildAssignmentLink(fullPath, 'https://band6.au');
    expect(link).toBe(
      `https://band6.au/?${ASSIGNMENT_PARAM}=course-1,topic-1,sub-1,dp-1,prompt-1`
    );
  });

  it('returns null when the path is incomplete', () => {
    expect(buildAssignmentLink({ ...fullPath, promptId: undefined }, 'x')).toBeNull();
    expect(buildAssignmentLink({}, 'x')).toBeNull();
  });

  it('round-trips through parseAssignmentParam', () => {
    const link = buildAssignmentLink(fullPath, 'https://band6.au')!;
    const raw = new URL(link).searchParams.get(ASSIGNMENT_PARAM);
    expect(parseAssignmentParam(raw)).toEqual(fullPath);
  });

  it('includes the base path for sub-path hosting (e.g. GitHub Pages)', () => {
    const link = buildAssignmentLink(fullPath, 'https://4bzdog.github.io/HSC-Writing-Master/');
    expect(link).toBe(
      `https://4bzdog.github.io/HSC-Writing-Master/?${ASSIGNMENT_PARAM}=course-1,topic-1,sub-1,dp-1,prompt-1`
    );
  });

  it('normalises base URL without trailing slash', () => {
    const link = buildAssignmentLink(fullPath, 'https://4bzdog.github.io/HSC-Writing-Master');
    expect(link).toBe(
      `https://4bzdog.github.io/HSC-Writing-Master/?${ASSIGNMENT_PARAM}=course-1,topic-1,sub-1,dp-1,prompt-1`
    );
  });

  it('round-trips realistic generateId-style UUID ids', () => {
    const uuidPath: StatePath = {
      courseId: 'course-11111111-2222-3333-4444-555555555555',
      topicId: 'topic-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      subTopicId: 'subTopic-99999999-8888-7777-6666-555555555555',
      dotPointId: 'dp-12345678-90ab-cdef-1234-567890abcdef',
      promptId: 'prompt-fedcba98-7654-3210-fedc-ba9876543210',
    };
    const link = buildAssignmentLink(uuidPath, 'https://band6.au')!;
    const raw = new URL(link).searchParams.get(ASSIGNMENT_PARAM);
    expect(parseAssignmentParam(raw)).toEqual(uuidPath);
  });
});

describe('parseAssignmentParam', () => {
  it('rejects the wrong number of segments', () => {
    expect(parseAssignmentParam('a,b,c')).toBeNull();
    expect(parseAssignmentParam('a,b,c,d,e,f')).toBeNull();
  });

  it('rejects empty segments and null input', () => {
    expect(parseAssignmentParam('a,,c,d,e')).toBeNull();
    expect(parseAssignmentParam(null)).toBeNull();
    expect(parseAssignmentParam('')).toBeNull();
  });
});

describe('resolveAssignmentPath', () => {
  it('resolves a valid path and returns the question text', () => {
    const result = resolveAssignmentPath(courses, fullPath);
    expect(result).not.toBeNull();
    expect(result!.question).toBe('Explain the structure of DNA.');
    // Plus the year, read off the topic the link already names.
    expect(result!.path).toEqual({ ...fullPath, syllabusYear: 'year12' });
  });

  it('opens a Year 11 question in Year 11, not in an empty Year 12', () => {
    // The link carries ids, not a year. Left unset it resolves to Year 12, the
    // navigator filters this topic out, and the shared question never opens.
    const twoYear = structuredClone(courses);
    twoYear[0].topics[0].year = 'year11';

    const result = resolveAssignmentPath(twoYear, fullPath);
    expect(result!.path.syllabusYear).toBe('year11');
  });

  it('returns null when any level is missing from the library', () => {
    expect(resolveAssignmentPath(courses, { ...fullPath, promptId: 'nope' })).toBeNull();
    expect(resolveAssignmentPath(courses, { ...fullPath, topicId: 'nope' })).toBeNull();
    expect(resolveAssignmentPath([], fullPath)).toBeNull();
    expect(resolveAssignmentPath(courses, null)).toBeNull();
  });
});
