import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import StrategyBrief from '../../components/StrategyBrief';
import { getCommandTermInfo } from '../../data/commandTerms';
import { parseStrategyTip } from '../../utils/strategyTip';
import type { PromptVerb } from '../../types';

/**
 * The verb's brief — the METHOD for answering a command term, which the
 * editor's strategy row and the verb ribbon's detail card both render so the
 * advice never reads two different ways.
 *
 * The tips in `data/commandTerms.ts` are authored as a method followed by its
 * caveats, and rendering both as identical bullets threw that relationship
 * away. Holding that shape is most of what this file is for.
 *
 * ## What used to be here, and why it is gone
 *
 * This component had a second scale, `page`, which drew the brief as a layer
 * ON the blank writing surface. It carried a `room` prop, measured its own
 * `scrollHeight` against it and dropped the checks — and on a phone the method
 * too — to fit. Four tests below described that arithmetic, and they were
 * correct about it.
 *
 * The arithmetic was the tell. A component that has to measure the box it is
 * in and delete its own content to survive there is in the wrong box: the box
 * was the student's writing surface, and the cost of being on it was a
 * transparent placeholder, a caret behind the verb's first letterform, and a
 * brief that showed a student its incomplete version first. The verb's meaning
 * now sits in the strategy row's header and the method sits here, at one size,
 * whole. There is nothing left to trim, so there is nothing left to test about
 * trimming.
 */

afterEach(cleanup);

const info = getCommandTermInfo('DESCRIBE' as PromptVerb);
const points = parseStrategyTip(info.tip).filter((s) => s.kind === 'point');
const method = points[0] && points[0].kind === 'point' ? points[0].text : '';
const check = points[1] && points[1].kind === 'point' ? points[1].text : '';

describe('the verb brief', () => {
  it('is the method, in the exam paper’s own voice', () => {
    const { container } = render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} />);

    const methodLine = screen.getByText(method);
    // Newsreader — the face the writing surface and the exemplars use for the
    // exam paper's own voice, per DesignSpec §1.
    expect(methodLine.className).toContain('font-serif');
    // No glyph announcing "here is a tip": the method says what it is.
    expect(container.querySelector('svg')).toBeNull();
  });

  // The method and its caveat used to be two identical bullets.
  it('sets the method above its checks, not beside them', () => {
    render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} />);

    const methodLine = screen.getByText(method);
    const checkLine = screen.getByText(check);
    expect(methodLine).toBeTruthy();
    // The check is indented behind a rule; the method is not.
    expect(checkLine.parentElement?.parentElement?.className).toContain('border-l-2');
    expect(methodLine.parentElement?.className).not.toContain('border-l-2');
  });

  /**
   * Whole, at one size. The page scale showed a student the method without its
   * checks, and on a phone showed neither — so the first version of the advice
   * anyone met was the one with the caveats missing, which for a tip shaped
   * "do this / and here is what it costs you" is the wrong half to drop.
   */
  it('keeps the checks, rather than dropping them to fit', () => {
    const { container } = render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} />);

    expect(within(container).getByText(method)).toBeTruthy();
    expect(within(container).getByText(check)).toBeTruthy();
  });

  describe('what it says for itself, and what the surface above it has said', () => {
    /**
     * Both call sites name the verb themselves — the editor's row sets the
     * term beside its definition, and the ribbon's detail card sets it as a
     * heading — so the default is headless. A brief that re-announced either
     * would be the duplication this whole surface was rebuilt to remove.
     */
    it('states neither the term nor the meaning by default', () => {
      render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} />);

      expect(screen.queryByText(info.term)).toBeNull();
      expect(screen.queryByText(info.definition)).toBeNull();
    });

    it('states the meaning, and rules it off, when asked to lead with it', () => {
      const { container } = render(
        <StrategyBrief verb={'DESCRIBE' as PromptVerb} lead="definition" />
      );

      expect(screen.getByText(info.definition)).toBeTruthy();
      // The rule belongs to the definition: it separates what the verb MEANS
      // from how to answer it, so it exists only when there is something above
      // it to separate from.
      expect(container.querySelector('.h-px')).toBeTruthy();
    });

    it('draws no rule when there is nothing above it to divide', () => {
      const { container } = render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} lead="none" />);

      expect(container.querySelector('.h-px')).toBeNull();
    });
  });
});
