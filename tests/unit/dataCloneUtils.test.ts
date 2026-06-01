import { describe, it, expect } from 'vitest';
import {
  shallowClone,
  deepCloneWithDepth,
  cloneCourses,
  cloneCourse,
  clonePartialCourse,
  structuralMerge,
  cloneForComparison,
  cloneWithFilter,
  estimateMemoryUsage,
} from '../../utils/dataCloneUtils';
import { Course } from '../../types';

const buildCourse = (): Course => ({
  id: 'c1',
  name: 'Course 1',
  outcomes: [{ code: 'O1', description: 'Outcome' }],
  topics: [
    {
      id: 't1',
      name: 'Topic 1',
      subTopics: [
        {
          id: 'st1',
          name: 'SubTopic 1',
          dotPoints: [
            {
              id: 'dp1',
              description: 'Dot Point 1',
              prompts: [
                {
                  id: 'p1',
                  question: 'Q1',
                  totalMarks: 5,
                  verb: 'EXPLAIN',
                  keywords: ['k1'],
                  sampleAnswers: [{ id: 'sa1', band: 4, answer: 'A', mark: 4, source: 'AI' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('dataCloneUtils', () => {
  describe('shallowClone', () => {
    it('should create a shallow copy of an object', () => {
      const original = { id: '1', name: 'Test', nested: { value: 'data' } };
      const cloned = shallowClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.nested).toBe(original.nested); // Nested reference is shared
    });

    it('should create a new object instance', () => {
      const original = { id: '1' };
      const cloned = shallowClone(original);

      cloned.id = '2';
      expect(original.id).toBe('1');
    });
  });

  describe('deepCloneWithDepth', () => {
    it('should deeply clone nested objects', () => {
      const original = {
        id: '1',
        nested: { value: 'data', deep: { level: 3 } },
      };
      const cloned = deepCloneWithDepth(original);

      expect(cloned).toEqual(original);
      expect(cloned.nested).not.toBe(original.nested);
      expect(cloned.nested.deep).not.toBe(original.nested.deep);
    });

    it('should respect max depth limit', () => {
      const original = {
        level1: { level2: { level3: { level4: 'value' } } },
      };
      const cloned = deepCloneWithDepth(original, 2);

      // Level 1 and 2 are cloned
      expect(cloned).not.toBe(original);
      expect(cloned.level1).not.toBe(original.level1);
      // Level 3 is shared (beyond maxDepth)
      expect(cloned.level1.level2).toBe(original.level1.level2);
    });

    it('should handle arrays', () => {
      const original = [{ id: 1 }, { id: 2 }];
      const cloned = deepCloneWithDepth(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[0]).not.toBe(original[0]);
    });

    it('should handle null values', () => {
      expect(deepCloneWithDepth(null as any)).toBe(null);
    });

    it('should clone with unlimited depth when maxDepth is negative', () => {
      const original = {
        a: { b: { c: { d: { e: 'deep' } } } },
      };
      const cloned = deepCloneWithDepth(original, -1);

      expect(cloned.a).not.toBe(original.a);
      expect(cloned.a.b).not.toBe(original.a.b);
      expect(cloned.a.b.c).not.toBe(original.a.b.c);
      expect(cloned.a.b.c.d).not.toBe(original.a.b.c.d);
    });
  });

  describe('cloneCourses', () => {
    it('should deeply clone courses structure', () => {
      const original: Course[] = [
        {
          id: 'c1',
          name: 'Course 1',
          outcomes: [],
          topics: [
            {
              id: 't1',
              name: 'Topic 1',
              subTopics: [
                {
                  id: 'st1',
                  name: 'SubTopic 1',
                  dotPoints: [
                    {
                      id: 'dp1',
                      description: 'Dot Point 1',
                      prompts: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const cloned = cloneCourses(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[0]).not.toBe(original[0]);
      expect(cloned[0].topics[0]).not.toBe(original[0].topics[0]);
      expect(cloned[0].topics[0].subTopics[0]).not.toBe(original[0].topics[0].subTopics[0]);
      expect(cloned[0].topics[0].subTopics[0].dotPoints[0]).not.toBe(
        original[0].topics[0].subTopics[0].dotPoints[0]
      );
    });

    it('should handle empty courses array', () => {
      const cloned = cloneCourses([]);
      expect(cloned).toEqual([]);
      expect(cloned).not.toBe([]);
    });

    it('should preserve unknown passthrough fields and deep-clone arrays', () => {
      const original = buildCourse();
      (original as any).subject = 'Science';
      const cloned = cloneCourses([original]);

      expect((cloned[0] as any).subject).toBe('Science');
      expect(cloned[0].outcomes).not.toBe(original.outcomes);
      const clonedPrompt = cloned[0].topics[0].subTopics[0].dotPoints[0].prompts[0];
      const originalPrompt = original.topics[0].subTopics[0].dotPoints[0].prompts[0];
      expect(clonedPrompt.sampleAnswers).not.toBe(originalPrompt.sampleAnswers);
      expect(clonedPrompt.keywords).toEqual(['k1']);
    });
  });

  describe('cloneCourse', () => {
    it('deep-clones a single course', () => {
      const original = buildCourse();
      const cloned = cloneCourse(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.topics[0]).not.toBe(original.topics[0]);
    });
  });

  describe('clonePartialCourse', () => {
    it('clones only the topics referenced by the paths and shares the rest', () => {
      const original = buildCourse();
      original.topics.push({ id: 't2', name: 'Topic 2', subTopics: [] });

      const cloned = clonePartialCourse(original, [
        { topicId: 't1', subTopicId: 'st1', dotPointId: 'dp1' },
      ]);

      // t1 is cloned (matched path), t2 is shared by reference (untouched).
      expect(cloned.topics[0]).not.toBe(original.topics[0]);
      expect(cloned.topics[1]).toBe(original.topics[1]);
    });
  });

  describe('structuralMerge', () => {
    it('merges nested objects and replaces arrays', () => {
      const source = { a: 1, nested: { x: 1, y: 2 }, list: [1, 2] };
      const result = structuralMerge(source, { nested: { y: 9 } as any, list: [3] });

      expect(result.a).toBe(1);
      expect(result.nested).toEqual({ x: 1, y: 9 });
      expect(result.list).toEqual([3]);
      expect(result).not.toBe(source);
    });
  });

  describe('cloneForComparison', () => {
    it('produces a lightweight structural summary', () => {
      const summary = cloneForComparison(buildCourse());
      expect(summary.id).toBe('c1');
      expect(summary.topics[0].subTopics[0].dotPoints).toBe(1);
      expect(summary.topics[0].subTopics[0].questions).toBe(1);
    });
  });

  describe('cloneWithFilter', () => {
    it('excludes specified fields', () => {
      const result = cloneWithFilter({ id: '1', secret: 'x', name: 'n' }, undefined, ['secret']);
      expect(result).toEqual({ id: '1', name: 'n' });
    });

    it('includes only whitelisted fields', () => {
      const result = cloneWithFilter({ id: '1', secret: 'x', name: 'n' }, ['id']);
      expect(result).toEqual({ id: '1' });
    });
  });

  describe('estimateMemoryUsage', () => {
    it('returns a positive estimate for objects and zero for nullish', () => {
      expect(estimateMemoryUsage(null)).toBe(0);
      expect(estimateMemoryUsage('hello')).toBeGreaterThan(0);
      expect(estimateMemoryUsage({ a: [1, 2, 3], b: 'text' })).toBeGreaterThan(0);
    });
  });
});
