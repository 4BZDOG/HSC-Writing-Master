import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The over-seat notice. Teachers and admins are told when more people are in
 * their school than the licence pays for, and only the purchaser is offered the
 * billing portal, because the portal is found through the purchaser's own
 * customer id and would fail for anyone else.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

const fetchMySchoolSeatsMock = vi.fn();
const createPortalUrlMock = vi.fn();

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    fetchMySchoolSeats: (...args: unknown[]) => fetchMySchoolSeatsMock(...args),
    createPortalUrl: (...args: unknown[]) => createPortalUrlMock(...args),
  };
});

import SeatOverageNotice, { isOverSeats } from '../../components/SeatOverageNotice';

const DISMISS_KEY = 'writing-studio:seat-overage-dismissed';

const asUser = (role: User['role']): User =>
  ({ username: `a-${role}`, role, preferences: {}, stats: {} }) as unknown as User;

const seats = (overrides: Partial<Record<string, unknown>> = {}) => ({
  planStatus: 'active',
  planSeats: 30,
  members: 34,
  purchaser: false,
  ...overrides,
});

beforeEach(() => {
  fetchMySchoolSeatsMock.mockReset();
  createPortalUrlMock.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('isOverSeats', () => {
  it('is true only for a live licence with more members than seats', () => {
    expect(isOverSeats(seats() as never)).toBe(true);
    expect(isOverSeats(seats({ members: 30 }) as never)).toBe(false);
    expect(isOverSeats(seats({ planStatus: 'past_due' }) as never)).toBe(true);
    expect(isOverSeats(seats({ planStatus: 'canceled' }) as never)).toBe(false);
    expect(isOverSeats(seats({ planStatus: 'none' }) as never)).toBe(false);
    // A licence with no seats recorded is unknown, not over.
    expect(isOverSeats(seats({ planSeats: 0 }) as never)).toBe(false);
  });
});

describe('SeatOverageNotice', () => {
  it('says how many over, and that the extra people keep access for now', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ purchaser: true }));
    render(<SeatOverageNotice user={asUser('teacher')} />);

    expect(
      await screen.findByText(
        /covers 30 seats, but 34 people are in the school now, 4 more than it covers/
      )
    ).toBeTruthy();
    expect(screen.getByText(/The 4 extra people keep School access for now\./)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('uses the singular when exactly one person is over', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ members: 31, purchaser: true }));
    render(<SeatOverageNotice user={asUser('admin')} />);
    expect(await screen.findByText(/31 people are in the school now, 1 more/)).toBeTruthy();
    expect(screen.getByText(/The extra person keeps School access for now\./)).toBeTruthy();
  });

  it('offers the billing portal to the purchaser, at the 44px phone target', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ purchaser: true }));
    createPortalUrlMock.mockResolvedValue({ url: null, error: 'Stripe is busy.', status: 503 });
    render(<SeatOverageNotice user={asUser('teacher')} />);

    const button = await screen.findByRole('button', { name: 'Manage subscription' });
    expect(button.className).toMatch(/min-h-11/);

    fireEvent.click(button);
    await waitFor(() => expect(createPortalUrlMock).toHaveBeenCalledTimes(1));
    // A failed portal says why, rather than leaving a button that did nothing.
    expect(await screen.findByText('Stripe is busy.')).toBeTruthy();
  });

  it('does not offer a button to a staff member who did not buy the licence, and says who to ask', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ purchaser: false }));
    render(<SeatOverageNotice user={asUser('teacher')} />);

    expect(
      await screen.findByText(
        /Ask the teacher or administrator who bought the licence to add seats under Manage subscription\./
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).toBeNull();
  });

  it('stays out of the way when the school is within its seats', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ members: 30 }));
    const { container } = render(<SeatOverageNotice user={asUser('teacher')} />);
    await waitFor(() => expect(fetchMySchoolSeatsMock).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe('');
  });

  it('stays out of the way when the licence is no longer live', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ planStatus: 'canceled' }));
    const { container } = render(<SeatOverageNotice user={asUser('admin')} />);
    await waitFor(() => expect(fetchMySchoolSeatsMock).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe('');
  });

  it('never asks for a student, whom the database would refuse anyway', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats());
    const { container } = render(<SeatOverageNotice user={asUser('user')} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMySchoolSeatsMock).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('says nothing when there is no seat picture to show', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(null);
    const { container } = render(<SeatOverageNotice user={asUser('teacher')} />);
    await waitFor(() => expect(fetchMySchoolSeatsMock).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe('');
  });

  it('can be dismissed for the session, and stays dismissed on the next mount in that session', async () => {
    fetchMySchoolSeatsMock.mockResolvedValue(seats({ purchaser: true }));
    const first = render(<SeatOverageNotice user={asUser('teacher')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss seat notice' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(window.sessionStorage.getItem(DISMISS_KEY)).toBe('1');
    first.unmount();

    render(<SeatOverageNotice user={asUser('teacher')} />);
    await waitFor(() => expect(fetchMySchoolSeatsMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
