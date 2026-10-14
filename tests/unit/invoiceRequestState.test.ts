import { describe, it, expect } from 'vitest';
import type { LicenceRequest, LicenceRequestStatus } from '../../services/licenceRequestService';
import { formatRequestDate, seatsPhrase, selectInvoiceView } from '../../utils/invoiceRequestState';

const request = (id: string, status: LicenceRequestStatus): LicenceRequest => ({
  id,
  status,
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
  poNumber: null,
  note: null,
  decidedAt: null,
  decisionNote: null,
  hostedInvoiceUrl: null,
  createdAt: '2026-10-14T01:00:00.000Z',
});

describe('selectInvoiceView', () => {
  it('shows the form to someone who has never asked', () => {
    expect(selectInvoiceView([])).toEqual({ kind: 'form' });
  });

  it('shows a pending request, and hides the form', () => {
    const pending = request('a', 'pending');
    expect(selectInvoiceView([pending])).toEqual({ kind: 'pending', request: pending });
  });

  it('shows an approved request, with its invoice', () => {
    const approved = request('a', 'approved');
    expect(selectInvoiceView([approved])).toEqual({ kind: 'approved', request: approved });
  });

  it('shows a declined request, so the person can ask again', () => {
    const declined = request('a', 'declined');
    expect(selectInvoiceView([declined])).toEqual({ kind: 'declined', request: declined });
  });

  it('lets a cancelled request be replaced by the form', () => {
    expect(selectInvoiceView([request('a', 'cancelled')])).toEqual({ kind: 'form' });
  });

  it('prefers a pending request to a newer declined one', () => {
    const pending = request('old', 'pending');
    expect(selectInvoiceView([request('new', 'declined'), pending])).toEqual({
      kind: 'pending',
      request: pending,
    });
  });

  it('reads the newest request, so a school that asks again after a decline sees the new one', () => {
    const approved = request('new', 'approved');
    expect(selectInvoiceView([approved, request('old', 'declined')])).toEqual({
      kind: 'approved',
      request: approved,
    });
  });
});

describe('formatRequestDate', () => {
  it('writes the date in words, in the school’s own clock', () => {
    expect(formatRequestDate('2026-10-14T01:00:00.000Z')).toBe('14 October 2026');
  });

  it('does not read a request made just after midnight in Sydney as the day before', () => {
    // 14:30 UTC on 13 October is 01:30 on 14 October in Sydney (AEDT, UTC+11).
    expect(formatRequestDate('2026-10-13T14:30:00.000Z')).toBe('14 October 2026');
  });

  it('returns nothing for a missing or unreadable value', () => {
    expect(formatRequestDate(null)).toBe('');
    expect(formatRequestDate(undefined)).toBe('');
    expect(formatRequestDate('not a date')).toBe('');
  });
});

describe('seatsPhrase', () => {
  it('uses the singular for one seat only', () => {
    expect(seatsPhrase(1)).toBe('1 seat');
    expect(seatsPhrase(5)).toBe('5 seats');
  });
});
