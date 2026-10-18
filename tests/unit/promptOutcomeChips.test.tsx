import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { explainOutcomeInContext } from '../../services/geminiService';
import { AICache } from '../../services/aiCache';
import { CourseOutcome, Prompt, PromptVerb } from '../../types';

/**
 * The outcome chips live in the prompt card's footer. Two things had gone
 * wrong there: the chips took a full-width row of their own beneath the label
 * (so they read as a stack rather than a row of the footer), and the hover
 * preview was absolutely positioned inside a card that clips its overflow, so
 * the panel was sliced off at the card edge.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

const outcomes: CourseOutcome[] = [
  { code: 'SE-12-01', description: 'Justifies the selection of software development approaches.' },
  { code: 'SE-12-03', description: 'Analyses how hardware and software influence engineering.' },
  { code: 'SE-12-06', description: 'Justifies the selection of a data structure for a problem.' },
];

const prompt = {
  id: 'p1',
  question: 'Assess the impact of emerging technologies on software development.',
  verb: 'ASSESS' as PromptVerb,
  totalMarks: 8,
  keywords: [],
  sampleAnswers: [],
  // Two: a question links one outcome, or two at most (`MAX_LINKED_OUTCOMES`).
  linkedOutcomes: ['SE-12-01', 'SE-12-03'],
} as unknown as Prompt;
const linked = outcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code));

const props = {
  prompt,
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: outcomes,
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

// jsdom reports `matches: false` for every query, which would read as a touch
// device and suppress the preview entirely.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('hover: hover'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const chipFor = (code: string) => screen.getByRole('button', { name: new RegExp(code) });

describe('outcome chips in the prompt footer', () => {
  it('sits the chips on the brief button’s line, and wraps rather than scrolls', () => {
    render(<PromptDisplay {...props} />);

    const group = screen.getByRole('group', { name: /linked outcomes/i });
    linked.forEach((o) => {
      expect(within(group).getByRole('button', { name: new RegExp(o.code) })).toBeTruthy();
    });
    // One row with the brief button and the tools. Where the footer is too narrow
    // for all of it, the chips drop to a line of their own (a container query on
    // the footer, `.outcome-footer` in index.css), keyed on how many there are.
    expect(group.className).toContain('outcome-footer-chips');
    expect(group.getAttribute('data-count')).toBe('2');
    expect(group.className).not.toMatch(/overflow-(x-)?(auto|hidden|scroll)/);

    const brief = screen.getByRole('button', { name: /read before you write/i });
    const row = brief.parentElement as HTMLElement;
    expect(row.className).toContain('outcome-footer');
    expect(row.className).toContain('flex-wrap');
    expect(group.parentElement).toBe(row);
    expect(
      within(row).getByRole('button', { name: /flag this question for review/i })
    ).toBeTruthy();
    expect(brief.className).toContain('flex-1');
  });

  it('keeps every chip whole: one line, one height, and 44px on a phone', () => {
    render(<PromptDisplay {...props} />);

    const chips = [
      screen.getByRole('button', { name: /read before you write/i }),
      ...linked.map((o) => chipFor(o.code)),
    ];
    for (const chip of chips) {
      // A code is never broken across lines, and never truncated with an ellipsis.
      expect(chip.className).toContain('whitespace-nowrap');
      expect(chip.className).not.toContain('truncate');
      expect(chip.className).toContain('min-h-9');
      expect(chip.className).toContain('max-sm:min-h-11');
    }
    // The flag beside them is a 44px target on a phone too.
    expect(
      screen.getByRole('button', { name: /flag this question for review/i }).className
    ).toContain('max-sm:size-11');
  });

  it('says so in plain words, without a scroller, when no outcomes are linked', () => {
    // The old strip was a scroller even with nothing in it, which is a WCAG
    // failure (`scrollable-region-focusable`): 153px of text in a slot that
    // narrowed to about 100px, no scrollbar, and nothing focusable inside to tab
    // to. The sentence has the row's width now, so it is never clipped at all.
    render(<PromptDisplay {...props} prompt={{ ...prompt, linkedOutcomes: [] }} />);

    const placeholder = screen.getByText(/no outcomes linked/i);
    const slot = placeholder.parentElement as HTMLElement;
    expect(slot.className).toContain('flex-1');
    expect(slot.className).not.toMatch(/overflow-(x-)?(auto|scroll)/);
    expect(placeholder.className).not.toContain('truncate');
    expect(screen.queryByRole('button', { name: /read before you write/i })).toBeNull();
    expect(screen.queryByRole('group', { name: /linked outcomes/i })).toBeNull();
    // The flag stays, beside the sentence.
    expect(screen.getByRole('button', { name: /flag this question for review/i })).toBeTruthy();
  });

  it('renders the hover preview outside the card, which clips its own overflow', () => {
    const { container } = render(<PromptDisplay {...props} />);

    fireEvent.mouseEnter(chipFor('SE-12-03'));

    const preview = screen.getByRole('tooltip');
    expect(preview.textContent).toContain('hardware and software');
    // The card is `overflow-hidden`; anything inside it would be clipped.
    expect(container.contains(preview)).toBe(false);
    expect(document.body.contains(preview)).toBe(true);
    expect(preview.className).toContain('fixed');
  });

  it('dismisses the preview when the pointer leaves the chip', () => {
    render(<PromptDisplay {...props} />);
    const chip = chipFor('SE-12-03');

    fireEvent.mouseEnter(chip);
    expect(screen.queryByRole('tooltip')).toBeTruthy();

    fireEvent.mouseLeave(chip);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('names the preview as the chip’s description, but only while the preview is showing', () => {
    render(<PromptDisplay {...props} />);
    const chip = chipFor('SE-12-03');
    expect(chip.getAttribute('aria-describedby')).toBeNull();

    fireEvent.mouseEnter(chip);
    const preview = screen.getByRole('tooltip');
    expect(preview.id).toBeTruthy();
    expect(chip.getAttribute('aria-describedby')).toBe(preview.id);

    // A reference to a node that is not in the page would be a dangling one.
    fireEvent.mouseLeave(chip);
    expect(chip.getAttribute('aria-describedby')).toBeNull();
  });

  describe('the verb sheet from the full brief', () => {
    beforeEach(() => {
      vi.mocked(explainOutcomeInContext).mockResolvedValue(
        '### What this outcome is asking for\nAssess the trade-offs.'
      );
      vi.spyOn(AICache, 'get').mockResolvedValue(undefined as never);
      vi.spyOn(AICache, 'set').mockResolvedValue(undefined as never);
    });

    it('opens the verb sheet over the brief, without closing the brief', () => {
      const onVerbClick = vi.fn();
      render(<PromptDisplay {...props} onVerbClick={onVerbClick} />);

      fireEvent.click(chipFor('SE-12-03'));
      const brief = screen.getByRole('dialog', { name: 'SE-12-03' });
      fireEvent.click(within(brief).getByRole('button', { name: 'What does ASSESS ask for?' }));

      expect(onVerbClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: 'SE-12-03' })).toBeTruthy();
    });
  });

  it('keeps the preview on screen for a chip near the viewport edge', () => {
    render(<PromptDisplay {...props} />);
    const chip = chipFor('SE-12-03');
    // A chip hard against the right edge of a 1024px-wide window.
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
      left: 1000,
      top: 600,
      width: 80,
      height: 24,
      right: 1080,
      bottom: 624,
      x: 1000,
      y: 600,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseEnter(chip);

    // The panel is 288px wide and centred on `left`, so its centre is clamped
    // to keep the right half inside the viewport.
    const preview = screen.getByRole('tooltip') as HTMLElement;
    expect(parseFloat(preview.style.left)).toBeLessThanOrEqual(window.innerWidth - 144);
  });

  it('leaves the preview shut on a touch device, where a tap opens the full brief', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }))
    );
    render(<PromptDisplay {...props} />);

    fireEvent.mouseEnter(chipFor('SE-12-03'));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
