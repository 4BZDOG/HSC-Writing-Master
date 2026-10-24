import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { User, UserRole } from '../../types';

/**
 * The header's route to Plus. A free student had no way to Plus from the screen
 * they spend their time on; this pins who is offered it (exactly the people the
 * upgrade prompt sells to), what it opens, and that it disappears wherever there
 * is nothing to buy.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({
  authService: { updateUser: vi.fn(), getCurrentUser: () => null },
}));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => false }));

const state = vi.hoisted(() => ({
  priceIds: { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' },
  selling: true,
  remaining: 3 as number,
  requests: [] as Array<{ feature: string; reason?: string }>,
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return state.priceIds;
    },
    monetisationEnabled: () => state.selling,
    freeEvalsRemaining: () => state.remaining,
    requestUpgrade: (feature: string, reason?: string) => state.requests.push({ feature, reason }),
  };
});

import AppHeader from '../../components/AppHeader';
import { HEADER_PLAN } from '../../utils/headerChrome';
import type { StorageStatus } from '../../utils/storageUtils';

const makeUser = (role: UserRole, overrides: Partial<User> = {}): User =>
  ({
    username: 'alex@example.com',
    role,
    displayName: 'Alex',
    preferences: { theme: 'dark' },
    stats: { questionsAnswered: 0, averageBand: 0 },
    ...overrides,
  }) as unknown as User;

const renderHeader = (user: User) =>
  render(
    <AppHeader
      user={user}
      onUpdateUser={vi.fn()}
      storageStatus={'IndexedDB' as StorageStatus}
      openModal={vi.fn()}
      onOpenAudit={vi.fn()}
      onOpenReviewQueue={vi.fn()}
      onOpenClassInsights={vi.fn()}
      onOpenStudentProgress={vi.fn()}
      onOpenUsageDashboard={vi.fn()}
      onOpenRuntimeKeys={vi.fn()}
    />
  );

const control = () => screen.queryByTestId('header-plan');

beforeEach(() => {
  state.priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' };
  state.selling = true;
  state.remaining = 3;
  state.requests = [];
});
afterEach(cleanup);

describe('who is offered Plus from the header', () => {
  it('offers it to a free student and to a guest', () => {
    renderHeader(makeUser('user'));
    expect(control()).toBeTruthy();
    cleanup();
    renderHeader(makeUser('guest'));
    expect(control()).toBeTruthy();
  });

  it.each([
    ['a teacher, who holds Plus as a staff perk', makeUser('teacher')],
    ['an admin', makeUser('admin')],
    ['a parent, who buys for a child from their dashboard', makeUser('parent')],
    ['a student already on Plus', makeUser('user', { stripePlan: 'plus' } as Partial<User>)],
    [
      'a student covered by their school',
      makeUser('user', { stripePlan: 'school' } as Partial<User>),
    ],
  ])('offers nothing to %s', (_who, user) => {
    renderHeader(user);
    expect(control()).toBeNull();
  });

  it('offers nothing on a deployment that sells nothing', () => {
    state.selling = false;
    renderHeader(makeUser('user'));
    expect(control()).toBeNull();
  });

  it('offers nothing where no Plus price is on sale, so it never opens a prompt with nothing to buy', () => {
    state.priceIds = { plus_monthly: '', plus_yearly: '', school: 'price_school' };
    renderHeader(makeUser('user'));
    expect(control()).toBeNull();
  });
});

describe('what it opens', () => {
  it('opens the prompt on the plan as a whole', () => {
    renderHeader(makeUser('user'));
    fireEvent.click(control()!);
    expect(state.requests).toEqual([{ feature: 'fullFeedback', reason: 'overview' }]);
  });

  it('leads with the daily limit once today’s free markings are spent', () => {
    state.remaining = 0;
    renderHeader(makeUser('user'));
    const button = control()!;
    expect(button.getAttribute('aria-label')).toMatch(/^No free markings left today\./);
    fireEvent.click(button);
    expect(state.requests).toEqual([{ feature: 'fullFeedback', reason: 'dailyLimit' }]);
  });

  it('names itself in full for a screen reader at every width, where a phone shows only the crown', () => {
    renderHeader(makeUser('user'));
    const button = control()!;
    expect(button.getAttribute('aria-label')).toBe('Upgrade to Band 6 Plus: see what it includes');
    // The visible label is hidden below `sm`; the crown is decorative.
    expect(button.querySelector('span')?.className).toContain('hidden sm:inline');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('wears the header vocabulary, with the phone touch target', () => {
    renderHeader(makeUser('user'));
    expect(control()!.className).toBe(HEADER_PLAN);
    expect(HEADER_PLAN).toContain('w-11 h-11');
  });
});
