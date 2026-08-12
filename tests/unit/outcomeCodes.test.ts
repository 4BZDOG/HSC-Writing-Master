import { describe, it, expect } from 'vitest';
import { duplicateCodeRows, withoutDuplicateCodes } from '../../utils/outcomeCodes';

/**
 * A question links to an outcome BY CODE, so two rows sharing one code make
 * every link through it ambiguous — and it is easy to end up with: parse a page
 * twice, paste a list overlapping one already typed, or copy a row to edit and
 * forget to change the code.
 */

describe('repeated outcome codes', () => {
  it('flags the later row, not the first', () => {
    const rows = [
      { code: 'BI-12-01', description: 'first' },
      { code: 'BI-12-02', description: 'other' },
      { code: 'BI-12-01', description: 'again' },
    ];
    // Which of the two the author meant to keep is not something the code can
    // know, so the one they typed first stays.
    expect([...duplicateCodeRows(rows)]).toEqual([2]);
    expect(withoutDuplicateCodes(rows).map((o) => o.description)).toEqual(['first', 'other']);
  });

  it('matches the way a person reads a code', () => {
    const rows = [
      { code: 'BI-12-01', description: 'first' },
      { code: ' bi-12-01 ', description: 'same thing, typed differently' },
    ];
    expect([...duplicateCodeRows(rows)]).toEqual([1]);
  });

  it('does not treat blank rows as repeats of each other', () => {
    // Two empty rows are unfinished, not duplicated — flagging them would put a
    // warning under every row an author has just added.
    const rows = [
      { code: '', description: '' },
      { code: '', description: '' },
    ];
    expect(duplicateCodeRows(rows).size).toBe(0);
  });
});
