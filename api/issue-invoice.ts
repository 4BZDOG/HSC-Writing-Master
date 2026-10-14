/**
 * POST /api/issue-invoice (platform admins only)
 *
 * Decides a school's invoice request from api/request-invoice.ts.
 *
 *   decline: records the decision. Nothing happens in Stripe.
 *   approve: creates the Stripe objects that bill the school. The customer is
 *            the requester's own (or a new one, linked to their profile). The
 *            subscription uses collection_method 'send_invoice', so Stripe
 *            emails an invoice and the school pays it by the hosted page or
 *            bank transfer. The existing webhook then applies the licence to
 *            the school, exactly as it does for a card purchase.
 *
 * Body: { requestId, action: 'approve' | 'decline', decisionNote?, daysUntilDue? }
 * Returns: { request } for a decline; { request, subscriptionId,
 *          hostedInvoiceUrl } for an approval.
 *
 * Money path, so it FAILS CLOSED. Every check that can refuse does so before
 * Stripe is called, and a read that fails refuses. Each Stripe step is safe to
 * retry: the customer and the subscription are created under idempotency keys
 * derived from the request id, so a double click, or an approval retried after
 * a failure, returns the objects already made instead of making new ones.
 *
 * Never returns raw Stripe errors. They are logged; the client gets one plain
 * sentence and, once a subscription exists, its id, so an admin does not retry
 * blindly.
 */
import type Stripe from 'stripe';
import { getStripe, getSupabaseAdmin, isStripeConfigured } from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import {
  INVOICE_DISABLED_ERROR,
  LICENCE_REQUEST_COLUMNS,
  invoicedLicencesEnabled,
  publicLicenceRequest,
  readSchoolLicence,
  schoolHoldsLiveLicence,
  validateDecisionRequest,
  type InvoiceAddress,
  type LicenceRequestRow,
} from './_lib/schoolLicence';

/** The custom field that puts the purchase order number on the invoice. */
const PO_FIELD_NAME = 'Purchase order';

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

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

/** A refusal or failure, with the HTTP status and the sentence to show. */
interface Refusal {
  ok: false;
  status: number;
  error: string;
  /** Set once a Stripe subscription exists, so the admin can see it. */
  subscriptionId?: string;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
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

  if (!invoicedLicencesEnabled()) {
    res.status(404).json({ error: INVOICE_DISABLED_ERROR });
    return;
  }

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }
  const adminId = auth.userId;
  if (!adminId) {
    res.status(401).json({ error: 'User identity required to decide an invoice request.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(501).json({
      error: 'Invoice decisions need the database, which is not configured on this deployment.',
    });
    return;
  }

  // The role is read from the database, never taken from the request. The
  // client can say anything about itself.
  const { data: caller, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .maybeSingle();
  if (callerError) {
    console.error('[issue-invoice] caller read failed:', callerError.message);
    res.status(503).json({ error: 'Could not check your account. Please try again.' });
    return;
  }
  if (caller?.role !== 'admin') {
    res
      .status(403)
      .json({ error: 'Only a platform admin can approve or decline invoice requests.' });
    return;
  }

  const validated = validateDecisionRequest(req.body);
  if (validated.ok === false) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const decision = validated.value;

  const { data: found, error: findError } = await supabase
    .from('licence_requests')
    .select(LICENCE_REQUEST_COLUMNS)
    .eq('id', decision.requestId)
    .maybeSingle();
  if (findError) {
    console.error('[issue-invoice] request read failed:', findError.message);
    res.status(503).json({ error: 'Could not load the request. Please try again.' });
    return;
  }
  if (!found) {
    res.status(404).json({ error: 'That invoice request could not be found.' });
    return;
  }
  const row = found as LicenceRequestRow;

  if (decision.action === 'decline') {
    await decline(res, supabase, row, adminId, decision.decisionNote);
    return;
  }

  const result = await approve(
    supabase,
    row,
    adminId,
    decision.decisionNote,
    decision.daysUntilDue
  );
  if (result.ok === false) {
    res.status(result.status).json({
      error: result.error,
      ...(result.subscriptionId ? { subscriptionId: result.subscriptionId } : {}),
    });
    return;
  }
  res.status(200).json({
    request: publicLicenceRequest(result.request),
    subscriptionId: result.subscriptionId,
    hostedInvoiceUrl: result.hostedInvoiceUrl,
  });
}

/** Records a decline. Nothing in Stripe is touched. A repeat decline is answered, not repeated. */
const decline = async (
  res: ResponseLike,
  supabase: Supabase,
  row: LicenceRequestRow,
  adminId: string,
  decisionNote: string | null
): Promise<void> => {
  if (row.status === 'declined') {
    res.status(200).json({ request: publicLicenceRequest(row) });
    return;
  }
  if (row.status !== 'pending') {
    res.status(409).json({
      error: `This request is already ${row.status}, so it cannot be declined.`,
    });
    return;
  }

  const { data, error } = await supabase
    .from('licence_requests')
    .update({
      status: 'declined',
      decided_by: adminId,
      decided_at: new Date().toISOString(),
      decision_note: decisionNote,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select(LICENCE_REQUEST_COLUMNS);
  if (error) {
    console.error('[issue-invoice] decline failed:', error.message);
    res.status(500).json({ error: 'Could not record the decision. Please try again.' });
    return;
  }
  const updated = (data as LicenceRequestRow[] | null)?.[0];
  if (!updated) {
    res.status(409).json({
      error: 'This request was changed while you were deciding it. Reload and check its status.',
    });
    return;
  }
  res.status(200).json({ request: publicLicenceRequest(updated) });
};

type ApproveResult =
  | {
      ok: true;
      request: LicenceRequestRow;
      subscriptionId: string;
      hostedInvoiceUrl: string | null;
    }
  | Refusal;

const approve = async (
  supabase: Supabase,
  row: LicenceRequestRow,
  adminId: string,
  decisionNote: string | null,
  daysUntilDue: number
): Promise<ApproveResult> => {
  // Approving twice answers with what already exists. Nothing is created again.
  if (row.status === 'approved') {
    return {
      ok: true,
      request: row,
      subscriptionId: row.stripe_subscription_id ?? '',
      hostedInvoiceUrl: row.hosted_invoice_url,
    };
  }
  if (row.status !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: `This request is already ${row.status}, so it cannot be approved.`,
    };
  }

  // a. The request must still describe a real, eligible purchase.
  const requester = await loadRequester(supabase, row);
  if (requester.ok === false) return requester;

  const school = await readSchoolLicence(supabase, row.school_id);
  if (school.ok === false) {
    console.error('[issue-invoice] school read failed:', school.error);
    return {
      ok: false,
      status: 503,
      error: 'Could not check the school. Nothing has been invoiced; try again.',
    };
  }
  if (schoolHoldsLiveLicence(school.school)) {
    return {
      ok: false,
      status: 409,
      error:
        'The school already holds a live licence, so this invoice would pay for seats twice. ' +
        'Decline this request instead.',
    };
  }

  if (!isStripeConfigured()) {
    return {
      ok: false,
      status: 501,
      error:
        'Stripe is not configured on this deployment, so the invoice cannot be issued. ' +
        'Set STRIPE_SECRET_KEY in the hosting project, then approve again.',
    };
  }
  const schoolPrice = process.env.STRIPE_SCHOOL_PRICE_ID;
  if (!schoolPrice) {
    return {
      ok: false,
      status: 501,
      error:
        'The school licence price is not set (STRIPE_SCHOOL_PRICE_ID), so no invoice can be issued. ' +
        'Set it in the hosting project, then approve again.',
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 501, error: 'Stripe is not configured on this deployment.' };
  }

  // b and c. Create the billing objects, or resume the ones an earlier approval
  // already made. A row that names a subscription came from an approval that
  // failed after Stripe created it. That subscription is reused, never replaced:
  // the idempotency key on the create is honoured for only 24 hours, so a retry
  // made after that would otherwise create a second subscription and invoice the
  // school twice.
  const billing = row.stripe_subscription_id
    ? await resumeSubscription(stripe, row)
    : await createSubscription(stripe, supabase, row, requester.profile, {
        schoolPrice,
        daysUntilDue,
      });
  if (billing.ok === false) return billing;
  const { customerId, subscriptionId, invoiceId } = billing;

  // d. The first invoice. Finalise it if Stripe left it as a draft, then send it
  //    so the accounts office gets the email and the hosted payment page.
  if (!invoiceId) {
    return {
      ok: false,
      status: 502,
      subscriptionId,
      error:
        'Stripe created the subscription without its first invoice. Check the subscription in the ' +
        'Stripe Dashboard before approving again.',
    };
  }
  const invoice = await finaliseAndSend(stripe, invoiceId, subscriptionId);
  if (invoice.ok === false) return invoice;

  // e. Record the approval. Conditional on still being pending, so a decline
  //    that landed meanwhile cannot be overwritten.
  const { data, error } = await supabase
    .from('licence_requests')
    .update({
      status: 'approved',
      decided_by: adminId,
      decided_at: new Date().toISOString(),
      decision_note: decisionNote,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_invoice_id: invoiceId,
      hosted_invoice_url: invoice.hostedInvoiceUrl,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select(LICENCE_REQUEST_COLUMNS);

  if (error) {
    console.error('[issue-invoice] approval write failed:', error.message);
    return {
      ok: false,
      status: 502,
      subscriptionId,
      error:
        'The invoice was issued in Stripe, but the request could not be marked approved. ' +
        'Approving again is safe: the same subscription is reused.',
    };
  }
  const updated = (data as LicenceRequestRow[] | null)?.[0];
  if (!updated) {
    return {
      ok: false,
      status: 409,
      subscriptionId,
      error:
        'The invoice was issued in Stripe, but the request changed while it was being approved. ' +
        'Check its status before doing anything else.',
    };
  }

  return {
    ok: true,
    request: updated,
    subscriptionId,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
  };
};

/**
 * The requester must still be a teacher or admin attached to the school the
 * request is for. The webhook files the licence under the requester's CURRENT
 * school, so a request raised for one school and approved after the requester
 * moved would licence the wrong one.
 */
const loadRequester = async (
  supabase: Supabase,
  row: LicenceRequestRow
): Promise<{ ok: true; profile: RequesterProfile } | Refusal> => {
  if (!row.requested_by) {
    return {
      ok: false,
      status: 409,
      error: 'The person who asked for this invoice has been removed. Decline the request.',
    };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, school_id, stripe_customer_id')
    .eq('id', row.requested_by)
    .maybeSingle();
  if (error) {
    console.error('[issue-invoice] requester read failed:', error.message);
    return {
      ok: false,
      status: 503,
      error: 'Could not check the person who asked. Nothing has been invoiced; try again.',
    };
  }
  const profile = data as RequesterProfile | null;
  if (!profile || !['teacher', 'admin'].includes(profile.role ?? '')) {
    return {
      ok: false,
      status: 409,
      error: 'The person who asked is no longer a teacher or admin. Decline the request.',
    };
  }
  if (profile.school_id !== row.school_id) {
    return {
      ok: false,
      status: 409,
      error:
        'The person who asked is no longer attached to this school. ' +
        'Decline the request, and ask them to make a new one.',
    };
  }
  return { ok: true, profile };
};

interface RequesterProfile {
  id: string;
  role: string | null;
  school_id: string | null;
  stripe_customer_id: string | null;
}

/** The address and contact details a Stripe customer carries, from the request. */
const billingDetails = (row: LicenceRequestRow) => {
  const address = row.billing_address as unknown as InvoiceAddress;
  return {
    name: row.billing_name,
    email: row.billing_email,
    address: {
      line1: address.line1,
      line2: address.line2 ?? undefined,
      city: address.city,
      state: address.state,
      postal_code: address.postcode,
      country: address.country,
    },
  };
};

/** Stripe subscription statuses that can still be invoiced. */
const BILLABLE_SUBSCRIPTION_STATUSES: string[] = ['active', 'trialing', 'past_due'];

/** An id from a Stripe field that may arrive as an id or as an expanded object. */
const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

/** The Stripe objects one approval bills through. */
type Billing =
  | { ok: true; customerId: string; subscriptionId: string; invoiceId: string | null }
  | Refusal;

/**
 * Creates the customer and the subscription for a request that has none yet.
 * The idempotency keys make a double click return the same objects. Recording
 * the ids straight away means a later failure still leaves the subscription
 * visible on the request.
 */
const createSubscription = async (
  stripe: Stripe,
  supabase: Supabase,
  row: LicenceRequestRow,
  requester: RequesterProfile,
  terms: { schoolPrice: string; daysUntilDue: number }
): Promise<Billing> => {
  const customer = await ensureCustomer(stripe, supabase, row, requester);
  if (customer.ok === false) return customer;

  // Stripe rejects a retry whose parameters differ from the first attempt, so a
  // retry must send the same days-until-due the first attempt did.
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create(
      {
        customer: customer.customerId,
        items: [{ price: terms.schoolPrice, quantity: row.seats }],
        collection_method: 'send_invoice',
        days_until_due: terms.daysUntilDue,
        metadata: {
          supabase_user_id: row.requested_by as string,
          school_id: row.school_id,
          licence_request_id: row.id,
        },
        ...(process.env.STRIPE_AUTOMATIC_TAX === 'true'
          ? { automatic_tax: { enabled: true } }
          : {}),
      },
      { idempotencyKey: `licence-request-${row.id}` }
    );
  } catch (e) {
    logStripe('subscription create', e);
    return {
      ok: false,
      status: 502,
      error:
        'Stripe did not confirm the subscription, so the request is still pending. ' +
        'Approve again to retry: the same subscription is reused, so nothing is invoiced twice.',
    };
  }

  const invoiceId = idOf(subscription.latest_invoice);
  const recorded = await recordStripeIds(supabase, row.id, {
    stripe_customer_id: customer.customerId,
    stripe_subscription_id: subscription.id,
    stripe_invoice_id: invoiceId,
  });
  // Without the id on the request, a retry after the idempotency key has
  // expired would create a second subscription. So stop here, before any
  // invoice is sent, and show the admin the one that exists.
  if (!recorded) {
    return {
      ok: false,
      status: 502,
      subscriptionId: subscription.id,
      error:
        'Stripe created the subscription, but the request could not record it, so no invoice has been sent. ' +
        'Approve again to retry; the same subscription is reused for 24 hours. Cancel the subscription ' +
        'in the Stripe Dashboard if it is not wanted.',
    };
  }
  return {
    ok: true,
    customerId: customer.customerId,
    subscriptionId: subscription.id,
    invoiceId,
  };
};

/**
 * Picks up an approval that already created its subscription. The subscription
 * is read back and must still be billable. One that has ended is refused, not
 * replaced: a new one is a new request and a new decision.
 */
const resumeSubscription = async (stripe: Stripe, row: LicenceRequestRow): Promise<Billing> => {
  const subscriptionId = row.stripe_subscription_id as string;

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (e) {
    logStripe('subscription read', e);
    return {
      ok: false,
      status: 502,
      subscriptionId,
      error:
        'A subscription for this request already exists in Stripe but could not be read. ' +
        'Check it in the Stripe Dashboard before approving again.',
    };
  }

  if (!BILLABLE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return {
      ok: false,
      status: 409,
      subscriptionId,
      error:
        `The subscription made for this request is ${subscription.status} in Stripe, so it cannot ` +
        'be invoiced. Decline this request and ask for a new one.',
    };
  }

  const customerId = idOf(subscription.customer) ?? row.stripe_customer_id;
  if (!customerId) {
    return {
      ok: false,
      status: 502,
      subscriptionId,
      error:
        'The subscription for this request has no customer in Stripe. Check it in the Stripe Dashboard.',
    };
  }
  return {
    ok: true,
    customerId,
    subscriptionId,
    invoiceId: idOf(subscription.latest_invoice),
  };
};

/**
 * Returns the Stripe customer the subscription bills, creating it if needed.
 *
 * A reused customer has its billing email, name and address replaced by the
 * request's. Stripe sends an invoice to the customer's email, so without this
 * the invoice would reach the requester's own inbox, not the accounts office.
 * That also changes where that customer's other emails go, so the operator
 * should know (docs/stripesetup.md).
 */
const ensureCustomer = async (
  stripe: Stripe,
  supabase: Supabase,
  row: LicenceRequestRow,
  requester: RequesterProfile
): Promise<{ ok: true; customerId: string } | Refusal> => {
  const poNumber = row.po_number;
  const customFields = poNumber ? [{ name: PO_FIELD_NAME, value: poNumber }] : null;

  // A customer recorded on the request, but not yet on the profile, is one an
  // earlier attempt made: reuse it rather than making another.
  const existingId = requester.stripe_customer_id ?? row.stripe_customer_id;
  if (existingId) {
    try {
      await stripe.customers.update(existingId, {
        ...billingDetails(row),
        invoice_settings: { custom_fields: customFields ?? '' },
      });
    } catch (e) {
      logStripe('customer update', e);
      return {
        ok: false,
        status: 502,
        error: 'Stripe did not accept the billing details. Nothing has been invoiced; try again.',
      };
    }
    if (requester.stripe_customer_id) return { ok: true, customerId: existingId };
    return linkCustomer(supabase, requester.id, existingId);
  }

  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create(
      {
        ...billingDetails(row),
        preferred_locales: ['en-AU'],
        metadata: {
          supabase_user_id: row.requested_by as string,
          school_id: row.school_id,
          licence_request_id: row.id,
        },
        ...(row.abn ? { tax_id_data: [{ type: 'au_abn' as const, value: row.abn }] } : {}),
        ...(customFields ? { invoice_settings: { custom_fields: customFields } } : {}),
      },
      { idempotencyKey: `licence-request-${row.id}-customer` }
    );
  } catch (e) {
    logStripe('customer create', e);
    return {
      ok: false,
      status: 502,
      error: 'Stripe did not create the billing customer. Nothing has been invoiced; try again.',
    };
  }

  // Record the customer on the request before linking it, so an approval that
  // fails from here on still shows which customer exists.
  await recordStripeIds(supabase, row.id, {
    stripe_customer_id: customer.id,
  });
  return linkCustomer(supabase, requester.id, customer.id);
};

/**
 * Links a Stripe customer to the requester's profile. The unique index on
 * profiles.stripe_customer_id means a link can only land once. If it does not,
 * stop and say so, and do not take the id from the other profile: no invoice has
 * been sent yet.
 */
const linkCustomer = async (
  supabase: Supabase,
  profileId: string,
  customerId: string
): Promise<{ ok: true; customerId: string } | Refusal> => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', profileId)
    .is('stripe_customer_id', null)
    .select('id');
  if (error) {
    logStripe('customer link', error);
    const claimed = (error as { code?: string }).code === '23505';
    return {
      ok: false,
      status: 409,
      error: claimed
        ? 'The person who asked is already linked to a different billing customer, so the invoice was not issued. Contact the platform administrator.'
        : 'Could not link the billing customer to the person who asked. Nothing has been invoiced; try again.',
    };
  }
  if (!data || (data as unknown[]).length === 0) {
    // Their profile gained a customer while this approval ran. Approving again
    // reuses that one.
    return {
      ok: false,
      status: 409,
      error:
        'The person who asked gained a billing customer while this was being approved. Approve again.',
    };
  }
  return { ok: true, customerId };
};

/**
 * Finalises the first invoice if it is still a draft, then sends it. Stripe
 * rejects a finalise or a send that is already done; that is tolerated when the
 * invoice is in the state the step was for, and anything else is a refusal.
 */
const finaliseAndSend = async (
  stripe: Stripe,
  invoiceId: string,
  subscriptionId: string
): Promise<{ ok: true; hostedInvoiceUrl: string | null } | Refusal> => {
  const fail = (step: string, e: unknown): Refusal => {
    logStripe(step, e);
    return {
      ok: false,
      status: 502,
      subscriptionId,
      error:
        'Stripe created the subscription, but the invoice could not be sent. The subscription exists, ' +
        'so do not approve again: send the invoice from the Stripe Dashboard, or retry sending it.',
    };
  };

  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(invoiceId);
  } catch (e) {
    return fail('invoice read', e);
  }

  if (invoice.status === 'draft') {
    try {
      invoice = await stripe.invoices.finalizeInvoice(invoiceId);
    } catch (e) {
      try {
        invoice = await stripe.invoices.retrieve(invoiceId);
      } catch (readError) {
        return fail('invoice finalise', e);
      }
      if (invoice.status === 'draft') return fail('invoice finalise', e);
    }
  }

  try {
    invoice = await stripe.invoices.sendInvoice(invoiceId);
  } catch (e) {
    // A failed send is not tolerated just because the invoice is open: an open
    // invoice may never have been emailed, and the school would then sit on a
    // licence it was never asked to pay. Only a PAID invoice needs no send.
    try {
      invoice = await stripe.invoices.retrieve(invoiceId);
    } catch {
      return fail('invoice send', e);
    }
    if (invoice.status !== 'paid') return fail('invoice send', e);
  }

  return { ok: true, hostedInvoiceUrl: invoice.hosted_invoice_url ?? null };
};

/**
 * Writes the Stripe ids onto a request that is still pending, as each one comes
 * into existence. Returns false when the write fails, and the caller decides
 * whether that is safe to go on from: for a subscription it is not.
 */
const recordStripeIds = async (
  supabase: Supabase,
  requestId: string,
  ids: {
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    stripe_invoice_id?: string | null;
  }
): Promise<boolean> => {
  const { error } = await supabase
    .from('licence_requests')
    .update(ids)
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) {
    logStripe('record ids', error);
    return false;
  }
  return true;
};

/** Logs a failure for the operator. Stripe's message can name the account, so it stays in the log. */
const logStripe = (step: string, e: unknown): void => {
  console.error(
    `[issue-invoice] ${step} failed:`,
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e && 'message' in e
        ? (e as { message: unknown }).message
        : e
  );
};
