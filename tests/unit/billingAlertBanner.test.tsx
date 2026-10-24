import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The past-due banner a student sees while Stripe retries a failed charge. When a
 * parent or guardian pays for the plan, the card is theirs: the student is told who
 * to ask and is offered no portal, which would only refuse them (managed_by_guardian).
 * A student who pays for their own plan keeps the portal button.
 */

const fetchAlert = vi.fn();
const createPortal = vi.fn();

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    fetchBillingAlert: () => fetchAlert(),
    createPortalUrl: (...args: unknown[]) => createPortal(...args),
  };
});

import BillingAlertBanner from '../../components/BillingAlertBanner';

const GUARDIAN_COPY =
  "The payment for your plan didn't go through. Ask your parent or guardian to update their payment details.";

beforeEach(() => {
  fetchAlert.mockReset();
  createPortal.mockReset();
});

afterEach(cleanup);

describe('BillingAlertBanner', () => {
  it('asks the student to get their parent or guardian to fix a payment they make, with no portal button', async () => {
    fetchAlert.mockResolvedValue({
      status: 'past_due',
      plan: 'plus',
      currentPeriodEnd: '2026-12-01T00:00:00Z',
      paidByGuardian: true,
    });

    render(<BillingAlertBanner />);

    expect(await screen.findByText(GUARDIAN_COPY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update payment method' })).toBeNull();
    expect(screen.queryByText(/There's a payment issue/)).toBeNull();
    expect(createPortal).not.toHaveBeenCalled();
  });

  it('still offers the portal to a student who pays for their own past-due plan', async () => {
    fetchAlert.mockResolvedValue({
      status: 'past_due',
      plan: 'plus',
      currentPeriodEnd: '2026-12-01T00:00:00Z',
      paidByGuardian: false,
    });

    render(<BillingAlertBanner />);

    expect(await screen.findByRole('button', { name: 'Update payment method' })).toBeTruthy();
    expect(screen.queryByText(GUARDIAN_COPY)).toBeNull();
  });

  it('asks a school licence holder to pay the overdue invoice or card, not just to update a card', async () => {
    // A licence may be invoiced against a purchase order, where there is no card at all.
    fetchAlert.mockResolvedValue({
      status: 'past_due',
      plan: 'school',
      currentPeriodEnd: '2026-12-01T00:00:00Z',
      paidByGuardian: false,
    });

    render(<BillingAlertBanner />);

    expect(await screen.findByText(/licence is overdue/)).toBeTruthy();
    expect(screen.getByText(/Pay the open invoice, or update the card/)).toBeTruthy();
    expect(screen.queryByText(/Update your card to keep it that way/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Open billing portal' })).toBeTruthy();
  });

  it('can be dismissed in both cases', async () => {
    const user = userEvent.setup();
    fetchAlert.mockResolvedValue({
      status: 'past_due',
      plan: 'plus',
      currentPeriodEnd: null,
      paidByGuardian: true,
    });

    render(<BillingAlertBanner />);
    await screen.findByText(GUARDIAN_COPY);
    await user.click(screen.getByRole('button', { name: 'Dismiss payment warning' }));

    expect(screen.queryByText(GUARDIAN_COPY)).toBeNull();
  });

  it('shows nothing when the plan is not past due', async () => {
    fetchAlert.mockResolvedValue(null);

    render(<BillingAlertBanner />);

    await vi.waitFor(() => expect(fetchAlert).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
