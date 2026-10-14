import { SCHOOL_SEAT_LIMITS } from '../services/entitlements';
import type { BillingAddress, InvoiceRequestPayload } from '../services/licenceRequestService';
import { normaliseAbn } from './abn';

/**
 * The invoice request form's rules: what each field may hold, what to say when
 * it does not, and the payload it becomes. Pure, so the rules are tested apart
 * from the form.
 *
 * The server (api/_lib/schoolLicence.ts) makes the same decisions and has the
 * last word. This copy exists so a field can say what to change before the
 * request leaves the page. tests/unit/invoiceRequestForm.test.ts runs both over
 * the same drafts, and pins the limits to the server's, so the two cannot drift
 * without a failing test.
 */

/** Length caps, as the server's INVOICE_LIMITS. */
export const INVOICE_FIELD_LIMITS = {
  name: 150,
  email: 254,
  addressLine: 100,
  city: 60,
  poNumber: 60,
  note: 1000,
} as const;

/** The states an invoice can be addressed to. Australia only. */
export const AU_STATE_CODES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;

/** The form's fields, top to bottom. The first invalid one takes focus on submit. */
export const INVOICE_FIELD_ORDER = [
  'billingName',
  'billingEmail',
  'line1',
  'line2',
  'city',
  'state',
  'postcode',
  'abn',
  'poNumber',
  'note',
] as const;

export type InvoiceField = (typeof INVOICE_FIELD_ORDER)[number];

/** The seat count comes from the picker above the form, so its error is shown at form level. */
export type InvoiceFormErrors = Partial<Record<InvoiceField | 'seats', string>>;

/** Everything the person types. Strings throughout, so an empty field is ''. */
export interface InvoiceDraft {
  billingName: string;
  billingEmail: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postcode: string;
  abn: string;
  poNumber: string;
  note: string;
}

export const emptyInvoiceDraft = (): InvoiceDraft => ({
  billingName: '',
  billingEmail: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postcode: '',
  abn: '',
  poNumber: '',
  note: '',
});

/**
 * The draft a declined request leaves behind, so asking again means correcting
 * a field rather than retyping the lot.
 */
export const draftFromRequest = (request: {
  billingName: string;
  billingEmail: string;
  billingAddress: BillingAddress;
  abn: string | null;
  poNumber: string | null;
  note: string | null;
}): InvoiceDraft => ({
  billingName: request.billingName,
  billingEmail: request.billingEmail,
  line1: request.billingAddress.line1,
  line2: request.billingAddress.line2 ?? '',
  city: request.billingAddress.city,
  state: (AU_STATE_CODES as readonly string[]).includes(request.billingAddress.state)
    ? request.billingAddress.state
    : '',
  postcode: request.billingAddress.postcode,
  abn: request.abn ?? '',
  poNumber: request.poNumber ?? '',
  note: request.note ?? '',
});

// ---------------------------------------------------------------------------
// Cleaning. The same rules as the server: control characters are removed from
// single-line fields, and the note keeps its line breaks.
// ---------------------------------------------------------------------------

const isControl = (code: number): boolean => code < 0x20 || (code >= 0x7f && code <= 0x9f);

const stripControl = (value: string, keep: (code: number) => boolean = () => false): string =>
  Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !isControl(code) || keep(code);
    })
    .join('');

const cleanLine = (value: string): string => stripControl(value).trim();

const cleanNote = (value: string): string =>
  stripControl(value.replace(/\r\n?/g, '\n'), (code) => code === 0x0a).trim();

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface InvoiceFormValidation {
  errors: InvoiceFormErrors;
  /** The payload to send, or null while any field is wrong. */
  payload: InvoiceRequestPayload | null;
}

/**
 * Checks the whole form. Every error names the field and says what to change,
 * and the sentences match the server's where the server has one.
 */
export const validateInvoiceDraft = (draft: InvoiceDraft, seats: number): InvoiceFormValidation => {
  const errors: InvoiceFormErrors = {};

  if (
    !Number.isInteger(seats) ||
    seats < SCHOOL_SEAT_LIMITS.min ||
    seats > SCHOOL_SEAT_LIMITS.max
  ) {
    errors.seats = `A school licence covers ${SCHOOL_SEAT_LIMITS.min} to ${SCHOOL_SEAT_LIMITS.max} seats. Change the number of seats and try again.`;
  }

  const billingName = cleanLine(draft.billingName);
  if (!billingName || billingName.length > INVOICE_FIELD_LIMITS.name) {
    errors.billingName = `Enter the name the invoice should be made out to, up to ${INVOICE_FIELD_LIMITS.name} characters.`;
  }

  const billingEmail = cleanLine(draft.billingEmail);
  if (
    !billingEmail ||
    billingEmail.length > INVOICE_FIELD_LIMITS.email ||
    !EMAIL_SHAPE.test(billingEmail)
  ) {
    errors.billingEmail =
      'Enter the billing email address the accounts office reads, for example accounts@yourschool.edu.au.';
  }

  const line1 = cleanLine(draft.line1);
  if (!line1 || line1.length > INVOICE_FIELD_LIMITS.addressLine) {
    errors.line1 = `Enter the street address, up to ${INVOICE_FIELD_LIMITS.addressLine} characters.`;
  }

  const line2 = cleanLine(draft.line2);
  if (line2.length > INVOICE_FIELD_LIMITS.addressLine) {
    errors.line2 = `The second address line is longer than ${INVOICE_FIELD_LIMITS.addressLine} characters. Shorten it or leave it blank.`;
  }

  const city = cleanLine(draft.city);
  if (!city || city.length > INVOICE_FIELD_LIMITS.city) {
    errors.city = `Enter the suburb or town, up to ${INVOICE_FIELD_LIMITS.city} characters.`;
  }

  const state = cleanLine(draft.state).toUpperCase();
  if (!(AU_STATE_CODES as readonly string[]).includes(state)) {
    errors.state = 'Choose the state the school is in.';
  }

  const postcode = cleanLine(draft.postcode);
  if (!/^\d{4}$/.test(postcode)) {
    errors.postcode = 'The postcode is four digits, for example 2000.';
  }

  let abn: string | null = null;
  const rawAbn = cleanLine(draft.abn);
  if (rawAbn !== '') {
    abn = normaliseAbn(rawAbn);
    if (!abn) {
      errors.abn =
        'The ABN is not valid. Check the eleven digits on the school’s ABN record, or leave the field blank.';
    }
  }

  const poNumber = cleanLine(draft.poNumber);
  if (poNumber.length > INVOICE_FIELD_LIMITS.poNumber) {
    errors.poNumber = `The purchase order number is longer than ${INVOICE_FIELD_LIMITS.poNumber} characters. Shorten it or leave it blank.`;
  }

  const note = cleanNote(draft.note);
  if (note.length > INVOICE_FIELD_LIMITS.note) {
    errors.note = `The note is longer than ${INVOICE_FIELD_LIMITS.note} characters. Shorten it or leave it blank.`;
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };

  return {
    errors,
    payload: {
      seats,
      billingName,
      billingEmail,
      billingAddress: {
        line1,
        line2: line2 || null,
        city,
        state,
        postcode,
        country: 'AU',
      },
      abn,
      poNumber: poNumber || null,
      note: note || null,
    },
  };
};

// ---------------------------------------------------------------------------
// The ABN field, which is checked as it is typed
// ---------------------------------------------------------------------------

export interface AbnFeedback {
  tone: 'hint' | 'error';
  message: string;
}

const ABN_HINT =
  'Optional. Eleven digits. It prints on the tax invoice, so the accounts office can match it to the school.';

/**
 * What the ABN field says while it is being typed. A partial number is only an
 * error once the person has left the field (`blurred`), so the field does not
 * shout at someone who is still typing. A full eleven digits are checked at
 * once, because that is the moment a mistake can be fixed cheaply.
 */
export const abnFeedback = (raw: string, blurred: boolean): AbnFeedback | null => {
  const value = raw.trim();
  if (value === '') return { tone: 'hint', message: ABN_HINT };
  if (/[^\d\s]/.test(value)) {
    return {
      tone: 'error',
      message: 'An ABN has only digits. Remove any letters or punctuation.',
    };
  }
  const digits = value.replace(/\s/g, '');
  if (digits.length < 11) {
    return blurred
      ? {
          tone: 'error',
          message:
            'An ABN has eleven digits. Check the number on the school’s ABN record, or leave the field blank.',
        }
      : { tone: 'hint', message: ABN_HINT };
  }
  if (digits.length > 11) {
    return {
      tone: 'error',
      message: 'An ABN has eleven digits. Remove the extra digits.',
    };
  }
  return normaliseAbn(digits) === null
    ? {
        tone: 'error',
        message:
          'The ABN is not valid. Check the eleven digits on the school’s ABN record, or leave the field blank.',
      }
    : null;
};
