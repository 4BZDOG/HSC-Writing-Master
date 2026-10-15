/**
 * POST /api/request-invoice
 *
 * A teacher or admin who belongs to a school asks for a licence to be invoiced
 * to the school instead of paid by card. This only RECORDS the request. A
 * platform admin approves it through api/issue-invoice.ts, and nothing is
 * activated, and no invoice is sent, until that happens.
 *
 * Body: { seats, billingName, billingEmail, billingAddress: { line1, line2?,
 *         city, state, postcode, country? }, abn?, poNumber?, note? }
 * Returns: 201 { request } for a new request; 200 { request } when the school
 *          already has a pending one (the existing request is returned, and no
 *          second row is written).
 *
 * The school is taken from the caller's own profile, never from the body: a
 * request can only be raised for the school the requester is attached to.
 *
 * Moves no money, so it works when Stripe is not configured. Needs the
 * database. Kill switch: SCHOOL_INVOICE_ENABLED=false answers 404 on this and
 * on issue-invoice.
 */
import { getSupabaseAdmin } from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import { notifyOperator } from './_lib/operatorAlert';
import {
  INVOICE_DISABLED_ERROR,
  LICENCE_REQUEST_COLUMNS,
  invoicedLicencesEnabled,
  otherUsersLicenceRequest,
  publicLicenceRequest,
  readSchoolLicence,
  schoolHoldsLiveLicence,
  validateInvoiceRequest,
  type LicenceRequestRow,
} from './_lib/schoolLicence';

/**
 * How many requests one account may raise in a rolling 24 hours. Counts every
 * request it has made, whatever became of them, so withdrawing and re-raising
 * does not reset the count.
 */
export const INVOICE_REQUESTS_PER_DAY = 3;

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  // Same opt-in CORS preamble as the other billing endpoints: on a split-host
  // deployment the POST carries Authorization and the browser preflights it.
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    if (cors && res.end) {
      res.status(204);
      res.end();
    } else {
      res.status(403).json({ error: 'Cross-origin access is not enabled for this origin.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // Checked before authentication, so a switched-off deployment answers the
  // same way to everyone and reveals nothing about accounts.
  if (!invoicedLicencesEnabled()) {
    res.status(404).json({ error: INVOICE_DISABLED_ERROR });
    return;
  }

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ error: 'User identity required to request an invoice.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(501).json({
      error: 'Invoice requests need the database, which is not configured on this deployment.',
    });
    return;
  }

  const validated = validateInvoiceRequest(req.body);
  if (validated.ok === false) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const details = validated.value;

  // Who is asking, and which school they are attached to. Read from the
  // profile, never from the request body. A failed read refuses rather than
  // guessing: the role check below is what keeps a student out of a licence.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('[request-invoice] profile read failed:', profileError.message);
    res.status(503).json({ error: 'Could not check your account. Please try again.' });
    return;
  }
  if (!profile || !['teacher', 'admin'].includes(profile.role as string)) {
    res.status(403).json({
      error: 'School licences are requested by a teacher or admin account.',
    });
    return;
  }
  const schoolId = profile.school_id as string | null;
  if (!schoolId) {
    res.status(400).json({
      error:
        'Your account is not attached to a school yet, so a licence would only cover you. ' +
        'Ask an admin to add you to your school (Admin → Schools), then request the seats.',
    });
    return;
  }

  // A school that already holds a live licence needs no invoice. Fail closed:
  // if the school cannot be read, the request is refused, not waved through.
  const school = await readSchoolLicence(supabase, schoolId);
  if (school.ok === false) {
    console.error('[request-invoice] school read failed:', school.error);
    res.status(503).json({ error: 'Could not check your school. Please try again.' });
    return;
  }
  if (schoolHoldsLiveLicence(school.school)) {
    res.status(409).json({
      error:
        'Your school already holds a licence, so there is nothing to invoice. ' +
        'An admin can see the licence and its seats in Admin → Schools.',
    });
    return;
  }

  // One pending request per school. A teacher who asks again gets the request
  // already waiting; the table index is what stops a race from making two.
  const pending = await findPendingRequest(supabase, schoolId);
  if (!pending.ok) {
    res.status(503).json({ error: 'Could not check existing requests. Please try again.' });
    return;
  }
  if (pending.row) {
    res.status(200).json({ request: presentFor(pending.row, userId) });
    return;
  }

  // Per-user spam guard. A parallel burst can slip a few past this count; the
  // one-pending index above still stops the duplicates that matter.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('licence_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', userId)
    .gte('created_at', since);
  if (countError) {
    console.error('[request-invoice] request count failed:', countError.message);
    res.status(503).json({ error: 'Could not check your recent requests. Please try again.' });
    return;
  }
  if ((count ?? 0) >= INVOICE_REQUESTS_PER_DAY) {
    res.status(429).json({
      error:
        `You have sent ${INVOICE_REQUESTS_PER_DAY} invoice requests in the last 24 hours. ` +
        'Wait for them to be answered, or contact the platform administrator.',
    });
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('licence_requests')
    .insert({
      requested_by: userId,
      school_id: schoolId,
      seats: details.seats,
      billing_name: details.billingName,
      billing_email: details.billingEmail,
      billing_address: details.billingAddress,
      abn: details.abn,
      po_number: details.poNumber,
      note: details.note,
      status: 'pending',
    })
    .select(LICENCE_REQUEST_COLUMNS)
    .single();

  if (insertError) {
    // 23505: another request for this school won the race to pending. Return
    // that one, as the non-racing path would have.
    if (insertError.code === '23505') {
      const raced = await findPendingRequest(supabase, schoolId);
      if (raced.ok && raced.row) {
        res.status(200).json({ request: presentFor(raced.row, userId) });
        return;
      }
    }
    console.error('[request-invoice] insert failed:', insertError.message);
    res.status(500).json({ error: 'Could not record the request. Please try again.' });
    return;
  }

  // Tells the operator a request is waiting, so nobody has to open the queue to find it.
  // Awaited, since the function is frozen after it responds. It never throws, and its
  // outcome does not change the answer below.
  await notifyOperator({
    kind: 'invoice_request',
    title: 'New invoice request',
    lines: [
      `School: ${school.school.name || schoolId}`,
      `${details.seats} seats`,
      ...(details.poNumber ? [`PO number: ${details.poNumber}`] : []),
      'Open Admin → Billing overview → Invoice requests to approve or decline.',
    ],
  });

  res.status(201).json({ request: publicLicenceRequest(inserted as LicenceRequestRow) });
}

/** The school's pending request, if any. `ok: false` means the read itself failed. */
const findPendingRequest = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  schoolId: string
): Promise<{ ok: true; row: LicenceRequestRow | null } | { ok: false }> => {
  const { data, error } = await supabase
    .from('licence_requests')
    .select(LICENCE_REQUEST_COLUMNS)
    .eq('school_id', schoolId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) {
    console.error('[request-invoice] pending lookup failed:', error.message);
    return { ok: false };
  }
  return { ok: true, row: (data as LicenceRequestRow | null) ?? null };
};

/** Full view for the requester, a summary for a colleague's request. */
const presentFor = (row: LicenceRequestRow, userId: string) =>
  row.requested_by === userId ? publicLicenceRequest(row) : otherUsersLicenceRequest(row);
