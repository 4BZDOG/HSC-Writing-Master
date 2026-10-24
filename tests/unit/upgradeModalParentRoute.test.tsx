import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { User } from '../../types';

/**
 * Most students have no card of their own. A parent or guardian is the other buyer of
 * Plus (schema §31), so the upgrade prompt tells a student that route exists. It is a
 * student's route only: the link code is theirs to create, and a guest has no account
 * to link.
 */

let guardianOn = true;

vi.mock('../../services/guardianService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/guardianService')>();
  return { ...actual, guardianAvailable: () => guardianOn };
});

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    STRIPE_PRICE_IDS: { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' },
    createCheckoutUrl: vi.fn(async () => ({ url: null, error: 'stubbed' })),
  };
});

import UpgradeModal from '../../components/UpgradeModal';
import { UPGRADE_REQUEST_EVENT } from '../../services/entitlements';

const PARENT_ROUTE = /A parent or guardian can pay instead/;

const asUser = (role: User['role']): User =>
  ({ username: `a-${role}`, role, stats: {} }) as unknown as User;

const openFor = (user: User) => {
  render(<UpgradeModal user={user} showToast={vi.fn()} />);
  fireEvent(
    window,
    new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature: 'fullFeedback' } })
  );
};

beforeEach(() => {
  guardianOn = true;
});
afterEach(cleanup);

describe('the parent route in the upgrade prompt', () => {
  it('tells a student a parent or guardian can pay, and where to start', () => {
    openFor(asUser('user'));
    expect(screen.getByText(PARENT_ROUTE)).toBeTruthy();
    expect(screen.getByText(/under Parent or guardian/)).toBeTruthy();
  });

  it('is not offered to a guest, who has no account to link', () => {
    openFor(asUser('guest'));
    expect(screen.queryByText(PARENT_ROUTE)).toBeNull();
  });

  it('is not offered where this build has no online guardian path', () => {
    guardianOn = false;
    openFor(asUser('user'));
    expect(screen.queryByText(PARENT_ROUTE)).toBeNull();
  });
});

describe('the prompt opened on the plan as a whole', () => {
  const openOverview = (user: User) => {
    render(<UpgradeModal user={user} showToast={vi.fn()} />);
    fireEvent(
      window,
      new CustomEvent(UPGRADE_REQUEST_EVENT, {
        detail: { feature: 'fullFeedback', reason: 'overview' },
      })
    );
  };

  it('leads with what the plan adds, not with one locked feature', () => {
    openOverview(asUser('user'));
    expect(screen.getByRole('heading', { name: 'What Band 6 Plus adds' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Full Marking Feedback/ })).toBeNull();
    expect(screen.getByText(/The free plan stays free if you do not upgrade\./)).toBeTruthy();
    // The lock's own sentence belongs to a lock, and none was pressed.
    expect(screen.queryByText(/includes Full Marking Feedback\./)).toBeNull();
  });
});
