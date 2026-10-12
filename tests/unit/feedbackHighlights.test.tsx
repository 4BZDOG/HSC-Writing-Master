import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import {
  createVerbRegex,
  KEYWORD_CHIP_CLASS,
  KEYWORD_HIGHLIGHT_CLASS,
  renderFormattedText,
  renderHighlightedText,
  textContainsKeyword,
  VERB_HIGHLIGHT_CLASS,
  VERB_HIGHLIGHT_IN_MARK_CLASS,
} from '../../utils/renderUtils';
import { commandTermsList } from '../../data/commandTerms';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * Command verbs and syllabus terms are painted the same way on every surface that
 * shows marking or feedback. These tests hold that: each surface renders both a
 * verb highlight and a term highlight from a fixture, and the matcher behind them
 * is pinned on the forms it should and should not catch.
 */

// The report pulls in the PDF exporter and the entitlement service; stub what the
// report calls, and keep everything else real.
vi.mock('../../pdf/exportEvaluation', () => ({ exportEvaluationPdf: vi.fn() }));
vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/entitlements')>()),
  isFeatureLocked: () => false,
  isFeedbackLocked: () => false,
}));

import EvaluationDisplay from '../../components/EvaluationDisplay';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';

afterEach(cleanup);

/** The text of every span carrying exactly this class — one per highlighted run. */
const highlighted = (root: ParentNode, className: string): string[] =>
  Array.from(root.querySelectorAll('span'))
    .filter((n) => n.getAttribute('class') === className)
    .map((n) => n.textContent ?? '');

const verbsIn = (root: ParentNode) => highlighted(root, VERB_HIGHLIGHT_CLASS);
const termsIn = (root: ParentNode) => highlighted(root, KEYWORD_HIGHLIGHT_CLASS);

/** The innermost element whose text contains `text` — where a reader's eye lands. */
const innermost = (root: HTMLElement, text: string): HTMLElement => {
  const hits = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) =>
    el.textContent?.includes(text)
  );
  if (hits.length === 0) throw new Error(`no element contains "${text}"`);
  return hits.sort((a, b) => a.textContent!.length - b.textContent!.length)[0];
};

/** Every match the verb matcher finds in `text`, as the reader would see it. */
const verbMatches = (text: string, verb: string): string[] => {
  const { container } = render(<>{renderHighlightedText(text, [], verb as PromptVerb)}</>);
  return verbsIn(container);
};

const termMatches = (text: string, keywords: string[]): string[] => {
  const { container } = render(<>{renderHighlightedText(text, keywords)}</>);
  return termsIn(container);
};

/** The standard forms of a command term, as the verb matcher has to find them. */
const formsOf = (verb: string): string[] => {
  const b = verb.toLowerCase();
  if (b.endsWith('e')) return [b, b.slice(0, -1) + 'ing', b + 'd', b + 's'];
  if (/[^aeiou]y$/.test(b)) return [b, b.slice(0, -1) + 'ies', b.slice(0, -1) + 'ied', b + 'ing'];
  if (/(s|x|z|ch|sh)$/.test(b)) return [b, b + 'es', b + 'ing', b + 'ed'];
  return [b, b + 's', b + 'ing', b + 'ed'];
};

describe('the command-verb matcher', () => {
  it('catches every standard form of every command term, through the verb path', () => {
    // The verb path is what the highlight uses; it must not be weaker than the
    // keyword path that `verbInflections` already pins.
    const gaps: string[] = [];
    for (const term of commandTermsList) {
      const regex = createVerbRegex(term.term);
      for (const form of formsOf(term.term)) {
        const fresh = regex ? new RegExp(regex.source, regex.flags) : null;
        if (!fresh || !fresh.test(`Candidates should ${form} the source.`)) {
          gaps.push(`${term.term} misses "${form}"`);
        }
      }
    }
    expect(gaps, gaps.join('\n')).toEqual([]);
  });

  it('catches the spellings and inflections of ANALYSE a student writes', () => {
    const forms = ['analyse', 'analyses', 'analysed', 'analysing', 'analyze', 'analyzing'];
    for (const form of forms) {
      expect(verbMatches(`They ${form} the data.`, 'ANALYSE'), form).toEqual([form]);
    }
  });

  it('does not take the noun "analysis" for the command verb ANALYSE', () => {
    // The noun is the content of an answer ("the analysis above"), not the
    // instruction. Keeping it out is a deliberate choice, not a gap.
    expect(verbMatches('The analysis above is sound.', 'ANALYSE')).toEqual([]);
    expect(verbMatches('Your analysis of the data is sound.', 'ANALYSE')).toEqual([]);
  });

  it('catches the inflections of a short all-capital verb', () => {
    // "DRAW" is four letters in capitals, which the acronym rule used to read as an
    // acronym and so derived no inflections at all.
    expect(verbMatches('Drawing the graph helps; draws were clear.', 'DRAW')).toEqual([
      'Drawing',
      'draws',
    ]);
  });

  it('matches a compound command term whole, and its command word on its own', () => {
    expect(verbMatches('Critically analysing the sources matters.', 'CRITICALLY ANALYSE')).toEqual([
      'Critically analysing',
    ]);
    // The command word alone is the command in feedback on that question.
    expect(verbMatches('Analyse the sources further.', 'CRITICALLY ANALYSE')).toEqual(['Analyse']);
  });

  it('paints the question verb and no other command term', () => {
    // "Evaluate" is a real command term, but not this question's. It stays plain.
    expect(verbMatches('Evaluate your use of terminology.', 'EXPLAIN')).toEqual([]);
    expect(verbMatches('Explaining and evaluating; explained.', 'EXPLAIN')).toEqual([
      'Explaining',
      'explained',
    ]);
  });

  it('does not light a verb inside a longer word', () => {
    expect(verbMatches('We redefine the term and its definitions.', 'DEFINE')).toEqual([]);
    expect(verbMatches('The accountable account stands.', 'ACCOUNT')).toEqual(['account']);
  });
});

describe('syllabus terms and possessives', () => {
  it("takes a possessive with the term, not a stray 's beside it", () => {
    const { container } = render(<>{renderFormattedText("W3C's standard applies.", ['W3C'])}</>);
    expect(termsIn(container)).toEqual(["W3C's"]);
    expect(container.textContent).toBe("W3C's standard applies.");
  });

  it('matches a term written with a curly apostrophe against a straight one, both ways', () => {
    expect(termMatches('The law is Newton’s second law.', ["Newton's second law"])).toEqual([
      'Newton’s second law',
    ]);
    expect(termMatches("Newton's second law applies.", ['Newton’s second law'])).toEqual([
      "Newton's second law",
    ]);
  });

  it('keeps the possessive out of the match when the s runs on into a word', () => {
    // "W3C'sx" is not the term with a possessive; the term matches, the rest does not.
    expect(termMatches("the W3C'sx spec", ['W3C'])).toEqual(['W3C']);
  });

  it('does not change what counts as a match, only how far a highlight runs', () => {
    expect(textContainsKeyword("W3C's standard", 'W3C')).toBe(true);
    expect(textContainsKeyword('the cellar door', 'cell')).toBe(false);
  });

  it('highlights a term inside bold once, and the verb once', () => {
    const { container } = render(
      <>{renderFormattedText('**Explain** osmosis in the cell.', ['osmosis'], 'EXPLAIN')}</>
    );
    expect(verbsIn(container)).toEqual(['Explain']);
    expect(termsIn(container)).toEqual(['osmosis']);
    expect(container.textContent).toBe('Explain osmosis in the cell.');
  });

  it('does not highlight a term inside another word', () => {
    expect(termMatches('The cell and the cellar.', ['cell'])).toEqual(['cell']);
    expect(termMatches('Filling the tube with water.', ['filing'])).toEqual([]);
    expect(termMatches('A filing cabinet.', ['filing'])).toEqual(['filing']);
  });
});

describe('the plain-run highlighter', () => {
  it('returns the text untouched when there is nothing to highlight', () => {
    const { container } = render(<>{renderHighlightedText('Plain words here.')}</>);
    expect(container.textContent).toBe('Plain words here.');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('paints a verb inside a diff mark without its own underline', () => {
    const { container } = render(
      <mark>{renderHighlightedText('Explain how', [], 'EXPLAIN' as PromptVerb, true)}</mark>
    );
    expect(highlighted(container, VERB_HIGHLIGHT_IN_MARK_CLASS)).toEqual(['Explain']);
    expect(highlighted(container, VERB_HIGHLIGHT_CLASS)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* Every marking surface, rendered from a fixture.                            */
/* ------------------------------------------------------------------------- */

const prompt = {
  id: 'p-explain',
  question: 'Explain how caching and latency improve system performance.',
  totalMarks: 6,
  verb: 'EXPLAIN' as PromptVerb,
  keywords: ['cache hit ratio', 'latency'],
  scenario: '',
  sampleAnswers: [],
  linkedOutcomes: [],
  markingCriteria: '',
  isPastHSC: false,
} as unknown as Prompt;

const result = {
  overallMark: 3,
  overallBand: 3,
  overallFeedback: 'Explaining the cache hit ratio is the strongest part of this response.',
  quickTip: 'Explain how latency falls when the hit ratio rises.',
  strengths: ['Explains the role of the cache hit ratio clearly.'],
  improvements: [
    'Explain how latency changes with each cache miss.',
    'Evaluate your use of terminology in the last paragraph.',
  ],
  criteria: [
    {
      criterion: 'Explains the latency mechanism',
      mark: 2,
      maxMark: 3,
      feedback: 'Reasoning about latency is developing.',
    },
  ],
  revisedAnswer: {
    text: 'Caching explains latency: each cache hit avoids a slow read, and the cache hit ratio sets the speed.',
    mark: 4,
    band: 4,
    keyChanges: [],
  },
} as unknown as EvaluationResult;

// The student's own words get the same treatment as the marker's: the question's verb
// (here in its past tense) and the term they used.
const STUDENT =
  'Caching stores data, so the system is faster because latency drops. We explained why.';

const renderReport = () =>
  render(
    <EvaluationDisplay
      result={result}
      prompt={prompt}
      userAnswer={STUDENT}
      onUseRevisedAnswer={vi.fn()}
      onImproveAnswer={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
    />
  );

describe('EvaluationDisplay: every surface paints the verb and the terms', () => {
  it('the question', () => {
    const { container } = renderReport();
    const h2 = container.querySelector('h2')!;
    expect(verbsIn(h2)).toEqual(['Explain']);
    expect(termsIn(h2)).toEqual(['latency']);
  });

  it('the student response', () => {
    const { container } = renderReport();
    const response = innermost(container, STUDENT);
    expect(termsIn(response)).toEqual(['latency']);
    expect(verbsIn(response)).toEqual(['explained']);
  });

  it("the coach's tip", () => {
    const { container } = renderReport();
    const tip = innermost(container, result.quickTip!);
    expect(verbsIn(tip)).toEqual(['Explain']);
    expect(termsIn(tip)).toEqual(['latency']);
  });

  it("the marker's commentary, including an inflected form of the verb", () => {
    const { container } = renderReport();
    const commentary = innermost(container, result.overallFeedback);
    expect(verbsIn(commentary)).toEqual(['Explaining']);
    expect(termsIn(commentary)).toEqual(['cache hit ratio']);
  });

  it('strong evidence, the strengths list', () => {
    renderReport();
    const section = screen.getByRole('heading', { name: 'Strong Evidence' }).closest('section')!;
    expect(verbsIn(section)).toEqual(['Explains']);
    expect(termsIn(section)).toEqual(['cache hit ratio']);
  });

  it('areas for growth, the improvements list', () => {
    renderReport();
    const section = screen.getByRole('heading', { name: 'Areas for Growth' }).closest('section')!;
    // The question's verb is painted; "Evaluate" in the advice is quoted, so it is not.
    expect(verbsIn(section)).toEqual(['Explain']);
    expect(termsIn(section)).toEqual(['latency']);
  });

  it('the criterion title and its feedback', () => {
    const { container } = renderReport();
    const title = screen.getByRole('heading', { name: /Explains the latency mechanism/ });
    expect(verbsIn(title)).toEqual(['Explains']);
    expect(termsIn(title)).toEqual(['latency']);
    const feedback = innermost(container, 'Reasoning about latency is developing.');
    expect(termsIn(feedback)).toEqual(['latency']);
  });

  it('the improved response', () => {
    const { container } = renderReport();
    const rewrite = innermost(container, 'Caching explains latency');
    expect(verbsIn(rewrite)).toEqual(['explains']);
    expect(termsIn(rewrite)).toEqual(['latency', 'cache hit ratio']);
  });

  it('the cap note names the verb as the highlighted command term', () => {
    renderReport();
    const note = screen.getByText(/even a flawless response tops out here/i);
    expect(verbsIn(note)).toEqual(['EXPLAIN']);
  });

  it('shows one key under the question, using the classes the text uses', () => {
    renderReport();
    const keys = screen.getAllByText('Highlighted:');
    expect(keys).toHaveLength(1);
    const key = keys[0].closest('p')!;
    expect(verbsIn(key)).toEqual(['command verb']);
    expect(termsIn(key)).toEqual(['syllabus terms']);
  });

  it('shows no key when the question has no verb or terms to paint', () => {
    const bare = { ...prompt, verb: '' as PromptVerb, keywords: [] } as unknown as Prompt;
    render(
      <EvaluationDisplay
        result={{ ...result, revisedAnswer: undefined } as EvaluationResult}
        prompt={bare}
        onUseRevisedAnswer={vi.fn()}
        onImproveAnswer={vi.fn()}
        isImproving={false}
        improveAnswerError={null}
      />
    );
    expect(screen.queryByText('Highlighted:')).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* The improvement review: the diff, the clean copy and the margin.           */
/* ------------------------------------------------------------------------- */

// "latency" is the student's own word, so it survives the revision unmarked; "cache
// hit ratio" is what the revision adds, so it lands inside an edit.
const ORIGINAL = 'Caching stores data. It makes the system faster, so latency falls.';
const IMPROVED =
  'Explain how caching stores frequently requested data, tracking the cache hit ratio. ' +
  'It makes the system faster, so latency falls.';

const renderReview = (over: Partial<React.ComponentProps<typeof ImprovementReviewModal>> = {}) =>
  render(
    <ImprovementReviewModal
      isOpen
      onClose={vi.fn()}
      improvedAnswer={IMPROVED}
      originalAnswer={ORIGINAL}
      originalPrompt={prompt}
      targetBand={4}
      targetMark={4}
      originalMark={3}
      onApply={vi.fn()}
      markerAsked={[
        'Explain how latency changes with each cache miss.',
        'Keep the cache hit ratio in view.',
      ]}
      {...over}
    />
  );

// The review is a portal into document.body, so every query starts from there.
const page = () => document.body;

describe('ImprovementReviewModal: every surface paints the verb and the terms', () => {
  it('the marked-up diff paints the verb and the term inside the added runs', () => {
    renderReview();
    const added = Array.from(page().querySelectorAll('mark')).filter(
      (m) => m.getAttribute('title') === 'Added by the marker'
    );
    expect(added.length).toBeGreaterThan(0);
    expect(added.flatMap((m) => highlighted(m, VERB_HIGHLIGHT_IN_MARK_CLASS))).toEqual(['Explain']);
    expect(added.flatMap((m) => highlighted(m, KEYWORD_HIGHLIGHT_CLASS))).toEqual([
      'cache hit ratio',
    ]);
    // Inside a mark the verb keeps its colour and drops its own underline.
    expect(added.flatMap((m) => highlighted(m, VERB_HIGHLIGHT_CLASS))).toEqual([]);
  });

  it('the marked-up diff paints a term the student wrote, as well as the added one', () => {
    renderReview();
    const body = Array.from(page().querySelectorAll('p')).find(
      (p) =>
        p.classList.contains('font-serif') && (p.textContent ?? '').includes('so latency falls')
    )!;
    // Document order: the added term first, then the student's own unchanged one.
    expect(termsIn(body)).toEqual(['cache hit ratio', 'latency']);
    expect(highlighted(body, VERB_HIGHLIGHT_IN_MARK_CLASS)).toEqual(['Explain']);
  });

  it('the clean copy paints the verb as well as the terms', () => {
    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Clean copy' }));
    const copy = innermost(page(), 'frequently requested data');
    expect(verbsIn(copy)).toEqual(['Explain']);
    expect(termsIn(copy)).toEqual(['cache hit ratio', 'latency']);
  });

  it("the marker's list paints the question's verb and its terms", () => {
    renderReview();
    const item = Array.from(page().querySelectorAll('li')).find((li) =>
      (li.textContent ?? '').startsWith('Explain how latency changes')
    )!;
    expect(verbsIn(item)).toEqual(['Explain']);
    expect(termsIn(item)).toEqual(['latency']);
  });

  it('the margin paints the edits it lists', () => {
    renderReview();
    const rail = screen.getByRole('complementary', { name: 'What changed and why' });
    expect(verbsIn(rail)).toContain('Explain');
    expect(termsIn(rail)).toContain('cache hit ratio');
  });

  it('lists only the terms the revision added, as chips in the term style', () => {
    renderReview();
    const heading = screen.getByRole('heading', { name: 'Syllabus terms the revision added' });
    const section = heading.closest('section')!;
    const chips = Array.from(section.querySelectorAll('span')).filter(
      (n) => n.getAttribute('class') === KEYWORD_CHIP_CLASS
    );
    // "latency" was already in the student's answer, so it is not a revision term.
    expect(chips.map((c) => c.textContent)).toEqual(['cache hit ratio']);
  });
});
