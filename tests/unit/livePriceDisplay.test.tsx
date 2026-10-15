import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, renderHook } from '@testing-library/react';

/**
 * The screens show the live Stripe price where one has arrived, and the env text
 * until then. A GST note appears beside a price only when Stripe says the price is
 * inclusive or exclusive of GST. An unspecified price says nothing about GST.
 *
 * The request is stubbed at fetch. The service and the hook are the real ones.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

let priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_s' };
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return priceIds;
    },
    createCheckoutUrl: vi.fn(),
  };
});

import { resetLivePricesForTests } from '../../services/livePrices';
import { useLivePrices } from '../../hooks/useLivePrices';
import PlanComparison from '../../components/PlanComparison';
import UpgradeModal from '../../components/UpgradeModal';
import { UPGRADE_REQUEST_EVENT } from '../../services/entitlements';

const livePrice = (display: string, interval: 'month' | 'year', taxBehavior: string) => ({
  amount: Number(display.replace(/[^\d.]/g, '')),
  currency: 'aud',
  interval,
  display,
  taxBehavior,
});

/** The answer the endpoint gives for a deployment whose Stripe prices are these. */
const liveBody = (tax: { plus: string; school: string }) => ({
  prices: {
    plusMonthly: livePrice('A$9', 'month', tax.plus),
    plusYearly: livePrice('A$65', 'year', tax.plus),
    schoolSeat: livePrice('A$5', 'year', tax.school),
  },
});

const stubPrices = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))
  );

beforeEach(() => {
  resetLivePricesForTests();
  priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_s' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLivePrices', () => {
  it('shows the env text first, then the live price once it arrives', async () => {
    stubPrices(liveBody({ plus: 'inclusive', school: 'exclusive' }));

    const { result } = renderHook(() => useLivePrices());

    expect(result.current.monthly).toBe('A$7.99');
    await waitFor(() => expect(result.current.monthly).toBe('A$9'));
    expect(result.current.yearly).toBe('A$65');
    expect(result.current.schoolSeat).toBe('A$5');
  });

  it('keeps the env text when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const { result } = renderHook(() => useLivePrices());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.monthly).toBe('A$7.99');
    expect(result.current.yearly).toBe('A$59');
    expect(result.current.monthlyGst).toBeNull();
  });
});

describe('the plan comparison', () => {
  it('shows live prices with GST wording when Stripe says inclusive and exclusive', async () => {
    stubPrices(liveBody({ plus: 'inclusive', school: 'exclusive' }));

    render(<PlanComparison user={null} showUpgradeCta={false} />);

    expect(await screen.findByText('A$65/year or A$9/month incl. GST')).toBeTruthy();
    expect(screen.getByText('A$5 per student, per year + GST')).toBeTruthy();
    expect(document.body.textContent).not.toContain('A$59');
  });

  it('says nothing about GST when Stripe does not specify it', async () => {
    stubPrices(liveBody({ plus: 'unspecified', school: 'unspecified' }));

    render(<PlanComparison user={null} showUpgradeCta={false} />);

    expect(await screen.findByText('A$65/year or A$9/month')).toBeTruthy();
    expect(screen.getByText('A$5 per student, per year')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GST/);
  });

  it('shows the env text, with no GST, when the live price is unavailable', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );

    render(<PlanComparison user={null} showUpgradeCta={false} />);

    expect(screen.getByText('A$59/year or A$7.99/month')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GST/);
  });
});

describe('the upgrade prompt', () => {
  const openFor = () => {
    render(<UpgradeModal showToast={vi.fn()} />);
    fireEvent(
      window,
      new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'fullFeedback' } })
    );
  };

  it('replaces the env price with the live one, and says GST is included', async () => {
    stubPrices(liveBody({ plus: 'inclusive', school: 'exclusive' }));

    openFor();

    await waitFor(() => expect(document.body.textContent).toContain('A$65 /year incl. GST'));
    expect(document.body.textContent).toContain('A$9 /month incl. GST');
    expect(document.body.textContent).toContain('Charged A$65 a year (incl. GST)');
    expect(document.body.textContent).not.toContain('A$59');
  });

  it('states no GST position when the price is unspecified', async () => {
    stubPrices(liveBody({ plus: 'unspecified', school: 'unspecified' }));

    openFor();

    await waitFor(() => expect(document.body.textContent).toContain('A$65 /year'));
    expect(document.body.textContent).not.toMatch(/GST/);
  });
});
