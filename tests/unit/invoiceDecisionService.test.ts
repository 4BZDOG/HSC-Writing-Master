import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  outcomeFromResponse,
  decideInvoiceRequest,
  actionsAfter,
  invoiceRequestRows,
  keepSettled,
  describeApproval,
  DUE_DAY_CHOICES,
  DEFAULT_DUE_DAYS,
  DECISION_NOTE_MAX,
  type DecidedInvoiceRequest,
} from '../../services/invoiceDecisionService';
import type { InvoiceRequestSummary } from '../../services/billingOverviewService';
import { INVOICE_DUE_DAYS, INVOICE_LIMITS } from '../../api/_lib/schoolLicence';

/**
 * The approval call moves money, so these tests pin the rule the screen depends
 * on: an answer that names a Stripe subscription, or no clear answer at all, is
 * never read as "refused, so approve again". No network is touched; fetch is
 * stubbed and the Supabase client is absent.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

const approvedBody = (over: Record<string, unknown> = {}) => ({
  request: { id: 'req_1', status: 'approved' },
  subscriptionId: 'sub_1Nabcdefghijk123456',
  hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/inv_1',
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('outcomeFromResponse: what the screen is allowed to say', () => {
  it('reads a successful approval as approved, with the subscription and the invoice link', () => {
    expect(outcomeFromResponse('approve', 200, approvedBody())).toEqual({
      kind: 'approved',
      subscriptionId: 'sub_1Nabcdefghijk123456',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/inv_1',
    });
  });

  it('keeps an approval with no invoice link, rather than inventing one', () => {
    expect(
      outcomeFromResponse('approve', 200, approvedBody({ hostedInvoiceUrl: undefined }))
    ).toMatchObject({ kind: 'approved', hostedInvoiceUrl: null });
  });

  it('reads a successful decline as declined', () => {
    expect(
      outcomeFromResponse('decline', 200, { request: { id: 'req_1', status: 'declined' } })
    ).toEqual({ kind: 'declined' });
  });

  it('refuses to call a 200 approved unless the body says the request is approved', () => {
    expect(outcomeFromResponse('approve', 200, { request: { status: 'pending' } }).kind).toBe(
      'unknown'
    );
    expect(outcomeFromResponse('decline', 200, approvedBody()).kind).toBe('unknown');
  });

  it('shows a refusal verbatim, with no subscription, so the admin may try again', () => {
    expect(
      outcomeFromResponse('approve', 409, {
        error:
          'The school already holds a live licence, so this invoice would pay for seats twice.',
      })
    ).toEqual({
      kind: 'refused',
      error: 'The school already holds a live licence, so this invoice would pay for seats twice.',
      subscriptionId: null,
    });
  });

  it('keeps the subscription id on a partial failure, so the screen can withhold a second approval', () => {
    expect(
      outcomeFromResponse('approve', 502, {
        error: 'Stripe created the subscription, but the invoice could not be sent.',
        subscriptionId: 'sub_1Nabcdefghijk123456',
      })
    ).toEqual({
      kind: 'refused',
      error: 'Stripe created the subscription, but the invoice could not be sent.',
      subscriptionId: 'sub_1Nabcdefghijk123456',
    });
  });

  it('treats a body that is not the server JSON as unknown, because the server may have acted', () => {
    // A gateway timeout arrives as an HTML page, which the caller parses to null.
    expect(outcomeFromResponse('approve', 504, null).kind).toBe('unknown');
    expect(outcomeFromResponse('approve', 500, { error: '   ' }).kind).toBe('unknown');
  });

  it('treats a success that is not the expected shape as unknown', () => {
    expect(outcomeFromResponse('approve', 200, undefined).kind).toBe('unknown');
  });
});

describe('decideInvoiceRequest: one call, never a throw', () => {
  it('posts the approval with the chosen payment terms and returns the outcome', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(approvedBody()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await decideInvoiceRequest('req_1', {
      action: 'approve',
      daysUntilDue: 45,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/issue-invoice',
      expect.objectContaining({ method: 'POST' })
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ requestId: 'req_1', action: 'approve', daysUntilDue: 45 });
    expect(outcome.kind).toBe('approved');
  });

  it('posts a decline with its note, and sends no payment terms', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ request: { status: 'declined' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    await decideInvoiceRequest('req_1', { action: 'decline', decisionNote: 'Use the other form.' });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({
      requestId: 'req_1',
      action: 'decline',
      decisionNote: 'Use the other form.',
    });
  });

  it('answers unknown, rather than throwing, when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const outcome = await decideInvoiceRequest('req_1', { action: 'approve', daysUntilDue: 30 });

    expect(outcome.kind).toBe('unknown');
    expect(outcome.kind === 'unknown' && outcome.error).toMatch(/not known whether/);
  });
});

describe('actionsAfter: what a card may still offer', () => {
  it('offers both actions before any answer, and after a plain refusal', () => {
    expect(actionsAfter(null)).toEqual({ approve: true, decline: true });
    expect(actionsAfter({ kind: 'refused', error: 'Try again.', subscriptionId: null })).toEqual({
      approve: true,
      decline: true,
    });
  });

  it('withdraws Approve after a partial failure, but keeps Decline, which the server guards', () => {
    expect(
      actionsAfter({
        kind: 'refused',
        error: 'Stripe holds a subscription.',
        subscriptionId: 'sub_1',
      })
    ).toEqual({ approve: false, decline: true });
  });

  it('withdraws both after an unknown answer', () => {
    expect(actionsAfter({ kind: 'unknown', error: 'Not known.' })).toEqual({
      approve: false,
      decline: false,
    });
  });
});

describe('the rows the queue shows after decisions', () => {
  const req = (id: string, over: Partial<InvoiceRequestSummary> = {}): InvoiceRequestSummary => ({
    id,
    schoolName: `School ${id}`,
    seats: 30,
    billingName: 'Accounts',
    billingEmail: 'accounts@school.nsw.edu.au',
    billingAddress: '1 Main Street, Parramatta NSW 2150',
    abn: null,
    poNumber: null,
    note: null,
    requestedAt: '2026-10-12T09:00:00+11:00',
    workingDaysWaited: 0,
    overdue: false,
    subscriptionId: null,
    ...over,
  });

  it('keeps each pending request in place, with the outcome this window has for it', () => {
    const decided: Record<string, DecidedInvoiceRequest> = {
      b: { request: req('b'), outcome: { kind: 'declined' } },
    };
    const rows = invoiceRequestRows([req('a'), req('b')], decided);

    expect(rows.map((r) => [r.request.id, r.outcome?.kind ?? null])).toEqual([
      ['a', null],
      ['b', 'declined'],
    ]);
  });

  it('keeps a settled decision after a refresh has taken it off the pending list', () => {
    const decided: Record<string, DecidedInvoiceRequest> = {
      z: {
        request: req('z'),
        outcome: { kind: 'approved', subscriptionId: 'sub_z', hostedInvoiceUrl: null },
      },
    };
    const rows = invoiceRequestRows([req('a')], decided);

    expect(rows.map((r) => r.request.id)).toEqual(['a', 'z']);
  });

  it('does not carry a refused or unknown answer past a refresh: the server has the say now', () => {
    const decided: Record<string, DecidedInvoiceRequest> = {
      y: { request: req('y'), outcome: { kind: 'unknown', error: 'Not known.' } },
    };
    expect(invoiceRequestRows([], decided)).toEqual([]);
    expect(Object.keys(keepSettled(decided))).toEqual([]);
  });
});

describe('describeApproval: the confirm step says what the server will do', () => {
  const base = {
    schoolName: 'Hillcrest High School',
    seats: 30,
    billingEmail: 'accounts@hillcrest.nsw.edu.au',
    poNumber: null,
    subscriptionId: null,
  };

  it('says what is created, who is invoiced, and when it is due', () => {
    const text = describeApproval(base, 30).join(' ');

    expect(text).toContain(
      'This creates a School subscription for 30 seats at the school licence price, for Hillcrest High School.'
    );
    expect(text).toContain(
      'Stripe emails the invoice to accounts@hillcrest.nsw.edu.au, due in 30 days.'
    );
  });

  it('says when access starts, and that it does not wait for payment', () => {
    expect(describeApproval(base, 30).join(' ')).toContain('before the invoice is paid');
  });

  it('follows the chosen payment terms', () => {
    expect(describeApproval(base, 45).join(' ')).toContain('due in 45 days');
  });

  it('prints the purchase order number on the invoice only when there is one', () => {
    expect(describeApproval({ ...base, poNumber: 'PO-2026-114' }, 30).join(' ')).toContain(
      'The purchase order number PO-2026-114 is printed on the invoice.'
    );
    expect(describeApproval(base, 30).join(' ')).not.toMatch(/purchase order number/);
  });

  it('warns that a reused billing customer is overwritten, because the server does that', () => {
    expect(describeApproval(base, 30).join(' ')).toContain(
      'its name, email and address are replaced'
    );
  });

  it('says a subscription already in Stripe is reused, with its id, and that its terms cannot change here', () => {
    const text = describeApproval({ ...base, subscriptionId: 'sub_1Nabcdefghijk123456' }, 60).join(
      ' '
    );

    expect(text).toContain('Stripe already holds subscription sub_1Nabcdefghijk123456');
    expect(text).toContain('creates no second subscription');
    expect(text).not.toContain('This creates a School subscription');
    expect(text).not.toContain('due in 60 days');
  });

  it('says the step cannot be undone here', () => {
    expect(describeApproval(base, 30).join(' ')).toContain('cannot be undone from this screen');
  });
});

describe('the due-day choices stay inside what the server accepts', () => {
  it('offers only terms the server accepts, and its default is one of them', () => {
    for (const days of DUE_DAY_CHOICES) {
      expect(days).toBeGreaterThanOrEqual(INVOICE_DUE_DAYS.min);
      expect(days).toBeLessThanOrEqual(INVOICE_DUE_DAYS.max);
    }
    expect(DEFAULT_DUE_DAYS).toBe(INVOICE_DUE_DAYS.default);
    expect(DUE_DAY_CHOICES).toContain(DEFAULT_DUE_DAYS);
  });

  it('caps the decision note at the length the server stores', () => {
    expect(DECISION_NOTE_MAX).toBe(INVOICE_LIMITS.note);
  });
});
