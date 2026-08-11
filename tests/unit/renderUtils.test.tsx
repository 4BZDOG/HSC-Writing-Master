import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  getKeywordVariants,
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
    const { verb } = countHighlights(renderEditorHighlights(text, [], 'ANALYSE'));
    expect(verb).toBe(3);
  });

  it('highlights keywords and the verb together without dropping either', () => {
    const text = 'Explain the cell. Explain the enzyme. Explain the cell again.';
    const { keyword, verb } = countHighlights(
      renderEditorHighlights(text, ['cell', 'enzyme'], 'EXPLAIN')
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
      <>
        {renderFormattedText('Define the mitochondria; the mitochondria matter.', ['mitochondria'])}
      </>
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
    expect(
      highlightTexts('Supervised practice supports learning.', ['supervised learning'])
    ).toEqual([]);
    expect(
      highlightTexts('Supervised or self-directed approaches to learning.', ['supervised learning'])
    ).toEqual([]);
  });

  it('keeps textContainsKeyword in agreement with the highlighter', () => {
    expect(
      textContainsKeyword('Compare supervised and unsupervised learning.', 'supervised learning')
    ).toBe(true);
    expect(
      textContainsKeyword('Supervised practice supports learning.', 'supervised learning')
    ).toBe(false);
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

describe('acronyms are not treated as plurals', () => {
  it('does not strip the capital S off an initialism', () => {
    // "DoS" (Denial of Service) was singularised to "Do", so every "do" a
    // student wrote lit up as the syllabus keyword and earned coverage credit.
    expect(getKeywordVariants('DoS')).not.toContain('Do');
    expect(getKeywordVariants('Denial of Service (DoS)')).not.toContain('Do');
    expect(getKeywordVariants('SaaS')).not.toContain('Saa');

    const prose = 'Students do not always know what to do when the system fails.';
    expect(textContainsKeyword(prose, 'DoS')).toBe(false);
    expect(textContainsKeyword(prose, 'Denial of Service (DoS)')).toBe(false);
  });

  it('still singularises a genuine lowercase plural, including acronym plurals', () => {
    expect(getKeywordVariants('APIs')).toContain('API');
    expect(getKeywordVariants('CPUs')).toContain('CPU');
    expect(textContainsKeyword('The cell divides.', 'cells')).toBe(true);
    expect(textContainsKeyword('Many mRNAs are produced.', 'mRNA')).toBe(true);
  });

  it('never derives a one- or two-letter variant', () => {
    for (const kw of ['DoS', 'red', 'gas', 'bias', 'SaaS', 'IoT', 'axis']) {
      const derived = getKeywordVariants(kw).filter((v) => v !== kw);
      derived.forEach((v) =>
        expect(v.replace(/[^A-Za-z0-9]/g, '').length).toBeGreaterThanOrEqual(3)
      );
    }
  });
});

describe('spelling and separator equivalence', () => {
  it('credits either side of a British/American pair', () => {
    const pairs: [string, string][] = [
      ['behaviour', 'Observed behavior changed over time.'],
      ['behavior', 'Observed behaviour changed over time.'],
      ['modelling', 'We used modeling techniques.'],
      ['modeling', 'We used modelling techniques.'],
      ['analyse', 'The data was analyzed carefully.'],
      ['organisation', 'The organization grew.'],
      ['programme', 'The program compiles.'],
      ['catalogue', 'The catalog lists every part.'],
    ];
    pairs.forEach(([kw, text]) =>
      expect(textContainsKeyword(text, kw), `${kw} in "${text}"`).toBe(true)
    );
  });

  it('treats hyphenated, spaced and closed compounds as the same term', () => {
    const forms = [
      'Replication is semi-conservative.',
      'Replication is semi conservative.',
      'Replication is semiconservative.',
    ];
    forms.forEach((text) =>
      expect(textContainsKeyword(text, 'semi-conservative'), text).toBe(true)
    );
  });

  it('keeps the -our swap off ordinary words that merely end in "our"', () => {
    // A blanket our -> or rule would make these match "for", "hor" and "tor".
    const prose = 'There are four of them and an hour is a long tour.';
    ['four', 'hour', 'tour', 'flour'].forEach((kw) =>
      expect(getKeywordVariants(kw), kw).not.toContain(kw.replace(/our$/, 'or'))
    );
    expect(prose).toBeTruthy();
  });

  it('keeps the double-l swap off short words where it changes meaning', () => {
    // "filing" must not become "filling", nor "ruling" become "rulling".
    expect(getKeywordVariants('filing')).not.toContain('filling');
    expect(getKeywordVariants('ruling')).not.toContain('rulling');
    expect(textContainsKeyword('The filling was sweet.', 'filing')).toBe(false);
  });
});

describe('classical plurals', () => {
  it('matches the -es plural of an -is singular', () => {
    // The -is rule sat behind the sibilant rule, which every word ending in
    // "s" hits first, so it was unreachable: "hypothesis" produced
    // "hypothesises" and never matched the "hypotheses" a student writes.
    expect(getKeywordVariants('hypothesis')).toContain('hypotheses');
    expect(getKeywordVariants('analysis')).toContain('analyses');
    expect(textContainsKeyword('Both hypotheses were tested.', 'hypothesis')).toBe(true);
    expect(textContainsKeyword('The analyses agree.', 'analysis')).toBe(true);
  });
});
