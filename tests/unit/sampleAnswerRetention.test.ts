import { describe, it, expect } from 'vitest';
import {
  addAndPruneSampleAnswers,
  deduplicateSampleAnswers,
} from '../../utils/dataManagerUtils';
import { SampleAnswer } from '../../types';

/**
 * What may and may not be thrown away when sample answers are saved.
 *
 * `evaluateAnswer` anchors its marking on HSC_EXEMPLAR samples and falls back
 * to AI-written ones only when there are none — deliberately, because marking
 * against AI-marked samples compounds the AI's own error. A verified exemplar
 * also cannot be regenerated: it came off a real past paper. So the pruning
 * rules may drop AI samples freely and must never drop an exemplar.
 */

const sa = (overrides: Partial<SampleAnswer>): SampleAnswer =>
  ({
    id: 'sa',
    answer: 'text',
    mark: 5,
    band: 5,
    source: 'AI',
    feedback: '',
    ...overrides,
  }) as SampleAnswer;

const ids = (answers: SampleAnswer[]) => answers.map((a) => a.id).sort();

describe('deduplicateSampleAnswers', () => {
  it('keeps the lower mark when the same text is stored twice', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'high', answer: 'same', mark: 6 }),
      sa({ id: 'low', answer: 'same', mark: 3 }),
    ]);

    expect(ids(result)).toEqual(['low']);
  });

  it('treats text differing only by surrounding whitespace as the same', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'a', answer: 'same', mark: 3 }),
      sa({ id: 'b', answer: '  same  ', mark: 6 }),
    ]);

    expect(result).toHaveLength(1);
  });

  it('leaves genuinely different answers alone', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'a', answer: 'first' }),
      sa({ id: 'b', answer: 'second' }),
    ]);

    expect(ids(result)).toEqual(['a', 'b']);
  });

  // The bug: the same text saved as a marked HSC exemplar and as an AI sample
  // resolved to whichever carried the lower mark, discarding the exemplar and
  // with it the marking anchor.
  it('keeps a verified exemplar over an AI answer with the same text', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'exemplar', answer: 'same', mark: 6, source: 'HSC_EXEMPLAR' }),
      sa({ id: 'ai', answer: 'same', mark: 3, source: 'AI' }),
    ]);

    expect(ids(result)).toEqual(['exemplar']);
  });

  it('keeps the exemplar whichever order the two arrive in', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'ai', answer: 'same', mark: 3, source: 'AI' }),
      sa({ id: 'exemplar', answer: 'same', mark: 6, source: 'HSC_EXEMPLAR' }),
    ]);

    expect(ids(result)).toEqual(['exemplar']);
  });

  it('still prefers the lower mark between two exemplars', () => {
    const result = deduplicateSampleAnswers([
      sa({ id: 'high', answer: 'same', mark: 6, source: 'HSC_EXEMPLAR' }),
      sa({ id: 'low', answer: 'same', mark: 3, source: 'HSC_EXEMPLAR' }),
    ]);

    expect(ids(result)).toEqual(['low']);
  });
});

describe('addAndPruneSampleAnswers', () => {
  const aiSamples = (n: number, mark = 5) =>
    Array.from({ length: n }, (_, i) => sa({ id: `ai${i}`, answer: `ai ${i}`, mark }));

  it('adds an answer to a group that is under the cap', () => {
    const result = addAndPruneSampleAnswers(aiSamples(2), sa({ id: 'new', answer: 'new one' }));

    expect(result).toHaveLength(3);
    expect(ids(result)).toContain('new');
  });

  it('caps a mark group at five', () => {
    const result = addAndPruneSampleAnswers(aiSamples(5), sa({ id: 'new', answer: 'new one' }));

    expect(result).toHaveLength(5);
    expect(ids(result)).toContain('new'); // the newest is always kept
  });

  it('prunes each mark group independently', () => {
    const existing = [
      ...aiSamples(5, 3),
      ...Array.from({ length: 2 }, (_, i) =>
        sa({ id: `top${i}`, answer: `full-mark ${i}`, mark: 7 })
      ),
    ];
    const result = addAndPruneSampleAnswers(existing, sa({ id: 'new', answer: 'new one', mark: 3 }));

    expect(result.filter((a) => a.mark === 3)).toHaveLength(5);
    expect(result.filter((a) => a.mark === 7)).toHaveLength(2);
  });

  // Surprising but deliberate: identical text is a duplicate whatever mark it
  // was filed under, so the same paragraph saved at 3 and at 7 marks collapses
  // to the 3-mark copy.
  it('treats identical text as a duplicate across different mark values', () => {
    const result = addAndPruneSampleAnswers(
      [sa({ id: 'seven', answer: 'identical', mark: 7 })],
      sa({ id: 'three', answer: 'identical', mark: 3 })
    );

    expect(ids(result)).toEqual(['three']);
  });

  it('keeps one answer of the opposite source for contrast', () => {
    const existing = [
      ...aiSamples(4),
      sa({ id: 'human', answer: 'a student wrote this', source: 'USER' }),
    ];
    const result = addAndPruneSampleAnswers(existing, sa({ id: 'new', answer: 'new one' }));

    expect(ids(result)).toContain('human');
  });

  // The bug: adding a sixth AI sample deleted a real past-paper exemplar to
  // make room for it.
  it('never prunes a verified exemplar to make room for an AI sample', () => {
    const existing = [
      sa({ id: 'exemplar1', answer: 'verified 1', source: 'HSC_EXEMPLAR' }),
      sa({ id: 'exemplar2', answer: 'verified 2', source: 'HSC_EXEMPLAR' }),
      ...aiSamples(6),
    ];

    const result = addAndPruneSampleAnswers(existing, sa({ id: 'new', answer: 'new one' }));

    expect(ids(result)).toContain('exemplar1');
    expect(ids(result)).toContain('exemplar2');
    expect(result).toHaveLength(5);
  });

  it('keeps exemplars even when the newest answer is a student one', () => {
    const existing = [
      sa({ id: 'exemplar1', answer: 'verified 1', source: 'HSC_EXEMPLAR' }),
      sa({ id: 'exemplar2', answer: 'verified 2', source: 'HSC_EXEMPLAR' }),
      ...aiSamples(3),
    ];

    const result = addAndPruneSampleAnswers(
      existing,
      sa({ id: 'new', answer: 'a student wrote this', source: 'USER' })
    );

    expect(ids(result)).toContain('exemplar1');
    expect(ids(result)).toContain('exemplar2');
    expect(ids(result)).toContain('new');
  });

  // Ground truth beats a display cap: six verified exemplars is a windfall,
  // not a problem to prune.
  it('keeps every exemplar even when they alone exceed the cap', () => {
    const existing = Array.from({ length: 6 }, (_, i) =>
      sa({ id: `exemplar${i}`, answer: `verified ${i}`, source: 'HSC_EXEMPLAR' })
    );

    const result = addAndPruneSampleAnswers(existing, sa({ id: 'new', answer: 'new one' }));

    expect(result.filter((a) => a.source === 'HSC_EXEMPLAR')).toHaveLength(6);
  });

  it('deduplicates as it adds', () => {
    const result = addAndPruneSampleAnswers(
      [sa({ id: 'existing', answer: 'identical', mark: 6 })],
      sa({ id: 'new', answer: 'identical', mark: 3 })
    );

    expect(result).toHaveLength(1);
    expect(result[0].mark).toBe(3);
  });
});
