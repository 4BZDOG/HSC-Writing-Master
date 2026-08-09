import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { renderFormattedText } from '../../utils/renderUtils';

/**
 * The outcome briefing (and any other AI prose that reaches
 * `renderFormattedText`) very often answers with a comparison table. Until the
 * renderer understood one, a student read the raw markup — rows of pipes and
 * dashes — where the clearest part of the explanation should have been.
 */
const draw = (text: string) => render(<>{renderFormattedText(text)}</>).container;

describe('markdown tables in AI prose', () => {
  it('renders a canonical pipe table as a table, not as pipes', () => {
    const table = [
      '| Band | What the marker wants |',
      '| --- | --- |',
      '| 6 | A sustained, evaluative judgement |',
      '| 4 | A clear description with some analysis |',
    ].join('\n');

    const container = draw(table);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    // The markup itself must be gone from the rendered text.
    expect(container.textContent).not.toContain('|');
    expect(container.textContent).not.toContain('---');
    expect(container.textContent).toContain('A sustained, evaluative judgement');
  });

  it('reads a fenced table even when the model omits the separator row', () => {
    const table = ['| Criterion | Marks |', '| Structure | 2 |', '| Terminology | 1 |'].join('\n');

    const container = draw(table);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.textContent).not.toContain('|');
  });

  it('honours column alignment from the separator row', () => {
    const table = ['| Left | Right |', '| :--- | ---: |', '| a | b |'].join('\n');

    const cells = draw(table).querySelectorAll('tbody td');
    expect(cells[0].className).toContain('text-left');
    expect(cells[1].className).toContain('text-right');
  });

  it('keeps inline formatting and pads short rows', () => {
    const table = [
      '| Term | Meaning | Example |',
      '| --- | --- | --- |',
      '| **Evaluate** | Make a judgement | ',
    ].join('\n');

    const container = draw(table);
    expect(container.querySelector('tbody strong')?.textContent).toBe('Evaluate');
    // Every row keeps the header's column count, so the grid cannot go ragged.
    expect(container.querySelectorAll('tbody tr td')).toHaveLength(3);
  });

  it('treats an escaped pipe as content, not a column divider', () => {
    const table = [
      '| Operator | Meaning |',
      '| --- | --- |',
      String.raw`| a \| b | bitwise or |`,
    ].join('\n');

    const cells = draw(table).querySelectorAll('tbody td');
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe('a | b');
  });

  it('leaves prose containing a stray pipe alone', () => {
    const prose = 'Choose either | or & as the separator.';
    const container = draw(prose);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('either | or');
  });

  it('renders prose around a table without swallowing it', () => {
    const text = [
      '### Band ladder',
      '| Band | Feature |',
      '| --- | --- |',
      '| 6 | Judgement |',
      'Aim for the top row.',
    ].join('\n');

    const container = draw(text);
    expect(container.querySelector('strong')?.textContent).toBe('Band ladder');
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.textContent).toContain('Aim for the top row.');
  });
});
