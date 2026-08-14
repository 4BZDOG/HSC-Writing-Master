import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { PromptVerb } from '../../types';
import {
  RIBBON_DETAIL_CARD,
  RIBBON_DETAIL_TERM,
  RIBBON_HEADER_BAR,
  RIBBON_ROOT,
  RIBBON_STAT_TRAY,
  RIBBON_STRIP,
  RIBBON_TIER_CARD,
  RIBBON_TIER_HEADER,
  RIBBON_VERB_CHIP,
} from '../../utils/verbRibbonChrome';

/**
 * The ribbon is about to be redesigned in `utils/verbRibbonChrome.ts`, one
 * constant at a time. That only works if the constants are the thing the ribbon
 * actually wears — a class string left behind in the JSX would silently stop
 * tracking the redesign, and nothing else in the suite looks at this
 * component's chrome. `tests/unit/commandVerbHierarchy.test.tsx` is the
 * behavioural contract and asserts nothing about colour or theme.
 *
 * The mirror of `tests/unit/appHeaderChrome.test.tsx`, which pinned the header
 * the same way before the same treatment.
 */

beforeAll(() => {
  // jsdom implements neither, and the tier auto-scroll reaches for both.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const getToggle = () => screen.getByRole('button', { name: /command verb hierarchy reference/i });

describe('the ribbon wears the shared vocabulary', () => {
  it('dresses its root and its header bar from verbRibbonChrome', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect((container.firstElementChild as HTMLElement).className).toContain(RIBBON_ROOT);
    expect(getToggle().className).toContain(RIBBON_HEADER_BAR);
  });

  it('dresses the detail card, its heading and its stat tray', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const term = screen.getAllByText('DESCRIBE').find((el) => el.tagName === 'H4') as HTMLElement;
    expect(term.className).toContain(RIBBON_DETAIL_TERM);
    expect(term.closest(`[class*="${RIBBON_DETAIL_CARD.split(' ')[0]}"]`)).toBeTruthy();
    expect(screen.getByText('Band Cap').closest('div')?.parentElement?.className).toContain(
      RIBBON_STAT_TRAY
    );
  });

  it('dresses the strip, its tier cards and their headers', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const strip = container.querySelector(`[class="${RIBBON_STRIP}"]`) as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.children).toHaveLength(6);
    for (const card of Array.from(strip.children)) {
      expect(card.className).toContain(RIBBON_TIER_CARD);
    }

    const header = screen.getByRole('button', { name: /Band 1 ceiling Remember & List/i });
    expect(header.className).toContain(RIBBON_TIER_HEADER);
  });

  it('dresses every one of the thirty-eight verb chips', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const chips = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.className.includes(RIBBON_VERB_CHIP)
    );
    expect(chips).toHaveLength(38);
    expect(chips.map((chip) => chip.textContent)).toContain('IDENTIFY');
  });
});
