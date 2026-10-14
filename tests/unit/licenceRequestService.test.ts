import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import {
  fetchMyLicenceRequests,
  invoicedLicencesOn,
  parseColleagueRequest,
  parseLicenceRequest,
  submitInvoiceRequest,
  type InvoiceRequestPayload,
} from '../../services/licenceRequestService';
import { invoicedLicencesEnabled as serverInvoicedLicencesEnabled } from '../../api/_lib/schoolLicence';

const savedEnv = { ...process.env };

const payload: InvoiceRequestPayload = {
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
  abn: null,
  poNumber: 'PO-2026-0412',
  note: null,
};

const serverRow = {
  id: '6f1c2a3e-1111-4222-8333-444455556666',
  status: 'pending',
  seats: 30,
  billing_name: 'Parramatta High School',
  billing_email: 'accounts@school.edu.au',
  billing_address: {
    line1: '1 Test Street',
    line2: null,
    city: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    country: 'AU',
  },
  abn: null,
  po_number: 'PO-2026-0412',
  note: null,
  decided_at: null,
  decision_note: null,
  hosted_invoice_url: null,
  created_at: '2026-10-14T01:00:00.000Z',
};

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ['SCHOOL_INVOICE_ENABLED', 'VITE_SCHOOL_INVOICE_ENABLED']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('invoicedLicencesOn matches the server switch', () => {
  // The values a deployment can plausibly set. Each must give the same answer
  // on both sides when a School price is configured.
  const switchValues: (string | undefined)[] = [
    undefined,
    '',
    'true',
    'false',
    'FALSE',
    ' false',
    '0',
  ];

  it.each(switchValues.map((value) => [String(value), value] as const))(
    'agrees with the server when VITE_SCHOOL_INVOICE_ENABLED is %s',
    (_label, value) => {
      delete process.env.SCHOOL_INVOICE_ENABLED;
      if (value === undefined) delete process.env.VITE_SCHOOL_INVOICE_ENABLED;
      else process.env.VITE_SCHOOL_INVOICE_ENABLED = value;
      expect(invoicedLicencesOn(value, 'price_school')).toBe(serverInvoicedLicencesEnabled());
    }
  );

  it('is off on the client when no School price is configured, whatever the switch says', () => {
    expect(invoicedLicencesOn(undefined, undefined)).toBe(false);
    expect(invoicedLicencesOn('true', '')).toBe(false);
  });

  it('is off on the client when the switch is false, even with a price', () => {
    expect(invoicedLicencesOn('false', 'price_school')).toBe(false);
  });
});

describe('parseLicenceRequest and parseColleagueRequest', () => {
  it('maps the API row to the camel-case shape the form reads', () => {
    const parsed = parseLicenceRequest(serverRow);
    expect(parsed).toMatchObject({
      id: serverRow.id,
      status: 'pending',
      seats: 30,
      billingName: 'Parramatta High School',
      billingEmail: 'accounts@school.edu.au',
      poNumber: 'PO-2026-0412',
      abn: null,
      createdAt: '2026-10-14T01:00:00.000Z',
    });
    expect(parsed?.billingAddress.postcode).toBe('2150');
  });

  it('drops a row it cannot read, rather than showing it in the wrong state', () => {
    expect(parseLicenceRequest({ ...serverRow, status: 'queued' })).toBeNull();
    expect(parseLicenceRequest({ ...serverRow, id: undefined })).toBeNull();
    expect(parseLicenceRequest({ ...serverRow, seats: '30' })).toBeNull();
    expect(parseLicenceRequest(null)).toBeNull();
  });

  it('keeps a missing address as blanks rather than failing the row', () => {
    const parsed = parseLicenceRequest({ ...serverRow, billing_address: null });
    expect(parsed?.billingAddress).toMatchObject({ line1: '', city: '', country: 'AU' });
  });

  it('reads the colleague summary, which has no billing details', () => {
    expect(
      parseColleagueRequest({
        id: serverRow.id,
        status: 'pending',
        seats: 30,
        created_at: serverRow.created_at,
      })
    ).toEqual({ id: serverRow.id, status: 'pending', seats: 30, createdAt: serverRow.created_at });
    expect(parseColleagueRequest({ id: serverRow.id, status: 'pending' })).toBeNull();
  });
});

describe('submitInvoiceRequest', () => {
  it('returns the request the school recorded, on 201', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { request: serverRow }));
    const result = await submitInvoiceRequest(payload);
    expect(result).toMatchObject({ ok: true, kind: 'own', request: { id: serverRow.id } });
  });

  it('posts to the request endpoint with the payload as JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { request: serverRow }));
    await submitInvoiceRequest(payload);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/request-invoice$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });

  it('treats a 200 with the caller’s own request as their own, not a colleague’s', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { request: serverRow }));
    const result = await submitInvoiceRequest(payload);
    expect(result).toMatchObject({ ok: true, kind: 'own' });
  });

  it('returns a colleague’s pending request as the summary it is, with no billing details', async () => {
    const summary = {
      id: serverRow.id,
      status: 'pending',
      seats: 30,
      created_at: serverRow.created_at,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { request: summary }));
    const result = await submitInvoiceRequest(payload);
    expect(result).toEqual({
      ok: true,
      kind: 'colleague',
      request: { id: serverRow.id, status: 'pending', seats: 30, createdAt: serverRow.created_at },
    });
  });

  it('shows the server’s own sentence on a refusal, with its status', async () => {
    const sentence =
      'Your school already holds a licence, so there is nothing to invoice. An admin can see the licence and its seats in Admin → Schools.';
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { error: sentence }));
    expect(await submitInvoiceRequest(payload)).toEqual({
      ok: false,
      error: sentence,
      status: 409,
    });
  });

  it('shows the server’s own sentence when the kill switch answers 404', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(404, { error: 'Invoiced licences are not offered on this deployment.' })
    );
    const result = await submitInvoiceRequest(payload);
    expect(result).toMatchObject({
      ok: false,
      status: 404,
      error: 'Invoiced licences are not offered on this deployment.',
    });
  });

  it('falls back to a plain sentence, with no status, when the request never arrives', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await submitInvoiceRequest(payload);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.status).toBeNull();
      expect(result.error).toMatch(/Nothing has been charged/);
    }
  });

  it('falls back when a 200 carries neither shape', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await submitInvoiceRequest(payload);
    expect(result).toMatchObject({ ok: false, status: 200 });
  });
});

describe('fetchMyLicenceRequests', () => {
  const chain = (result: { data: unknown; error: unknown }) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return builder;
  };

  it('returns null when Supabase is not configured', async () => {
    expect(await fetchMyLicenceRequests()).toBeNull();
  });

  it('reads only the signed-in person’s own rows, newest first, and maps them', async () => {
    const query = chain({ data: [serverRow], error: null });
    vi.doMock('../../services/supabaseClient', () => ({
      supabase: {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
        from: vi.fn(() => query),
      },
    }));
    vi.resetModules();
    const { fetchMyLicenceRequests: fetchWithClient } =
      await import('../../services/licenceRequestService');
    const rows = await fetchWithClient();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ id: serverRow.id, status: 'pending' });
    expect(query.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('requested_by', 'user-1');
    expect(query.order as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    vi.doUnmock('../../services/supabaseClient');
  });
});
