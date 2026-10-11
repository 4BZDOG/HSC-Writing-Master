// pdf/reportFormat.ts
//
// Presentation of the progress report's values: dates, shares, counts and the
// export filename. The data side hands over ISO strings and fractions; the print
// side formats them here, in one place, so a date reads the same on the page, in
// the footer and in the filename. Pure and deterministic — no Intl, so the output
// does not depend on the host's locale data.
//
// Dates are read in local time, which is what the reader sees on their own clock.
// Tests use mid-day times so a timezone offset cannot move a date across midnight.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An ISO timestamp as epoch milliseconds, or null when it is not a date. */
export const parseTime = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** "12 Aug" — or "12 Aug 2026" when `withYear`. Empty string for a non-date. */
export const formatShortDate = (iso: string | null | undefined, withYear = false): string => {
  const t = parseTime(iso);
  if (t === null) return '';
  const d = new Date(t);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
};

/** "12 Aug – 4 Oct 2026", or "12 Aug 2025 – 4 Oct 2026" when the years differ. */
export const formatDateRange = (
  first: string | null | undefined,
  last: string | null | undefined
): string => {
  const a = parseTime(first);
  const b = parseTime(last);
  if (a === null && b === null) return '';
  if (a === null || b === null) {
    const only = a === null ? last : first;
    return formatShortDate(only, true);
  }
  const start = new Date(a);
  const end = new Date(b);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return formatShortDate(last, true);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatShortDate(first, !sameYear)} – ${formatShortDate(last, true)}`;
};

/** A 0–1 share as a whole percentage: 0.8 -> "80%". */
export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;

/** "1 attempt", "5 attempts". */
export const formatAttempts = (n: number): string => `${n} attempt${n === 1 ? '' : 's'}`;

/** A mean band to one decimal place: 4.333 -> "4.3". */
export const formatBand = (band: number): string => band.toFixed(1);

/** The local calendar date as yyyy-mm-dd, for filenames. */
export const reportDateStamp = (iso: string | null | undefined): string => {
  const t = parseTime(iso);
  if (t === null) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * One filename part, made safe for every filesystem the file might land on:
 * accents folded to ASCII, runs of anything else collapsed to a single hyphen.
 */
export const filenamePart = (text: string, maxLength = 60): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

/** A whole number with a thousands separator: 1234 -> "1,234". Plain, so it reads the same anywhere. */
export const formatInt = (n: number | null | undefined): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * A change in band as an arrow and a number: "▲ 1.5", "▼ 0.5". Zero reads as
 * level, "0.0", with no arrow. Null is an em dash.
 */
export const formatChange = (change: number | null | undefined): string => {
  if (typeof change !== 'number' || !Number.isFinite(change)) return '—';
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return '0.0';
  return `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded).toFixed(1)}`;
};
