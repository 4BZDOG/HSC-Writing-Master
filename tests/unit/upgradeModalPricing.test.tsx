import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * The upgrade prompt has to sell whatever this deployment configured, not only
 * the full monthly-and-yearly pair.
 *
 * `stripeReady` used to require BOTH Plus price IDs, so a deployment that had
 * priced only one period — an annual school pilot, or a monthly launch with
 * the yearly price still being decided — fell all the way back to "Keep me
 * posted". The server would have taken the payment; the button never offered
 * it. And because the price toggle was the only thing that stated a price, the
 * user was not even told what it cost.
 */

const createCheckoutUrlMock = vi.fn();

let priceIds = { plus_monthly: '', plus_yearly: '', school: '' };

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return priceIds;
    },
    createCheckoutUrl: (...args: unknown[]) => createCheckoutUrlMock(...args),
  };
});

import UpgradeModal from '../../components/UpgradeModal';
import { UPGRADE_REQUEST_EVENT } from '../../services/entitlements';

const openFor = (feature = 'fullFeedback') => {
  render(<UpgradeModal showToast={vi.fn()} />);
  fireEvent(window, new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }));
};

beforeEach(() => {
  createCheckoutUrlMock.mockReset();
  createCheckoutUrlMock.mockResolvedValue({ url: null, error: 'stubbed' });
  priceIds = { plus_monthly: '', plus_yearly: '', school: '' };
});

afterEach(cleanup);

describe('upgrade prompt with both billing periods priced', () => {
  beforeEach(() => {
    priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' };
  });

  it('offers the choice and defaults to yearly', () => {
    openFor();

    expect(screen.getByRole('button', { name: /monthly/i }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: /yearly/i }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('checks out the period the user picked', async () => {
    openFor();

    fireEvent.click(screen.getByRole('button', { name: /monthly/i }));
    fireEvent.click(screen.getByRole('button', { name: /upgrade now/i }));

    await waitFor(() => expect(createCheckoutUrlMock).toHaveBeenCalledWith('price_m'));
  });
});

describe('upgrade prompt with only the yearly price configured', () => {
  beforeEach(() => {
    priceIds = { plus_monthly: '', plus_yearly: 'price_y', school: '' };
  });

  it('sells it rather than falling back to "Keep me posted"', () => {
    openFor();

    expect(screen.getByRole('button', { name: /upgrade now/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /keep me posted/i })).toBeNull();
  });

  it('still states the price, with no toggle to a period that is not on sale', () => {
    openFor();

    expect(screen.queryByRole('button', { name: /^monthly$/i })).toBeNull();
    expect(screen.getByText(/\/year/)).toBeTruthy();
  });

  it('checks out the one price that exists', async () => {
    openFor();

    fireEvent.click(screen.getByRole('button', { name: /upgrade now/i }));

    await waitFor(() => expect(createCheckoutUrlMock).toHaveBeenCalledWith('price_y'));
  });
});

describe('upgrade prompt with only the monthly price configured', () => {
  beforeEach(() => {
    priceIds = { plus_monthly: 'price_m', plus_yearly: '', school: '' };
  });

  it('checks out the monthly price even though yearly is the usual default', async () => {
    openFor();

    fireEvent.click(screen.getByRole('button', { name: /upgrade now/i }));

    // The default billing period is 'yearly'; without falling back to what is
    // actually on sale this would have posted an empty priceId and been
    // rejected with "Missing or invalid priceId".
    await waitFor(() => expect(createCheckoutUrlMock).toHaveBeenCalledWith('price_m'));
  });

  it('states the monthly price', () => {
    openFor();

    expect(screen.getByText(/\/month/)).toBeTruthy();
  });
});

describe('upgrade prompt with no prices configured', () => {
  it('registers interest instead of offering a checkout', () => {
    openFor();

    expect(screen.getByRole('button', { name: /keep me posted/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /upgrade now/i })).toBeNull();
  });

  it('never calls the checkout endpoint', () => {
    openFor();

    fireEvent.click(screen.getByRole('button', { name: /keep me posted/i }));

    expect(createCheckoutUrlMock).not.toHaveBeenCalled();
  });
});
