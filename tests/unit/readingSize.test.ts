import { describe, it, expect } from 'vitest';
import {
  READING_SIZE_DEFAULT,
  READING_SIZE_MAX,
  READING_SIZE_MIN,
  READING_SIZE_STEP,
  canStepReadingSize,
  clampReadingSize,
  stepReadingSize,
} from '../../utils/readingSize';

describe('the shared reading-size range', () => {
  it('is 12 to 48, in steps of 2, starting at 18', () => {
    expect(READING_SIZE_MIN).toBe(12);
    expect(READING_SIZE_MAX).toBe(48);
    expect(READING_SIZE_STEP).toBe(2);
    expect(READING_SIZE_DEFAULT).toBe(18);
  });
});

describe('clampReadingSize', () => {
  it('leaves an in-range size alone', () => {
    expect(clampReadingSize(18)).toBe(18);
    expect(clampReadingSize(14)).toBe(14);
  });

  it('pins a size below the range to the minimum and above it to the maximum', () => {
    expect(clampReadingSize(4)).toBe(12);
    expect(clampReadingSize(-10)).toBe(12);
    expect(clampReadingSize(60)).toBe(48);
    expect(clampReadingSize(33)).toBe(33);
  });

  it('falls back to the default for a value that is not a number', () => {
    expect(clampReadingSize(Number.NaN)).toBe(READING_SIZE_DEFAULT);
    expect(clampReadingSize(Number.POSITIVE_INFINITY)).toBe(READING_SIZE_DEFAULT);
  });
});

describe('stepReadingSize', () => {
  it('moves one step up or down', () => {
    expect(stepReadingSize(18, 1)).toBe(20);
    expect(stepReadingSize(18, -1)).toBe(16);
  });

  it('never leaves the range, however far it is pushed', () => {
    expect(stepReadingSize(12, -1)).toBe(12);
    expect(stepReadingSize(47, 1)).toBe(48);
    expect(stepReadingSize(48, 1)).toBe(48);
  });

  it('steps from the clamped size, so a size outside the range comes back in one step at a time', () => {
    expect(stepReadingSize(60, -1)).toBe(46);
    expect(stepReadingSize(2, 1)).toBe(14);
  });
});

describe('canStepReadingSize', () => {
  it('is false exactly where a step would leave the size unchanged', () => {
    expect(canStepReadingSize(12, -1)).toBe(false);
    expect(canStepReadingSize(48, 1)).toBe(false);
    expect(canStepReadingSize(13, -1)).toBe(true);
    expect(canStepReadingSize(47, 1)).toBe(true);
  });

  it('allows both directions across the whole middle of the range', () => {
    for (let size = READING_SIZE_MIN + 2; size < READING_SIZE_MAX; size += 2) {
      expect(canStepReadingSize(size, -1)).toBe(true);
      expect(canStepReadingSize(size, 1)).toBe(true);
    }
  });

  it('allows the way back in from a size outside the range', () => {
    expect(canStepReadingSize(60, -1)).toBe(true);
    expect(canStepReadingSize(2, 1)).toBe(true);
  });
});
