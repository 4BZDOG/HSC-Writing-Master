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
    expect(counter.textContent).toBe('3/5 left');
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

  it('draws nothing for an account that is not metered', () => {
    remaining = Infinity;
    const { container } = render(<FreeEvalCounter />);

    expect(container.firstChild).toBeNull();
  });
});
