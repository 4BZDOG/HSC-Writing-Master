import { describe, it, expect } from 'vitest';
import { buildLicenceNote } from '../../utils/licenceNote';

/**
 * The champion note is what a teacher sends an administrator. It has to say what
 * the licence covers, what it costs per student, how it is paid, and where the
 * app is, and nothing that pushes the reader to decide quickly.
 */

const base = {
  seatPrice: 'A$4',
  productName: 'Band 6 — HSC Writing Coach',
  invoicing: false,
  appUrl: 'https://writing.example.edu.au/',
};

describe('buildLicenceNote', () => {
  it('names the school, the per-student price and what the licence covers', () => {
    const note = buildLicenceNote({ ...base, schoolName: 'Hills High' });
    expect(note).toContain('at Hills High for A$4 per student a year');
    expect(note).toMatch(/class and school progress reports for staff/);
  });

  it('falls back to "the school" when the account does not know its school', () => {
    expect(buildLicenceNote({ ...base, schoolName: null })).toContain('at the school for A$4');
    expect(buildLicenceNote({ ...base, schoolName: '   ' })).toContain('at the school for A$4');
  });

  it('says it is paid by card, and offers an invoice only where one can be raised', () => {
    expect(buildLicenceNote({ ...base, invoicing: false })).toContain('It is paid by card.');
    expect(buildLicenceNote({ ...base, invoicing: false })).not.toMatch(/purchase order/);
    expect(buildLicenceNote({ ...base, invoicing: true })).toContain(
      'by invoice against a purchase order'
    );
  });

  it('states the GST position beside the seat price, and says nothing when it is not known', () => {
    expect(buildLicenceNote({ ...base, seatGst: 'incl. GST' })).toContain(
      'A$4 per student a year incl. GST,'
    );
    expect(buildLicenceNote({ ...base, seatGst: '+ GST' })).toContain(
      'A$4 per student a year + GST,'
    );
    expect(buildLicenceNote({ ...base, seatGst: null })).not.toMatch(/GST/);
  });

  it('names the product as the admin will find it, not the repository', () => {
    const note = buildLicenceNote(base);
    expect(note).toContain('a School licence for Band 6 — HSC Writing Coach.');
    expect(note).not.toMatch(/Writing Master/);
  });

  it('states a monthly seat price as monthly', () => {
    expect(buildLicenceNote({ ...base, seatInterval: 'month' })).toContain(
      'A$4 per student a month'
    );
    expect(buildLicenceNote(base)).toContain('A$4 per student a year');
  });

  it('gives the address of the app', () => {
    expect(buildLicenceNote(base)).toContain('The app is at https://writing.example.edu.au/.');
  });

  it('is plain: no exclamation marks, no pressure, and it ends as a sentence', () => {
    const note = buildLicenceNote({ ...base, schoolName: 'Hills High', invoicing: true });
    expect(note).not.toContain('!');
    expect(note).not.toMatch(/act now|limited|don't miss|today only|last chance|urgent/i);
    expect(note.endsWith('.')).toBe(true);
  });
});
