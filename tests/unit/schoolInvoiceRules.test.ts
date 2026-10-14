import { describe, it, expect, afterEach } from 'vitest';

/**
 * The pure rules behind invoiced (purchase-order) school licences. The two
 * endpoints lean on these for every refusal, so each table here pins one rule
 * the money path depends on: what counts as a live licence, what an ABN must
 * look like, and which values are refused rather than quietly changed.
 */

import {
  INVOICE_LIMITS,
  invoicedLicencesEnabled,
  normaliseAbn,
  schoolHoldsLiveLicence,
  validateDecisionRequest,
  validateInvoiceRequest,
} from '../../api/_lib/schoolLicence';

const goodAddress = {
  line1: '1 Test Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

const goodRequest = {
  seats: 30,
  billingName: 'Parramatta High School',
  billingEmail: 'accounts@school.edu.au',
  billingAddress: goodAddress,
  abn: '51 824 753 556',
  poNumber: 'PO-2026-0412',
  note: 'For the Year 12 English team',
};

const savedEnv = { ...process.env };
afterEach(() => {
  for (const key of ['SCHOOL_INVOICE_ENABLED', 'VITE_SCHOOL_INVOICE_ENABLED']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('schoolHoldsLiveLicence', () => {
  it.each(['active', 'trialing', 'past_due'])(
    'holds a licence while the status is %s',
    (status) => {
      expect(schoolHoldsLiveLicence({ stripe_subscription_id: 'sub_1', plan_status: status })).toBe(
        true
      );
    }
  );

  it('still holds a licence that is set to cancel at period end (Stripe keeps it active)', () => {
    expect(schoolHoldsLiveLicence({ stripe_subscription_id: 'sub_1', plan_status: 'active' })).toBe(
      true
    );
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired', 'none'])(
    'does not hold a licence when the status is %s',
    (status) => {
      expect(schoolHoldsLiveLicence({ stripe_subscription_id: 'sub_1', plan_status: status })).toBe(
        false
      );
    }
  );

  it('does not hold a licence without a subscription id, whatever the status says', () => {
    expect(schoolHoldsLiveLicence({ stripe_subscription_id: null, plan_status: 'active' })).toBe(
      false
    );
  });

  it('treats a missing school as no licence', () => {
    expect(schoolHoldsLiveLicence(null)).toBe(false);
    expect(schoolHoldsLiveLicence(undefined)).toBe(false);
  });
});

describe('normaliseAbn', () => {
  it('accepts the ATO example, with or without spaces, and returns the eleven digits', () => {
    expect(normaliseAbn('51 824 753 556')).toBe('51824753556');
    expect(normaliseAbn('51824753556')).toBe('51824753556');
  });

  it('rejects a well-formed ABN whose check digit is wrong', () => {
    expect(normaliseAbn('51 824 753 557')).toBeNull();
  });

  it('rejects anything that is not exactly eleven digits', () => {
    expect(normaliseAbn('5182475355')).toBeNull();
    expect(normaliseAbn('518247535560')).toBeNull();
    expect(normaliseAbn('51-824-753-556')).toBeNull();
    expect(normaliseAbn('AB 824 753 556')).toBeNull();
    expect(normaliseAbn('')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(normaliseAbn(51824753556)).toBeNull();
    expect(normaliseAbn(undefined)).toBeNull();
    expect(normaliseAbn(null)).toBeNull();
  });
});

describe('validateInvoiceRequest', () => {
  it('accepts a complete request and returns the cleaned value', () => {
    const result = validateInvoiceRequest(goodRequest);
    expect(result).toEqual({
      ok: true,
      value: {
        seats: 30,
        billingName: 'Parramatta High School',
        billingEmail: 'accounts@school.edu.au',
        billingAddress: {
          line1: '1 Test Street',
          line2: null,
          city: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'AU',
        },
        abn: '51824753556',
        poNumber: 'PO-2026-0412',
        note: 'For the Year 12 English team',
      },
    });
  });

  it('accepts the optional fields being left out', () => {
    const result = validateInvoiceRequest({
      seats: 5,
      billingName: 'Accounts',
      billingEmail: 'a@b.co',
      billingAddress: goodAddress,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.abn).toBeNull();
      expect(result.value.poNumber).toBeNull();
      expect(result.value.note).toBeNull();
    }
  });

  it('accepts a seat count sent as a numeric string, the way a form posts it', () => {
    const result = validateInvoiceRequest({ ...goodRequest, seats: '45' });
    expect(result.ok && result.value.seats).toBe(45);
  });

  describe('seat bounds are refused, not clamped', () => {
    it.each([4, 1001, 30.5, '', 'thirty', null, undefined, true])(
      'refuses seats of %s',
      (seats) => {
        const result = validateInvoiceRequest({ ...goodRequest, seats });
        expect(result.ok).toBe(false);
      }
    );

    it('explains the range in plain English', () => {
      const result = validateInvoiceRequest({ ...goodRequest, seats: 3 });
      expect(result.ok === false && result.error).toContain('5 to 1000');
    });
  });

  describe('email shape', () => {
    it.each(['', 'accounts', 'accounts@school', 'a b@school.edu.au', 'a@@school.edu.au'])(
      'refuses %j',
      (billingEmail) => {
        expect(validateInvoiceRequest({ ...goodRequest, billingEmail }).ok).toBe(false);
      }
    );

    it('refuses an address longer than the cap', () => {
      const local = 'a'.repeat(INVOICE_LIMITS.email);
      expect(validateInvoiceRequest({ ...goodRequest, billingEmail: `${local}@x.co` }).ok).toBe(
        false
      );
    });
  });

  describe('length caps', () => {
    it('accepts a name exactly at the cap and refuses one character more', () => {
      const atCap = 'N'.repeat(INVOICE_LIMITS.name);
      expect(validateInvoiceRequest({ ...goodRequest, billingName: atCap }).ok).toBe(true);
      expect(validateInvoiceRequest({ ...goodRequest, billingName: `${atCap}N` }).ok).toBe(false);
    });

    it('refuses a purchase order number over the cap', () => {
      const result = validateInvoiceRequest({
        ...goodRequest,
        poNumber: 'P'.repeat(INVOICE_LIMITS.poNumber + 1),
      });
      expect(result.ok).toBe(false);
    });

    it('refuses a note over the cap', () => {
      const result = validateInvoiceRequest({
        ...goodRequest,
        note: 'x'.repeat(INVOICE_LIMITS.note + 1),
      });
      expect(result.ok).toBe(false);
    });

    it('refuses a blank billing name', () => {
      expect(validateInvoiceRequest({ ...goodRequest, billingName: '   ' }).ok).toBe(false);
    });
  });

  describe('control characters', () => {
    it('strips tabs, bells and line breaks from single-line fields', () => {
      const result = validateInvoiceRequest({
        ...goodRequest,
        billingName: '  Acc\tounts\u0007\nOffice ',
      });
      expect(result.ok && result.value.billingName).toBe('AccountsOffice');
    });

    it('keeps line breaks in the note but normalises them, and strips other control characters', () => {
      const result = validateInvoiceRequest({
        ...goodRequest,
        note: 'Line one\r\nLine two\u0007',
      });
      expect(result.ok && result.value.note).toBe('Line one\nLine two');
    });
  });

  describe('address shape', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['no street line', { line1: '' }],
      ['no suburb', { city: '' }],
      ['a state that is not Australian', { state: 'XX' }],
      ['a three-digit postcode', { postcode: '200' }],
      ['a letters-only postcode', { postcode: 'ABCD' }],
      ['a country other than Australia', { country: 'NZ' }],
    ];
    for (const [label, change] of cases) {
      it(`refuses ${label}`, () => {
        const result = validateInvoiceRequest({
          ...goodRequest,
          billingAddress: { ...goodAddress, ...change },
        });
        expect(result.ok).toBe(false);
      });
    }

    it('refuses a missing address', () => {
      expect(validateInvoiceRequest({ ...goodRequest, billingAddress: undefined }).ok).toBe(false);
      expect(validateInvoiceRequest({ ...goodRequest, billingAddress: 'Sydney' }).ok).toBe(false);
    });

    it('accepts the state in lower case and normalises it', () => {
      const result = validateInvoiceRequest({
        ...goodRequest,
        billingAddress: { ...goodAddress, state: 'nsw' },
      });
      expect(result.ok && result.value.billingAddress.state).toBe('NSW');
    });

    it('defaults the country to Australia when it is left out', () => {
      const { country: _country, ...withoutCountry } = goodAddress;
      const result = validateInvoiceRequest({
        ...goodRequest,
        billingAddress: withoutCountry,
      });
      expect(result.ok && result.value.billingAddress.country).toBe('AU');
    });
  });

  describe('ABN', () => {
    it('refuses an ABN that fails the checksum rather than storing it', () => {
      const result = validateInvoiceRequest({ ...goodRequest, abn: '51 824 753 557' });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain('ABN');
    });

    it('treats a blank ABN as not given', () => {
      const result = validateInvoiceRequest({ ...goodRequest, abn: '  ' });
      expect(result.ok && result.value.abn).toBeNull();
    });
  });

  it('refuses a body that is not an object', () => {
    expect(validateInvoiceRequest(null).ok).toBe(false);
    expect(validateInvoiceRequest('seats=30').ok).toBe(false);
    expect(validateInvoiceRequest([goodRequest]).ok).toBe(false);
  });
});

describe('validateDecisionRequest', () => {
  const requestId = '6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

  it('accepts an approval and defaults payment terms to 30 days', () => {
    expect(validateDecisionRequest({ requestId, action: 'approve' })).toEqual({
      ok: true,
      value: { requestId, action: 'approve', decisionNote: null, daysUntilDue: 30 },
    });
  });

  it('accepts a decline with a note', () => {
    const result = validateDecisionRequest({
      requestId,
      action: 'decline',
      decisionNote: 'Please resubmit with the PO number.',
    });
    expect(result.ok && result.value.decisionNote).toBe('Please resubmit with the PO number.');
  });

  it.each([6, 91, 30.5, 'soon'])('refuses payment terms of %s days', (daysUntilDue) => {
    expect(validateDecisionRequest({ requestId, action: 'approve', daysUntilDue }).ok).toBe(false);
  });

  it('accepts payment terms at both ends of the range', () => {
    expect(validateDecisionRequest({ requestId, action: 'approve', daysUntilDue: 7 }).ok).toBe(
      true
    );
    expect(validateDecisionRequest({ requestId, action: 'approve', daysUntilDue: 90 }).ok).toBe(
      true
    );
  });

  it('refuses an action other than approve or decline', () => {
    expect(validateDecisionRequest({ requestId, action: 'delete' }).ok).toBe(false);
    expect(validateDecisionRequest({ requestId }).ok).toBe(false);
  });

  it('refuses a request id that is not a UUID', () => {
    expect(validateDecisionRequest({ requestId: 'not-a-uuid', action: 'approve' }).ok).toBe(false);
    expect(validateDecisionRequest({ action: 'approve' }).ok).toBe(false);
  });
});

describe('invoicedLicencesEnabled (kill switch)', () => {
  it('is on by default', () => {
    delete process.env.SCHOOL_INVOICE_ENABLED;
    delete process.env.VITE_SCHOOL_INVOICE_ENABLED;
    expect(invoicedLicencesEnabled()).toBe(true);
  });

  it('is off when SCHOOL_INVOICE_ENABLED is false', () => {
    process.env.SCHOOL_INVOICE_ENABLED = 'false';
    expect(invoicedLicencesEnabled()).toBe(false);
  });

  it('falls back to the VITE_ copy when the server variable is unset', () => {
    delete process.env.SCHOOL_INVOICE_ENABLED;
    process.env.VITE_SCHOOL_INVOICE_ENABLED = 'false';
    expect(invoicedLicencesEnabled()).toBe(false);
  });

  it('the server variable wins over the VITE_ copy', () => {
    process.env.SCHOOL_INVOICE_ENABLED = 'true';
    process.env.VITE_SCHOOL_INVOICE_ENABLED = 'false';
    expect(invoicedLicencesEnabled()).toBe(true);
  });
});
