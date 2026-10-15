import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import BillingIncidents from '../../components/admin/BillingIncidents';
import BillingOverviewDialog from '../../components/admin/BillingOverview';
import * as billingService from '../../services/billingOverviewService';
import type {
  BillingIncidentRow,
  BillingOverview,
  IncidentSummary,
} from '../../services/billingOverviewService';

/**
 * The open billing incidents on the Billing overview (schema §13, §29). The reads and the
 * resolve call are stubbed; the sorting and the counting are the real functions. Pinned
 * here: each kind has a plain label, a row leaves on a successful resolve, a failed resolve
 * says so and keeps the row, a database without the resolve function gets the re-apply
 * line instead of a button, and an open incident keeps the page from saying "Nothing needs
 * attention".
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({ authService: { updateUser: vi.fn() } }));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => true }));

vi.mock('../../services/billingOverviewService', async (importOriginal) => {
  const actual = await importOriginal<typeof billingService>();
  return {
    ...actual,
    loadBillingOverview: vi.fn(),
    resolveBillingIncident: vi.fn(),
  };
});

const NOW = new Date('2026-10-14T09:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

const resolve = vi.mocked(billingService.resolveBillingIncident);
const load = vi.mocked(billingService.loadBillingOverview);

const incident = (id: string, over: Partial<BillingIncidentRow> = {}): BillingIncidentRow => ({
  id,
  kind: 'dispute',
  user_id: 'user-1',
  school_id: null,
  subscription_ids: ['dp_1'],
  detail: 'Payment dispute dp_1 on charge ch_1: $49.00, reason fraudulent, status needs_response.',
  detected_at: daysAgo(3),
  schools: null,
  ...over,
});

const summaryOf = (rows: BillingIncidentRow[]): IncidentSummary =>
  billingService.summariseIncidents(rows, NOW);

beforeEach(() => {
  resolve.mockReset();
  load.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BillingIncidents: rows', () => {
  it('names each kind in plain words, with the school when there is one', () => {
    const rows = [
      incident('a', { kind: 'dispute', schools: { name: 'Hillcrest High School' } }),
      incident('b', { kind: 'refund', detail: 'Charge ch_9 was refunded in full.' }),
      incident('c', { kind: 'duplicate_subscription', detail: 'Two live subscriptions.' }),
      incident('d', { kind: 'duplicate_school_licence', detail: 'Both are billed.' }),
      incident('e', { kind: 'customer_mismatch', detail: 'Linked to another customer.' }),
    ];
    render(<BillingIncidents summary={summaryOf(rows)} error={null} />);

    expect(screen.getByText('Open billing incidents (5)')).toBeTruthy();
    expect(screen.getByText('Payment dispute · Hillcrest High School')).toBeTruthy();
    expect(screen.getByText('Full refund')).toBeTruthy();
    expect(screen.getByText('Duplicate subscription')).toBeTruthy();
    expect(screen.getByText('Duplicate school licence')).toBeTruthy();
    expect(screen.getByText('Customer mismatch')).toBeTruthy();
    expect(screen.getByText(rows[0].detail)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Mark resolved' })).toHaveLength(5);
  });

  it('says how long ago each incident was detected', () => {
    render(
      <BillingIncidents
        summary={summaryOf([incident('a', { detected_at: new Date().toISOString() })])}
        error={null}
      />
    );
    expect(screen.getByText('Detected today')).toBeTruthy();
  });

  it('shows nothing when there are no open incidents', () => {
    const { container } = render(<BillingIncidents summary={summaryOf([])} error={null} />);
    expect(container.textContent).toBe('');
  });

  it('says the incidents were not checked when they could not be read', () => {
    render(<BillingIncidents summary={null} error="Could not load billing incidents" />);
    expect(
      screen.getByText('Billing incidents were not checked: Could not load billing incidents.')
    ).toBeTruthy();
  });

  it('gives the resolve button and the note field a 44px touch target on a phone', () => {
    render(<BillingIncidents summary={summaryOf([incident('a')])} error={null} />);
    const button = screen.getByRole('button', { name: 'Mark resolved' });
    expect(button.className).toContain('min-h-[44px] sm:min-h-0');
    expect(screen.getByLabelText('Resolution note (optional)').className).toContain(
      'min-h-[44px] sm:min-h-0'
    );
  });
});

describe('BillingIncidents: resolving', () => {
  it('removes the row when the resolve succeeds, and tells the page which one', async () => {
    resolve.mockResolvedValueOnce(undefined);
    const onResolved = vi.fn();
    render(
      <BillingIncidents
        summary={summaryOf([incident('a'), incident('b', { kind: 'refund' })])}
        error={null}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark resolved' })[0]);

    await waitFor(() => expect(screen.queryByText('Payment dispute')).toBeNull());
    expect(resolve).toHaveBeenCalledWith('a', null);
    expect(onResolved).toHaveBeenCalledWith('a');
    expect(screen.getByText('Full refund')).toBeTruthy();
  });

  it('sends the trimmed note with the resolve call', async () => {
    resolve.mockResolvedValueOnce(undefined);
    render(<BillingIncidents summary={summaryOf([incident('a')])} error={null} />);

    fireEvent.change(screen.getByLabelText('Resolution note (optional)'), {
      target: { value: '  Refund issued in Stripe  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith('a', 'Refund issued in Stripe'));
  });

  it('keeps the row and says so in a sentence when the resolve fails', async () => {
    resolve.mockRejectedValueOnce(new Error('Incident not found or already resolved'));
    const onResolved = vi.fn();
    render(
      <BillingIncidents summary={summaryOf([incident('a')])} error={null} onResolved={onResolved} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));

    expect(
      await screen.findByText(
        'Could not mark this resolved: Incident not found or already resolved. It is still open.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeTruthy();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('replaces the button with the re-apply line when the resolve function is missing', async () => {
    resolve.mockRejectedValueOnce(
      new Error(
        'Could not find the function public.resolve_billing_incident(p_id, p_note) in the schema cache'
      )
    );
    render(<BillingIncidents summary={summaryOf([incident('a')])} error={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));

    expect(
      await screen.findByText('Re-apply the database schema to resolve incidents here.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull();
  });

  it('does not send a second resolve while one is in flight', async () => {
    let finish: () => void = () => {};
    resolve.mockImplementationOnce(() => new Promise<void>((done) => (finish = done)));
    render(<BillingIncidents summary={summaryOf([incident('a')])} error={null} />);

    const button = screen.getByRole('button', { name: 'Mark resolved' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(resolve).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByText('Payment dispute')).toBeNull());
  });
});

describe('the Billing overview: open incidents count as needing attention', () => {
  const overview = (over: Partial<BillingOverview> = {}): BillingOverview => ({
    asOf: NOW.toISOString(),
    stripeConfigured: true,
    subscriptions: billingService.summariseSubscriptions([], NOW),
    schools: [],
    schoolsError: null,
    requests: [],
    requestsError: null,
    webhook: { lastReceivedAt: daysAgo(1), daysSinceLast: 1, silent: false },
    recentEvents: [{ id: 'evt_1', type: 'charge.dispute.created', received_at: daysAgo(1) }],
    incidents: summaryOf([]),
    incidentsError: null,
    ...over,
  });

  const openDialog = async () => {
    render(<BillingOverviewDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Active now')).toBeTruthy());
  };

  it('lists an open incident and does not say nothing needs attention', async () => {
    load.mockResolvedValue(overview({ incidents: summaryOf([incident('a')]) }));
    await openDialog();

    expect(screen.getByText('Open billing incidents (1)')).toBeTruthy();
    expect(screen.queryByText(/Nothing needs attention/)).toBeNull();
  });

  it('drops a resolved row from the page tally at once', async () => {
    load.mockResolvedValue(overview({ incidents: summaryOf([incident('a')]) }));
    resolve.mockResolvedValueOnce(undefined);
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));

    await waitFor(() => expect(screen.getByText(/Nothing needs attention/)).toBeTruthy());
    expect(screen.queryByText('Open billing incidents (1)')).toBeNull();
  });

  it('does not claim nothing needs attention when the incidents could not be read', async () => {
    load.mockResolvedValue(
      overview({ incidents: null, incidentsError: 'Could not load billing incidents' })
    );
    await openDialog();

    expect(
      screen.getByText('Billing incidents were not checked: Could not load billing incidents.')
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing needs attention/)).toBeNull();
  });
});
