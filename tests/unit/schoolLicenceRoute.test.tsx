import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * Can anyone actually buy a School licence?
 *
 * The seat picker used to live inside the upgrade prompt, shown only to
 * teachers and admins. Both of those hold a paid plan already — a teacher
 * through the staff perk, an admin by role — so neither ever has a LOCKED
 * control, and the prompt only opens when a locked control is pressed. The one
 * in-app route to the School plan was behind a door the only two roles allowed
 * to use it could not open: `VITE_STRIPE_SCHOOL_PRICE_ID` could be set,
 * correct, and live, and no school could buy a thing.
 *
 * The first test below is the proof of that, kept as a test rather than a
 * comment so nobody moves the panel back. The rest pin the route that replaced
 * it: the plan comparison, which is where staff actually arrive.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

const createCheckoutUrlMock = vi.fn();
let priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
let contactEmail = '';
let selling = true;

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return priceIds;
    },
    get SCHOOL_CONTACT_EMAIL() {
      return contactEmail;
    },
    monetisationEnabled: () => selling,
    createCheckoutUrl: (...args: unknown[]) => createCheckoutUrlMock(...args),
  };
});

// utils/planComparison reads the switch from planPolicy directly, not via
// entitlements, so a pilot deployment has to be simulated in both places.
vi.mock('../../services/planPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/planPolicy')>();
  return { ...actual, monetisationEnabled: () => selling };
});

import PlanComparison from '../../components/PlanComparison';
import {
  isFeatureLocked,
  PREMIUM_FEATURES,
  SCHOOL_SEAT_LIMITS,
  type PremiumFeatureKey,
} from '../../services/entitlements';

// Staff are attached to a school: the seat purchase is for a school, and the
// server refuses one for an account with no school. Students are never offered it.
const asUser = (role: User['role']): User =>
  ({
    username: `a-${role}`,
    role,
    stats: {},
    ...(role === 'teacher' || role === 'admin'
      ? { schoolId: 'school-1', schoolName: 'Hills High' }
      : {}),
  }) as unknown as User;

beforeEach(() => {
  createCheckoutUrlMock.mockReset();
  createCheckoutUrlMock.mockResolvedValue({ url: null, error: 'stubbed', status: 500 });
  priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
  contactEmail = '';
  selling = true;
});
afterEach(cleanup);

describe('why the seat purchase cannot live behind a lock', () => {
  // Staff hold Plus as a staff perk, so every Plus lock is open to them. The
  // Class & School reports are priced at School, so a teacher does meet ONE lock,
  // and the prompt that opens for it renders the seat route too. The plan
  // comparison still carries the route for a teacher who meets no lock at all.
  it('a teacher is locked out of only the School-priced reports', () => {
    const locked = (Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[]).filter((key) =>
      isFeatureLocked(key, asUser('teacher'))
    );
    expect(locked).toEqual(['cohortReports']);
  });

  it('an admin has nothing locked, so no lock can ever open the prompt for them', () => {
    const locked = (Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[]).filter((key) =>
      isFeatureLocked(key, asUser('admin'))
    );
    expect(locked).toEqual([]);
  });
});

describe('the plan comparison carries the School route', () => {
  it('offers a teacher the seat purchase, at the default seat count', () => {
    render(<PlanComparison user={asUser('teacher')} showToast={vi.fn()} />);
    expect(screen.getByRole('button', { name: `Buy ${SCHOOL_SEAT_LIMITS.default} seats` }));
  });

  it('checks out the school price with the seats the buyer picked', async () => {
    createCheckoutUrlMock.mockResolvedValue({ url: null, error: 'stubbed', status: 500 });
    render(<PlanComparison user={asUser('teacher')} showToast={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('More seats'));
    fireEvent.click(
      screen.getByRole('button', { name: `Buy ${SCHOOL_SEAT_LIMITS.default + 5} seats` })
    );
    await waitFor(() =>
      expect(createCheckoutUrlMock).toHaveBeenCalledWith(
        'price_school',
        SCHOOL_SEAT_LIMITS.default + 5
      )
    );
  });

  it('will not let the picker leave the bounds the server clamps to', () => {
    render(<PlanComparison user={asUser('teacher')} showToast={vi.fn()} />);
    const fewer = screen.getByLabelText('Fewer seats');
    for (let i = 0; i < 20; i++) fireEvent.click(fewer);
    expect(screen.getByRole('button', { name: `Buy ${SCHOOL_SEAT_LIMITS.min} seats` }));
  });

  it('gives a student no School route at all, not even an enquiry link', () => {
    // A student cannot buy a licence and a licence offered to them is an upsell
    // aimed at the wrong person. Their answer is the "ask your school" line
    // that describeAccess gives a School-priced lock.
    contactEmail = 'licensing@example.com';
    render(<PlanComparison user={asUser('user')} showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Ask about a school licence/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ask about a school licence/i })).toBeNull();
  });

  it('answers a teacher with no contact address configured, with a toast, not a dead end', () => {
    priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' };
    const showToast = vi.fn();
    render(<PlanComparison user={asUser('teacher')} showToast={showToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask about a school licence/i }));
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/school licences are not on sale/i),
      'info'
    );
  });

  it('asks a teacher with no school to get added to one, and draws no seat picker', () => {
    const teacher = { ...asUser('teacher'), schoolId: undefined, schoolName: undefined };
    render(<PlanComparison user={teacher as User} showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    expect(screen.getByText(/ask an admin to add you to yours/i)).toBeTruthy();
  });

  it('says a school that is already covered is covered, and offers no second purchase', () => {
    // Gap 1 of the paywall inventory: a second licence would be refused, so the
    // route says who to ask instead of offering seats.
    render(
      <PlanComparison
        user={{ ...asUser('teacher'), stripePlan: 'school' } as User}
        showToast={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    expect(screen.getByText(/ask whoever bought the licence/i)).toBeTruthy();
  });

  it('shows the server sentence, and no purchase, when a licence is already held', async () => {
    // The server's 409 with `school_licence_held`. Its sentence says whom to ask.
    // Showing a "Buy" button after that would send the buyer into the refusal again.
    createCheckoutUrlMock.mockResolvedValue({
      url: null,
      error: 'Your school already has a School licence. Ask whoever bought it to add seats.',
      status: 409,
      code: 'school_licence_held',
    });
    render(<PlanComparison user={asUser('teacher')} showToast={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: `Buy ${SCHOOL_SEAT_LIMITS.default} seats` })
    );
    await waitFor(() =>
      expect(screen.getByText(/Your school already has a School licence/)).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Manage subscription/i })).toBeNull();
  });

  it('offers nothing at all on a deployment that sells nothing', () => {
    selling = false;
    render(<PlanComparison user={asUser('teacher')} showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    // The comparison table still explains what a School licence IS — it is the
    // SELLING that stops, not the description.
    expect(screen.queryByText(/Ask about a school licence/i)).toBeNull();
  });

  it('draws no School route at all when the caller cannot report a failure', () => {
    // Without `showToast` a failed checkout would spin and stop silently, so
    // the panel is withheld rather than shown with no way to explain itself.
    render(<PlanComparison user={asUser('teacher')} />);
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
  });
});
