import { describe, it, expect } from 'vitest';
import { promptBandForMark, rangedGuideRows } from '../../utils/guideBands';
import { parseMarkingCriteria } from '../../utils/markingGuideParse';
import { getBandForMark } from '../../data/commandTerms';

/**
 * On a guide written in mark ranges a mark takes the band of the row it falls in
 * (the row's top mark's band), so the guide, its exemplars and the feedback agree
 * on a band (utils/guideBands.ts).
 */
const NESA_20 =
  '17-20 marks: Analyses skilfully\n13-16 marks: Analyses effectively\n9-12 marks: Explains\n5-8 marks: Describes\n1-4 marks: Refers minimally';
const NESA_8 =
  '7-8 marks: Explains in detail\n5-6 marks: Explains\n3-4 marks: Outlines\n1-2 marks: Provides some relevant information';

describe('bands on a ranged marking guide', () => {
  it('reads a 20-mark DISCUSS one row to a band, Band 5 at the top, as its guide labels them', () => {
    const q = { totalMarks: 20, verb: 'DISCUSS', markingCriteria: NESA_20 };
    expect([20, 17, 16, 13, 12, 9, 8, 5, 4, 1].map((m) => promptBandForMark(q, m))).toEqual([
      5, 5, 4, 4, 3, 3, 2, 2, 1, 1,
    ]);
    expect(parseMarkingCriteria(NESA_20, 20, 5).map((r) => r.band)).toEqual([5, 4, 3, 2, 1]);
  });

  it('puts every mark of a row in the row’s band, where the formula would split it', () => {
    const q = { totalMarks: 8, verb: 'EXPLAIN', markingCriteria: NESA_8 };
    // The formula puts 5/8 and 6/8 in different bands; the guide's 5-6 row is one.
    expect(getBandForMark(5, 8, 3)).not.toBe(getBandForMark(6, 8, 3));
    expect(promptBandForMark(q, 5)).toBe(promptBandForMark(q, 6));
    const rows = parseMarkingCriteria(NESA_8, 8, 3);
    expect(rows.map((r) => r.band)).toEqual([3, 3, 2, 1]);
    expect(promptBandForMark(q, 5)).toBe(rows[1].band);
    expect(promptBandForMark(q, 3)).toBe(rows[2].band);
  });

  it('agrees with the formula on the app’s own one-band-per-row rubrics', () => {
    const tier4of7 = '6-7 marks: a\n4-5 marks: b\n2-3 marks: c\n1 mark: d';
    const q = { totalMarks: 7, verb: 'ANALYSE', markingCriteria: tier4of7 };
    for (let m = 1; m <= 7; m++) expect(promptBandForMark(q, m)).toBe(getBandForMark(m, 7, 4));
  });

  it('falls back to the formula for per-mark, band-labelled, gapped or missing guides', () => {
    expect(rangedGuideRows('4 marks: a\n3 marks: b\n2 marks: c\n1 mark: d')).toBeNull();
    expect(rangedGuideRows('Band 6: a\nBand 5: b')).toBeNull();
    expect(rangedGuideRows('17-20 marks: a\n9-12 marks: b')).toBeNull();
    expect(rangedGuideRows(undefined)).toBeNull();
    const q = { totalMarks: 20, verb: 'DISCUSS' };
    expect(promptBandForMark(q, 13)).toBe(getBandForMark(13, 20, 5));
  });
});
