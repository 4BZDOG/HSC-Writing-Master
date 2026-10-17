import { describe, it, expect } from 'vitest';
import {
  changeAnchors,
  diffWords,
  groupEdits,
  groupedChanges,
  substantiveChanges,
  summariseDiff,
  segmentsForSide,
  tokenizeWords,
  type DiffChange,
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

describe('changeAnchors', () => {
  it('counts a replacement as one change, not two', () => {
    // "b" cut, "x" added in its place — a reader sees one edit.
    const segments = diffWords('a b c', 'a x c');
    expect(changeAnchors(segments)).toHaveLength(1);
  });

  it('counts separated edits individually', () => {
    const segments = diffWords('a b c d e', 'a X c d Y');
    expect(changeAnchors(segments)).toHaveLength(2);
  });

  it('is empty when nothing changed', () => {
    expect(changeAnchors(diffWords('a b c', 'a b c'))).toEqual([]);
    // Punctuation-only differences are not changes either.
    expect(changeAnchors(diffWords('a b c', 'A b c.'))).toEqual([]);
  });

  it('points at a segment that is actually a change', () => {
    const segments = diffWords('one two three', 'one four three');
    for (const index of changeAnchors(segments)) {
      expect(segments[index].op).not.toBe('equal');
    }
  });
});

describe('substantiveChanges', () => {
  const change = (removed: string, added: string): DiffChange => ({ removed, added });

  it('keeps additions of a real phrase (two or more words)', () => {
    const kept = substantiveChanges([change('', 'frequently requested data')]);
    expect(kept).toHaveLength(1);
  });

  it('keeps a phrase rewrite (something added in place of two or more cut words)', () => {
    const kept = substantiveChanges([change('makes the system faster', 'reduces latency')]);
    expect(kept).toHaveLength(1);
  });

  it('drops a function-word swap but keeps a content-word swap', () => {
    expect(substantiveChanges([change('a', 'the')])).toHaveLength(0);
    expect(substantiveChanges([change('cat', 'dog')])).toHaveLength(1);
  });

  it('keeps the single-word edits that change an HSC answer', () => {
    // Command-term swap and factual reversal — the most instructive one-word edits.
    expect(substantiveChanges([change('describe', 'analyse')])).toHaveLength(1);
    expect(substantiveChanges([change('increases', 'decreases')])).toHaveLength(1);
    // A one-word negation insertion inverts the claim.
    expect(substantiveChanges([change('', 'not')])).toHaveLength(1);
  });

  it('still drops a plain one-word insertion that does not flip meaning', () => {
    expect(substantiveChanges([change('', 'the')])).toHaveLength(0);
    expect(substantiveChanges([change('', 'quickly')])).toHaveLength(0);
  });

  it('drops a stray short deletion but keeps a whole cut clause', () => {
    expect(substantiveChanges([change('the extra', '')])).toHaveLength(0);
    const clause = 'the camp overall the composer effectively uses visual techniques';
    expect(substantiveChanges([change(clause, '')])).toHaveLength(1);
  });

  it('filters a real diff down to the edits worth revising from', () => {
    const student = 'The cat sat on the extra mat by the door.';
    const revised = 'The dog sat on the mat right there by the door.';
    const all = groupedChanges(diffWords(student, revised));
    const kept = substantiveChanges(all);
    // The content swap cat→dog now stays (a real substitution teaches), as does
    // the two-word insertion "right there"; the lone "extra" cut still goes.
    expect(kept.some((c) => c.added.includes('dog'))).toBe(true);
    expect(kept.some((c) => c.added.includes('right there'))).toBe(true);
    expect(kept.some((c) => c.removed.includes('extra') && !c.added)).toBe(false);
  });
});

describe('groupEdits', () => {
  it('is empty when nothing changed', () => {
    expect(groupEdits(diffWords('a b c', 'a b c'))).toEqual([]);
    expect(groupEdits(diffWords('', ''))).toEqual([]);
    // Punctuation and capitalisation alone are not edits either.
    expect(groupEdits(diffWords('a b c', 'A b c.'))).toEqual([]);
  });

  it('turns one substitution into one edit with its indices and wording', () => {
    const segments = diffWords('a b c', 'a x c');
    expect(groupEdits(segments)).toEqual([{ start: 1, end: 2, removed: 'b', added: 'x' }]);
  });

  it('bridges a kept run of one word', () => {
    const edits = groupEdits(diffWords('a b c d e', 'a X c Y e'));
    expect(edits).toHaveLength(1);
    expect(edits[0].removed).toBe('b c d');
    expect(edits[0].added).toBe('X c Y');
  });

  it('bridges a kept run of two words', () => {
    const edits = groupEdits(diffWords('a b c d e f', 'a X c d Y f'));
    expect(edits).toHaveLength(1);
    expect(edits[0].removed).toBe('b c d e');
    expect(edits[0].added).toBe('X c d Y');
  });

  it('does not bridge a kept run of three words', () => {
    const edits = groupEdits(diffWords('a b c d e f g', 'a X c d e Y g'));
    expect(edits).toHaveLength(2);
    expect(edits[0].removed).toBe('b');
    expect(edits[1].added).toBe('Y');
  });

  it('does not bridge across a sentence end', () => {
    // "C. D" is two kept words, but the full stop starts a new point.
    const edits = groupEdits(diffWords('A B C. D E', 'A X C. D Y'));
    expect(edits).toHaveLength(2);
  });

  it('does not bridge across a paragraph break', () => {
    // "beta" and "gamma" are two kept words, but the break between them starts a new paragraph.
    const edits = groupEdits(diffWords('alpha beta\n\ngamma delta', 'ALPHA2 beta\n\ngamma DELTA2'));
    expect(edits).toHaveLength(2);
  });

  it('shows the student’s own wording for a bridged kept run', () => {
    // "Cache" is kept, but the student capitalised it; the cut side must show that.
    const edits = groupEdits(diffWords('slow Cache fast', 'quick cache slower'));
    expect(edits).toEqual([
      { start: 0, end: 4, removed: 'slow Cache fast', added: 'quick cache slower' },
    ]);
  });

  it('collapses a break inside an edit to a space', () => {
    const edits = groupEdits(diffWords('one two\n\nthree four', 'one X three Y'));
    expect(edits).toHaveLength(1);
    expect(edits[0].removed).toBe('two three four');
    expect(edits[0].added).toBe('X three Y');
  });

  it('points start and end at changed runs, with only kept text between them', () => {
    const segments = diffWords('a b c d e', 'a X c Y e');
    const [edit] = groupEdits(segments);
    expect(segments[edit.start].op).not.toBe('equal');
    expect(segments[edit.end].op).not.toBe('equal');
    // The one kept run inside the edit is the bridge, and it is the only equal run there.
    const kept = segments.slice(edit.start, edit.end + 1).filter((s) => s.op === 'equal');
    expect(kept.map((s) => s.value.trim())).toEqual(['c']);
  });

  it('honours a bridge limit of zero, which leaves each changed run its own edit', () => {
    const segments = diffWords('a b c d e', 'a X c Y e');
    expect(groupEdits(segments, 0)).toHaveLength(2);
    expect(groupEdits(segments, 0)).toHaveLength(changeAnchors(segments).length);
  });
});
