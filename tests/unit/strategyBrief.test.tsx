import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import StrategyBrief from '../../components/StrategyBrief';
import { getCommandTermInfo } from '../../data/commandTerms';
import { parseStrategyTip } from '../../utils/strategyTip';
import type { PromptVerb } from '../../types';

/**
 * The verb's brief, which the blank writing surface and the strategy row both
 * render so the advice never reads two different ways.
 *
 * Two things it has to get right. The tips in `data/commandTerms.ts` are
 * authored as a method followed by its caveats, and rendering both as
 * identical bullets threw that relationship away. And the writing card's
 * height is not its own — it is floored by the question beside it — so a brief
 * sized for a laptop was cut in half on a phone.
 */

afterEach(cleanup);

const info = getCommandTermInfo('DESCRIBE' as PromptVerb);
const points = parseStrategyTip(info.tip).filter((s) => s.kind === 'point');
const method = points[0] && points[0].kind === 'point' ? points[0].text : '';
const check = points[1] && points[1].kind === 'point' ? points[1].text : '';

/** jsdom reports 0 for every layout box, so the brief's height is stubbed. */
const withNaturalHeight = (height: number) =>
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    value: height,
  });

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    value: 0,
  });
});

describe('the verb brief', () => {
  it('leads with the verb, not a glyph', () => {
    const { container } = render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" />);

    expect(screen.getByText(info.term)).toBeTruthy();
    // Newsreader — the face the writing surface and the exemplars use for the
    // exam paper's own voice, per DesignSpec §1.
    expect(screen.getByText(info.term).className).toContain('font-serif');
    expect(container.querySelector('svg')).toBeNull();
  });

  // The method and its caveat used to be two identical bullets.
  it('sets the method above its checks, not beside them', () => {
    render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="panel" />);

    const methodLine = screen.getByText(method);
    const checkLine = screen.getByText(check);
    expect(methodLine).toBeTruthy();
    // The check is indented behind a rule; the method is not.
    expect(checkLine.parentElement?.parentElement?.className).toContain('border-l-2');
    expect(methodLine.parentElement?.className).not.toContain('border-l-2');
  });

  // The row below the page opens the whole brief, which is what it is for.
  it('keeps the checks for the panel and not the page', () => {
    const { container: panel } = render(
      <StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="panel" />
    );
    expect(within(panel).getByText(check)).toBeTruthy();

    cleanup();
    const { container: page } = render(
      <StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" />
    );
    expect(within(page).queryByText(check)).toBeNull();
    expect(within(page).getByText(method)).toBeTruthy();
  });

  describe('fitting the card it is drawn on', () => {
    it('shows the method when the card can finish it', () => {
      withNaturalHeight(200);
      render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" room={400} />);
      expect(screen.getByText(method)).toBeTruthy();
    });

    // A phone's writing card has about 100px of body. Verb and definition
    // finish there; the method does not, and half a sentence is worse than
    // none — the strategy row still opens the whole brief.
    it('drops the method when it would be cut off', () => {
      withNaturalHeight(260);
      render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" room={180} />);

      expect(screen.getByText(info.term)).toBeTruthy();
      expect(screen.getByText(info.definition)).toBeTruthy();
      expect(screen.queryByText(method)).toBeNull();
    });

    it('assumes there is room until it has been measured', () => {
      withNaturalHeight(260);
      // room 0 is "no ResizeObserver yet", and the first paint is the one a
      // student sees — so it shows everything rather than pre-emptively
      // trimming and flashing the method in a beat later.
      render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" room={0} />);
      expect(screen.getByText(method)).toBeTruthy();
    });

    it('re-decides when the card resizes, rather than staying trimmed', () => {
      withNaturalHeight(260);
      const { rerender } = render(
        <StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" room={180} />
      );
      expect(screen.queryByText(method)).toBeNull();

      // The workspace grew — a shorter question beside it, or a rotated phone.
      rerender(<StrategyBrief verb={'DESCRIBE' as PromptVerb} scale="page" room={500} />);
      expect(screen.getByText(method)).toBeTruthy();
    });
  });
});
