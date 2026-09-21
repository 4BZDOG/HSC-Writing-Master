import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Editor from '../../components/Editor';
import { getCommandTermInfo } from '../../data/commandTerms';
import { parseStrategyTip } from '../../utils/strategyTip';
import { PromptVerb } from '../../types';
import { readSupportUsage } from '../../utils/supportEngagement';

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
  const term = (verb = 'DESCRIBE') => getCommandTermInfo(verb as PromptVerb).term;
  const definition = (verb = 'DESCRIBE') => getCommandTermInfo(verb as PromptVerb).definition;
  const firstTip = (verb: string) => {
    const segment = parseStrategyTip(getCommandTermInfo(verb as PromptVerb).tip).find(
      (s) => s.kind === 'point'
    );
    return segment && segment.kind === 'point' ? segment.text : '';
  };

  const strategyToggle = () => screen.getByRole('button', { name: /how to answer a .* question/i });
  const openPanel = () =>
    document.getElementById(strategyToggle().getAttribute('aria-controls') as string) as HTMLElement;
  const writingSurface = () => document.querySelector('textarea') as HTMLTextAreaElement;

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * THE WRITING SURFACE BELONGS TO THE STUDENT.
   *
   * The brief used to be drawn ON the blank writing surface, as a
   * `pointer-events-none` layer sharing the textarea's own padding so the verb
   * sat exactly where the first word would go. Three things came with that and
   * none of them were worth it: the placeholder had to be turned transparent,
   * so a blank page carried no invitation to write at all; a click to start put
   * the caret behind the verb's first letterform; and the layer measured the
   * card and dropped its own checks to fit, so the version a student met first
   * was the incomplete one. At the first keystroke all of it vanished — the
   * student who wanted the advice lost it the instant they acted on it.
   *
   * What replaced it is a glossary line above the surface: the term, its
   * meaning, and a named way in to the method. These tests hold the two halves
   * of that — nothing on the writing surface, and the meaning never leaving
   * the screen.
   */
  it('leaves the writing surface to the student', () => {
    // The placeholder is the parent's to supply; `Workspace` passes the same
    // shape. It is here because the point of the test is that it SHOWS.
    renderEditor({ placeholder: 'Draft your DESCRIBE response here…' });

    expect(screen.queryByTestId('strategy-page')).toBeNull();
    // The invitation to write, never hidden. It used to be switched to
    // `text-transparent` whenever the page brief was up, which is what left a
    // blank writing surface with nothing on it saying a student could write.
    expect(writingSurface().placeholder).toMatch(/draft your/i);
    expect(writingSurface().className).toContain('placeholder:text-[rgb(var(--color-text-dim))]');
    expect(writingSurface().className).not.toContain('placeholder:text-transparent');
  });

  it('states the verb and what it wants, above the page rather than on it', () => {
    renderEditor();

    expect(screen.getByText(term())).toBeTruthy();
    expect(screen.getByText(definition())).toBeTruthy();
    // Shut, so the method is not competing with the writing area for height.
    expect(strategyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(firstTip('DESCRIBE'))).toBeNull();
  });

  /**
   * The point of moving it. The old brief was at its largest on a blank page
   * and gone at keystroke one; the definition a student needs WHILE drafting
   * now stays put, and the method stays one press away at any length of draft.
   */
  it('keeps the meaning on screen once the student is writing', () => {
    renderEditor({ value: 'The first sentence of an answer.' });

    expect(screen.getByText(term())).toBeTruthy();
    expect(screen.getByText(definition())).toBeTruthy();
    expect(strategyToggle()).toBeTruthy();
  });

  it('briefs whichever verb the question uses', () => {
    renderEditor({ verb: 'EVALUATE' as PromptVerb });

    expect(screen.getByText(term('EVALUATE'))).toBeTruthy();
    expect(screen.getByText(definition('EVALUATE'))).toBeTruthy();
  });

  it('is absent in Exam Mode — the strategy is assistance', () => {
    renderEditor({ writingMode: 'exam' });

    expect(screen.queryByRole('button', { name: /how to answer/i })).toBeNull();
    expect(screen.queryByText(definition())).toBeNull();
  });

  describe('the way in to the method', () => {
    /**
     * The definition is a READING and the toggle is a CONTROL, so they are not
     * the same element. As one button the row put the whole definition inside
     * the control's accessible name — "DESCRIBE, provide the characteristics
     * and features of something in detail, How to answer, button" — and a
     * student who clicked the sentence to re-read it collapsed the panel they
     * were reading.
     */
    it('is a named control of its own, not the sentence beside it', () => {
      renderEditor();

      // The accessible name says what pressing it does, and nothing else.
      expect(strategyToggle().textContent).not.toContain(definition());
      // Pressing the definition is not pressing anything.
      const meaning = screen.getByText(definition());
      expect(meaning.closest('button')).toBeNull();
    });

    it('opens to the method and its checks, and says the verb no second time', () => {
      renderEditor();
      fireEvent.click(strategyToggle());

      const panel = openPanel();
      expect(within(panel).getByText(firstTip('DESCRIBE'))).toBeTruthy();
      // The row a line above states both; repeating either here is the fault
      // this whole surface was rebuilt to remove.
      expect(
        within(panel).queryByText(term()),
        'the row states the verb; the panel inside it must not state it again'
      ).toBeNull();
      expect(
        within(panel).queryByText(definition()),
        'the row states the meaning; the panel inside it must not state it again'
      ).toBeNull();
    });

    it('opens the same way mid-draft as on a blank page', () => {
      renderEditor({ value: Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') });

      fireEvent.click(strategyToggle());
      expect(strategyToggle().getAttribute('aria-expanded')).toBe('true');
      expect(within(openPanel()).getByText(firstTip('DESCRIBE'))).toBeTruthy();
    });

    it('marks itself read once it has been opened and shut again', () => {
      renderEditor();

      expect(screen.queryByText(/^Read$/i)).toBeNull();
      fireEvent.click(strategyToggle());
      fireEvent.click(strategyToggle());
      expect(screen.getByText(/^Read$/i)).toBeTruthy();
    });
  });

  /**
   * The marking report names the supports a student did not open, at the moment
   * they are looking at a lost mark — so what counts as "opened" has to be
   * something they actually chose to do.
   *
   * While the brief led on the blank page, it counted: a student could read the
   * strategy exactly as intended without ever touching the row, and reporting
   * otherwise would have told them something untrue. The definition that
   * replaced it is NOT the strategy — it is one sentence, it is unmissable, and
   * nobody chooses to read it. Opening the panel is the choice, and the only
   * thing worth reporting as one.
   */
  describe('what the marking report is told', () => {
    it('counts opening the method, not merely being shown the meaning', () => {
      renderEditor({ promptId: 'q1' });
      expect(readSupportUsage('q1').opened).not.toContain('strategy');

      fireEvent.click(strategyToggle());
      expect(readSupportUsage('q1').opened).toContain('strategy');
    });

    it('keeps counting it once the student has started writing', () => {
      const { rerender } = renderEditor({ promptId: 'q3' });
      fireEvent.click(strategyToggle());

      rerender(
        <Editor
          value="The first sentence of an answer."
          onChange={vi.fn()}
          verb={'DESCRIBE' as PromptVerb}
          writingMode="coach"
          promptId="q3"
        />
      );

      expect(readSupportUsage('q3').skipped).not.toContain('strategy');
    });

    it('says nothing at all in Exam Mode, where there is no strategy', () => {
      renderEditor({ promptId: 'q2', writingMode: 'exam' });

      const usage = readSupportUsage('q2');
      expect(usage.available).not.toContain('strategy');
    });
  });
});
