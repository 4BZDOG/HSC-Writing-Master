import { describe, it, expect } from 'vitest';
import { isSameCourseName, withoutHscPrefix } from '../../utils/courseNames';

describe('withoutHscPrefix', () => {
  it('drops a leading HSC, whatever the case, and leaves the subject', () => {
    expect(withoutHscPrefix('HSC Biology')).toBe('Biology');
    expect(withoutHscPrefix('hsc Software Engineering')).toBe('Software Engineering');
    expect(withoutHscPrefix('  HSC  English EAL/D ')).toBe('English EAL/D');
  });

  it('leaves a name that already has no prefix alone', () => {
    expect(withoutHscPrefix('Biology')).toBe('Biology');
    expect(withoutHscPrefix('Biology (Advanced)')).toBe('Biology (Advanced)');
  });

  it('does not strip HSC from the middle of a name or from a word that begins with it', () => {
    expect(withoutHscPrefix('Ancient HSC Practice')).toBe('Ancient HSC Practice');
    expect(withoutHscPrefix('HSCWriting')).toBe('HSCWriting');
  });

  it('gives an empty string for a missing name', () => {
    expect(withoutHscPrefix('')).toBe('');
    expect(withoutHscPrefix('   ')).toBe('');
  });
});

describe('isSameCourseName', () => {
  it('matches a legacy "HSC" name to the new one, on either side', () => {
    expect(isSameCourseName('HSC Software Engineering', 'Software Engineering')).toBe(true);
    expect(isSameCourseName('Software Engineering', 'HSC Software Engineering')).toBe(true);
    expect(isSameCourseName('HSC Biology', 'HSC Biology')).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(isSameCourseName('  biology ', 'HSC Biology')).toBe(true);
  });

  it('keeps different courses apart, including a course and its advanced variant', () => {
    expect(isSameCourseName('Biology', 'Biology (Advanced)')).toBe(false);
    expect(isSameCourseName('HSC Biology', 'HSC Chemistry')).toBe(false);
  });

  it('treats two missing names as the same, as the comparison it replaces did', () => {
    expect(isSameCourseName(undefined, '')).toBe(true);
    expect(isSameCourseName(undefined, 'Biology')).toBe(false);
  });
});
