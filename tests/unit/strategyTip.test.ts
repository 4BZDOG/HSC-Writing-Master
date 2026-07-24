import { describe, it, expect } from 'vitest';
import { parseStrategyTip } from '../../utils/strategyTip';
import { commandTermsList } from '../../data/commandTerms';

describe('parseStrategyTip', () => {
  it('treats each standalone line as its own point', () => {
    expect(
      parseStrategyTip('Just name it and stop.\nExplanations waste time and earn zero extra marks.')
    ).toEqual([
      { kind: 'point', text: 'Just name it and stop.' },
      { kind: 'point', text: 'Explanations waste time and earn zero extra marks.' },
    ]);
  });

  it('reads a quoted line after a colon as a template, not another instruction', () => {
    const segments = parseStrategyTip(
      'Use a point-by-point structure:\n"X is... whereas Y is..."\nMake each difference precise.'
    );
    expect(segments).toEqual([
      { kind: 'point', text: 'Use a point-by-point structure:' },
      { kind: 'example', text: '"X is... whereas Y is..."' },
      { kind: 'point', text: 'Make each difference precise.' },
    ]);
  });

  it('splits a short comma list after a colon into individual terms', () => {
    const segments = parseStrategyTip(
      'Chain every sentence with linking words:\nbecause, leads to, results in, therefore.\nFacts alone do not explain.'
    );
    expect(segments[1]).toEqual({
      kind: 'terms',
      items: ['because', 'leads to', 'results in', 'therefore'],
    });
  });

  it('leaves prose that merely contains commas as prose', () => {
    // Long parts and sentence punctuation mean this is a sentence, not a list.
    const segments = parseStrategyTip(
      'Do this:\nCover what should happen, why it matters to the reader, and the expected outcome of acting on it.'
    );
    expect(segments[1].kind).toBe('example');
  });

  it('needs at least three items before treating a line as a list', () => {
    const segments = parseStrategyTip('Do this:\nfirst, second');
    expect(segments[1].kind).toBe('example');
  });

  it('only reads a continuation after a colon — a bare quote stays a point', () => {
    const segments = parseStrategyTip('Go beyond the surface.\n"This suggests that..."');
    expect(segments[1].kind).toBe('point');
  });

  it('drops blank lines and surrounding whitespace', () => {
    expect(parseStrategyTip('  One.  \n\n  Two.  ')).toEqual([
      { kind: 'point', text: 'One.' },
      { kind: 'point', text: 'Two.' },
    ]);
  });

  it('returns nothing for an absent tip, so the block can be skipped', () => {
    expect(parseStrategyTip(undefined)).toEqual([]);
    expect(parseStrategyTip('')).toEqual([]);
    expect(parseStrategyTip('   \n  ')).toEqual([]);
  });

  it('parses every real command term tip without losing a line', () => {
    const terms = commandTermsList;
    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) {
      const expected = term.tip.split('\n').filter((l) => l.trim()).length;
      const segments = parseStrategyTip(term.tip);
      expect(segments, `${term.term} produced no segments`).toHaveLength(expected);
      // A term list must never swallow its items.
      for (const segment of segments) {
        if (segment.kind === 'terms') expect(segment.items.length).toBeGreaterThanOrEqual(3);
        else expect(segment.text.length).toBeGreaterThan(0);
      }
    }
  });
});
