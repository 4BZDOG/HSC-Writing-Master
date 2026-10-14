import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import BillingOverviewDialog from '../../components/admin/BillingOverview';
import AppHeader from '../../components/AppHeader';
import * as billingService from '../../services/billingOverviewService';
import type { BillingOverview } from '../../services/billingOverviewService';
import type { StorageStatus } from '../../utils/storageUtils';
import type { User, UserRole } from '../../types';

/**
 * The Billing overview is read-only, so what matters is that each state says the
 * true thing: healthy is not "all clear" when a check did not run, an empty table
 * says how to fill it, and a missing migration names the migration. The reads are
 * stubbed here; the counting is covered by billingOverviewService.test.ts.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({ authService: { updateUser: vi.fn() } }));

/** A mutable flag, so one test can run the local build without a second module mock. */
const { remote } = vi.hoisted(() => ({ remote: { value: true } }));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => remote.value }));

vi.mock('../../services/billingOverviewService', async (importOriginal) => {
  const actual = await importOriginal<typeof billingService>();
  return { ...actual, loadBillingOverview: vi.fn() };
});

const NOW = new Date('2026-10-14T09:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number): string => new Date(NOW.getTime() + days * DAY).toISOString();

const sub = (over: Partial<billingService.BillingSubscriptionRow> & { id: string }) => ({
  status: 'active',
  plan: 'plus',
  seats: 1,
  current_period_end: at(20),
  cancel_at_period_end: false,
  updated_at: at(-1),
  last_event_at: at(-1),
  ...over,
});

/** A real summary built from fixture rows, so the dialog sees what the service would give it. */
const overviewFrom = (
  rows: billingService.BillingSubscriptionRow[],
  over: Partial<BillingOverview> = {}
): BillingOverview => ({
  asOf: NOW.toISOString(),
  stripeConfigured: true,
  subscriptions: billingService.summariseSubscriptions(rows, NOW),
  schools: [],
  schoolsError: null,
  requests: [],
  requestsError: null,
  webhook: { lastReceivedAt: at(-1), daysSinceLast: 1, silent: false },
  recentEvents: [{ id: 'evt_1', type: 'customer.subscription.updated', received_at: at(-1) }],
  ...over,
});

const healthy = () =>
  overviewFrom([
    sub({ id: 'sub_plus_1' }),
    sub({ id: 'sub_plus_2' }),
    sub({
      id: 'sub_school',
      plan: 'school',
      seats: 30,
      current_period_end: at(5),
      cancel_at_period_end: true,
    }),
  ]);

const load = vi.mocked(billingService.loadBillingOverview);
const onClose = vi.fn();

const openDialog = async () => {
  render(<BillingOverviewDialog isOpen={true} onClose={onClose} />);
  await waitFor(() => expect(screen.getByText('Active now')).toBeTruthy());
};

/** A stat tile's value, read by its label (label and value share one tile). */
const tileValue = (label: string): string | null =>
  screen.getByText(label).parentElement?.querySelector('.text-2xl')?.textContent ?? null;

beforeEach(() => {
  load.mockReset();
  remote.value = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BillingOverview: a healthy product', () => {
  it('shows the paying counts, the seats and what ends, from the summary', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    expect(tileValue('Subscriptions')).toBe('3');
    expect(tileValue('Paid seats')).toBe('32');
    expect(tileValue('Ending')).toBe('1');
    expect(tileValue('Past due')).toBe('0');
    expect(screen.getByText('2 Plus, 1 school licence')).toBeTruthy();
  });

  it('says nothing needs attention, and names the checks that were actually made', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    expect(
      screen.getByText(
        /Nothing needs attention\. No payment is failing, no renewal is overdue, and no school is over its seats\./
      )
    ).toBeTruthy();
  });

  it('does not claim the school check passed when it could not run', async () => {
    load.mockResolvedValue({
      ...healthy(),
      schools: null,
      schoolsError: 'Could not load schools: list_schools missing',
    });
    await openDialog();

    expect(
      screen.getByText(/Nothing needs attention\. No payment is failing, no renewal is overdue\./)
    ).toBeTruthy();
    expect(screen.queryByText(/no school is over its seats/)).toBeNull();
    expect(screen.getByText(/School seats were not checked: Could not load schools/)).toBeTruthy();
  });

  it('lists the coming renewals and endings, with the window counts', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    // The label is a span inside the line, so read the line it sits in.
    const windowLine = (label: RegExp): string | null | undefined =>
      screen.getByText(label).parentElement?.textContent;
    // Two Plus renewals fall in 30 days (at 20 days out), and only the school
    // licence ends, at 5 days out, which is inside the 7-day window too.
    expect(windowLine(/Next 7 days:/)).toContain('0 renewing, 1 ending.');
    expect(windowLine(/Next 30 days:/)).toContain('2 renewing, 1 ending.');
    expect(screen.getByText('Ends', { exact: true })).toBeTruthy();
  });
});

describe('BillingOverview: needs attention', () => {
  it('leads with each subscription that needs a decision, in plain words, with a Stripe reference', async () => {
    load.mockResolvedValue(
      overviewFrom([
        sub({ id: 'sub_pd_abcdef123456', status: 'past_due', last_event_at: at(-3) }),
        sub({ id: 'sub_unpaid_abcdef654321', status: 'unpaid', last_event_at: at(-6) }),
      ])
    );
    await openDialog();

    expect(screen.getByText('Unpaid · Band 6 Plus')).toBeTruthy();
    expect(screen.getByText('Payment failing · Band 6 Plus')).toBeTruthy();
    expect(screen.getByText(/Last webhook update 3 days ago\./)).toBeTruthy();
    expect(screen.getByText('Subscription sub_…654321')).toBeTruthy();
    // Unpaid is the most serious, so it reads first.
    const titles = screen.getAllByText(/Unpaid · |Payment failing · /).map((n) => n.textContent);
    expect(titles).toEqual(['Unpaid · Band 6 Plus', 'Payment failing · Band 6 Plus']);
  });

  it('says a past-due access continues while Stripe retries', async () => {
    load.mockResolvedValue(
      overviewFrom([sub({ id: 'sub_pd', status: 'past_due', last_event_at: at(-1) })])
    );
    await openDialog();

    expect(screen.getByText(/Stripe is still retrying, so access continues/)).toBeTruthy();
  });

  it('lists an over-seat school with members against seats', async () => {
    load.mockResolvedValue(
      overviewFrom([], { schools: [{ name: 'Hillcrest High', members: 34, seats: 30 }] })
    );
    await openDialog();

    expect(screen.getByText('Over seats · Hillcrest High')).toBeTruthy();
    expect(screen.getByText(/34 members against 30 seats/)).toBeTruthy();
  });

  it('says the webhook is quiet, and that quiet is normal on annual plans', async () => {
    load.mockResolvedValue(
      overviewFrom([sub({ id: 'sub_a' })], {
        webhook: { lastReceivedAt: at(-50), daysSinceLast: 50, silent: true },
        recentEvents: [],
      })
    );
    await openDialog();

    expect(screen.getByText('Webhook quiet')).toBeTruthy();
    expect(screen.getByText(/Nothing has reached the webhook for 50 days/)).toBeTruthy();
    expect(screen.getByText(/Quiet is normal on annual plans/)).toBeTruthy();
  });

  it('says so plainly when no event has ever been recorded', async () => {
    load.mockResolvedValue(
      overviewFrom([sub({ id: 'sub_a' })], {
        webhook: { lastReceivedAt: null, daysSinceLast: null, silent: true },
        recentEvents: [],
      })
    );
    await openDialog();

    expect(
      screen.getByText(/No Stripe event has been recorded, but paid subscriptions exist/)
    ).toBeTruthy();
  });
});

describe('BillingOverview: honest empty and absent states', () => {
  it('tells an empty table how to fill it and says nothing is coming up', async () => {
    load.mockResolvedValue(
      overviewFrom([], {
        recentEvents: [],
        webhook: { lastReceivedAt: null, daysSinceLast: null, silent: false },
      })
    );
    await openDialog();

    expect(
      screen.getByText(/No paying subscriptions yet\. They appear here once a checkout completes\./)
    ).toBeTruthy();
    expect(screen.getByText('Nothing renews or ends in the next 30 days.')).toBeTruthy();
    expect(screen.getByText('No events recorded yet.')).toBeTruthy();
  });

  it('says Stripe is not configured in this build, without hiding what the database holds', async () => {
    load.mockResolvedValue(overviewFrom([sub({ id: 'sub_a' })], { stripeConfigured: false }));
    await openDialog();

    expect(screen.getByText(/Stripe is not configured in this build/)).toBeTruthy();
    expect(tileValue('Subscriptions')).toBe('1');
  });

  it('names the migration when the billing tables are missing', async () => {
    load.mockRejectedValue(
      new Error(
        "Could not load subscriptions: Could not find the table 'public.subscriptions' in the schema cache"
      )
    );
    render(<BillingOverviewDialog isOpen={true} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByText('The billing tables are not in this database yet.')).toBeTruthy()
    );
    expect(screen.getByText(/schema\.sql \(§13\)/)).toBeTruthy();
  });

  it('offers a retry on an ordinary failure, and recovers when it succeeds', async () => {
    load.mockRejectedValueOnce(new Error('Could not load webhook events: network unreachable'));
    load.mockResolvedValueOnce(healthy());
    render(<BillingOverviewDialog isOpen={true} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText('Could not load billing data.')).toBeTruthy());
    expect(screen.getByText(/network unreachable/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Active now')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the last figures and says so when a refresh fails', async () => {
    load.mockResolvedValueOnce(healthy());
    load.mockRejectedValueOnce(new Error('Could not load subscriptions: timeout'));
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('timeout'));
    expect(tileValue('Subscriptions')).toBe('3');
  });

  it('does not read anything in a local build with no Supabase', () => {
    remote.value = false;
    render(<BillingOverviewDialog isOpen={true} onClose={onClose} />);

    expect(screen.getByText('Billing needs Supabase.')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('BillingOverview: the dialog itself', () => {
  it('is a modal dialog with a name, and has a close control at least 44px square', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    const dialog = screen.getByRole('dialog', { name: 'Billing overview' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close' });
    // w-11 h-11 on phones, which is 44px.
    expect(close.className).toContain('w-11 h-11');
  });

  it('closes from the close button, from Escape, and from a press on the scrim', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not read until it is opened', () => {
    render(<BillingOverviewDialog isOpen={false} onClose={onClose} />);

    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never presents a money figure', async () => {
    load.mockResolvedValue(healthy());
    await openDialog();

    expect(screen.queryByText(/A\$|\$\d/)).toBeNull();
    expect(screen.getByText(/Revenue is not shown\./)).toBeTruthy();
  });
});

/**
 * Reachability, the failure the header tests cannot see on their own: the item
 * must open the dialog, and the dialog must be mounted for the admin who can open
 * it. Pinned here from both ends.
 */
describe('the Billing overview is reachable from the admin tools', () => {
  const makeUser = (role: UserRole): User => ({
    username: 'alex@example.com',
    role,
    displayName: 'Alex',
    preferences: {
      defaultFocusMode: false,
      autoSave: true,
      highContrast: false,
      showTips: true,
      theme: 'dark',
    },
    stats: {
      xp: 0,
      level: 1,
      questionsAnswered: 0,
      totalWordsWritten: 0,
      averageBand: 0,
      lastActive: Date.now(),
      streakDays: 0,
    },
  });

  const renderHeader = (role: UserRole, openModal = vi.fn()) =>
    render(
      <AppHeader
        user={makeUser(role)}
        onUpdateUser={vi.fn()}
        storageStatus={'IndexedDB' as StorageStatus}
        openModal={openModal}
        onOpenAudit={vi.fn()}
        onOpenReviewQueue={vi.fn()}
        onOpenClassInsights={vi.fn()}
        onOpenStudentProgress={vi.fn()}
        onOpenUsageDashboard={vi.fn()}
        onOpenRuntimeKeys={vi.fn()}
      />
    );

  const openTools = (): void => {
    fireEvent.click(screen.getByRole('button', { name: /(admin|teaching) tools/i }));
  };

  const ITEM = 'Billing Overview (subscriptions, renewals, webhook)';

  it('opens the overview from the admin menu, and closes the menu it was chosen from', () => {
    const openModal = vi.fn();
    renderHeader('admin', openModal);
    openTools();

    fireEvent.click(screen.getByLabelText(ITEM));

    expect(openModal).toHaveBeenCalledWith('billingOverview');
    expect(screen.queryByRole('dialog', { name: /Admin tools/i })).toBeNull();
  });

  it('offers a teacher no route to it', () => {
    renderHeader('teacher');
    openTools();

    expect(screen.queryByLabelText(ITEM)).toBeNull();
  });

  it('is mounted lazily and only for a system admin, the same way as the Database Manager', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'AppModals.tsx'), 'utf8');

    expect(src).toMatch(
      /const BillingOverview = lazy\(\(\) => import\('\.\/admin\/BillingOverview'\)\)/
    );
    expect(src).toMatch(
      /isSystemAdmin\(user\.role\) && \(\s*<Suspense[\s\S]*?<BillingOverview[\s\S]*?isModalOpen\('billingOverview'\)/
    );
  });
});
