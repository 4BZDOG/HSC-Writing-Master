import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

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
    STRIPE_PRICE_IDS: { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_s' },
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
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    // Not an error the user can act on by trying again, so it is not toasted
    // as one — the prompt itself changes to say what is true.
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByText(/already have a live subscription/i)).toBeTruthy();
  });

  it('never offers a teacher the Plus checkout, so a live subscription leaves them no Manage subscription route', () => {
    // A teacher holds Plus as a staff perk. A Plus control opens nothing for
    // them, so the refusal that a second subscription gets cannot reach them.
    const teacher = { username: 't', role: 'teacher', stats: {} } as unknown as User;
    render(<UpgradeModal showToast={showToast} user={teacher} />);
    fireEvent(
      window,
      new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'fullFeedback' } })
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(createCheckoutUrlMock).not.toHaveBeenCalled();
  });

  it('opens the billing portal from that CTA rather than checkout again', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    fireEvent.click(screen.getByRole('button', { name: /Manage subscription/i }));
    await waitFor(() => expect(createPortalUrlMock).toHaveBeenCalledTimes(1));
    expect(createCheckoutUrlMock).toHaveBeenCalledTimes(1);
  });

  it('forgets the refusal once the prompt is closed', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i }));
    await waitFor(() => screen.getByRole('button', { name: /Manage subscription/i }));
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));
    fireEvent(
      window,
      new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'sampleAnswers' } })
    );
    expect(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByRole('button', { name: /Manage subscription/i })).toBeNull();
  });
});

describe('checkout refused because the school already holds a licence', () => {
  beforeEach(() => {
    createCheckoutUrlMock.mockResolvedValue({
      url: null,
      error: 'Your school already has a School licence. Ask whoever bought it to add seats.',
      status: ALREADY_SUBSCRIBED_STATUS,
      code: 'school_licence_held',
    });
  });

  it('shows the server sentence, offers no purchase, and never turns into the billing portal', async () => {
    // The 409 with a code is not "already subscribed". The portal belongs to the
    // licence's buyer and would 404 for this caller, so it must not be offered.
    open();
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Band 6 Plus/i }));
    await waitFor(() => screen.getByText(/Your school already has a School licence/));

    expect(screen.queryByRole('button', { name: /Manage subscription/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upgrade to Band 6 Plus/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Maybe later/i })).toBeTruthy();
    expect(createPortalUrlMock).not.toHaveBeenCalled();
  });
});
