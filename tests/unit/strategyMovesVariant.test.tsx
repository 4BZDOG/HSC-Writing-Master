import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import StrategyMoves from '../../components/StrategyMoves';

/**
 * One piece of markup, two type scales. The verb sheet (the default) reads the
 * tip as a document; the writing area ("worked") keeps its tracked section heads
 * and its smaller body. Both must draw the same parts in the same order.
 */

afterEach(cleanup);

const parts = {
  method: [
    { text: 'Lead with the claim.', detail: [] },
    { text: 'Then support it with one example.', detail: [] },
  ],
  terms: ['because'],
  examples: ['X is Y, whereas Z is W.'],
  watch: [{ text: 'Do not list without linking.', detail: [] }],
  band: 3,
};

describe('StrategyMoves', () => {
  it('draws the verb sheet with sentence-case subheads at heading level 4', () => {
    render(<StrategyMoves {...parts} />);

    const heading = screen.getByRole('heading', { name: 'Method', level: 4 });
    expect(heading.className).toContain('font-semibold');
    expect(heading.className).not.toContain('t-section');
  });

  it('draws the writing-area variant with the tracked section heads at heading level 3', () => {
    render(<StrategyMoves {...parts} variant="worked" />);

    for (const name of ['Method', 'Words to use', 'Sentence shape', 'Watch for']) {
      const heading = screen.getByRole('heading', { name: new RegExp(name, 'i') });
      expect(heading.tagName).toBe('H3');
      expect(heading.className).toContain('t-section');
    }
  });

  it('keeps the same parts, in the same order, under either variant', () => {
    const { container, unmount } = render(<StrategyMoves {...parts} />);
    const sheetHeadings = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
    const sheetSteps = container.querySelectorAll('ol > li').length;
    unmount();

    const { container: worked } = render(<StrategyMoves {...parts} variant="worked" />);
    const workedHeadings = Array.from(worked.querySelectorAll('h3')).map((h) => h.textContent);

    expect(workedHeadings).toEqual(sheetHeadings);
    expect(sheetHeadings).toEqual(['Method', 'Words to use', 'Sentence shape', 'Watch for']);
    expect(sheetSteps).toBe(2);
  });

  it('sets the lead at body size and the later steps a step down only in the worked variant', () => {
    const { container, unmount } = render(<StrategyMoves {...parts} variant="worked" />);
    const workedItems = Array.from(container.querySelectorAll('ol > li p'));
    expect(workedItems[0].className).toContain('text-base');
    expect(workedItems[1].className).toContain('text-sm');
    unmount();

    const { container: sheet } = render(<StrategyMoves {...parts} />);
    const sheetItems = Array.from(sheet.querySelectorAll('ol > li p'));
    expect(sheetItems[0].className).toContain('t-body');
    expect(sheetItems[1].className).toContain('text-base');
  });

  it('gives each word a chip only when it can insert, and plain text otherwise', () => {
    const { unmount } = render(<StrategyMoves {...parts} onInsertWord={() => {}} />);
    expect(screen.getByRole('button', { name: 'because' })).toBeTruthy();
    unmount();

    const { container } = render(<StrategyMoves {...parts} />);
    expect(within(container).queryByRole('button', { name: 'because' })).toBeNull();
    expect(within(container).getByText('because')).toBeTruthy();
  });
});
