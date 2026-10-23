import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '../../types';
import type { GuardianStudentProgress, LinkedStudent } from '../../services/guardianService';

/**
 * The parent's home. The dashboard shows each linked child's plan and who pays
 * for it, offers the Plus purchase for a child on the free plan, opens billing
 * for a child the parent pays for, shows read-only progress, and removes a link
 * only after a confirmation. Every server call is mocked here.
 */

const guardian = {
  listMyStudents: vi.fn(),
  redeemGuardianInvite: vi.fn(),
  removeGuardianLink: vi.fn(),
  startGuardianCheckout: vi.fn(),
  openGuardianBillingPortal: vi.fn(),
  fetchGuardianStudentProgress: vi.fn(),
  listPaidSubscriptions: vi.fn(),
  guardianAvailable: vi.fn(() => true),
};

vi.mock('../../services/guardianService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/guardianService')>();
  return {
    ...actual,
    listMyStudents: (...args: unknown[]) => guardian.listMyStudents(...args),
    redeemGuardianInvite: (...args: unknown[]) => guardian.redeemGuardianInvite(...args),
    removeGuardianLink: (...args: unknown[]) => guardian.removeGuardianLink(...args),
    startGuardianCheckout: (...args: unknown[]) => guardian.startGuardianCheckout(...args),
    openGuardianBillingPortal: (...args: unknown[]) => guardian.openGuardianBillingPortal(...args),
    fetchGuardianStudentProgress: (...args: unknown[]) =>
      guardian.fetchGuardianStudentProgress(...args),
    listPaidSubscriptions: (...args: unknown[]) => guardian.listPaidSubscriptions(...args),
    guardianAvailable: () => guardian.guardianAvailable(),
  };
});

// Both Plus prices configured, so the monthly/yearly choice is on screen.
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    monetisationEnabled: () => true,
    STRIPE_PRICE_IDS: { plus_monthly: 'price_monthly', plus_yearly: 'price_yearly', school: '' },
  };
});

vi.mock('../../hooks/useLivePrices', () => ({
  useLivePrices: () => ({
    monthly: 'A$7.99',
    yearly: 'A$59',
    yearlyNote: 'Save 38%',
    schoolSeat: 'A$4',
    monthlyGst: null,
    yearlyGst: 'incl. GST',
    schoolSeatGst: null,
  }),
}));

import GuardianDashboard, {
  canBuyPlusForChild,
  planSentence,
} from '../../components/guardian/GuardianDashboard';
import {
  verbHighlights,
  bandsReached,
  trendSentence,
} from '../../components/guardian/GuardianChildProgress';

const sam: LinkedStudent = {
  studentId: 'child-1',
  displayName: 'Sam',
  username: 'sam',
  plan: 'free',
  planPeriodEnd: null,
  paidByMe: false,
  cancelAtPeriodEnd: false,
  linkedAt: '2026-10-01T00:00:00Z',
};

const ada: LinkedStudent = {
  studentId: 'child-2',
  displayName: 'Ada',
  username: 'ada',
  plan: 'plus',
  planPeriodEnd: '2026-12-01T00:00:00Z',
  paidByMe: true,
  cancelAtPeriodEnd: false,
  linkedAt: '2026-09-15T00:00:00Z',
};

const emptyProgress = {
  username: 'sam',
  displayName: 'Sam',
  byVerb: [],
  totals: { total_attempts: 0, active_students: 1, avg_band: null, avg_mark_frac: null },
  trend: [],
} as unknown as GuardianStudentProgress;

const adaProgress = {
  username: 'ada',
  displayName: 'Ada',
  byVerb: [
    {
      label: 'EXPLAIN',
      attempts: 6,
      students: 1,
      avg_mark: 3.9,
      avg_band: 4,
      low_band_rate: 0,
      avg_mark_frac: 0.78,
    },
    {
      label: 'EVALUATE',
      attempts: 8,
      students: 1,
      avg_mark: 2.4,
      avg_band: 3,
      low_band_rate: 0.5,
      avg_mark_frac: 0.4,
    },
  ],
  totals: { total_attempts: 14, active_students: 1, avg_band: 4.3, avg_mark_frac: 0.62 },
  trend: [
    { at: '2026-10-01T10:00:00Z', band: 3, mark: 9 },
    { at: '2026-10-05T10:00:00Z', band: 4.5, mark: 13 },
  ],
} as unknown as GuardianStudentProgress;

const parent = {
  username: 'pat@example.com',
  displayName: 'Pat Nguyen',
  role: 'parent',
} as unknown as User;

const renderDashboard = (
  overrides: Partial<{
    onBrowseQuestions: () => void;
    onSignOut: () => void;
  }> = {}
) => {
  const onBrowseQuestions = overrides.onBrowseQuestions ?? vi.fn();
  const onSignOut = overrides.onSignOut ?? vi.fn();
  render(
    <GuardianDashboard user={parent} onBrowseQuestions={onBrowseQuestions} onSignOut={onSignOut} />
  );
  return { onBrowseQuestions, onSignOut };
};

beforeEach(() => {
  vi.clearAllMocks();
  guardian.guardianAvailable.mockReturnValue(true);
  guardian.listMyStudents.mockResolvedValue([sam, ada]);
  guardian.fetchGuardianStudentProgress.mockImplementation(async (id: string) =>
    id === 'child-2' ? adaProgress : emptyProgress
  );
  guardian.listPaidSubscriptions.mockResolvedValue([]);
});

describe('GuardianDashboard: the children', () => {
  it('shows each child with their plan, who pays, and the next step', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Sam' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByText('Paid by you')).toBeTruthy();
    expect(screen.getByText('Sam is on the free plan.')).toBeTruthy();
    expect(screen.getByText(/Paid by you\. Renews/)).toBeTruthy();
  });

  it('offers the Plus purchase for a free child, and one billing route when the parent pays for a live subscription', async () => {
    guardian.listPaidSubscriptions.mockResolvedValue([{ userId: 'child-2', status: 'active' }]);
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    expect(screen.getByRole('button', { name: 'Get Band 6 Plus for Sam' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Get Band 6 Plus for Ada' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
  });

  it('shows no billing route when the parent pays for no live subscription', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    expect(screen.queryByRole('button', { name: 'Manage billing' })).toBeNull();
  });

  it('says a school licence covers a child, and offers nothing to buy', async () => {
    guardian.listMyStudents.mockResolvedValue([{ ...sam, plan: 'school' }]);
    renderDashboard();

    expect(
      await screen.findByText(
        'Sam is covered by their school’s licence, so there is nothing to buy here.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Get Band 6 Plus for Sam' })).toBeNull();
  });

  it('shows read-only progress for each child, with the band and the marks', async () => {
    renderDashboard();

    expect(await screen.findByText('Average band 4.3 out of 6')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('Weakest command verb')).toBeTruthy();
    expect(screen.getByText('Evaluate')).toBeTruthy();
    expect(screen.getByText('Strongest command verb')).toBeTruthy();
    expect(screen.getByText('Explain')).toBeTruthy();
    expect(screen.getByText('Band 3.0 to 4.5, up 1.5')).toBeTruthy();
    expect(fetchCalls()).toContainEqual(['child-2', 30]);
  });

  it('says so, with a sentence, when a child has no marked answers yet', async () => {
    renderDashboard();

    expect(
      await screen.findByText(
        'Sam has no marked answers in the last 30 days. Progress appears here once they have had an answer marked.'
      )
    ).toBeTruthy();
  });

  it('shows an empty list with a way to add a child, and no children yet', async () => {
    guardian.listMyStudents.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText(/No children are linked yet/i)).toBeTruthy();
  });

  it('shows the load error and retries on request', async () => {
    const user = userEvent.setup();
    guardian.listMyStudents
      .mockRejectedValueOnce(new Error('Your children could not be loaded. Try again in a moment.'))
      .mockResolvedValueOnce([sam]);
    renderDashboard();

    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Sam' })).toBeTruthy();
  });
});

describe('GuardianDashboard: linking a child', () => {
  it('redeems the code the child showed, then lists the child', async () => {
    const user = userEvent.setup();
    guardian.redeemGuardianInvite.mockResolvedValue({ studentId: 'child-1', displayName: 'Sam' });
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.type(screen.getByLabelText('Link code'), 'K7QM-4PXR');
    await user.click(screen.getByRole('button', { name: 'Link child' }));

    expect(guardian.redeemGuardianInvite).toHaveBeenCalledWith('K7QM-4PXR');
    expect(await screen.findByText('Linked to Sam.')).toBeTruthy();
    expect(guardian.listMyStudents).toHaveBeenCalledTimes(2);
  });

  it('asks for a code before calling the server', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.click(screen.getByRole('button', { name: 'Link child' }));

    expect(await screen.findByText('Enter the code your child shows you.')).toBeTruthy();
    expect(guardian.redeemGuardianInvite).not.toHaveBeenCalled();
  });

  it('says why a code did not link, in the server’s own words', async () => {
    const user = userEvent.setup();
    guardian.redeemGuardianInvite.mockRejectedValue(
      new Error('That code has expired. Ask your child to create a new one.')
    );
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.type(screen.getByLabelText('Link code'), 'OLD0-CODE');
    await user.click(screen.getByRole('button', { name: 'Link child' }));

    expect((await screen.findByRole('alert')).textContent).toContain('That code has expired.');
  });
});

describe('GuardianDashboard: buying Plus for a child', () => {
  it('starts checkout for the chosen billing period and the child', async () => {
    const user = userEvent.setup();
    guardian.startGuardianCheckout.mockResolvedValue({
      url: null,
      error: 'Sam already has Band 6 Plus.',
      code: 'beneficiary_has_plan',
    });
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.click(screen.getByRole('button', { name: /^Monthly/ }));
    await user.click(screen.getByRole('button', { name: 'Get Band 6 Plus for Sam' }));

    expect(guardian.startGuardianCheckout).toHaveBeenCalledWith('child-1', 'monthly', 'Sam');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Sam already has Band 6 Plus.'
    );
  });

  it('defaults to the yearly price, which is the one the upgrade prompt leads with', async () => {
    const user = userEvent.setup();
    guardian.startGuardianCheckout.mockResolvedValue({ url: null, error: 'nope', code: null });
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.click(screen.getByRole('button', { name: 'Get Band 6 Plus for Sam' }));

    expect(guardian.startGuardianCheckout).toHaveBeenCalledWith('child-1', 'yearly', 'Sam');
  });

  it('shows the same display prices the upgrade prompt uses', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    const group = screen.getByRole('group', { name: 'Billing period for Sam' });
    expect(within(group).getByText('A$59 incl. GST a year')).toBeTruthy();
    expect(within(group).getByText('A$7.99 a month')).toBeTruthy();
  });
});

describe('GuardianDashboard: removing a link', () => {
  it('asks first, and only then removes the link', async () => {
    const user = userEvent.setup();
    guardian.removeGuardianLink.mockResolvedValue(true);
    renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.click(screen.getByRole('button', { name: 'Remove link to Sam' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove the link to Sam?')).toBeTruthy();
    expect(guardian.removeGuardianLink).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Remove link' }));

    expect(guardian.removeGuardianLink).toHaveBeenCalledWith('child-1');
  });

  it('keeps billing reachable after a paid child is unlinked, and says so', async () => {
    const user = userEvent.setup();
    guardian.removeGuardianLink.mockResolvedValue(true);
    guardian.listMyStudents.mockResolvedValueOnce([ada]).mockResolvedValueOnce([]);
    guardian.listPaidSubscriptions.mockResolvedValue([{ userId: 'child-2', status: 'active' }]);
    renderDashboard();
    await screen.findByRole('heading', { name: 'Ada' });

    await user.click(screen.getByRole('button', { name: 'Remove link to Ada' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove link' })
    );

    expect(
      await screen.findByText(
        'You still pay for a subscription for a student you are no longer linked to.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
  });

  it('still offers billing, with the reason, when the payments cannot be checked', async () => {
    guardian.listPaidSubscriptions.mockRejectedValue(
      new Error('Your billing could not be checked. Try again in a moment.')
    );
    renderDashboard();

    expect((await screen.findByRole('alert')).textContent).toContain('could not be checked');
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
  });
});

describe('GuardianDashboard: navigation and the no-account state', () => {
  it('hands off to the question workspace and signs out through the callbacks it was given', async () => {
    const user = userEvent.setup();
    const { onBrowseQuestions, onSignOut } = renderDashboard();
    await screen.findByRole('heading', { name: 'Sam' });

    await user.click(screen.getByRole('button', { name: 'Browse questions' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onBrowseQuestions).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('explains that linking needs an online account, and makes no server call, in mock mode', () => {
    guardian.guardianAvailable.mockReturnValue(false);
    renderDashboard();

    expect(
      screen.getByRole('heading', { name: 'Parent accounts need an online account' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Link child' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Browse questions' })).toBeTruthy();
    expect(guardian.listMyStudents).not.toHaveBeenCalled();
  });
});

describe('GuardianDashboard: the pure reading of a child', () => {
  it('describes the plan from where it comes', () => {
    // Dates are read in the runner's own zone, so the expected date is too.
    const end = new Date(ada.planPeriodEnd as string).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(planSentence({ ...sam })).toBe('Sam is on the free plan.');
    expect(planSentence({ ...ada, cancelAtPeriodEnd: true })).toBe(
      `Paid by you. Ends ${end}. No further charges.`
    );
    expect(planSentence({ ...ada, paidByMe: false })).toBe(
      `Ada holds Band 6 Plus on their own account. Renews ${end}.`
    );
    expect(planSentence({ ...sam, plan: 'school' })).toMatch(/covered by their school/);
  });

  it('offers a purchase only where Plus is sold', () => {
    expect(canBuyPlusForChild()).toBe(true);
  });

  it('picks the strongest and weakest verb from mark share, and leaves out unmeasured ones', () => {
    const rows = [
      {
        label: 'EXPLAIN',
        attempts: 6,
        students: 1,
        avg_mark: 3,
        avg_band: 4,
        low_band_rate: 0,
        avg_mark_frac: 0.78,
      },
      {
        label: 'EVALUATE',
        attempts: 8,
        students: 1,
        avg_mark: 2,
        avg_band: 3,
        low_band_rate: 0,
        avg_mark_frac: 0.4,
      },
      {
        label: 'DESCRIBE',
        attempts: 2,
        students: 1,
        avg_mark: null,
        avg_band: 2,
        low_band_rate: 0,
        avg_mark_frac: null,
      },
    ] as unknown as Parameters<typeof verbHighlights>[0];

    const result = verbHighlights(rows);

    expect(result.weakest?.label).toBe('EVALUATE');
    expect(result.strongest?.label).toBe('EXPLAIN');
  });

  it('gives no strongest verb when only one verb can be measured', () => {
    const rows = [
      {
        label: 'EXPLAIN',
        attempts: 6,
        students: 1,
        avg_mark: 3,
        avg_band: 4,
        low_band_rate: 0,
        avg_mark_frac: 0.5,
      },
    ] as unknown as Parameters<typeof verbHighlights>[0];

    const result = verbHighlights(rows);

    expect(result.weakest?.label).toBe('EXPLAIN');
    expect(result.strongest).toBeNull();
  });

  it('lights the band segments an average has reached', () => {
    expect(bandsReached(4.3)).toEqual([true, true, true, true, false, false]);
    expect(bandsReached(null)).toEqual([false, false, false, false, false, false]);
  });

  it('words the band change, or nothing without two points', () => {
    expect(trendSentence([3, 4.5])).toBe('Band 3.0 to 4.5, up 1.5');
    expect(trendSentence([4, 3])).toBe('Band 4.0 to 3.0, down 1');
    expect(trendSentence([4])).toBe('');
  });
});

function fetchCalls(): unknown[][] {
  return guardian.fetchGuardianStudentProgress.mock.calls as unknown[][];
}
