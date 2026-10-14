/**
 * The platform admin's decision on a purchase-order request (api/issue-invoice.ts).
 * Approving creates the Stripe subscription and emails its invoice. Declining only
 * records the decision.
 *
 * This is the one call on the Billing overview that moves money, so what comes
 * back is sorted into four outcomes the screen can act on. The rule that matters
 * is in `outcomeFromResponse`: an answer that names a Stripe subscription, or no
 * clear answer at all, must never read as "safe to approve again".
 */
import { supabase } from './supabaseClient';
import type { InvoiceRequestSummary } from './billingOverviewService';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * The payment terms an approval offers. Each is inside the server's 7 to 90 day
 * range (api/_lib/schoolLicence.ts), which a test pins.
 */
export const DUE_DAY_CHOICES = [14, 30, 45, 60] as const;
export const DEFAULT_DUE_DAYS = 30;

/** The most a decision note may run to. The server stores the same limit (`INVOICE_LIMITS.note`). */
export const DECISION_NOTE_MAX = 1000;

export type InvoiceDecision =
  | { action: 'approve'; daysUntilDue: number }
  | { action: 'decline'; decisionNote: string | null };

export type DecisionOutcome =
  | { kind: 'approved'; subscriptionId: string; hostedInvoiceUrl: string | null }
  | { kind: 'declined' }
  /**
   * The server refused and said why. A `subscriptionId` means Stripe already holds
   * a subscription for this request, so approving must wait for a look in Stripe.
   */
  | { kind: 'refused'; error: string; subscriptionId: string | null }
  /** No clear answer. The request may or may not have been decided. */
  | { kind: 'unknown'; error: string };

/** A request the admin has decided in this window, kept with what the server said. */
export interface DecidedInvoiceRequest {
  request: InvoiceRequestSummary;
  outcome: DecisionOutcome;
}

const UNKNOWN_OUTCOME =
  'The result did not come back, so it is not known whether the request was decided. ' +
  'Use Refresh in this window and check the request, and Stripe, before doing anything else.';

/**
 * Maps one response to an outcome. Pure, so every rule can be tested without a
 * network. Two cases must never reach the screen as "refused, try again":
 *
 *   - a failure that names a subscriptionId: the subscription exists in Stripe,
 *     and the screen must not offer a second approval;
 *   - a body that is not the server's JSON (a gateway timeout, a crash page): the
 *     server may have acted, so it is unknown rather than refused.
 */
export const outcomeFromResponse = (
  action: InvoiceDecision['action'],
  status: number,
  body: unknown
): DecisionOutcome => {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const request = data?.request as { status?: unknown } | undefined;

  if (status >= 200 && status < 300) {
    if (action === 'approve' && request?.status === 'approved') {
      return typeof data?.subscriptionId === 'string'
        ? {
            kind: 'approved',
            subscriptionId: data.subscriptionId,
            hostedInvoiceUrl:
              typeof data.hostedInvoiceUrl === 'string' ? data.hostedInvoiceUrl : null,
          }
        : { kind: 'unknown', error: UNKNOWN_OUTCOME };
    }
    if (action === 'decline' && request?.status === 'declined') return { kind: 'declined' };
    return { kind: 'unknown', error: UNKNOWN_OUTCOME };
  }

  const error = typeof data?.error === 'string' ? data.error.trim() : '';
  if (!error) return { kind: 'unknown', error: UNKNOWN_OUTCOME };
  const subscriptionId =
    typeof data?.subscriptionId === 'string' && data.subscriptionId !== ''
      ? data.subscriptionId
      : null;
  return { kind: 'refused', error, subscriptionId };
};

const authHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* No session: the server answers 401 and says so, which is shown as a refusal. */
  }
  return headers;
};

/**
 * Approves or declines one request. Never throws: a failure to reach the server
 * is an `unknown` outcome, because the server may have acted before the answer
 * was lost.
 */
export const decideInvoiceRequest = async (
  requestId: string,
  decision: InvoiceDecision
): Promise<DecisionOutcome> => {
  const payload =
    decision.action === 'approve'
      ? { requestId, action: 'approve', daysUntilDue: decision.daysUntilDue }
      : { requestId, action: 'decline', decisionNote: decision.decisionNote };
  try {
    const res = await fetch(`${apiBase}/api/issue-invoice`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return outcomeFromResponse(decision.action, res.status, body);
  } catch {
    return { kind: 'unknown', error: UNKNOWN_OUTCOME };
  }
};

/**
 * What a card may still offer after its last answer. Approve is withdrawn after
 * an unknown answer, and after a refusal that names a subscription, until the
 * admin has looked in Stripe and read the request again. Decline stays open after
 * a refusal, because the server itself refuses a decline while the subscription
 * is still billing.
 */
export const actionsAfter = (
  outcome: DecisionOutcome | null
): { approve: boolean; decline: boolean } => {
  if (!outcome) return { approve: true, decline: true };
  if (outcome.kind === 'unknown') return { approve: false, decline: false };
  if (outcome.kind === 'refused' && outcome.subscriptionId) {
    return { approve: false, decline: true };
  }
  return { approve: true, decline: true };
};

/** A settled outcome is final, so it survives a refresh. The others are re-read from the server. */
export const isSettled = (outcome: DecisionOutcome): boolean =>
  outcome.kind === 'approved' || outcome.kind === 'declined';

/**
 * The rows the queue shows: each pending request, with this window's outcome if it
 * has one, then any request decided here that a refresh has since taken off the
 * pending list. Refused and unknown outcomes are not carried into that second
 * group, since the server has the say on them now.
 */
export const invoiceRequestRows = (
  pending: InvoiceRequestSummary[],
  decided: Record<string, DecidedInvoiceRequest>
): { request: InvoiceRequestSummary; outcome: DecisionOutcome | null }[] => {
  const pendingIds = new Set(pending.map((r) => r.id));
  const rows: { request: InvoiceRequestSummary; outcome: DecisionOutcome | null }[] = pending.map(
    (request) => ({ request, outcome: decided[request.id]?.outcome ?? null })
  );
  for (const entry of Object.values(decided)) {
    if (!pendingIds.has(entry.request.id) && isSettled(entry.outcome)) {
      rows.push({ request: entry.request, outcome: entry.outcome });
    }
  }
  return rows;
};

/** Keeps the settled decisions and drops the rest, once a fresh read has arrived. */
export const keepSettled = (
  decided: Record<string, DecidedInvoiceRequest>
): Record<string, DecidedInvoiceRequest> =>
  Object.fromEntries(Object.entries(decided).filter(([, entry]) => isSettled(entry.outcome)));

/**
 * The sentences the approval confirm step shows before the admin presses the
 * button. Each one describes something the server does on approval (see
 * api/issue-invoice.ts), so the screen never promises more than the server does.
 */
export const describeApproval = (
  request: Pick<
    InvoiceRequestSummary,
    'schoolName' | 'seats' | 'billingEmail' | 'poNumber' | 'subscriptionId'
  >,
  daysUntilDue: number
): string[] => {
  const sentences: string[] = [];
  if (request.subscriptionId) {
    sentences.push(
      `Stripe already holds subscription ${request.subscriptionId} for this request, ` +
        'made by an earlier approval that did not finish. Approving sends that ' +
        'subscription’s invoice. It creates no second subscription, and the payment ' +
        'terms it was given stay as they are.'
    );
  } else {
    sentences.push(
      `This creates a School subscription for ${request.seats} seats at the school ` +
        `licence price, for ${request.schoolName}.`
    );
    sentences.push(
      `Stripe emails the invoice to ${request.billingEmail}, due in ${daysUntilDue} days.`
    );
  }
  sentences.push(
    'The school’s members get access once the subscription is recorded, usually within ' +
      'moments, and before the invoice is paid.'
  );
  if (request.poNumber) {
    sentences.push(`The purchase order number ${request.poNumber} is printed on the invoice.`);
  }
  if (!request.subscriptionId) {
    sentences.push(
      'If the person who asked already has a Stripe billing customer, its name, email ' +
        'and address are replaced with the ones on this request.'
    );
  }
  sentences.push(
    'This cannot be undone from this screen. To stop an invoice that has been sent, void it in Stripe.'
  );
  return sentences;
};
