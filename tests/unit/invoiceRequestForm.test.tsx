import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import type { LicenceRequest, SubmitInvoiceResult } from '../../services/licenceRequestService';

/**
 * Every state of the purchase-order panel, driven through the service so the
 * tests read what a person would see and do: open the disclosure, fill the
 * form, send it, and see the state that comes back.
 */

const fetchMock = vi.fn();
const submitMock = vi.fn();
let enabled = true;

vi.mock('../../services/licenceRequestService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/licenceRequestService')>();
  return {
    ...actual,
    get invoicedLicencesEnabled() {
      return () => enabled;
    },
    fetchMyLicenceRequests: () => fetchMock(),
    submitInvoiceRequest: (payload: unknown) => submitMock(payload),
  };
});

import InvoiceRequestForm from '../../components/InvoiceRequestForm';

const ownRequest = (overrides: Partial<LicenceRequest> = {}): LicenceRequest => ({
  id: '6f1c2a3e-1111-4222-8333-444455556666',
  status: 'pending',
  seats: 30,
  billingName: 'Parramatta High School',
  billingEmail: 'accounts@school.edu.au',
  billingAddress: {
    line1: '1 Test Street',
    line2: null,
    city: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    country: 'AU',
  },
  abn: '51824753556',
  poNumber: 'PO-2026-0412',
  note: null,
  decidedAt: null,
  decisionNote: null,
  hostedInvoiceUrl: null,
  createdAt: '2026-10-13T14:30:00.000Z',
  ...overrides,
});

const open = async ({ settled = true }: { settled?: boolean } = {}) => {
  fireEvent.click(screen.getByRole('button', { name: /Pay by invoice or purchase order/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  // The lookup has been called, but the panel stays on its loading line until the
  // promise settles and React re-renders. A slow runner read the form too early,
  // so wait for it unless the test is about the loading line itself.
  if (settled)
    await waitFor(() =>
      expect(screen.queryByText(/Checking for a request your school has already sent/)).toBeNull()
    );
};

/** Fills every required field with good values, so a test can change one thing. */
const fillForm = () => {
  fireEvent.change(screen.getByLabelText('Name on the invoice'), {
    target: { value: 'Parramatta High School' },
  });
  fireEvent.change(screen.getByLabelText('Accounts email'), {
    target: { value: 'accounts@school.edu.au' },
  });
  fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Test Street' } });
  fireEvent.change(screen.getByLabelText('Suburb or town'), { target: { value: 'Parramatta' } });
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'NSW' } });
  fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '2150' } });
};

const sendButton = () =>
  screen.getByRole('button', { name: /Request an invoice for|Sending request/ });

beforeEach(() => {
  enabled = true;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
  submitMock.mockReset();
});

afterEach(cleanup);

describe('the disclosure', () => {
  it('starts closed, and reads nothing until it is opened', () => {
    render(<InvoiceRequestForm seats={30} />);
    const button = screen.getByRole('button', { name: /Pay by invoice or purchase order/i });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
  });

  it('says invoices and purchase orders are accepted, beside the link to them', () => {
    render(<InvoiceRequestForm seats={30} />);
    expect(screen.getByText(/Invoices and purchase orders are accepted/)).toBeTruthy();
  });

  it('renders nothing on a deployment with invoices switched off', () => {
    enabled = false;
    const { container } = render(<InvoiceRequestForm seats={30} />);
    expect(container.innerHTML).toBe('');
  });

  it('opens on click and reports it to assistive technology', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    const button = screen.getByRole('button', { name: /Pay by invoice or purchase order/i });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: /Pay by invoice or purchase order/i })).toBeTruthy();
  });

  it('collapses on Cancel, hands focus back to the link, and keeps what was typed', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fireEvent.change(screen.getByLabelText('Purchase order number (optional)'), {
      target: { value: 'PO-77' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const button = screen.getByRole('button', { name: /Pay by invoice or purchase order/i });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(
      (screen.getByLabelText('Purchase order number (optional)') as HTMLInputElement).value
    ).toBe('PO-77');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the empty form', () => {
  it('asks for every required field, names the seats it will invoice, and says Australia only', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(screen.getByLabelText('Name on the invoice')).toBeTruthy();
    expect(screen.getByLabelText('Accounts email')).toBeTruthy();
    expect(screen.getByLabelText('Street address')).toBeTruthy();
    expect(screen.getByLabelText('Suburb or town')).toBeTruthy();
    expect(screen.getByLabelText('State')).toBeTruthy();
    expect(screen.getByLabelText('Postcode')).toBeTruthy();
    expect(
      screen.getByText('Australian addresses only. Invoices cannot be sent overseas.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request an invoice for 30 seats' })).toBeTruthy();
  });

  it('says why the ABN is asked for, and that it is optional', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(screen.getByLabelText(/^ABN \(optional\)/)).toBeTruthy();
    expect(screen.getByText(/It prints on the tax invoice/)).toBeTruthy();
  });

  it('refuses a blank submit, marks every bad field, and moves focus to the first one', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fireEvent.click(sendButton());

    expect(submitMock).not.toHaveBeenCalled();
    const name = screen.getByLabelText('Name on the invoice');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toMatch(/-error$/);
    const error = document.getElementById(name.getAttribute('aria-describedby') as string);
    expect(error?.textContent).toMatch(/Enter the name the invoice should be made out to/);
    expect(document.activeElement).toBe(name);
    expect(screen.getByRole('alert').textContent).toMatch(/Check the highlighted details/);
  });

  it('clears a field’s error as soon as it is edited', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fireEvent.click(sendButton());
    const name = screen.getByLabelText('Name on the invoice');
    fireEvent.change(name, { target: { value: 'Parramatta High School' } });
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });

  it('gives inputs 16px text on a phone and 44px tap targets for the buttons', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    const input = screen.getByLabelText('Name on the invoice');
    expect(input.className).toContain('text-base');
    expect(input.className).toContain('min-h-11');
    expect(sendButton().className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('min-h-11');
  });
});

describe('an ABN, checked as it is typed', () => {
  it('shows a full number that fails the check at once, and clears when it passes', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    const abn = screen.getByLabelText(/^ABN/);
    fireEvent.change(abn, { target: { value: '51 824 753 557' } });
    expect(abn.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/The ABN is not valid/)).toBeTruthy();
    fireEvent.change(abn, { target: { value: '51 824 753 556' } });
    expect(abn.getAttribute('aria-invalid')).toBeNull();
  });

  it('does not shout about a partial number until the field has been left', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    const abn = screen.getByLabelText(/^ABN/);
    fireEvent.change(abn, { target: { value: '5182 475' } });
    expect(abn.getAttribute('aria-invalid')).toBeNull();
    fireEvent.blur(abn);
    expect(abn.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/An ABN has eleven digits/)).toBeTruthy();
  });
});

describe('sending the form', () => {
  it('sends the seats from the picker and the cleaned values, then shows the request as pending', async () => {
    submitMock.mockResolvedValue({
      ok: true,
      kind: 'own',
      request: ownRequest(),
    } as SubmitInvoiceResult);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fillForm();
    fireEvent.change(screen.getByLabelText('Purchase order number (optional)'), {
      target: { value: '  PO-2026-0412 ' },
    });
    fireEvent.click(sendButton());

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0]).toMatchObject({
      seats: 30,
      billingName: 'Parramatta High School',
      billingEmail: 'accounts@school.edu.au',
      billingAddress: {
        line1: '1 Test Street',
        line2: null,
        city: 'Parramatta',
        state: 'NSW',
        postcode: '2150',
        country: 'AU',
      },
      poNumber: 'PO-2026-0412',
      abn: null,
      note: null,
    });

    await waitFor(() => expect(screen.getByText('Invoice request received')).toBeTruthy());
    expect(
      screen.getByText(
        /We will email an invoice to accounts@school.edu.au once it is approved, usually within two working days/
      )
    ).toBeTruthy();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Invoice request received');
  });

  it('shows the sending state, and cannot be sent twice while it is in flight', async () => {
    let finish: (value: SubmitInvoiceResult) => void = () => {};
    submitMock.mockReturnValue(new Promise<SubmitInvoiceResult>((resolve) => (finish = resolve)));
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fillForm();
    fireEvent.click(sendButton());

    const busy = await screen.findByRole('button', { name: 'Sending request…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(submitMock).toHaveBeenCalledTimes(1);

    finish({ ok: true, kind: 'own', request: ownRequest() });
    await waitFor(() => expect(screen.getByText('Invoice request received')).toBeTruthy());
  });

  it('keeps the form and shows the server’s own sentence when it refuses', async () => {
    const sentence =
      'Your school already holds a licence, so there is nothing to invoice. An admin can see the licence and its seats in Admin → Schools.';
    submitMock.mockResolvedValue({ ok: false, error: sentence, status: 409 });
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fillForm();
    fireEvent.click(sendButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(sentence);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((screen.getByLabelText('Name on the invoice') as HTMLInputElement).value).toBe(
      'Parramatta High School'
    );
    expect(screen.queryByText('Invoice request received')).toBeNull();
    expect(screen.queryByRole('link', { name: /View the invoice/ })).toBeNull();
  });

  it('shows a colleague’s pending request as a summary, with no form and no billing details', async () => {
    submitMock.mockResolvedValue({
      ok: true,
      kind: 'colleague',
      request: { id: 'x', status: 'pending', seats: 40, createdAt: '2026-10-12T02:00:00.000Z' },
    } as SubmitInvoiceResult);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    fillForm();
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(screen.getByText('A request is already waiting for your school')).toBeTruthy()
    );
    expect(screen.getByText(/A request for 40 seats was received on 12 October 2026/)).toBeTruthy();
    expect(
      screen.getByText(/Only the person who raised it can see its billing details/)
    ).toBeTruthy();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
  });
});

describe('the states a request can be in when the panel opens', () => {
  it('shows a pending request in place of the form, with the date in Sydney time', async () => {
    fetchMock.mockResolvedValue([ownRequest()]);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(await screen.findByText('Invoice request received')).toBeTruthy();
    // 14:30 UTC on 13 October is 01:30 on 14 October in Sydney.
    expect(screen.getByText(/Received on 14 October 2026/)).toBeTruthy();
    expect(screen.getByText('PO-2026-0412')).toBeTruthy();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
  });

  it('shows an approved request with a link to the invoice that opens in a new tab', async () => {
    fetchMock.mockResolvedValue([
      ownRequest({
        status: 'approved',
        decidedAt: '2026-10-14T01:00:00.000Z',
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/inv_2',
      }),
    ]);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(await screen.findByText('Invoice approved on 14 October 2026')).toBeTruthy();
    const link = screen.getByRole('link', { name: /View the invoice \(opens in a new tab\)/ });
    expect(link.getAttribute('href')).toBe('https://invoice.stripe.com/i/acct_1/inv_2');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(
      screen.getByText(/Members get School access within five minutes of opening the app/)
    ).toBeTruthy();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
  });

  it('never makes a link from a value that is not an https address', async () => {
    fetchMock.mockResolvedValue([
      ownRequest({
        status: 'approved',
        decidedAt: '2026-10-14T01:00:00.000Z',
        hostedInvoiceUrl: 'javascript:alert(1)',
      }),
    ]);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    await screen.findByText('Invoice approved on 14 October 2026');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/The link to pay it is not on this page yet/)).toBeTruthy();
  });

  it('shows a declined request with the administrator’s note, and the form again, filled in from it', async () => {
    fetchMock.mockResolvedValue([
      ownRequest({
        status: 'declined',
        decidedAt: '2026-10-14T01:00:00.000Z',
        decisionNote: 'The PO was for last year. Please send a current one.',
      }),
    ]);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(await screen.findByText('This request was not approved')).toBeTruthy();
    expect(screen.getByText(/The PO was for last year. Please send a current one./)).toBeTruthy();
    expect(screen.getByText(/To ask again, check the details below/)).toBeTruthy();
    expect((screen.getByLabelText('Name on the invoice') as HTMLInputElement).value).toBe(
      'Parramatta High School'
    );
    expect(
      (screen.getByLabelText('Purchase order number (optional)') as HTMLInputElement).value
    ).toBe('PO-2026-0412');
  });

  it('sends a fresh request after a decline, and shows it as pending', async () => {
    fetchMock.mockResolvedValue([
      ownRequest({ status: 'declined', decidedAt: '2026-10-14T01:00:00.000Z' }),
    ]);
    submitMock.mockResolvedValue({
      ok: true,
      kind: 'own',
      request: ownRequest({
        id: 'new-one',
        status: 'pending',
        createdAt: '2026-10-15T01:00:00.000Z',
      }),
    } as SubmitInvoiceResult);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    await screen.findByText('This request was not approved');
    fireEvent.click(sendButton());
    expect(await screen.findByText('Invoice request received')).toBeTruthy();
    expect(screen.queryByText('This request was not approved')).toBeNull();
  });

  it('still offers the form, with a note, when the earlier requests cannot be read', async () => {
    fetchMock.mockResolvedValue(null);
    render(<InvoiceRequestForm seats={30} />);
    await open();
    expect(
      await screen.findByText(/We could not check for a request your school has already sent/)
    ).toBeTruthy();
    expect(screen.getByLabelText('Name on the invoice')).toBeTruthy();
  });

  it('shows a loading line, not the form, until the earlier requests are read', async () => {
    let resolve: (rows: LicenceRequest[]) => void = () => {};
    fetchMock.mockReturnValue(new Promise<LicenceRequest[]>((r) => (resolve = r)));
    render(<InvoiceRequestForm seats={30} />);
    await open({ settled: false });
    expect(screen.getByText(/Checking for a request your school has already sent/)).toBeTruthy();
    expect(screen.queryByLabelText('Name on the invoice')).toBeNull();
    resolve([]);
    expect(await screen.findByLabelText('Name on the invoice')).toBeTruthy();
  });

  it('reads the earlier requests once, however often the panel is opened and closed', async () => {
    render(<InvoiceRequestForm seats={30} />);
    await open();
    await screen.findByLabelText('Name on the invoice');
    const button = screen.getByRole('button', { name: /Pay by invoice or purchase order/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByRole('region', { hidden: true })).getByLabelText('Name on the invoice')
    ).toBeTruthy();
  });
});
