import { describe, it, expect } from 'vitest';
import { isCourseVisible, visibleCourses } from '../../utils/courseVisibility';
import type { Course, UserRole } from '../../types';

const ROLES: UserRole[] = ['admin', 'teacher', 'user', 'guest'];

const makeCourse = (id: string, status?: 'draft' | 'published'): Course => ({
  id,
  name: `Course ${id}`,
  outcomes: [],
  topics: [],
  ...(status ? { status } : {}),
});

describe('isCourseVisible', () => {
  // Absence and 'published' both mean visible to everyone, for every role —
  // the "absence means what it always meant" rule shared with every other
  // additive field in this codebase.
  (['published', undefined] as const).forEach((status) => {
    ROLES.forEach((role) => {
      it(`status=${status ?? 'absent'} is visible to ${role}`, () => {
        expect(isCourseVisible(makeCourse('c', status), role)).toBe(true);
      });
    });
  });

  // A draft course is visible only to an admin (canCreateCurriculum).
  it('status=draft is visible to admin', () => {
    expect(isCourseVisible(makeCourse('c', 'draft'), 'admin')).toBe(true);
  });

  (['teacher', 'user', 'guest'] as UserRole[]).forEach((role) => {
    it(`status=draft is hidden from ${role}`, () => {
      expect(isCourseVisible(makeCourse('c', 'draft'), role)).toBe(false);
    });
  });
});

describe('visibleCourses', () => {
  const courses: Course[] = [
    makeCourse('published', 'published'),
    makeCourse('absent'),
    makeCourse('draft', 'draft'),
  ];

  it('admin sees every course, including drafts', () => {
    expect(visibleCourses(courses, 'admin').map((c) => c.id)).toEqual([
      'published',
      'absent',
      'draft',
    ]);
  });

  (['teacher', 'user', 'guest'] as UserRole[]).forEach((role) => {
    it(`${role} sees only published/absent-status courses, not the draft`, () => {
      expect(visibleCourses(courses, role).map((c) => c.id)).toEqual(['published', 'absent']);
    });
  });

  it('returns an empty array when there are no courses', () => {
    expect(visibleCourses([], 'admin')).toEqual([]);
  });
});
