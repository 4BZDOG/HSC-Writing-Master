import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { User } from '../../types';

/**
 * What the profile's plan card says each role holds.
 *
 * A free student used to read "Limited daily evaluations and basic features", which
 * gives them nothing to plan around. Staff were never told that the Class and School
 * reports are what a School licence adds, so a teacher on the staff perk met a lock
 * on the class report with no explanation on their own plan card. And a parent, who
 * holds no plan, was told "You are on Free" beside Compare plans.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('../../services/authService', () => ({
  authService: { getCurrentUser: () => null, updateUser: vi.fn() },
}));
vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(),
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    fetchBillingLookup: async () => ({ status: 'none' }),
    createPortalUrl: async () => ({ url: null, error: 'stub', status: 500 }),
  };
});

import UserProfileModal from '../../components/UserProfileModal';
import { freeEvalLimit, freePlanSummary } from '../../services/entitlements';
import { freeTierLimits } from '../../services/planPolicy';

const asUser = (overrides: Partial<User>): User =>
  ({
    username: 'someone@example.com',
    displayName: 'Someone',
    role: 'user',
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
      onComparePlans={() => {}}
    />
  );

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the free plan, in figures', () => {
  it('states the daily allowance, the feedback, and how far questions and exemplars go', () => {
    const summary = freePlanSummary();
    const limits = freeTierLimits();
    expect(summary).toContain(`${freeEvalLimit()} marked answers a day`);
    expect(summary).toContain('the summary and band for each');
    expect(summary).toContain(`tier ${limits.maxQuestionTier} of 6`);
    expect(summary).toContain(`up to Band ${limits.maxSampleBand}`);
    expect(summary).toMatch(/the count resets at /);
  });

  it('is what a free student reads on their plan card', () => {
    renderCard(asUser({ role: 'user' }));
    expect(screen.getByText(new RegExp(`${freeEvalLimit()} marked answers a day`))).toBeTruthy();
    expect(screen.queryByText(/Limited daily evaluations/)).toBeNull();
  });
});

describe('what a School licence adds, said to the staff it is for', () => {
  it('tells a teacher on the staff perk that class and school reports come with a licence', async () => {
    renderCard(asUser({ role: 'teacher' }));
    await waitFor(() =>
      expect(screen.getByText(/Class and school reports come with a School licence\./)).toBeTruthy()
    );
  });

  it('tells a teacher whose school holds a licence that the reports are included', async () => {
    renderCard(asUser({ role: 'teacher', stripePlan: 'school' }));
    await waitFor(() =>
      expect(screen.getByText(/Class and school reports are included\./)).toBeTruthy()
    );
  });

  it('says nothing about cohort reports to a student, who cannot run them', async () => {
    renderCard(asUser({ role: 'user', stripePlan: 'plus' }));
    await waitFor(() => expect(screen.getByText(/Full marking/)).toBeTruthy());
    expect(screen.queryByText(/Class and school reports/)).toBeNull();
  });
});

describe('Compare plans, for a parent', () => {
  it('describes what Plus gives their child, not a plan the parent does not hold', () => {
    renderCard(asUser({ role: 'parent' }));
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    expect(screen.getByText('What Band 6 Plus gives your child, and what it costs.')).toBeTruthy();
    expect(screen.queryByText(/You are on Free/)).toBeNull();
  });
});
