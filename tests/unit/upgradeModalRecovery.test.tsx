import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * What the upgrade prompt does when checkout is refused because the caller is
 * ALREADY subscribed.
 *
 * `api/create-checkout` answers 409 with "You already have an active
 * subscription. Use “Manage subscription” to change your plan or seats." —
 * correct, and it names a control that lives two screens away in the profile.
 * Shown as a red toast it reads as a failure the user should retry. So the
 * prompt turns its own CTA into that control instead.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

const createCheckoutUrlMock = vi.fn();
const createPortalUrlMock = vi.fn();

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    STRIPE_PRICE_IDS: { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' },
    createCheckoutUrl: (...args: unknown[]) => createCheckoutUrlMock(...args),
    createPortalUrl: (...args: unknown[]) => createPortalUrlMock(...args),
  };
});

import UpgradeModal from '../../components/UpgradeModal';
import { UPGRADE_REQUEST_EVENT, ALREADY_SUBSCRIBED_STATUS } from '../../services/entitlements';

const showToast = vi.fn();

const open = () => {
  render(<UpgradeModal showToast={showToast} />);
  fireEvent(
    window,
    new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'fullFeedback' } })
  );
};

beforeEach(() => {
  showToast.mockReset();
  createCheckoutUrlMock.mockReset();
  createPortalUrlMock.mockReset();
  createPortalUrlMock.mockResolvedValue({ url: null, error: 'portal stub', status: 500 });
});
afterEach(cleanup);

describe('checkout refused as a duplicate subscription', () => {
  beforeEach(() => {
    createCheckoutUrlMock.mockResolvedValue({
      url: null,
      error: 'You already have an active subscription.',
      status: ALREADY_SUBSCRIBED_STATUS,
    });
  });

  it('turns the CTA into the control the refusal names', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade now/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    // Not an error the user can act on by trying again, so it is not toasted
    // as one — the prompt itself changes to say what is true.
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByText(/already have a live subscription/i)).toBeTruthy();
  });

  it('opens the billing portal from that CTA rather than checkout again', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade now/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    fireEvent.click(screen.getByRole('button', { name: /Manage subscription/i }));
    await waitFor(() => expect(createPortalUrlMock).toHaveBeenCalledTimes(1));
    expect(createCheckoutUrlMock).toHaveBeenCalledTimes(1);
  });

  it('forgets the refusal once the prompt is closed', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade now/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));
    fireEvent(
      window,
      new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'sampleAnswers' } })
    );
    expect(screen.getByRole('button', { name: /Upgrade now/i })).toBeTruthy();
  });
});

describe('any other checkout failure', () => {
  it('is still reported as an error the user can retry', async () => {
    createCheckoutUrlMock.mockResolvedValue({
      url: null,
      error: 'Could not start checkout. Please try again.',
      status: 500,
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade now/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByRole('button', { name: /Manage subscription/i })).toBeNull();
  });
});
