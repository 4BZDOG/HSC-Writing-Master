import { describe, it, expect } from 'vitest';
import {
  countQuestions,
  courseAvailability,
  summariseAvailability,
} from '../../utils/courseAvailability';
import type { Course } from '../../types';

/**
 * What a course is to a viewer: purchased, included, to unlock, coming soon, or
 * simply open. The course picker, the course library and the first-run picker all
 * read it from here, so they cannot disagree.
 */

const withPrompts = (n: number) =>
  ({
    topics: [
      {
        subTopics: [{ dotPoints: [{ prompts: Array.from({ length: n }, (_, i) => ({ id: i })) }] }],
      },
    ],
  }) as unknown as Course;

describe('course availability', () => {
  it('names each access rule as the viewer would', () => {
    expect(courseAvailability(5, 'owned')).toBe('purchased');
    expect(courseAvailability(5, 'included-plan')).toBe('included');
    expect(courseAvailability(5, 'free-course')).toBe('included');
    expect(courseAvailability(5, 'locked')).toBe('locked');
    expect(courseAvailability(5, 'staff')).toBe('open');
    expect(courseAvailability(5, 'disabled')).toBe('open');
  });

  it('calls a course with no questions coming soon, whatever its price or ownership', () => {
    for (const reason of ['owned', 'locked', 'included-plan', 'staff', 'disabled'] as const) {
      expect(courseAvailability(0, reason)).toBe('coming-soon');
    }
  });

  it('counts questions across topics, and tolerates missing levels', () => {
    expect(countQuestions(withPrompts(3))).toBe(3);
    expect(countQuestions({ topics: [] } as unknown as Course)).toBe(0);
    expect(countQuestions({} as Course)).toBe(0);
  });

  it('summarises only the states worth naming, in a fixed order', () => {
    expect(
      summariseAvailability(['open', 'locked', 'purchased', 'coming-soon', 'locked', 'included'])
    ).toBe('1 purchased · 1 included · 2 to unlock · 1 coming soon');
    expect(summariseAvailability(['open', 'open'])).toBe('');
  });
});
