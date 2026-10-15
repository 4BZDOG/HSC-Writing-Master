import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SeatEconomics from '../../components/admin/SeatEconomics';
import * as seatService from '../../services/seatEconomicsService';
import type { SeatUsage, SeatUsageResult } from '../../services/seatEconomicsService';
import type { SeatUsageMeasures } from '../../utils/seatEconomics';

/**
 * The panel is read-only and admin only, so what matters is that each state says
 * the true thing: a table with the verdict in words, a calls-only view when no cost
 * is set, a loss that reads as a loss, and a plain message when the schema is not
 * there. The reads are stubbed; the arithmetic is covered by seatEconomics.test.ts.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({ authService: { updateUser: vi.fn() } }));

vi.mock('../../services/seatEconomicsService', async (importOriginal) => {
  const actual = await importOriginal<typeof seatService>();
  return { ...actual, loadSeatUsage: vi.fn() };
});

// The seat price is fixed here so the margin and verdict wording does not depend on the
// build's environment. It is a mutable value so one test can make it unreadable.
const price = vi.hoisted(() => ({ schoolSeat: 'A$4' }));
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    PLAN_PRICING: {
      ...actual.PLAN_PRICING,
      get schoolSeat() {
        return price.schoolSeat;
      },
    },
  };
});

const load = vi.mocked(seatService.loadSeatUsage);

const measures = (over: Partial<SeatUsageMeasures>): SeatUsageMeasures => ({
  seats: 10,
  members: 8,
  active_users: 6,
  total_calls: 300,
  calls_per_seat_per_day: 1,
  avg_calls_per_active_user_day: 5,
  p95_calls_per_user_day: 40,
  max_calls_per_user_day: 90,
  user_days_over_100: 0,
  seats_unused: 2,
  ...over,
});

/**
 * At A$0.01 a call and A$4 a seat: Alpha's 1 call a seat a day costs A$3.65 a year
 * (thin), Beta's 8 cost A$29.20 (loss). The totals sit in between.
 */
const usage = (days: number): SeatUsage => ({
  days,
  schools: [
    { id: 'alpha', name: 'Alpha High', ...measures({}) },
    {
      id: 'beta',
      name: 'Beta College',
      ...measures({
        seats: 5,
        members: 9,
        active_users: 4,
        total_calls: 1200,
        calls_per_seat_per_day: 8,
        p95_calls_per_user_day: 250,
        max_calls_per_user_day: 300,
        user_days_over_100: 4,
        seats_unused: 0,
      }),
    },
  ],
  totals: measures({
    seats: 15,
    members: 17,
    active_users: 10,
    total_calls: 1500,
    calls_per_seat_per_day: 3.33,
    p95_calls_per_user_day: 250,
    max_calls_per_user_day: 300,
    user_days_over_100: 4,
    seats_unused: 2,
  }),
});

const ok = (days: number): SeatUsageResult => ({ status: 'ok', usage: usage(days) });

const openPanel = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Seat economics/ }));
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
};

beforeEach(() => {
  load.mockReset();
  load.mockImplementation(async (days) => ok(days));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SeatEconomics: opening and reading the table', () => {
  it('is closed by default and reads nothing until opened', () => {
    render(<SeatEconomics />);
    const toggle = screen.getByRole('button', { name: /Seat economics/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(load).not.toHaveBeenCalled();
  });

  it('reads the 30-day window when opened, and lists each school with its figures', async () => {
    render(<SeatEconomics />);
    await openPanel();

    expect(load).toHaveBeenCalledWith(30);
    const alphaRow = screen.getByRole('rowheader', { name: 'Alpha High' }).closest('tr');
    expect(alphaRow).not.toBeNull();
    const cells = Array.from(alphaRow!.querySelectorAll('td')).map((td) => td.textContent);
    // Seats, members, active users, calls per seat per day, p95, verdict.
    // Seats, members, active users, calls per seat per day, p95, verdict. No cost is set
    // here, so the verdict is "No cost set" rather than a judgement.
    expect(cells.slice(0, 6)).toEqual(['10', '8', '6', '1', '40', 'No cost set']);

    expect(screen.getByRole('rowheader', { name: 'Beta College' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'All licensed schools' })).toBeTruthy();
  });

  it('puts the plain-language explanation above the table', async () => {
    render(<SeatEconomics />);
    await openPanel();

    const explanation = screen.getByText(/These are AI calls, not money/);
    const table = screen.getByRole('table');
    expect(
      explanation.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('shows the verdict in words, so a loss is not only a colour', async () => {
    vi.stubEnv('VITE_AI_COST_PER_CALL_AUD', '0.01');
    render(<SeatEconomics />);
    await openPanel();

    // Beta and the totals row are both over the seat price, so "Loss" appears twice.
    expect(screen.getAllByText('Loss').length).toBeGreaterThan(0);
    expect(screen.getByText('Thin margin')).toBeTruthy();
  });
});

describe('SeatEconomics: the cost per call', () => {
  it('shows calls only, with the note, when VITE_AI_COST_PER_CALL_AUD is unset', async () => {
    render(<SeatEconomics />);
    await openPanel();

    expect(
      screen.getByText('Set VITE_AI_COST_PER_CALL_AUD to see projected cost and margin.')
    ).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'AI cost per seat a year' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Margin per seat a year' })).toBeNull();
    expect(screen.getAllByText('No cost set')).toHaveLength(3);
  });

  it('adds the projected cost, margin and heavy-user columns when a cost is set', async () => {
    vi.stubEnv('VITE_AI_COST_PER_CALL_AUD', '0.01');
    render(<SeatEconomics />);
    await openPanel();

    expect(screen.queryByText(/Set VITE_AI_COST_PER_CALL_AUD/)).toBeNull();
    expect(screen.getByText(/Cost per call A\$0\.0100/)).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'AI cost per seat a year' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Margin per seat a year' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Heavy user a year' })).toBeTruthy();
    // Alpha: 1 call a seat a day at A$0.01 for 365 days is A$3.65.
    expect(screen.getByText('A$3.65')).toBeTruthy();
  });

  it('says the seat price could not be read rather than judging it', async () => {
    price.schoolSeat = 'call us';
    try {
      vi.stubEnv('VITE_AI_COST_PER_CALL_AUD', '0.01');
      render(<SeatEconomics />);
      await openPanel();

      expect(screen.getByText(/The seat price could not be read/)).toBeTruthy();
      expect(screen.getAllByText('No price to compare')).toHaveLength(3);
      expect(screen.queryByText('Loss')).toBeNull();
    } finally {
      price.schoolSeat = 'A$4';
    }
  });
});

describe('SeatEconomics: the window toggle', () => {
  it('reads again with 90 days when the 90-day window is chosen', async () => {
    render(<SeatEconomics />);
    await openPanel();

    const ninety = screen.getByRole('button', { name: 'Last 90 days' });
    expect(ninety.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(ninety);

    await waitFor(() => expect(load).toHaveBeenLastCalledWith(90));
    expect(ninety.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  it('keeps the table in a loading state while the new window is read', async () => {
    render(<SeatEconomics />);
    await openPanel();

    let finish: (r: SeatUsageResult) => void = () => {};
    load.mockImplementationOnce(
      () =>
        new Promise<SeatUsageResult>((resolve) => {
          finish = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading seat usage…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();

    finish(ok(90));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });
});

describe('SeatEconomics: the other states', () => {
  it('says to re-apply the schema when the report is unavailable', async () => {
    load.mockResolvedValue({ status: 'unavailable' });
    render(<SeatEconomics />);
    fireEvent.click(screen.getByRole('button', { name: /Seat economics/ }));

    expect(await screen.findByText('Re-apply the database schema to see seat usage.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the error and lets the admin try again', async () => {
    load.mockResolvedValueOnce({ status: 'error', message: 'Could not load seat usage: boom' });
    render(<SeatEconomics />);
    fireEvent.click(screen.getByRole('button', { name: /Seat economics/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not load seat usage: boom')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says so when no school has a live licence, instead of showing an empty table', async () => {
    load.mockResolvedValue({
      status: 'ok',
      usage: { days: 30, schools: [], totals: measures({ seats: 0, members: 0 }) },
    });
    render(<SeatEconomics />);
    fireEvent.click(screen.getByRole('button', { name: /Seat economics/ }));

    expect(await screen.findByText(/No school has a live licence/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
