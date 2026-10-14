import { describe, it, expect } from 'vitest';
import { buildLicenceNote } from '../../utils/licenceNote';

/**
 * The champion note is what a teacher sends an administrator. It has to say what
 * the licence covers, what it costs per student, how it is paid, and where the
 * app is, and nothing that pushes the reader to decide quickly.
 */

const base = {
  seatPrice: 'A$4',
  invoicing: false,
  appUrl: 'https://writing.example.edu.au/',
};

describe('buildLicenceNote', () => {
  it('names the school, the per-student price and what the licence covers', () => {
    const note = buildLicenceNote({ ...base, schoolName: 'Hills High' });
    expect(note).toContain('at Hills High for a year');
    expect(note).toContain('A$4 per student a year');
    expect(note).toMatch(/class and school progress reports for staff/);
  });

  it('falls back to "the school" when the account does not know its school', () => {
    expect(buildLicenceNote({ ...base, schoolName: null })).toContain('at the school for a year');
    expect(buildLicenceNote({ ...base, schoolName: '   ' })).toContain('at the school for a year');
  });

  it('says it is paid by card, and offers an invoice only where one can be raised', () => {
    expect(buildLicenceNote({ ...base, invoicing: false })).toContain('It is paid by card.');
    expect(buildLicenceNote({ ...base, invoicing: false })).not.toMatch(/purchase order/);
    expect(buildLicenceNote({ ...base, invoicing: true })).toContain(
      'by invoice against a purchase order'
    );
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
