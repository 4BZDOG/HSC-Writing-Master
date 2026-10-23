import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The plan card in the profile, for a student whose Plus someone else pays for,
 * and for a parent. The student is told who pays and is not offered the
 * portal. The parent is told their account holds no plan, and is offered no
 * purchase for themselves.
 */

const lookup = vi.fn();

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => null,
    updateUser: vi.fn(),
  },
}));

vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, fetchBillingLookup: () => lookup() };
});

// The guardian section is not under test here, and needs no online account.
vi.mock('../../components/guardian/StudentGuardianSection', () => ({
  default: () => null,
  showGuardianSection: () => false,
}));

import UserProfileModal from '../../components/UserProfileModal';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    username: 'sam@example.com',
    displayName: 'Sam Nguyen',
    role: 'user',
    preferences: {
      theme: 'dark',
      defaultFocusMode: false,
      autoSave: true,
      highContrast: false,
      showTips: true,
    },
    stats: {
      xp: 0,
      level: 1,
      questionsAnswered: 0,
      totalWordsWritten: 0,
      averageBand: 0,
      streakDays: 1,
      lastActive: Date.now(),
    },
    ...overrides,
  }) as unknown as User;

const renderModal = (user: User) =>
  render(
    <UserProfileModal
      isOpen
      onClose={() => {}}
      user={user}
      onUpdateUser={vi.fn()}
      onLogout={() => {}}
    />
  );

beforeEach(() => {
  lookup.mockReset();
});

afterEach(cleanup);

describe('the plan card when a parent pays for the plan', () => {
  it('says who pays, and offers no portal for the student to open', async () => {
    lookup.mockResolvedValue({
      status: 'found',
      state: {
        status: 'active',
        plan: 'plus',
        currentPeriodEnd: '2026-12-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        paidByGuardian: true,
      },
    });

    renderModal(makeUser({ stripePlan: 'plus' }));

    expect(
      await screen.findByText(
        'Paid for by your parent or guardian. They manage the billing for this plan.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /manage subscription/i })).toBeNull();
  });

  it('still offers the portal for a student who pays for their own plan', async () => {
    lookup.mockResolvedValue({
      status: 'found',
      state: {
        status: 'active',
        plan: 'plus',
        currentPeriodEnd: '2026-12-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        paidByGuardian: false,
      },
    });

    renderModal(makeUser({ stripePlan: 'plus' }));

    expect(await screen.findByRole('button', { name: /manage subscription/i })).toBeTruthy();
    expect(screen.queryByText(/Paid for by your parent or guardian/)).toBeNull();
  });
});

describe('the plan card for a parent account', () => {
  it('says the account holds no plan and offers no purchase for itself', () => {
    renderModal(
      makeUser({ role: 'parent', username: 'pat@example.com', displayName: 'Pat Nguyen' })
    );

    expect(screen.getByText(/Your account does not hold a plan/)).toBeTruthy();
    expect(screen.queryByText(/Upgrade to /)).toBeNull();
    expect(screen.queryByRole('button', { name: /manage subscription/i })).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
