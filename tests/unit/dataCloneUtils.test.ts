/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { shallowClone, deepCloneWithDepth, cloneCourses } from '../../utils/dataCloneUtils';
import { Course } from '../../types';

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
  });
});
