import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * "Renews" vs "Access ends" on the profile's plan card.
 *
 * The date on that card comes from two different places depending on who is
 * paying. A user with their own subscription reads `cancel_at_period_end`
 * straight off their row, and that case was already handled. A user holding
 * the plan through their SCHOOL's seat licence has no row of their own — the
 * date comes off the school — and Stripe keeps a cancelling subscription at
 * status 'active' right up to the boundary, so nothing in that path could tell
 * a renewal date from a stop date.
 *
 * The result was a student at a lapsing school being told their plan "renews"
 * on the exact day their whole school drops back to the free tier.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));
vi.mock('../../services/authService', () => ({
  authService: { getCurrentUser: () => null, updateUser: vi.fn() },
}));
vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(),
}));

let lookup: unknown = { status: 'none' };

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    fetchBillingLookup: async () => lookup,
    createPortalUrl: async () => ({ url: null, error: 'stub', status: 500 }),
  };
});

import UserProfileModal from '../../components/UserProfileModal';

const schoolMember = (overrides: Partial<User> = {}): User =>
  ({
    username: 'student@school',
    displayName: 'A Student',
    role: 'user',
    stripePlan: 'school',
    planPeriodEnd: '2027-03-01T00:00:00.000Z',
    preferences: { theme: 'dark' },
    stats: { questionsAnswered: 0, averageBand: 0 },
    ...overrides,
  }) as unknown as User;

const renderCard = (user: User) =>
  render(
    <UserProfileModal
      isOpen
      onClose={() => {}}
      user={user}
      onUpdateUser={() => {}}
      onLogout={() => {}}
    />
  );

beforeEach(() => {
  lookup = { status: 'none' };
});
afterEach(cleanup);

describe('a plan held through a school licence', () => {
  it('says the access ends when the licence is set to lapse', async () => {
    renderCard(schoolMember({ planCancelAtPeriodEnd: true }));
    await waitFor(() => expect(screen.getByText(/Access ends/i)).toBeTruthy());
    // Not "no further charges" — they were never being charged. What they need
    // to know is whose decision it was.
    expect(screen.getByText(/licence ends then/i)).toBeTruthy();
    expect(screen.queryByText(/no further charges/i)).toBeNull();
  });

  it('still says it renews when the licence is not lapsing', async () => {
    renderCard(schoolMember());
    await waitFor(() => expect(screen.getByText(/Renews/i)).toBeTruthy());
    expect(screen.queryByText(/Access ends/i)).toBeNull();
  });

  it('reads as renewing on a database that predates the column', async () => {
    // `plan_cancel_at_period_end` absent → undefined → the behaviour before
    // this existed, rather than a card that claims the plan is ending.
    renderCard(schoolMember({ planCancelAtPeriodEnd: undefined }));
    await waitFor(() => expect(screen.getByText(/Renews/i)).toBeTruthy());
  });
});

describe('a plan held through the user’s own subscription', () => {
  it('takes the answer from their subscription row, not the school flag', async () => {
    lookup = {
      status: 'found',
      state: {
        status: 'active',
        plan: 'plus',
        currentPeriodEnd: '2027-03-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      },
    };
    // A stale school flag from an earlier session must not decide this.
    renderCard(schoolMember({ stripePlan: 'plus', planCancelAtPeriodEnd: false }));
    await waitFor(() => expect(screen.getByText(/Access ends/i)).toBeTruthy());
    expect(screen.getByText(/no further charges/i)).toBeTruthy();
  });
});
