/**
 * Rules shared by the invoiced (purchase-order) school licence endpoints:
 * api/request-invoice.ts asks for a licence, api/issue-invoice.ts approves it.
 *
 * Kept pure, apart from one read helper, so the rules can be tested without
 * Stripe or Supabase and so the webhook's view of "a live licence" has exactly
 * one definition on the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SCHOOL_SEAT_LIMITS } from './entitlements';

/**
 * Stripe statuses that mean a licence is in force. `past_due` counts: Stripe is
 * still retrying (or, for an invoice, still waiting for payment), and the
 * webhook keeps the plan through that window. A licence set to cancel at the
 * period end is still `active` here, which is correct: it is held until the
 * boundary.
 */
export const LIVE_LICENCE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

/** The licence columns on `schools` (supabase/schema.sql §13). */
export interface SchoolLicenceRow {
  id: string;
  stripe_subscription_id: string | null;
  plan_status: string | null;
}

/**
 * True when the school holds a licence right now. Needs BOTH the subscription
 * id and a live status: a cancelled licence keeps its old id, and a status with
 * no id means the webhook has not written the school yet.
 */
export const schoolHoldsLiveLicence = (
  school: Pick<SchoolLicenceRow, 'stripe_subscription_id' | 'plan_status'> | null | undefined
): boolean =>
  Boolean(school?.stripe_subscription_id) &&
  LIVE_LICENCE_STATUSES.includes(school?.plan_status ?? '');

/**
 * Kill switch for purchase orders. `SCHOOL_INVOICE_ENABLED=false` answers both
 * endpoints with 404; it falls back to the VITE_ copy, the same way the other
 * billing switches do, so one hosting variable can drive both halves. On by
 * default: a deployment has to say `false` to turn the feature off.
 */
export const invoicedLicencesEnabled = (): boolean =>
  (process.env.SCHOOL_INVOICE_ENABLED ?? process.env.VITE_SCHOOL_INVOICE_ENABLED) !== 'false';

export const INVOICE_DISABLED_ERROR = 'Invoiced licences are not offered on this deployment.';

/** Days the customer has to pay an invoice. Default is the NSW school norm. */
export const INVOICE_DUE_DAYS = { min: 7, max: 90, default: 30 } as const;

/** Length caps. Stripe allows 150 characters for a customer name and 140 for a custom field value. */
export const INVOICE_LIMITS = {
  name: 150,
  email: 254,
  addressLine: 100,
  city: 60,
  poNumber: 60,
  note: 1000,
} as const;

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;

/**
 * Checks an ABN and returns its eleven digits, or null. Spaces are allowed
 * because that is how an ABN is printed on an invoice ("51 824 753 556"). The
 * check is the ATO's: take one from the first digit, weight the digits, and the
 * sum must divide by 89.
 */
export const normaliseAbn = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return null;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const values = digits.split('').map(Number);
  values[0] -= 1;
  const sum = values.reduce((total, digit, i) => total + digit * weights[i], 0);
  return sum % 89 === 0 ? digits : null;
};

/**
 * C0 and C1 control characters. Checked by code point rather than with a regex
 * literal, which lint rejects for control characters.
 */
const isControl = (code: number): boolean => code < 0x20 || (code >= 0x7f && code <= 0x9f);

/** Drops control characters, except those `keep` names. */
const stripControl = (value: string, keep: (code: number) => boolean = () => false): string =>
  Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !isControl(code) || keep(code);
    })
    .join('');

/**
 * Removes control characters and trims. A pasted value can carry tabs, line
 * breaks or stray bytes that would show up in a Stripe invoice or the admin's
 * list; none of them belong in a single-line field.
 */
const cleanLine = (value: unknown): string =>
  typeof value === 'string' ? stripControl(value).trim() : '';

/** The free-text note keeps its line breaks and drops everything else that is control. */
const cleanNote = (value: unknown): string =>
  typeof value === 'string'
    ? stripControl(value.replace(/\r\n?/g, '\n'), (code) => code === 0x0a).trim()
    : '';

export interface InvoiceAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postcode: string;
  country: 'AU';
}

export interface InvoiceRequestValue {
  seats: number;
  billingName: string;
  billingEmail: string;
  billingAddress: InvoiceAddress;
  abn: string | null;
  poNumber: string | null;
  note: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Seats must be a whole number inside SCHOOL_SEAT_LIMITS. This REFUSES an
 * out-of-range number rather than clamping it. create-checkout clamps because
 * the buyer is looking at a price; here the purchase order would carry the
 * clamped number, so a school asking for 3 seats would be invoiced for 5 without
 * being told.
 */
const parseSeats = (raw: unknown): ValidationResult<number> => {
  const seats = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof seats !== 'number' || !Number.isInteger(seats)) {
    return {
      ok: false,
      error: `Enter the number of seats as a whole number from ${SCHOOL_SEAT_LIMITS.min} to ${SCHOOL_SEAT_LIMITS.max}.`,
    };
  }
  if (seats < SCHOOL_SEAT_LIMITS.min || seats > SCHOOL_SEAT_LIMITS.max) {
    return {
      ok: false,
      error: `A school licence covers ${SCHOOL_SEAT_LIMITS.min} to ${SCHOOL_SEAT_LIMITS.max} seats. Change the number of seats and try again.`,
    };
  }
  return { ok: true, value: seats };
};

const parseAddress = (raw: unknown): ValidationResult<InvoiceAddress> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Enter the billing address: street, suburb, state and postcode.' };
  }
  const source = raw as Record<string, unknown>;
  const line1 = cleanLine(source.line1);
  const line2 = cleanLine(source.line2);
  const city = cleanLine(source.city);
  const state = cleanLine(source.state).toUpperCase();
  const postcode = cleanLine(source.postcode);
  const country = cleanLine(source.country).toUpperCase() || 'AU';

  if (!line1 || line1.length > INVOICE_LIMITS.addressLine) {
    return {
      ok: false,
      error: `Enter the street address, up to ${INVOICE_LIMITS.addressLine} characters.`,
    };
  }
  if (line2.length > INVOICE_LIMITS.addressLine) {
    return {
      ok: false,
      error: `The second address line is longer than ${INVOICE_LIMITS.addressLine} characters. Shorten it or leave it blank.`,
    };
  }
  if (!city || city.length > INVOICE_LIMITS.city) {
    return {
      ok: false,
      error: `Enter the suburb or town, up to ${INVOICE_LIMITS.city} characters.`,
    };
  }
  if (!(AU_STATES as readonly string[]).includes(state)) {
    return { ok: false, error: `The state must be one of ${AU_STATES.join(', ')}.` };
  }
  if (!/^\d{4}$/.test(postcode)) {
    return { ok: false, error: 'The postcode must be four digits.' };
  }
  if (country !== 'AU') {
    return {
      ok: false,
      error: 'Invoices are issued to Australian addresses only. Leave the country as Australia.',
    };
  }
  return {
    ok: true,
    value: { line1, line2: line2 || null, city, state, postcode, country: 'AU' },
  };
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a request from a teacher or admin. Every field is trimmed, stripped
 * of control characters and length-capped before it is stored. The result is
 * the value to store, or the one sentence to show.
 */
export const validateInvoiceRequest = (body: unknown): ValidationResult<InvoiceRequestValue> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the invoice details as a JSON object.' };
  }
  const source = body as Record<string, unknown>;

  const seats = parseSeats(source.seats);
  if (!seats.ok) return seats;

  const billingName = cleanLine(source.billingName);
  if (!billingName || billingName.length > INVOICE_LIMITS.name) {
    return {
      ok: false,
      error: `Enter the name the invoice should be made out to, up to ${INVOICE_LIMITS.name} characters.`,
    };
  }

  const billingEmail = cleanLine(source.billingEmail);
  if (
    !billingEmail ||
    billingEmail.length > INVOICE_LIMITS.email ||
    !EMAIL_SHAPE.test(billingEmail)
  ) {
    return {
      ok: false,
      error:
        'Enter the billing email address the accounts office reads, for example accounts@yourschool.edu.au.',
    };
  }

  const address = parseAddress(source.billingAddress);
  if (!address.ok) return address;

  let abn: string | null = null;
  const rawAbn = cleanLine(source.abn);
  if (rawAbn !== '') {
    abn = normaliseAbn(rawAbn);
    if (!abn) {
      return {
        ok: false,
        error:
          'The ABN is not valid. Check the eleven digits on the school’s ABN record, or leave the field blank.',
      };
    }
  }

  const poNumber = cleanLine(source.poNumber);
  if (poNumber.length > INVOICE_LIMITS.poNumber) {
    return {
      ok: false,
      error: `The purchase order number is longer than ${INVOICE_LIMITS.poNumber} characters. Shorten it or leave it blank.`,
    };
  }

  const note = cleanNote(source.note);
  if (note.length > INVOICE_LIMITS.note) {
    return {
      ok: false,
      error: `The note is longer than ${INVOICE_LIMITS.note} characters. Shorten it or leave it blank.`,
    };
  }

  return {
    ok: true,
    value: {
      seats: seats.value,
      billingName,
      billingEmail,
      billingAddress: address.value,
      abn,
      poNumber: poNumber || null,
      note: note || null,
    },
  };
};

export interface DecisionRequestValue {
  requestId: string;
  action: 'approve' | 'decline';
  decisionNote: string | null;
  daysUntilDue: number;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates an admin's decision. `daysUntilDue` defaults to 30 and is bounded to 7 to 90. */
export const validateDecisionRequest = (body: unknown): ValidationResult<DecisionRequestValue> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the decision as a JSON object.' };
  }
  const source = body as Record<string, unknown>;

  const requestId = typeof source.requestId === 'string' ? source.requestId.trim() : '';
  if (!UUID_SHAPE.test(requestId)) {
    return { ok: false, error: 'The request id is missing or malformed.' };
  }

  if (source.action !== 'approve' && source.action !== 'decline') {
    return { ok: false, error: 'The action must be approve or decline.' };
  }

  const note = cleanNote(source.decisionNote);
  if (note.length > INVOICE_LIMITS.note) {
    return {
      ok: false,
      error: `The decision note is longer than ${INVOICE_LIMITS.note} characters. Shorten it or leave it blank.`,
    };
  }

  let daysUntilDue: number = INVOICE_DUE_DAYS.default;
  if (
    source.daysUntilDue !== undefined &&
    source.daysUntilDue !== null &&
    source.daysUntilDue !== ''
  ) {
    const raw =
      typeof source.daysUntilDue === 'string' ? Number(source.daysUntilDue) : source.daysUntilDue;
    if (
      typeof raw !== 'number' ||
      !Number.isInteger(raw) ||
      raw < INVOICE_DUE_DAYS.min ||
      raw > INVOICE_DUE_DAYS.max
    ) {
      return {
        ok: false,
        error: `Payment terms must be a whole number of days from ${INVOICE_DUE_DAYS.min} to ${INVOICE_DUE_DAYS.max}.`,
      };
    }
    daysUntilDue = raw;
  }

  return {
    ok: true,
    value: {
      requestId,
      action: source.action,
      decisionNote: note || null,
      daysUntilDue,
    },
  };
};

/**
 * Reads a school's licence columns. Returns an error rather than a school when
 * the read fails, so the caller can refuse. A failed read must never be taken
 * to mean "no licence", because the approval path would then issue a second
 * one.
 */
export const readSchoolLicence = async (
  supabase: SupabaseClient,
  schoolId: string
): Promise<{ ok: true; school: SchoolLicenceRow } | { ok: false; error: string }> => {
  const { data, error } = await supabase
    .from('schools')
    .select('id, stripe_subscription_id, plan_status')
    .eq('id', schoolId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'The school could not be found.' };
  return { ok: true, school: data as SchoolLicenceRow };
};
