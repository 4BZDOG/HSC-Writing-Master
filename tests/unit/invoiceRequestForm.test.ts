import { describe, it, expect } from 'vitest';
import {
  AU_STATE_CODES,
  INVOICE_FIELD_LIMITS,
  INVOICE_FIELD_ORDER,
  abnFeedback,
  draftFromRequest,
  emptyInvoiceDraft,
  validateInvoiceDraft,
  type InvoiceDraft,
} from '../../utils/invoiceRequestForm';
import { INVOICE_LIMITS, validateInvoiceRequest } from '../../api/_lib/schoolLicence';

/**
 * The form's rules, checked two ways. The client's validator must say yes or no
 * to each draft exactly as the server does, and the limits and states must be
 * the server's. A row here fails when either side changes alone.
 */

const good: InvoiceDraft = {
  billingName: 'Parramatta High School',
  billingEmail: 'accounts@school.edu.au',
  line1: '1 Test Street',
  line2: '',
  city: 'Parramatta',
  state: 'NSW',
  postcode: '2150',
  abn: '51 824 753 556',
  poNumber: 'PO-2026-0412',
  note: 'For the Year 12 English team',
};

const withChanges = (changes: Partial<InvoiceDraft>): InvoiceDraft => ({ ...good, ...changes });

/** The body the server's validator is given for the same form values. */
const asServerBody = (draft: InvoiceDraft, seats: number) => ({
  seats,
  billingName: draft.billingName,
  billingEmail: draft.billingEmail,
  billingAddress: {
    line1: draft.line1,
    line2: draft.line2,
    city: draft.city,
    state: draft.state,
    postcode: draft.postcode,
    country: 'AU',
  },
  abn: draft.abn,
  poNumber: draft.poNumber,
  note: draft.note,
});

const cases: [string, InvoiceDraft, number][] = [
  ['a complete form', good, 30],
  ['only the required fields', withChanges({ line2: '', abn: '', poNumber: '', note: '' }), 5],
  [
    'every optional field blank, with spaces only',
    withChanges({ abn: '  ', poNumber: ' ', note: '  ' }),
    30,
  ],
  ['a blank billing name', withChanges({ billingName: '' }), 30],
  ['a billing name at the cap', withChanges({ billingName: 'x'.repeat(150) }), 30],
  ['a billing name one over the cap', withChanges({ billingName: 'x'.repeat(151) }), 30],
  [
    'a billing name padded to the cap with spaces',
    withChanges({ billingName: `${'x'.repeat(150)}   ` }),
    30,
  ],
  ['a tab inside the billing name', withChanges({ billingName: 'Parramatta\tHigh School' }), 30],
  ['an email with no domain', withChanges({ billingEmail: 'accounts@school' }), 30],
  ['an email with a space', withChanges({ billingEmail: 'acc ounts@school.edu.au' }), 30],
  ['a blank street', withChanges({ line1: '' }), 30],
  ['a street at the cap', withChanges({ line1: 'x'.repeat(100) }), 30],
  ['a street one over the cap', withChanges({ line1: 'x'.repeat(101) }), 30],
  ['a second line one over the cap', withChanges({ line2: 'x'.repeat(101) }), 30],
  ['a blank suburb', withChanges({ city: '' }), 30],
  ['a suburb one over the cap', withChanges({ city: 'x'.repeat(61) }), 30],
  ['a lower-case state', withChanges({ state: 'nsw' }), 30],
  ['a state outside Australia', withChanges({ state: 'NZ' }), 30],
  ['no state', withChanges({ state: '' }), 30],
  ['a three-digit postcode', withChanges({ postcode: '200' }), 30],
  ['a five-digit postcode', withChanges({ postcode: '21500' }), 30],
  ['a postcode with letters', withChanges({ postcode: 'ABCD' }), 30],
  ['an ABN with a wrong check digit', withChanges({ abn: '51 824 753 557' }), 30],
  ['an ABN that is too short', withChanges({ abn: '5182' }), 30],
  ['an ABN with a prefix', withChanges({ abn: 'ABN 51 824 753 556' }), 30],
  ['a purchase order at the cap', withChanges({ poNumber: 'P'.repeat(60) }), 30],
  ['a purchase order one over the cap', withChanges({ poNumber: 'P'.repeat(61) }), 30],
  ['a note at the cap', withChanges({ note: 'n'.repeat(1000) }), 30],
  ['a note one over the cap', withChanges({ note: 'n'.repeat(1001) }), 30],
  [
    'a note with Windows line breaks',
    withChanges({ note: 'Needed by Friday\r\nPlease quote the PO' }),
    30,
  ],
  ['a note with a bell character', withChanges({ note: 'Needed\u0007 by Friday' }), 30],
  ['seats below the range', good, 4],
  ['seats above the range', good, 1001],
  ['seats at the bottom of the range', good, 5],
  ['seats at the top of the range', good, 1000],
  ['a fractional seat count', good, 30.5],
];

describe('the client validator agrees with the server on every case', () => {
  it.each(cases)('%s', (_label, draft, seats) => {
    const client = validateInvoiceDraft(draft, seats);
    const server = validateInvoiceRequest(asServerBody(draft, seats));
    expect(client.payload !== null).toBe(server.ok);
  });

  it('keeps every table row meaningful: some pass and some fail', () => {
    const outcomes = cases.map(
      ([, draft, seats]) => validateInvoiceDraft(draft, seats).payload !== null
    );
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
  });
});

describe('the limits and states are the server’s', () => {
  it('pins each length cap to INVOICE_LIMITS', () => {
    expect(INVOICE_FIELD_LIMITS).toEqual({
      name: INVOICE_LIMITS.name,
      email: INVOICE_LIMITS.email,
      addressLine: INVOICE_LIMITS.addressLine,
      city: INVOICE_LIMITS.city,
      poNumber: INVOICE_LIMITS.poNumber,
      note: INVOICE_LIMITS.note,
    });
  });

  it('accepts each state the form offers, and only those', () => {
    for (const state of AU_STATE_CODES) {
      expect(validateInvoiceRequest(asServerBody(withChanges({ state }), 30)).ok, state).toBe(true);
    }
    expect(validateInvoiceRequest(asServerBody(withChanges({ state: 'QLD ' }), 30)).ok).toBe(true);
    expect(validateInvoiceRequest(asServerBody(withChanges({ state: 'NZL' }), 30)).ok).toBe(false);
  });
});

describe('the validator says what to change', () => {
  it('returns no errors and a payload for a complete form', () => {
    const result = validateInvoiceDraft(good, 30);
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
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
      note: 'For the Year 12 English team',
    });
  });

  it('sends null for every blank optional field', () => {
    const result = validateInvoiceDraft(
      withChanges({ line2: '', abn: '', poNumber: '', note: '' }),
      5
    );
    expect(result.payload).toMatchObject({ abn: null, poNumber: null, note: null });
    expect(result.payload?.billingAddress.line2).toBeNull();
  });

  it('names each bad field, and no good one', () => {
    const result = validateInvoiceDraft(
      withChanges({ billingName: '', postcode: '20', abn: '51 824 753 557' }),
      30
    );
    expect(Object.keys(result.errors).sort()).toEqual(['abn', 'billingName', 'postcode']);
    expect(result.payload).toBeNull();
  });

  it('puts a seat count out of range at form level, not on a field', () => {
    const result = validateInvoiceDraft(good, 2);
    expect(Object.keys(result.errors)).toEqual(['seats']);
  });

  it('writes every sentence in plain words, with no exclamation mark and a full stop', () => {
    const everyBad = withChanges({
      billingName: '',
      billingEmail: 'x',
      line1: '',
      line2: 'x'.repeat(101),
      city: '',
      state: '',
      postcode: '1',
      abn: '1',
      poNumber: 'P'.repeat(61),
      note: 'n'.repeat(1001),
    });
    const { errors } = validateInvoiceDraft(everyBad, 2);
    const sentences = Object.values(errors);
    expect(sentences.length).toBe(INVOICE_FIELD_ORDER.length + 1);
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toMatch(/!/);
      expect(sentence, sentence).toMatch(/\.$/);
    }
  });

  it('keeps errors to fields the form has, so focus can move to the first one', () => {
    const { errors } = validateInvoiceDraft(emptyInvoiceDraft(), 30);
    for (const key of Object.keys(errors)) {
      expect([...INVOICE_FIELD_ORDER, 'seats']).toContain(key);
    }
    expect(INVOICE_FIELD_ORDER.find((field) => errors[field])).toBe('billingName');
  });
});

describe('abnFeedback, as the ABN is typed', () => {
  it('hints while the field is empty, even after it has been left', () => {
    expect(abnFeedback('', true)?.tone).toBe('hint');
  });

  it('does not shout about a partial number while the person is still typing', () => {
    expect(abnFeedback('5182 475', false)?.tone).toBe('hint');
  });

  it('says a partial number needs eleven digits once the field has been left', () => {
    const feedback = abnFeedback('5182 475', true);
    expect(feedback?.tone).toBe('error');
    expect(feedback?.message).toMatch(/eleven digits/);
  });

  it('checks a full number at once, and clears when it passes', () => {
    expect(abnFeedback('51 824 753 557', false)?.tone).toBe('error');
    expect(abnFeedback('51 824 753 556', false)).toBeNull();
  });

  it('refuses letters and punctuation, and names the fix', () => {
    expect(abnFeedback('ABN 51 824', false)?.message).toMatch(/only digits/);
    expect(abnFeedback('51-824-753-556', false)?.tone).toBe('error');
  });

  it('refuses more than eleven digits', () => {
    expect(abnFeedback('518247535560', false)?.message).toMatch(/Remove the extra digits/);
  });
});

describe('draftFromRequest', () => {
  it('turns a declined request back into a form the person can correct', () => {
    const draft = draftFromRequest({
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
      poNumber: 'PO-1',
      note: null,
    });
    expect(draft).toEqual({
      billingName: 'Parramatta High School',
      billingEmail: 'accounts@school.edu.au',
      line1: '1 Test Street',
      line2: '',
      city: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
      abn: '',
      poNumber: 'PO-1',
      note: '',
    });
  });

  it('leaves the state blank when the stored value is not one the form offers', () => {
    const draft = draftFromRequest({
      billingName: 'X',
      billingEmail: 'x@y.co',
      billingAddress: {
        line1: '1',
        line2: null,
        city: 'C',
        state: 'Victoria',
        postcode: '3000',
        country: 'AU',
      },
      abn: null,
      poNumber: null,
      note: null,
    });
    expect(draft.state).toBe('');
  });
});
