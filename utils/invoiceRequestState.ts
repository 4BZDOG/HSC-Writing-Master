import type { LicenceRequest } from '../services/licenceRequestService';

/**
 * Which face the purchase-order panel shows: the form, or the state of the
 * person's last request. Pure, so the rule that decides it is tested directly.
 */
export type InvoiceRequestView =
  | { kind: 'form' }
  | { kind: 'pending'; request: LicenceRequest }
  | { kind: 'approved'; request: LicenceRequest }
  | { kind: 'declined'; request: LicenceRequest };

/**
 * Chooses the view from the person's own requests, newest first (the order
 * `fetchMyLicenceRequests` returns them in).
 *
 * A pending request wins over everything, because the school has one waiting
 * and a second form would only be refused. Otherwise the newest decides: an
 * approved one shows the invoice and hides the form, a declined one shows the
 * administrator's note and the form to ask again. A cancelled request does not
 * block a new one, so it shows the form.
 */
export const selectInvoiceView = (requests: readonly LicenceRequest[]): InvoiceRequestView => {
  const pending = requests.find((request) => request.status === 'pending');
  if (pending) return { kind: 'pending', request: pending };

  const latest = requests[0];
  if (!latest) return { kind: 'form' };
  if (latest.status === 'approved') return { kind: 'approved', request: latest };
  if (latest.status === 'declined') return { kind: 'declined', request: latest };
  return { kind: 'form' };
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // The school is in NSW. A request made just after midnight Sydney time must
  // not read as the day before, which a UTC date would do.
  timeZone: 'Australia/Sydney',
});

/** "14 October 2026", in the school's own clock, or '' for a value that is not a date. */
export const formatRequestDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : DATE_FORMAT.format(new Date(time));
};

/** "1 seat" or "30 seats". */
export const seatsPhrase = (seats: number): string => (seats === 1 ? '1 seat' : `${seats} seats`);

/** "51 824 753 556", the way an ABN is printed. Anything that is not eleven digits is returned as it was. */
export const formatAbn = (digits: string): string =>
  /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
    : digits;
