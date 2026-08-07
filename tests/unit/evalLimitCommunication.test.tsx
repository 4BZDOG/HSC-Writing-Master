import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { User } from '../../types';

/**
 * What the app SAYS about the daily marking limit, at the two moments it
 * matters: while the student still has markings left, and when they don't.
 *
 * Both were being answered badly. The remaining count lived in the Evaluate
 * button's `title` attribute — invisible on a phone, which is what most
 * students use — so the limit arrived as a refusal after they had written an
 * answer and waited out the marking call. And the upgrade prompt that refusal
 * opened led with "Full Marking Feedback", because marking is metered by count
 * and has no feature key of its own, so the limit borrowed `fullFeedback`.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'student-a', role: 'user', preferences: {} }),
  },
}));

import * as entitlements from '../../services/entitlements';
import {
  freeEvalsRemaining,
  recordEvaluation,
  requestUpgrade,
  syncFreeEvalCount,
  subscribeEvalCount,
  FREE_TIER_EVAL_LIMIT,
  UPGRADE_REQUEST_EVENT,
} from '../../services/entitlements';
import UpgradeModal from '../../components/UpgradeModal';
import FreeEvalCounter from '../../components/FreeEvalCounter';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the remaining-markings counter is visible, not hover-only', () => {
  it('states the number as text a phone can render', () => {
    render(<FreeEvalCounter />);
    // The point of the whole component: this is text in the document, not a
    // `title` attribute that a touch device has no way to surface.
    expect(screen.getByText(`${FREE_TIER_EVAL_LIMIT}/${FREE_TIER_EVAL_LIMIT} left`)).toBeTruthy();
  });

  it('counts down as markings are spent, without a re-render from outside', () => {
    render(<FreeEvalCounter />);
    act(() => {
      recordEvaluation();
    });
    expect(screen.getByText(`${FREE_TIER_EVAL_LIMIT - 1}/${FREE_TIER_EVAL_LIMIT} left`)).toBeTruthy();
  });

  it('says plainly when the allowance is gone', () => {
    render(<FreeEvalCounter />);
    act(() => {
      syncFreeEvalCount(FREE_TIER_EVAL_LIMIT);
    });
    expect(screen.getByText(/0 left today/i)).toBeTruthy();
  });

  it('shows nothing at all to someone who is not metered', () => {
    // A teacher, a paid plan, an admin, or a deployment with monetisation off:
    // there is no number to state and no limit to warn about, so a chip
    // reading "∞" or "5/5" would be noise at best and wrong at worst.
    vi.spyOn(entitlements, 'freeEvalsRemaining').mockReturnValue(Infinity);
    const { container } = render(<FreeEvalCounter />);
    expect(container.querySelector('[data-testid="free-eval-counter"]')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('the free-evaluation mirror announces its own changes', () => {
  it('notifies subscribers when a marking is spent', () => {
    // Without this the count can only be redrawn by something else happening
    // to re-render — which is how it came to be keyed on `evaluationResult`
    // and went stale exactly when the server had just corrected it.
    const listener = vi.fn();
    const unsubscribe = subscribeEvalCount(listener);

    recordEvaluation();
    expect(listener).toHaveBeenCalledTimes(1);

    // And when the SERVER corrects the mirror on a refusal.
    syncFreeEvalCount(FREE_TIER_EVAL_LIMIT, FREE_TIER_EVAL_LIMIT);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    recordEvaluation();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reflects the server’s correction rather than the local guess', () => {
    // A second device, or cleared site data, leaves the mirror showing a full
    // allowance the server has already spent.
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
    syncFreeEvalCount(FREE_TIER_EVAL_LIMIT);
    expect(freeEvalsRemaining()).toBe(0);
  });
});

describe('the upgrade prompt at the daily limit', () => {
  const showToast = vi.fn();
  const user = { username: 'student-a', role: 'user', stats: {} } as unknown as User;

  const openAtLimit = () => {
    render(<UpgradeModal showToast={showToast} user={user} />);
    act(() => {
      requestUpgrade('fullFeedback', 'dailyLimit');
    });
  };

  beforeEach(() => showToast.mockReset());

  it('leads with the limit, not with criterion feedback', () => {
    openAtLimit();
    // The headline answers the question the student is actually asking.
    expect(screen.getByText(/used today.s free markings/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Full Marking Feedback/i })).toBeNull();
  });

  it('states the allowance and that it returns', () => {
    // "You've hit a wall" converts worse than "here is the wall, and here is
    // when it moves" — and the second one is also the truth.
    openAtLimit();
    expect(screen.getByText(new RegExp(`${FREE_TIER_EVAL_LIMIT} marked answers a day`))).toBeTruthy();
    expect(screen.getByText(/reset at midnight/i)).toBeTruthy();
  });

  it('still leads with the feature when a locked control opened it', () => {
    render(<UpgradeModal showToast={showToast} user={user} />);
    act(() => {
      requestUpgrade('fullFeedback');
    });
    expect(screen.getByText('Full Marking Feedback')).toBeTruthy();
    expect(screen.queryByText(/used today.s free markings/i)).toBeNull();
  });
});

describe('a guest is told the real next step', () => {
  it('offers an account rather than a checkout that can only 401', () => {
    // /api/create-checkout answers "Authentication required." to a guest —
    // correct, and useless at the moment someone is trying to pay.
    const showToast = vi.fn();
    const guest = { username: 'guest', role: 'guest', stats: {} } as unknown as User;
    render(<UpgradeModal showToast={showToast} user={guest} />);
    act(() => {
      requestUpgrade('fullFeedback');
    });

    const cta = screen.getByRole('button', { name: /Create an account/i });
    fireEvent.click(cta);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/free account first/i),
      'info'
    );
  });
});

/** The event contract the whole prompt hangs off. */
describe('requestUpgrade', () => {
  it('carries the reason alongside the feature', () => {
    const seen: unknown[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(UPGRADE_REQUEST_EVENT, handler);

    requestUpgrade('pdfExport');
    requestUpgrade('fullFeedback', 'dailyLimit');

    window.removeEventListener(UPGRADE_REQUEST_EVENT, handler);
    expect(seen[0]).toMatchObject({ feature: 'pdfExport', reason: undefined });
    expect(seen[1]).toMatchObject({ feature: 'fullFeedback', reason: 'dailyLimit' });
  });
});
