import { postBillingJson, STRIPE_PRICE_IDS } from './entitlements';

/**
 * The school's side of purchase orders: ask for a licence to be invoiced, and
 * read back what happened to the ask. The rules live on the server
 * (api/_lib/schoolLicence.ts); this file only carries them to the screen.
 *
 * Nothing here moves money or activates a licence. A request is recorded, a
 * platform admin decides it, and the invoice is issued from the server.
 */

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

/**
 * Whether the purchase-order route is offered. Pure, so the same rule can be
 * tested against the server's: the server answers 404 only for an explicit
 * `false`, and this copies that. A school price is also required, because an
 * approval has nothing to invoice without one.
 */
export const invoicedLicencesOn = (
  switchValue: string | undefined,
  schoolPriceId: string | undefined
): boolean => switchValue !== 'false' && Boolean(schoolPriceId);

export const invoicedLicencesEnabled = (): boolean =>
  invoicedLicencesOn(import.meta.env.VITE_SCHOOL_INVOICE_ENABLED, STRIPE_PRICE_IDS.school);

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type LicenceRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

const STATUSES: readonly LicenceRequestStatus[] = ['pending', 'approved', 'declined', 'cancelled'];

export interface BillingAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postcode: string;
  country: 'AU';
}

/** A request the signed-in person raised. Read through their own RLS, or returned to them when they raised it. */
export interface LicenceRequest {
  id: string;
  status: LicenceRequestStatus;
  seats: number;
  billingName: string;
  billingEmail: string;
  billingAddress: BillingAddress;
  abn: string | null;
  poNumber: string | null;
  note: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
}

/**
 * What a teacher learns about a colleague's pending request. The server sends
 * this shape, with no billing details, when the school already has one waiting.
 */
export interface ColleagueLicenceRequest {
  id: string;
  status: LicenceRequestStatus;
  seats: number;
  createdAt: string;
}

/** What the form sends. Blank optional fields are null. */
export interface InvoiceRequestPayload {
  seats: number;
  billingName: string;
  billingEmail: string;
  billingAddress: BillingAddress;
  abn: string | null;
  poNumber: string | null;
  note: string | null;
}

export type SubmitInvoiceResult =
  | { ok: true; kind: 'own'; request: LicenceRequest }
  | { ok: true; kind: 'colleague'; request: ColleagueLicenceRequest }
  | { ok: false; error: string; status: number | null };

// ---------------------------------------------------------------------------
// Parsing. Pure, and forgiving about missing fields, because a row that cannot
// be read is dropped rather than shown with the wrong state.
// ---------------------------------------------------------------------------

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const asStatus = (value: unknown): LicenceRequestStatus | null =>
  STATUSES.find((status) => status === value) ?? null;

const parseAddress = (raw: unknown): BillingAddress => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    line1: asString(source.line1) ?? '',
    line2: asString(source.line2),
    city: asString(source.city) ?? '',
    state: asString(source.state) ?? '',
    postcode: asString(source.postcode) ?? '',
    country: 'AU',
  };
};

/** A request as the API sends it (snake_case, see publicLicenceRequest). Null when the row is not one. */
export const parseLicenceRequest = (raw: unknown): LicenceRequest | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const status = asStatus(row.status);
  const id = asString(row.id);
  const createdAt = asString(row.created_at);
  const billingName = asString(row.billing_name);
  const billingEmail = asString(row.billing_email);
  if (!id || !status || !createdAt || billingName === null || billingEmail === null) return null;
  if (typeof row.seats !== 'number') return null;
  return {
    id,
    status,
    seats: row.seats,
    billingName,
    billingEmail,
    billingAddress: parseAddress(row.billing_address),
    abn: asString(row.abn),
    poNumber: asString(row.po_number),
    note: asString(row.note),
    decidedAt: asString(row.decided_at),
    decisionNote: asString(row.decision_note),
    hostedInvoiceUrl: asString(row.hosted_invoice_url),
    createdAt,
  };
};

/** The summary the server gives for a colleague's request. Null when the row is not one. */
export const parseColleagueRequest = (raw: unknown): ColleagueLicenceRequest | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const status = asStatus(row.status);
  const id = asString(row.id);
  const createdAt = asString(row.created_at);
  if (!id || !status || !createdAt || typeof row.seats !== 'number') return null;
  return { id, status, seats: row.seats, createdAt };
};

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

const SUBMIT_FALLBACK =
  'We could not send the request. Check your connection and try again. Nothing has been charged.';

/**
 * Records a request for the signed-in person's school. The server answers 201
 * for a new request, and 200 with the school's existing pending request when
 * there is one: its own, in full, or a colleague's, as a summary.
 */
export const submitInvoiceRequest = async (
  payload: InvoiceRequestPayload
): Promise<SubmitInvoiceResult> => {
  const { data, error, status } = await postBillingJson<{ request?: unknown }>(
    '/api/request-invoice',
    { ...payload },
    SUBMIT_FALLBACK
  );
  if (!data) return { ok: false, error: error ?? SUBMIT_FALLBACK, status };

  const own = parseLicenceRequest(data.request);
  if (own) return { ok: true, kind: 'own', request: own };

  const colleague = parseColleagueRequest(data.request);
  if (colleague) return { ok: true, kind: 'colleague', request: colleague };

  return { ok: false, error: SUBMIT_FALLBACK, status };
};

/**
 * The signed-in person's own requests, newest first. Filtered to their own
 * `requested_by`, because an admin's RLS also reads every school's requests and
 * the form must show the person's own state, not the platform's. Null when the
 * read fails, so the caller can offer the form rather than claim there is none.
 */
export const fetchMyLicenceRequests = async (): Promise<LicenceRequest[] | null> => {
  try {
    const { supabase } = await import('./supabaseClient');
    if (!supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('licence_requests')
      .select(
        'id, status, seats, billing_name, billing_email, billing_address, abn, po_number, note, decided_at, decision_note, hosted_invoice_url, created_at'
      )
      .eq('requested_by', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    return data.map(parseLicenceRequest).filter((row): row is LicenceRequest => row !== null);
  } catch {
    return null;
  }
};
