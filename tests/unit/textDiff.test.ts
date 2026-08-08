import { describe, it, expect } from 'vitest';
import {
  diffWords,
  summariseDiff,
  segmentsForSide,
  tokenizeWords,
  type DiffSegment,
} from '../../utils/textDiff';

/**
 * The diff is what tells a student "these six words are the extra mark". It has
 * to be lossless — every segment concatenated must rebuild each side exactly —
 * or the "use this answer" button hands back text the student never saw.
 */
const rebuild = (segments: DiffSegment[], side: 'original' | 'revised') =>
  segmentsForSide(segments, side)
    .map((s) => s.value)
    .join('');

describe('diffWords', () => {
  it('rebuilds both sides exactly', () => {
    const a = 'Caching stores data in memory. It is fast.';
    const b = 'Caching stores frequently requested data in memory, so it reduces latency.';

    const segments = diffWords(a, b);

    expect(rebuild(segments, 'original')).toBe(a);
    expect(rebuild(segments, 'revised')).toBe(b);
  });

  it('marks only the inserted words', () => {
    const segments = diffWords('Caching stores data.', 'Caching stores cached data.');
    const inserted = segments
      .filter((s) => s.op === 'insert')
      .map((s) => s.value.trim())
      .join(' ');

    expect(inserted).toBe('cached');
    expect(segments.some((s) => s.op === 'delete')).toBe(false);
  });

  it('marks only the deleted words', () => {
    const segments = diffWords('Caching really stores data.', 'Caching stores data.');
    const deleted = segments
      .filter((s) => s.op === 'delete')
      .map((s) => s.value.trim())
      .join(' ');

    expect(deleted).toBe('really');
  });

  it('does not report a change for punctuation or capitalisation alone', () => {
    const segments = diffWords('caching reduces latency', 'Caching reduces latency.');

    expect(segments.every((s) => s.op === 'equal')).toBe(true);
    // The revision's wording is what the student is asked to write.
    expect(rebuild(segments, 'revised')).toBe('Caching reduces latency.');
  });

  it('handles an empty side', () => {
    expect(diffWords('', 'A new answer.')).toEqual([{ op: 'insert', value: 'A new answer.' }]);
    expect(diffWords('An old answer.', '')).toEqual([{ op: 'delete', value: 'An old answer.' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('keeps a shared opening and closing out of the changed region', () => {
    const a = 'Caching is a technique. It is slow to warm. Overall it helps.';
    const b = 'Caching is a technique. It reduces database load. Overall it helps.';

    const segments = diffWords(a, b);

    expect(segments[0].op).toBe('equal');
    expect(segments[0].value.startsWith('Caching is a technique.')).toBe(true);
    expect(segments[segments.length - 1].op).toBe('equal');
    expect(segments[segments.length - 1].value.trim().endsWith('Overall it helps.')).toBe(true);
  });

  it('collapses adjacent tokens of the same kind into one run', () => {
    const segments = diffWords('one two', 'one alpha beta two');
    const inserts = segments.filter((s) => s.op === 'insert');

    expect(inserts).toHaveLength(1);
    expect(inserts[0].value.trim()).toBe('alpha beta');
  });

  it('degrades to a wholesale replacement rather than hanging on huge inputs', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `alpha${i}`).join(' ');
    const b = Array.from({ length: 4000 }, (_, i) => `beta${i}`).join(' ');

    const started = Date.now();
    const segments = diffWords(a, b);

    expect(Date.now() - started).toBeLessThan(2000);
    expect(rebuild(segments, 'original')).toBe(a);
    expect(rebuild(segments, 'revised')).toBe(b);
  });
});

describe('summariseDiff', () => {
  it('counts what was kept, added and removed', () => {
    const stats = summariseDiff(diffWords('a b c d', 'a b x y z'));

    expect(stats.kept).toBe(2);
    expect(stats.removed).toBe(2);
    expect(stats.added).toBe(3);
    expect(stats.originalWords).toBe(4);
    expect(stats.revisedWords).toBe(5);
    expect(stats.retention).toBeCloseTo(0.5);
  });

  it('reports full retention when nothing was cut', () => {
    const stats = summariseDiff(diffWords('a b c', 'a b c d'));

    expect(stats.retention).toBe(1);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(0);
  });

  it('does not divide by zero on an empty original', () => {
    expect(summariseDiff(diffWords('', 'a b')).retention).toBe(0);
  });
});

describe('tokenizeWords', () => {
  it('carries trailing whitespace so joining is lossless', () => {
    expect(tokenizeWords('one  two\nthree').join('')).toBe('one  two\nthree');
  });
});
