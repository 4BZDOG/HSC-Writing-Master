import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * The free tier's "n/5 left" counter. Two states matter: with markings left it
 * is a status readout; at zero it is the one place the daily limit is stated,
 * so it has to be the place a student can act on it.
 */

let remaining = 3;
const requestUpgradeMock = vi.fn();

vi.mock('../../services/entitlements', () => ({
  freeEvalLimit: () => 5,
  freeEvalsRemaining: () => remaining,
  subscribeEvalCount: () => () => {},
  PLAN_LABELS: { free: 'Free', plus: 'Band 6 Plus', school: 'School' },
  requestUpgrade: (...args: unknown[]) => requestUpgradeMock(...args),
  // The counter's button names the one CTA the policy gives a free student.
  describeAccess: () => ({ state: 'locked', cta: 'upgrade', ctaLabel: 'Upgrade to Band 6 Plus' }),
}));

import FreeEvalCounter from '../../components/FreeEvalCounter';

beforeEach(() => {
  requestUpgradeMock.mockReset();
});
afterEach(cleanup);

describe('FreeEvalCounter', () => {
  it('reads as a status while markings are left, with no action', () => {
    remaining = 3;
    render(<FreeEvalCounter />);

    const counter = screen.getByTestId('free-eval-counter');
    expect(counter.tagName).toBe('SPAN');
    // Both forms are in the DOM, one hidden by breakpoint: the full sentence from
    // `sm` up and the short one below it. The aria-label carries the sentence.
    expect(counter.textContent).toContain('3 of 5 markings left');
    expect(counter.textContent).toContain('3/5 left');
    expect(counter.getAttribute('aria-label')).toMatch(/^3 of 5 markings left\. Resets at /);
  });

  it('becomes a control at zero that opens the prompt for the daily limit', () => {
    remaining = 0;
    render(<FreeEvalCounter />);

    const control = screen.getByRole('button', { name: /0 left today\. Upgrade to Band 6 Plus\./ });
    fireEvent.click(control);

    expect(requestUpgradeMock).toHaveBeenCalledWith('fullFeedback', 'dailyLimit');
  });

  it('keeps its visible words in its accessible name at zero', () => {
    // WCAG 2.5.3: a voice user says what they can see, so the visible "0 left
    // today" has to be inside the name.
    remaining = 0;
    render(<FreeEvalCounter />);

    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/^0 left today/);
  });

  it('is 44px tall on a phone at zero, where it is a tap target', () => {
    remaining = 0;
    render(<FreeEvalCounter />);

    expect(screen.getByTestId('free-eval-counter').className).toContain('min-h-11 sm:min-h-0');
  });

  it('says what is left in full from sm up, and names the reset time', () => {
    remaining = 3;
    render(<FreeEvalCounter />);

    const counter = screen.getByTestId('free-eval-counter');
    // The full sentence is the visible text from sm up; the fraction is the phone's.
    expect(counter.querySelector('.hidden.sm\\:inline')?.textContent).toBe('3 of 5 markings left');
    expect(counter.querySelector('.sm\\:hidden')?.textContent).toBe('3/5 left');
    expect(counter.getAttribute('aria-label')).toMatch(/^3 of 5 markings left\. Resets at .+\.$/);
  });

  it('reads the singular correctly: 1 of 5 markings left', () => {
    remaining = 1;
    render(<FreeEvalCounter />);

    expect(screen.getByTestId('free-eval-counter').getAttribute('aria-label')).toMatch(
      /^1 of 5 markings left\./
    );
  });

  it('is 36px tall, and 44px on a phone, like the chips beside it', () => {
    remaining = 3;
    render(<FreeEvalCounter />);

    expect(screen.getByTestId('free-eval-counter').className).toContain('h-9 max-sm:h-11');
  });

  it('draws nothing for an account that is not metered', () => {
    remaining = Infinity;
    const { container } = render(<FreeEvalCounter />);

    expect(container.firstChild).toBeNull();
  });
});
