import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { renderEditorHighlights, renderFormattedText } from '../../utils/renderUtils';

/**
 * The writing area paints keyword / command-verb highlights by stacking a
 * coloured overlay (`renderEditorHighlights`) exactly on top of a transparent
 * textarea, and the prompt panel bolds the same terms via `renderFormattedText`.
 *
 * Both used `regex.test(part)` to decide which split fragments were matches —
 * but the shared regex is global (`/gi`), so `.test()` advanced `lastIndex`
 * between calls and silently dropped *every other* occurrence. These tests lock
 * in that repeated terms are all highlighted, so the flicker can't come back.
 */
describe('renderEditorHighlights', () => {
  const countHighlights = (node: React.ReactNode) => {
    const { container } = render(<>{node}</>);
    // Keyword overlay spans carry the emerald class; verb spans the accent class.
    return {
      keyword: container.querySelectorAll('span.text-emerald-400').length,
      verb: container.querySelectorAll('span.text-\\[rgb\\(var\\(--color-accent\\)\\)\\]').length,
    };
  };

  it('highlights every occurrence of a repeated keyword (not every other one)', () => {
    const text = 'The cell divides. Another cell forms. A third cell dies.';
    const { keyword } = countHighlights(renderEditorHighlights(text, ['cell']));
    expect(keyword).toBe(3);
  });

  it('highlights repeated occurrences of the command verb', () => {
    const text = 'Analyse this, then analyse that, and analyse again.';
    const { verb } = countHighlights(renderEditorHighlights(text, [], 'Analyse'));
    expect(verb).toBe(3);
  });

  it('highlights keywords and the verb together without dropping either', () => {
    const text = 'Explain the cell. Explain the enzyme. Explain the cell again.';
    const { keyword, verb } = countHighlights(
      renderEditorHighlights(text, ['cell', 'enzyme'], 'Explain')
    );
    expect(verb).toBe(3);
    expect(keyword).toBe(3); // two "cell" + one "enzyme"
  });

  it('is case-insensitive and matches simple plural variants', () => {
    const text = 'One Cell, two cells, three CELLS.';
    const { keyword } = countHighlights(renderEditorHighlights(text, ['cell']));
    expect(keyword).toBe(3);
  });

  it('preserves the full text content when highlighting', () => {
    const text = 'The cell divides and the cell grows.';
    const { container } = render(<>{renderEditorHighlights(text, ['cell'])}</>);
    expect(container.textContent).toBe(text);
  });
});

describe('renderFormattedText', () => {
  it('bolds every occurrence of a repeated keyword in the prompt', () => {
    const { container } = render(
      <>{renderFormattedText('Define the mitochondria; the mitochondria matter.', ['mitochondria'])}</>
    );
    expect(container.querySelectorAll('span.text-emerald-400').length).toBe(2);
    expect(container.textContent).toBe('Define the mitochondria; the mitochondria matter.');
  });
});
