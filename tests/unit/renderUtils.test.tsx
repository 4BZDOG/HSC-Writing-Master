import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  renderEditorHighlights,
  renderFormattedText,
  textContainsKeyword,
} from '../../utils/renderUtils';

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
  const keywordCount = (text: string, keywords: string[]) => {
    const { container } = render(<>{renderFormattedText(text, keywords)}</>);
    return container.querySelectorAll('span.text-emerald-400').length;
  };

  it('bolds every occurrence of a repeated keyword in the prompt', () => {
    const { container } = render(
      <>{renderFormattedText('Define the mitochondria; the mitochondria matter.', ['mitochondria'])}</>
    );
    expect(container.querySelectorAll('span.text-emerald-400').length).toBe(2);
    expect(container.textContent).toBe('Define the mitochondria; the mitochondria matter.');
  });

  it('matches verb forms in both directions (test → testing/tested)', () => {
    expect(keywordCount('We are testing now; we tested before.', ['test'])).toBe(2);
    expect(keywordCount('Run a test first.', ['testing'])).toBe(1);
  });

  it('treats hyphenated and spaced forms as the same term', () => {
    expect(keywordCount('Validation runs client side here.', ['client-side'])).toBe(1);
    expect(keywordCount('Validation is client-side here.', ['client side'])).toBe(1);
  });

  it('matches British and American spellings of the same term', () => {
    expect(keywordCount('Code optimization matters.', ['optimisation'])).toBe(1);
    expect(keywordCount('They are analyzing the data.', ['analyse'])).toBe(1);
  });

  it('highlights a multi-word phrase as one continuous span, including plurals', () => {
    const { container } = render(
      <>{renderFormattedText('Draw two data flow diagrams.', ['data flow diagram'])}</>
    );
    const spans = container.querySelectorAll('span.text-emerald-400');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('data flow diagrams');
  });

  it('matches terms with symbol edges where \\b alone fails (C++)', () => {
    expect(keywordCount('Programs written in C++ run fast.', ['C++'])).toBe(1);
  });
});

describe('coordination ellipsis (shared head nouns)', () => {
  const highlightTexts = (text: string, keywords: string[]) => {
    const { container } = render(<>{renderFormattedText(text, keywords)}</>);
    return Array.from(container.querySelectorAll('span.text-emerald-400')).map(
      (s) => s.textContent
    );
  };

  it('highlights the elided first conjunct: "supervised and unsupervised learning"', () => {
    const spans = highlightTexts('Compare supervised and unsupervised learning.', [
      'supervised learning',
      'unsupervised learning',
    ]);
    expect(spans).toEqual(['supervised', 'unsupervised learning']);
  });

  it('handles comma-separated conjunct lists', () => {
    const spans = highlightTexts(
      'Investigate supervised, semi-supervised and unsupervised learning.',
      ['supervised learning', 'unsupervised learning']
    );
    expect(spans).toContain('supervised');
    expect(spans).toContain('unsupervised learning');
  });

  it('matches a pluralised shared head ("local and wide area networks")', () => {
    const spans = highlightTexts('Compare local and wide area networks.', ['local area network']);
    expect(spans).toEqual(['local']);
  });

  it('still prefers the full contiguous phrase when present', () => {
    const spans = highlightTexts('Supervised learning uses labelled data.', [
      'supervised learning',
    ]);
    expect(spans).toEqual(['Supervised learning']);
  });

  it('does not fire without a coordinated shared head', () => {
    expect(highlightTexts('Supervised practice supports learning.', ['supervised learning'])).toEqual(
      []
    );
    expect(
      highlightTexts('Supervised or self-directed approaches to learning.', ['supervised learning'])
    ).toEqual([]);
  });

  it('keeps textContainsKeyword in agreement with the highlighter', () => {
    expect(
      textContainsKeyword('Compare supervised and unsupervised learning.', 'supervised learning')
    ).toBe(true);
    expect(textContainsKeyword('Supervised practice supports learning.', 'supervised learning')).toBe(
      false
    );
  });
});

describe('textContainsKeyword (shared matcher for coverage meters)', () => {
  it('agrees with the highlighter for every variant form', () => {
    const cases: [string, string][] = [
      ['We are testing the module.', 'test'],
      ['Validation runs client side.', 'client-side'],
      ['Code optimization matters.', 'optimisation'],
      ['Draw two data flow diagrams.', 'data flow diagram'],
      ['Programs in C++ run fast.', 'C++'],
    ];
    cases.forEach(([text, kw]) => {
      const { container } = render(<>{renderFormattedText(text, [kw])}</>);
      const highlighted = container.querySelectorAll('span.text-emerald-400').length > 0;
      expect(textContainsKeyword(text, kw)).toBe(highlighted);
      expect(highlighted).toBe(true);
    });
  });

  it('does not report a keyword the highlighter would not mark', () => {
    expect(textContainsKeyword('The cellar door.', 'cell')).toBe(false);
    expect(textContainsKeyword('', 'cell')).toBe(false);
    expect(textContainsKeyword('anything', '')).toBe(false);
  });
});
