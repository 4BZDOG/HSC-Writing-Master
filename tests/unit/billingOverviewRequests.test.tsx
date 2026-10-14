import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import BillingOverviewDialog from '../../components/admin/BillingOverview';
import * as billingService from '../../services/billingOverviewService';
import type { BillingOverview, InvoiceRequestSummary } from '../../services/billingOverviewService';
import * as decisionService from '../../services/invoiceDecisionService';

/**
 * The purchase-order queue on the Billing overview. The reads and the approve or
 * decline call are stubbed; the rules that decide what each card may offer are the
 * real functions. What is pinned here: the confirm step says what will happen, a
 * call in flight disables every decision and the dismissal, a partial failure that
 * names a subscription keeps Approve off, and focus goes where a screen reader
 * needs it.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({ authService: { updateUser: vi.fn() } }));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => true }));

vi.mock('../../services/billingOverviewService', async (importOriginal) => {
  const actual = await importOriginal<typeof billingService>();
  return { ...actual, loadBillingOverview: vi.fn() };
});

vi.mock('../../services/invoiceDecisionService', async (importOriginal) => {
  const actual = await importOriginal<typeof decisionService>();
  return { ...actual, decideInvoiceRequest: vi.fn() };
});

const NOW = new Date('2026-10-14T09:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number): string => new Date(NOW.getTime() + days * DAY).toISOString();

const load = vi.mocked(billingService.loadBillingOverview);
const decide = vi.mocked(decisionService.decideInvoiceRequest);
const onClose = vi.fn();

const pending = (id: string, over: Partial<InvoiceRequestSummary> = {}): InvoiceRequestSummary => ({
  id,
  schoolName: 'Hillcrest High School',
  seats: 30,
  billingName: 'Accounts Office',
  billingEmail: 'accounts@hillcrest.nsw.edu.au',
  billingAddress: '1 Main Street, Parramatta NSW 2150',
  abn: '51 824 753 556',
  poNumber: 'PO-2026-114',
  note: null,
  requestedAt: at(-2),
  workingDaysWaited: 2,
  overdue: false,
  subscriptionId: null,
  ...over,
});

const overviewWith = (
  requests: InvoiceRequestSummary[] | null,
  over: Partial<BillingOverview> = {}
): BillingOverview => ({
  asOf: NOW.toISOString(),
  stripeConfigured: true,
  subscriptions: billingService.summariseSubscriptions([], NOW),
  schools: [],
  schoolsError: null,
  requests,
  requestsError: null,
  webhook: { lastReceivedAt: at(-1), daysSinceLast: 1, silent: false },
  recentEvents: [{ id: 'evt_1', type: 'customer.subscription.updated', received_at: at(-1) }],
  ...over,
});

const openDialog = async () => {
  render(<BillingOverviewDialog isOpen={true} onClose={onClose} />);
  await waitFor(() => expect(screen.getByText('Active now')).toBeTruthy());
};

const approveButtons = () => screen.queryAllByRole('button', { name: 'Approve' });

beforeEach(() => {
  load.mockReset();
  decide.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the queue appears only when there is a request', () => {
  it('is absent, with no empty state, when nothing is waiting', async () => {
    load.mockResolvedValue(overviewWith([]));
    await openDialog();

    expect(screen.queryByText('Invoice requests')).toBeNull();
    expect(screen.getByText(/Nothing needs attention\./)).toBeTruthy();
  });

  it('does not say nothing needs attention while a request is waiting', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();

    expect(screen.getByText('Invoice requests')).toBeTruthy();
    expect(screen.queryByText(/Nothing needs attention\./)).toBeNull();
  });

  it('says the requests were not read, rather than that nothing needs attention, when the read failed', async () => {
    load.mockResolvedValue(
      overviewWith(null, {
        requestsError:
          'Could not load invoice requests: permission denied for table licence_requests',
      })
    );
    await openDialog();

    expect(
      screen.getByText(/Invoice requests were not checked: Could not load invoice/)
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing needs attention\./)).toBeNull();
  });

  it('names the purchase-order migration when the table is missing', async () => {
    load.mockResolvedValue(
      overviewWith(null, {
        requestsError:
          "Could not load invoice requests: Could not find the table 'public.licence_requests' in the schema cache",
      })
    );
    await openDialog();

    expect(screen.getByText(/schema\.sql \(§27\)/)).toBeTruthy();
    // The rest of the overview still loads.
    expect(screen.getByText('Active now')).toBeTruthy();
  });
});

describe('each request shows what the approver needs to check', () => {
  it('shows the school, seats, billing contact, ABN, PO and address on one card', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();

    expect(screen.getByText('Hillcrest High School')).toBeTruthy();
    expect(screen.getByText(/30 seats · Accounts Office ·/)).toBeTruthy();
    expect(screen.getByText('accounts@hillcrest.nsw.edu.au')).toBeTruthy();
    expect(screen.getByText('51 824 753 556')).toBeTruthy();
    expect(screen.getByText('PO-2026-114')).toBeTruthy();
    expect(screen.getByText('1 Main Street, Parramatta NSW 2150')).toBeTruthy();
    expect(screen.getByText('1 waiting')).toBeTruthy();
  });

  it('says "Not given" for an ABN or purchase order the school left out', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a', { abn: null, poNumber: null })]));
    await openDialog();

    expect(screen.getAllByText('Not given')).toHaveLength(2);
  });

  it('flags a request older than three working days, in words as well as colour', async () => {
    load.mockResolvedValue(
      overviewWith([
        pending('req_old', { workingDaysWaited: 5, overdue: true, schoolName: 'Old School' }),
        pending('req_new', { workingDaysWaited: 1, overdue: false, schoolName: 'New School' }),
      ])
    );
    await openDialog();

    expect(screen.getByText('Waiting 5 working days · overdue')).toBeTruthy();
    expect(screen.getByText('Waiting 1 working day')).toBeTruthy();
    expect(screen.getByText('2 waiting')).toBeTruthy();
  });

  it('lists four requests in the order the read gave them, the longest waiting first', async () => {
    load.mockResolvedValue(
      overviewWith([
        pending('req_1', { schoolName: 'School One', workingDaysWaited: 6, overdue: true }),
        pending('req_2', { schoolName: 'School Two', workingDaysWaited: 4, overdue: true }),
        pending('req_3', { schoolName: 'School Three', workingDaysWaited: 1 }),
        pending('req_4', { schoolName: 'School Four', workingDaysWaited: 0 }),
      ])
    );
    await openDialog();

    const names = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent ?? '')
      .filter((t) => t.startsWith('School '));
    expect(names).toEqual(['School One', 'School Two', 'School Three', 'School Four']);
    expect(screen.getByText('4 waiting')).toBeTruthy();
    expect(screen.getByText('Came in today')).toBeTruthy();
    expect(approveButtons()).toHaveLength(4);
  });

  it('notes a subscription a part-finished approval left in Stripe, with its id', async () => {
    load.mockResolvedValue(
      overviewWith([pending('req_a', { subscriptionId: 'sub_1Nabcdefghijk123456' })])
    );
    await openDialog();

    expect(screen.getByText(/Stripe already holds subscription/)).toBeTruthy();
    // The id sits in its own element, so it can break on its own on a phone.
    expect(screen.getByText('sub_1Nabcdefghijk123456')).toBeTruthy();
  });
});

describe('approving: the confirm step says what will happen first', () => {
  it('opens a confirm step that states the subscription, the invoice, the due date and the access', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.getByText('Approve Hillcrest High School’s request?')).toBeTruthy();
    expect(
      screen.getByText(
        'This creates a School subscription for 30 seats at the school licence price, for Hillcrest High School.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Stripe emails the invoice to accounts@hillcrest.nsw.edu.au, due in 30 days.'
      )
    ).toBeTruthy();
    expect(screen.getByText(/The purchase order number PO-2026-114 is printed/)).toBeTruthy();
    expect(screen.getByText(/its name, email and address are replaced/)).toBeTruthy();
    expect(screen.getByText(/cannot be undone from this screen/)).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();
  });

  it('offers 14, 30, 45 and 60 days, with 30 selected, and the sentence follows the choice', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const select = screen.getByLabelText('Payment due in') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['14', '30', '45', '60']);
    expect(select.value).toBe('30');

    fireEvent.change(select, { target: { value: '45' } });
    expect(
      screen.getByText(
        'Stripe emails the invoice to accounts@hillcrest.nsw.edu.au, due in 45 days.'
      )
    ).toBeTruthy();
  });

  it('sends the chosen payment terms, and shows the invoice link on success', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'approved',
      subscriptionId: 'sub_1Nabcdefghijk123456',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/inv_1',
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText('Payment due in'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Approved.'));
    expect(decide).toHaveBeenCalledWith('req_a', { action: 'approve', daysUntilDue: 60 });
    const link = screen.getByRole('link', { name: /Open the invoice/ });
    expect(link.getAttribute('href')).toBe('https://invoice.stripe.com/i/acct_1/inv_1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('Subscription sub_1Nabcdefghijk123456')).toBeTruthy();
    expect(approveButtons()).toHaveLength(0);
  });

  it('says where the invoice is when no link came back, rather than inventing one', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'approved',
      subscriptionId: 'sub_1Nabcdefghijk123456',
      hostedInvoiceUrl: null,
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() =>
      expect(screen.getByText(/The invoice link is not shown here/)).toBeTruthy()
    );
    expect(screen.queryByRole('link', { name: /Open the invoice/ })).toBeNull();
  });

  it('shows a server refusal verbatim and leaves Approve available', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'refused',
      error:
        'The school already holds a live licence, so this invoice would pay for seats twice. Decline this request instead.',
      subscriptionId: null,
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'The school already holds a live licence, so this invoice would pay for seats twice.'
      )
    );
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps Approve off after a partial failure that names a subscription, and shows the id', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'refused',
      error:
        'Stripe created the subscription, but the invoice could not be sent. Do not approve again.',
      subscriptionId: 'sub_1Nabcdefghijk123456',
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Do not approve again.');
    expect(screen.getByRole('alert').textContent).toContain('sub_1Nabcdefghijk123456');
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true);
    // Decline stays: the server refuses it while the subscription is still billing.
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(false);
  });

  it('withdraws both actions after an answer that is not clear, and says how to check', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'unknown',
      error: 'The result did not come back, so it is not known whether the request was decided.',
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not known whether')
    );
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(true);
  });

  it('for a request with a subscription already in Stripe, says it is reused and that the terms cannot change', async () => {
    load.mockResolvedValue(
      overviewWith([pending('req_a', { subscriptionId: 'sub_1Nabcdefghijk123456' })])
    );
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.getByText(/creates no second subscription/)).toBeTruthy();
    expect(screen.queryByText(/This creates a School subscription/)).toBeNull();
    expect(
      screen.getByText('Set when the subscription was first created, so it cannot change here.')
    ).toBeTruthy();
    expect((screen.getByLabelText('Payment due in') as HTMLSelectElement).disabled).toBe(true);
  });
});

describe('declining: records the decision and says it changes nothing in Stripe', () => {
  it('sends the decline with the note, and reports it declined', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({ kind: 'declined' });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(
      screen.getByText(/Declining records the decision in the app\. It changes nothing in Stripe/)
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note for the person who asked (optional)'), {
      target: { value: '  Please use the other form.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Decline request' }));

    await waitFor(() =>
      expect(screen.getByText('Declined. Nothing in Stripe was changed.')).toBeTruthy()
    );
    expect(decide).toHaveBeenCalledWith('req_a', {
      action: 'decline',
      decisionNote: 'Please use the other form.',
    });
  });

  it('caps the note at the length the server stores', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    const note = screen.getByLabelText('Note for the person who asked (optional)');
    expect(note.getAttribute('maxlength')).toBe('1000');
  });
});

describe('while a call is in flight, nothing else can be decided or dismissed', () => {
  it('disables every decision, the close control, the scrim and Escape until the answer returns', async () => {
    load.mockResolvedValue(
      overviewWith([pending('req_a'), pending('req_b', { schoolName: 'Other' })])
    );
    let answer: (value: decisionService.DecisionOutcome) => void = () => undefined;
    decide.mockImplementation(
      () =>
        new Promise<decisionService.DecisionOutcome>((resolve) => {
          answer = resolve;
        })
    );
    await openDialog();
    fireEvent.click(approveButtons()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    const sending = await screen.findByRole('button', { name: /Sending invoice/ });
    expect(sending.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
    // The other request cannot be approved or declined while this one is out.
    expect(approveButtons()[0].hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Close' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true);
    expect(sending.closest('[aria-busy="true"]')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      answer({ kind: 'declined' });
    });
    await waitFor(() =>
      expect(screen.getByText('Declined. Nothing in Stripe was changed.')).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: 'Close' }).hasAttribute('disabled')).toBe(false);
  });

  it('sends only one call when the confirm button is pressed twice', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockImplementation(() => new Promise(() => undefined));
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const confirm = screen.getByRole('button', { name: 'Approve and send invoice' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(decide).toHaveBeenCalledTimes(1);
  });
});

describe('the dialog itself, with a request on it', () => {
  it('still closes from the close control and Escape when nothing is in flight', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus to the confirm heading when it opens, so a screen reader reads what is approved', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(document.activeElement?.textContent).toBe('Approve Hillcrest High School’s request?');
  });

  it('returns focus to the Approve button that opened the step when it is cancelled', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(document.activeElement?.textContent).toBe('Approve');
    expect(decide).not.toHaveBeenCalled();
  });

  it('moves focus to the answer once a call ends, so the outcome is announced', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'refused',
      error: 'Could not check the school. Nothing has been invoiced; try again.',
      subscriptionId: null,
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));

    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('alert'));
  });

  it('keeps an approval on screen after a refresh has taken it off the pending list', async () => {
    load.mockResolvedValueOnce(
      overviewWith([pending('req_a'), pending('req_b', { schoolName: 'Other School' })])
    );
    decide.mockResolvedValue({
      kind: 'approved',
      subscriptionId: 'sub_1Nabcdefghijk123456',
      hostedInvoiceUrl: null,
    });
    await openDialog();
    fireEvent.click(approveButtons()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

    load.mockResolvedValueOnce(overviewWith([pending('req_b', { schoolName: 'Other School' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByText('1 waiting')).toBeTruthy());
    expect(screen.getByText(/Approved\. Stripe has sent the invoice/)).toBeTruthy();
    expect(screen.getByText('Other School')).toBeTruthy();
  });

  it('drops a refusal once a refresh has read the request again', async () => {
    load.mockResolvedValue(overviewWith([pending('req_a')]));
    decide.mockResolvedValue({
      kind: 'refused',
      error: 'Stripe holds a subscription.',
      subscriptionId: 'sub_1Nabcdefghijk123456',
    });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send invoice' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    load.mockResolvedValue(
      overviewWith([pending('req_a', { subscriptionId: 'sub_1Nabcdefghijk123456' })])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    // The re-read request now shows the subscription from the database, and Approve is back.
    expect(approveButtons()).toHaveLength(1);
  });
});
