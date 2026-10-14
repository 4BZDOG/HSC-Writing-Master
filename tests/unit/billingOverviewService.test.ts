import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  summariseSubscriptions,
  summariseSchools,
  summariseWebhook,
  collectAttention,
  isMissingSchemaError,
  shortSubscriptionRef,
  loadBillingOverview,
  RENEWAL_GRACE_DAYS,
  STALLED_CHECKOUT_DAYS,
  WEBHOOK_SILENT_DAYS,
  type BillingSubscriptionRow,
  type BillingEventRow,
} from '../../services/billingOverviewService';
import type { SchoolRow } from '../../services/quotaService';
import * as supabaseClient from '../../services/supabaseClient';
import * as quotaService from '../../services/quotaService';

/**
 * The billing overview is the admin's only view of money, and nothing in it may
 * move a plan. These tests pin the counting and the "needs attention" rules as
 * pure functions, so each boundary (the 7-day window, the renewal grace, the
 * silence threshold) is checked without a database.
 */

const NOW = new Date('2026-10-14T09:00:00.000Z');
const DAY = 86_400_000;

/** An ISO timestamp `days` from NOW (negative = in the past). */
const at = (days: number): string => new Date(NOW.getTime() + days * DAY).toISOString();

const sub = (over: Partial<BillingSubscriptionRow> & { id: string }): BillingSubscriptionRow => ({
  status: 'active',
  plan: 'plus',
  seats: 1,
  current_period_end: at(20),
  cancel_at_period_end: false,
  updated_at: at(-1),
  last_event_at: at(-1),
  ...over,
});

const school = (over: Partial<SchoolRow> & { name: string }): SchoolRow => ({
  id: over.name,
  daily_ai_limit: null,
  members: 0,
  used_today: 0,
  plan_status: 'active',
  plan_seats: 30,
  plan_period_end: at(40),
  plan_cancel_at_period_end: false,
  ...over,
});

describe('summariseSubscriptions: what is paying now', () => {
  it('counts live subscriptions by plan and seats, and leaves out lapsed ones', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_plus_1' }),
        sub({ id: 'sub_plus_2', status: 'trialing' }),
        sub({ id: 'sub_school', plan: 'school', seats: 30 }),
        sub({ id: 'sub_gone', status: 'canceled' }),
        sub({ id: 'sub_expired', status: 'incomplete_expired' }),
      ],
      NOW
    );

    expect(summary.live.total).toBe(3);
    expect(summary.live.byPlan).toEqual({ plus: 2, school: 1, other: 0 });
    expect(summary.live.seatsByPlan).toEqual({ plus: 2, school: 30, other: 0 });
    expect(summary.live.seats).toBe(32);
  });

  it('counts a past-due subscription as paying, and says it is in grace', () => {
    const summary = summariseSubscriptions([sub({ id: 'sub_a', status: 'past_due' })], NOW);

    expect(summary.live.total).toBe(1);
    expect(summary.live.pastDue).toBe(1);
  });

  it('counts subscriptions set to end at the period boundary', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_cancelling', cancel_at_period_end: true }),
        sub({ id: 'sub_renewing' }),
        // Not live, so not counted as an ending licence either.
        sub({ id: 'sub_done', status: 'canceled', cancel_at_period_end: true }),
      ],
      NOW
    );

    expect(summary.live.endingAtPeriodEnd).toBe(1);
  });

  it('buckets an unknown plan as other rather than dropping it', () => {
    const summary = summariseSubscriptions([sub({ id: 'sub_odd', plan: 'free' })], NOW);

    expect(summary.live.byPlan.other).toBe(1);
    expect(summary.live.total).toBe(1);
  });

  it('reports an empty table as zero everywhere, with nothing to attend to', () => {
    const summary = summariseSubscriptions([], NOW);

    expect(summary.live.total).toBe(0);
    expect(summary.attention).toEqual([]);
    expect(summary.upcoming.list).toEqual([]);
    expect(summary.upcoming.next7).toEqual({ renews: 0, ends: 0 });
  });
});

describe('summariseSubscriptions: needs attention', () => {
  it('flags unpaid at any age, since the webhook recorded the change', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_unpaid', status: 'unpaid', last_event_at: at(-5) })],
      NOW
    );

    expect(summary.attention).toEqual([
      {
        kind: 'unpaid',
        ref: shortSubscriptionRef('sub_unpaid'),
        plan: 'plus',
        seats: 1,
        since: at(-5),
        days: 5,
      },
    ]);
  });

  it('flags past_due and measures it from the last webhook update', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_pd', status: 'past_due', last_event_at: at(-3), updated_at: at(-9) })],
      NOW
    );

    expect(summary.attention).toHaveLength(1);
    expect(summary.attention[0]).toMatchObject({ kind: 'past_due', since: at(-3), days: 3 });
  });

  it('falls back to updated_at for past_due when no event time was stored', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_pd', status: 'past_due', last_event_at: null, updated_at: at(-2) })],
      NOW
    );

    expect(summary.attention[0]).toMatchObject({ since: at(-2), days: 2 });
  });

  it('still flags past_due with no timestamp at all, and says the age is unknown', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_pd', status: 'past_due', last_event_at: null, updated_at: null })],
      NOW
    );

    expect(summary.attention).toHaveLength(1);
    expect(summary.attention[0]).toMatchObject({ since: null, days: null });
  });

  it('flags an incomplete checkout only once it is older than the stall threshold', () => {
    const fresh = summariseSubscriptions(
      [sub({ id: 'sub_fresh', status: 'incomplete', last_event_at: at(-0.5) })],
      NOW
    );
    const stalled = summariseSubscriptions(
      [
        sub({
          id: 'sub_stalled',
          status: 'incomplete',
          last_event_at: at(-STALLED_CHECKOUT_DAYS - 1),
        }),
      ],
      NOW
    );

    expect(fresh.attention).toEqual([]);
    expect(stalled.attention).toHaveLength(1);
    expect(stalled.attention[0].kind).toBe('incomplete');
  });

  it('does not call an incomplete checkout stalled when its age is unknown', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_x', status: 'incomplete', last_event_at: null, updated_at: null })],
      NOW
    );

    expect(summary.attention).toEqual([]);
  });

  it('flags an active renewal once the period has been over for longer than the grace', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_late', current_period_end: at(-(RENEWAL_GRACE_DAYS + 1)) })],
      NOW
    );

    expect(summary.attention).toHaveLength(1);
    expect(summary.attention[0]).toMatchObject({
      kind: 'renewal_overdue',
      since: at(-(RENEWAL_GRACE_DAYS + 1)),
      days: RENEWAL_GRACE_DAYS + 1,
    });
  });

  it('does not flag a renewal that is late but still inside the grace', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_just_late', current_period_end: at(-(RENEWAL_GRACE_DAYS - 1)) })],
      NOW
    );

    expect(summary.attention).toEqual([]);
  });

  it('flags a trial whose end has passed without the webhook converting it', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_trial', status: 'trialing', current_period_end: at(-10) })],
      NOW
    );

    expect(summary.attention[0]).toMatchObject({ kind: 'renewal_overdue' });
  });

  it('does not flag a past_due row as overdue (it is already flagged as past due)', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_pd', status: 'past_due', current_period_end: at(-10) })],
      NOW
    );

    expect(summary.attention.map((a) => a.kind)).toEqual(['past_due']);
  });

  it('orders the list most serious first, then longest-standing within a kind', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_pd_recent', status: 'past_due', last_event_at: at(-1) }),
        sub({ id: 'sub_pd_old', status: 'past_due', last_event_at: at(-6) }),
        sub({ id: 'sub_unpaid', status: 'unpaid', last_event_at: at(-2) }),
        sub({ id: 'sub_overdue', current_period_end: at(-9) }),
        sub({ id: 'sub_stalled', status: 'incomplete', last_event_at: at(-3) }),
      ],
      NOW
    );

    expect(summary.attention.map((a) => [a.kind, a.days])).toEqual([
      ['unpaid', 2],
      ['renewal_overdue', 9],
      ['past_due', 6],
      ['past_due', 1],
      ['incomplete', 3],
    ]);
  });
});

describe('summariseSubscriptions: coming up', () => {
  it('splits renewals and endings into the next 7 and the next 30 days', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_renew_3d', current_period_end: at(3) }),
        sub({ id: 'sub_end_5d', current_period_end: at(5), cancel_at_period_end: true }),
        sub({ id: 'sub_renew_20d', current_period_end: at(20) }),
        sub({ id: 'sub_end_25d', current_period_end: at(25), cancel_at_period_end: true }),
      ],
      NOW
    );

    expect(summary.upcoming.next7).toEqual({ renews: 1, ends: 1 });
    expect(summary.upcoming.next30).toEqual({ renews: 2, ends: 2 });
  });

  it('includes a period ending exactly 7 days out in the 7-day window, and 30 in the 30', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_7', current_period_end: at(7) }),
        sub({ id: 'sub_30', current_period_end: at(30) }),
        sub({ id: 'sub_31', current_period_end: at(31) }),
      ],
      NOW
    );

    expect(summary.upcoming.next7).toEqual({ renews: 1, ends: 0 });
    expect(summary.upcoming.next30).toEqual({ renews: 2, ends: 0 });
    expect(summary.upcoming.list.map((u) => u.daysUntil)).toEqual([7, 30]);
  });

  it('lists soonest first, with whole days until each', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_later', current_period_end: at(12.6) }),
        sub({ id: 'sub_sooner', current_period_end: at(2.2), plan: 'school', seats: 30 }),
      ],
      NOW
    );

    expect(summary.upcoming.list).toMatchObject([
      { plan: 'school', seats: 30, daysUntil: 2, willEnd: false },
      { plan: 'plus', daysUntil: 12, willEnd: false },
    ]);
  });

  it('leaves out past periods (those are attention, not coming up) and non-live rows', () => {
    const summary = summariseSubscriptions(
      [
        sub({ id: 'sub_past', current_period_end: at(-1) }),
        sub({ id: 'sub_unpaid', status: 'unpaid', current_period_end: at(4) }),
      ],
      NOW
    );

    expect(summary.upcoming.list).toEqual([]);
  });

  it('marks a cancelling subscription as ending, not renewing', () => {
    const summary = summariseSubscriptions(
      [sub({ id: 'sub_end', current_period_end: at(4), cancel_at_period_end: true })],
      NOW
    );

    expect(summary.upcoming.list[0].willEnd).toBe(true);
    expect(summary.upcoming.next7).toEqual({ renews: 0, ends: 1 });
  });
});

describe('summariseSchools: seats against members', () => {
  it('reports a live licence with more members than seats, most over first', () => {
    const issues = summariseSchools([
      school({ name: 'Hillcrest', members: 34, plan_seats: 30 }),
      school({ name: 'Ridgeway', members: 61, plan_seats: 30 }),
      school({ name: 'Within', members: 30, plan_seats: 30 }),
    ]);

    expect(issues).toEqual([
      { name: 'Ridgeway', members: 61, seats: 30 },
      { name: 'Hillcrest', members: 34, seats: 30 },
    ]);
  });

  it('ignores a lapsed licence, whatever its member count', () => {
    const issues = summariseSchools([
      school({ name: 'Lapsed', members: 50, plan_seats: 30, plan_status: 'canceled' }),
      school({ name: 'Never', members: 50, plan_seats: 30, plan_status: 'none' }),
    ]);

    expect(issues).toEqual([]);
  });

  it('ignores a school with no seats bought, since there is nothing to exceed', () => {
    const issues = summariseSchools([school({ name: 'Free', members: 12, plan_seats: 0 })]);

    expect(issues).toEqual([]);
  });
});

describe('summariseWebhook: is Stripe still reaching us', () => {
  it('is silent when paid subscriptions exist and nothing has ever been recorded', () => {
    expect(summariseWebhook([], 3, NOW)).toEqual({
      lastReceivedAt: null,
      daysSinceLast: null,
      silent: true,
    });
  });

  it('is not silent when nothing has been recorded but no one is paying', () => {
    expect(summariseWebhook([], 0, NOW).silent).toBe(false);
  });

  it('is not silent after a recent event', () => {
    const summary = summariseWebhook(
      [{ id: 'evt_1', type: 'invoice.payment_failed', received_at: at(-2) }],
      3,
      NOW
    );

    expect(summary).toEqual({ lastReceivedAt: at(-2), daysSinceLast: 2, silent: false });
  });

  it('stays quiet just inside the threshold and speaks at it', () => {
    const event = (days: number): BillingEventRow[] => [
      { id: 'evt', type: 'customer.subscription.updated', received_at: at(-days) },
    ];

    expect(summariseWebhook(event(WEBHOOK_SILENT_DAYS - 1), 3, NOW).silent).toBe(false);
    expect(summariseWebhook(event(WEBHOOK_SILENT_DAYS), 3, NOW).silent).toBe(true);
  });

  it('takes the newest event even when the page arrives out of order', () => {
    const summary = summariseWebhook(
      [
        { id: 'evt_old', type: 'a', received_at: at(-30) },
        { id: 'evt_new', type: 'b', received_at: at(-1) },
        { id: 'evt_mid', type: 'c', received_at: at(-7) },
      ],
      1,
      NOW
    );

    expect(summary.lastReceivedAt).toBe(at(-1));
    expect(summary.daysSinceLast).toBe(1);
  });

  it('is not silent when the last event is old but no one is paying any more', () => {
    const summary = summariseWebhook([{ id: 'evt', type: 'a', received_at: at(-200) }], 0, NOW);

    expect(summary.silent).toBe(false);
  });
});

describe('collectAttention: the order the admin reads it in', () => {
  it('lists subscriptions, then schools, then the webhook, and only when it is silent', () => {
    const overview = {
      subscriptions: summariseSubscriptions(
        [sub({ id: 'sub_pd', status: 'past_due', last_event_at: at(-2) })],
        NOW
      ),
      schools: [{ name: 'Hillcrest', members: 34, seats: 30 }],
      webhook: summariseWebhook([], 1, NOW),
    };

    expect(collectAttention(overview).map((i) => i.type)).toEqual([
      'subscription',
      'school',
      'webhook',
    ]);
  });

  it('is empty for a healthy product', () => {
    const overview = {
      subscriptions: summariseSubscriptions([sub({ id: 'sub_ok' })], NOW),
      schools: [],
      webhook: summariseWebhook([{ id: 'evt', type: 'a', received_at: at(-1) }], 1, NOW),
    };

    expect(collectAttention(overview)).toEqual([]);
  });

  it('does not invent school items when the seat check could not run', () => {
    const overview = {
      subscriptions: summariseSubscriptions([], NOW),
      schools: null,
      webhook: summariseWebhook([], 0, NOW),
    };

    expect(collectAttention(overview)).toEqual([]);
  });
});

describe('small helpers', () => {
  it('shortens a Stripe id to something findable in Stripe and not a secret', () => {
    expect(shortSubscriptionRef('sub_1Nabcdefghijk123456')).toBe('sub_…123456');
    expect(shortSubscriptionRef('sub_1')).toBe('sub_1');
  });

  it('recognises a missing table from PostgREST and Postgres wording', () => {
    expect(
      isMissingSchemaError(
        "Could not load subscriptions: Could not find the table 'public.subscriptions' in the schema cache"
      )
    ).toBe(true);
    expect(
      isMissingSchemaError(
        'Could not load webhook events: relation "public.stripe_events" does not exist'
      )
    ).toBe(true);
    expect(isMissingSchemaError('JWT expired')).toBe(false);
  });
});

/**
 * The loader is exercised with a stub client: it must page the subscription read
 * (not stop at PostgREST's first 1000 rows), keep the webhook and school failures
 * apart, and never reach Stripe.
 */
const eventsResult = vi.hoisted(() => ({
  value: { data: [] as unknown[], error: null as { message: string } | null },
}));

vi.mock('../../services/supabaseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/supabaseClient')>();
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(eventsResult.value),
  };
  return {
    ...actual,
    supabase: { from: () => chain },
    fetchAllRows: vi.fn(),
  };
});

vi.mock('../../services/quotaService', async (importOriginal) => {
  const actual = await importOriginal<typeof quotaService>();
  return { ...actual, fetchSchools: vi.fn() };
});

describe('loadBillingOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventsResult.value = { data: [], error: null };
  });

  it('summarises the rows it reads and reports a healthy overview', async () => {
    vi.mocked(supabaseClient.fetchAllRows).mockResolvedValue([sub({ id: 'sub_ok' })]);
    eventsResult.value = {
      data: [{ id: 'evt_1', type: 'customer.subscription.updated', received_at: at(-1) }],
      error: null,
    };
    vi.mocked(quotaService.fetchSchools).mockResolvedValue([]);

    const overview = await loadBillingOverview(NOW);

    expect(overview.asOf).toBe(NOW.toISOString());
    expect(overview.subscriptions.live.total).toBe(1);
    expect(overview.webhook.silent).toBe(false);
    expect(overview.schools).toEqual([]);
    expect(overview.schoolsError).toBeNull();
    expect(overview.recentEvents).toHaveLength(1);
  });

  it('reads subscriptions through fetchAllRows, the paged reader, not a single capped select', async () => {
    vi.mocked(supabaseClient.fetchAllRows).mockResolvedValue([]);
    vi.mocked(quotaService.fetchSchools).mockResolvedValue([]);

    await loadBillingOverview(NOW);

    expect(supabaseClient.fetchAllRows).toHaveBeenCalledTimes(1);
    expect(vi.mocked(supabaseClient.fetchAllRows).mock.calls[0][1]).toBe(
      'Could not load subscriptions'
    );
  });

  it('fails the whole load when the webhook ledger cannot be read', async () => {
    vi.mocked(supabaseClient.fetchAllRows).mockResolvedValue([]);
    vi.mocked(quotaService.fetchSchools).mockResolvedValue([]);
    eventsResult.value = {
      data: [],
      error: { message: 'relation "public.stripe_events" does not exist' },
    };

    await expect(loadBillingOverview(NOW)).rejects.toThrow(/stripe_events/);
  });

  it('keeps the rest of the overview when only the school seat check fails', async () => {
    vi.mocked(supabaseClient.fetchAllRows).mockResolvedValue([sub({ id: 'sub_ok' })]);
    vi.mocked(quotaService.fetchSchools).mockRejectedValue(
      new Error('Could not load schools: function list_schools() does not exist')
    );

    const overview = await loadBillingOverview(NOW);

    expect(overview.schools).toBeNull();
    expect(overview.schoolsError).toMatch(/list_schools/);
    expect(overview.subscriptions.live.total).toBe(1);
  });

  it('reports Stripe as not configured in a build with no price IDs', async () => {
    vi.mocked(supabaseClient.fetchAllRows).mockResolvedValue([]);
    vi.mocked(quotaService.fetchSchools).mockResolvedValue([]);

    const overview = await loadBillingOverview(NOW);

    expect(overview.stripeConfigured).toBe(false);
  });
});
