import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
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
  linkedOutcomes: outcomes.map((o) => o.code),
} as unknown as Prompt;

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
  userRole: 'student' as const,
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
  it('lays every chip out in one horizontal strip that scrolls rather than wraps', () => {
    render(<PromptDisplay {...props} />);

    const strip = chipFor('SE-12-01').parentElement as HTMLElement;
    // All three chips share the one strip…
    outcomes.forEach((o) => {
      expect(within(strip).getByRole('button', { name: new RegExp(o.code) })).toBeTruthy();
    });
    // …laid out in a row that never wraps to a second line.
    expect(strip.className).toContain('flex-nowrap');
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).not.toContain('flex-wrap');
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

  it('keeps the preview on screen for a chip near the viewport edge', () => {
    render(<PromptDisplay {...props} />);
    const chip = chipFor('SE-12-06');
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
