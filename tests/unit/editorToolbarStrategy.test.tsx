import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Editor from '../../components/Editor';
import { getCommandTermInfo } from '../../data/commandTerms';
import { parseStrategyTip } from '../../utils/strategyTip';
import { PromptVerb } from '../../types';

/**
 * The writing card's chrome. Two things it has to get right: the controls a
 * student reaches for are not crowded out by ones they never touch (bold and
 * italic in a prose exam answer), and the command-verb strategy — the coaching
 * that matters most before the first sentence — is visible enough to be worth
 * opening.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

const renderEditor = (props: Partial<React.ComponentProps<typeof Editor>> = {}) =>
  render(
    <Editor
      value=""
      onChange={vi.fn()}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      {...props}
    />
  );

const formatToggle = () => screen.getByRole('button', { name: /formatting/i });

describe('editor formatting tools', () => {
  it('keeps bold and italic folded away until asked for', () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Italic' })).toBeNull();
    expect(formatToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals them on the toggle, and folds them away again', () => {
    renderEditor();

    fireEvent.click(formatToggle());
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /hide formatting/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /hide formatting/i }));
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('offers no formatting at all in Exam Mode', () => {
    renderEditor({ writingMode: 'exam' });

    expect(screen.queryByRole('button', { name: /formatting/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });
});

describe('the verb brief', () => {
  const firstTip = (verb: string) => {
    const segment = parseStrategyTip(getCommandTermInfo(verb as PromptVerb).tip).find(
      (s) => s.kind === 'point'
    );
    return segment && segment.kind === 'point' ? segment.text : '';
  };

  const strategyToggle = () => screen.getByRole('button', { name: /strategy/i });
  const page = () => screen.getByTestId('strategy-page');
  /** The brief stays mounted and fades, so showing is a class, not presence. */
  const pageIsShowing = () => page().className.includes('opacity-100');

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * The blank page IS the brief. The row above it used to carry a LEADING
   * state — amber wash, a lit lightbulb, "Read this first" and a quoted tip —
   * to claim the moment before the first sentence. The writing surface is that
   * moment, has the room to be read in, and costs no layout, so the brief
   * moved onto it and the row went quiet permanently.
   */
  it('briefs the verb on the blank page', () => {
    renderEditor();

    expect(pageIsShowing()).toBe(true);
    const brief = within(page());
    expect(brief.getByText(getCommandTermInfo('DESCRIBE' as PromptVerb).term)).toBeTruthy();
    expect(brief.getByText(getCommandTermInfo('DESCRIBE' as PromptVerb).definition)).toBeTruthy();
    expect(brief.getByText(firstTip('DESCRIBE'))).toBeTruthy();
  });

  // Never in the way: a click anywhere on the surface has to reach the
  // textarea underneath, and the brief must not be in the tab order.
  it('never stands between the student and the page', () => {
    renderEditor();
    expect(page().className).toContain('pointer-events-none');
    expect(within(page()).queryByRole('button')).toBeNull();
  });

  it('stands down the moment there is a draft, and comes back if it is cleared', () => {
    const { rerender } = renderEditor();
    expect(pageIsShowing()).toBe(true);

    rerender(
      <Editor value="A" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );
    expect(pageIsShowing()).toBe(false);
    expect(page().hasAttribute('inert')).toBe(true);

    // Clearing the draft to nothing is exactly when it is wanted again.
    rerender(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );
    expect(pageIsShowing()).toBe(true);
  });

  it('briefs whichever verb the question uses', () => {
    renderEditor({ verb: 'EVALUATE' as PromptVerb });

    expect(within(page()).getByText(firstTip('EVALUATE'))).toBeTruthy();
    expect(screen.getByText(/EVALUATE strategy/i)).toBeTruthy();
  });

  it('is absent in Exam Mode — the strategy is assistance', () => {
    renderEditor({ writingMode: 'exam' });
    expect(screen.queryByRole('button', { name: /strategy/i })).toBeNull();
    expect(screen.queryByTestId('strategy-page')).toBeNull();
  });

  /**
   * The row is the way BACK to the brief once the page is no longer blank, and
   * nothing more. It is a hairline from the first frame: two loud things at
   * word zero would spend the page's attention twice.
   */
  describe('the row back to it', () => {
    it('is quiet from the first frame, on a blank page', () => {
      renderEditor();

      expect(strategyToggle().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText(/Read this first/i)).toBeNull();
      expect(strategyToggle().className).not.toMatch(/amber/);
    });

    it('opens mid-draft to the same brief', () => {
      renderEditor({ value: Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') });
      expect(pageIsShowing()).toBe(false);

      fireEvent.click(strategyToggle());
      expect(strategyToggle().getAttribute('aria-expanded')).toBe('true');

      const panel = document.getElementById(
        strategyToggle().getAttribute('aria-controls') as string
      ) as HTMLElement;
      expect(within(panel).getByText(firstTip('DESCRIBE'))).toBeTruthy();
      expect(
        within(panel).getByText(getCommandTermInfo('DESCRIBE' as PromptVerb).definition)
      ).toBeTruthy();
    });

    it('marks itself read once it has been opened and shut again', () => {
      renderEditor();

      expect(screen.queryByText(/^Read$/i)).toBeNull();
      fireEvent.click(strategyToggle());
      fireEvent.click(strategyToggle());
      expect(screen.getByText(/^Read$/i)).toBeTruthy();
    });
  });
});
