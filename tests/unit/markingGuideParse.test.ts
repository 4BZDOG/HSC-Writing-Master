import { describe, it, expect } from 'vitest';
import {
  criterionForMark,
  exemplarMarkForItem,
  isBandLabelled,
  parseMarkingCriteria,
  type MarkingCriteriaItem,
} from '../../utils/markingGuideParse';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import type { PromptVerb } from '../../types';

/**
 * The marking guide's rows, and the mark each one holds. The Marking Guide draws
 * these rows and the Sample Answers panel reads the same rows, so a mismatch
 * here shows up as an exemplar opened against the wrong criterion.
 *
 * Tiers, from data/commandTerms: IDENTIFY 1 (caps at Band 1), DESCRIBE 2 (Band 2),
 * EXPLAIN 3 (Band 3), ANALYSE 4 (Band 4), EVALUATE 6 (Band 6).
 */

const tierOf = (verb: string): number => getCommandTermInfo(verb as PromptVerb).tier;
const ANALYSE = tierOf('ANALYSE'); // 4
const EVALUATE = tierOf('EVALUATE'); // 6
const DESCRIBE = tierOf('DESCRIBE'); // 2
const IDENTIFY = tierOf('IDENTIFY'); // 1

/** Shorthand for a parsed row, for building ladders directly in the helper tests. */
const row = (
  markLabel: string,
  markRange: [number, number],
  band: number,
  description = 'criterion'
): MarkingCriteriaItem => ({ markLabel, markRange, band, description });

describe('parseMarkingCriteria: the numeric ladder', () => {
  it('reads one row per mark, highest first, with the band each mark earns', () => {
    const guide = [
      '5 marks: Analyses effectively',
      '4 marks: Analyses with detail',
      '3 marks: Describes the features',
      '2 marks: Outlines a feature',
      '1 mark: Identifies one feature',
    ].join('\n');

    const items = parseMarkingCriteria(guide, 5, ANALYSE);

    expect(items.map((i) => i.markLabel)).toEqual(['5', '4', '3', '2', '1']);
    expect(items.map((i) => i.markRange)).toEqual([
      [5, 5],
      [4, 4],
      [3, 3],
      [2, 2],
      [1, 1],
    ]);
    // ANALYSE on 5 marks: 5 and 4 earn Band 4, then 3, 2, 1.
    expect(items.map((i) => i.band)).toEqual([4, 4, 3, 2, 1]);
    expect(items[0].description).toMatch(/Analyses effectively/);
  });

  it('takes its band from getBandForMark, not from the mark arithmetic', () => {
    const guide = '3 marks: Describes\n2 marks: Outlines\n1 mark: Identifies';
    for (const item of parseMarkingCriteria(guide, 3, EVALUATE)) {
      const mark = item.markRange[1];
      expect(item.band).toBe(getBandForMark(mark, 3, EVALUATE));
    }
  });

  it('keeps a single-mark label as the bare number', () => {
    const [only] = parseMarkingCriteria('1 mark: Names a feature', 1, IDENTIFY);
    expect(only.markLabel).toBe('1');
    expect(only.markRange).toEqual([1, 1]);
  });
});

describe('parseMarkingCriteria: range rows', () => {
  it('reads "N-M marks:" as one row holding every mark in the range', () => {
    const guide = '6-7 marks: Thorough analysis\n3-5 marks: Sound description\n1-2 marks: Basic';
    const items = parseMarkingCriteria(guide, 8, EVALUATE);

    expect(items.map((i) => i.markLabel)).toEqual(['6–7', '3–5', '1–2']);
    expect(items.map((i) => i.markRange)).toEqual([
      [6, 7],
      [3, 5],
      [1, 2],
    ]);
    // A range is labelled, and banded, by its TOP mark.
    expect(items[0].band).toBe(getBandForMark(7, 8, EVALUATE));
    expect(items[1].band).toBe(getBandForMark(5, 8, EVALUATE));
    expect(items[2].band).toBe(getBandForMark(2, 8, EVALUATE));
  });

  it('accepts an en dash or a hyphen in the range', () => {
    const items = parseMarkingCriteria('7–8 marks: a\n5-6 marks: b', 8, EVALUATE);
    expect(items.map((i) => i.markRange)).toEqual([
      [7, 8],
      [5, 6],
    ]);
  });
});

describe('parseMarkingCriteria: band-labelled rows', () => {
  it('draws a Band row at the mark that starts that band on this question', () => {
    // EVALUATE on 4 marks: Band 6 is reached first at mark 4.
    const [only] = parseMarkingCriteria('Band 6: Comprehensive, sustained evaluation', 4, EVALUATE);

    expect(only.markLabel).toBe('Band 6');
    expect(only.markRange).toEqual([4, 4]);
    expect(only.band).toBe(6);
    expect(only.description).toMatch(/Comprehensive, sustained evaluation/);
  });

  it('snaps a band the question cannot award onto the lowest band it can', () => {
    // A 4-mark EVALUATE runs Band 6 at mark 4 down to Band 3 at mark 1; Band 2
    // is unreachable, so the row a student would read as Band 2 is Band 3 at 1.
    const [only] = parseMarkingCriteria('Band 2: Elementary statements only', 4, EVALUATE);

    expect(only.markLabel).toBe('Band 3');
    expect(only.markRange).toEqual([1, 1]);
    expect(only.band).toBe(3);
  });

  it('caps a band above a Describe question ceiling at the band it can earn', () => {
    // DESCRIBE caps at Band 2. Band 6 is not reachable, so the row sits at the
    // full-marks mark and reads as the ceiling band.
    const [only] = parseMarkingCriteria('Band 6: Thorough description', 4, DESCRIBE);

    expect(only.band).toBe(2);
    expect(only.markRange).toEqual([4, 4]);
    expect(only.markLabel).toBe('Band 2');
  });

  it('keeps a reachable band exactly as the author wrote it', () => {
    const [only] = parseMarkingCriteria('Band 2: Elementary statements only', 6, EVALUATE);
    expect(only.markLabel).toBe('Band 2');
    expect(only.band).toBe(2);
  });

  it('recognises a band row through isBandLabelled, and no numeric row', () => {
    const items = parseMarkingCriteria('Band 4: Sound\n2 marks: Outlines', 4, ANALYSE);
    expect(items.map(isBandLabelled)).toEqual([true, false]);
  });
});

describe('parseMarkingCriteria: the "(N marks)" trailing style', () => {
  it('reads the label before a bracketed mark value as the criterion', () => {
    const [only] = parseMarkingCriteria('Describes both features (2 marks)', 2, DESCRIBE);

    expect(only.markLabel).toBe('2');
    expect(only.markRange).toEqual([2, 2]);
    expect(only.description).toBe('Describes both features');
  });

  it('keeps the criteria that follow a bracketed value, not just the words before it', () => {
    const [only] = parseMarkingCriteria(
      'Band 5 (6 marks) — Thorough analysis with clear relationships.',
      6,
      EVALUATE
    );

    expect(only.markLabel).toBe('6');
    expect(only.description).toMatch(/Thorough analysis with clear relationships/);
  });

  it('reads a bracketed range', () => {
    const [only] = parseMarkingCriteria('Sound explanation (3-4 marks)', 4, ANALYSE);
    expect(only.markLabel).toBe('3–4');
    expect(only.markRange).toEqual([3, 4]);
  });
});

describe('parseMarkingCriteria: continuation lines', () => {
  it('appends a wrapped line to the row above it', () => {
    const items = parseMarkingCriteria(
      'Describes both features (2 marks)\nwith a relevant example',
      2,
      DESCRIBE
    );

    expect(items).toHaveLength(1);
    expect(items[0].description).toMatch(/Describes both features/);
    expect(items[0].description).toMatch(/with a relevant example/);
  });

  it('appends a wrapped line to a numeric row without starting a new one', () => {
    const items = parseMarkingCriteria(
      '3 marks: Describes the features in\nsome useful detail\n2 marks: Outlines one',
      3,
      ANALYSE
    );

    expect(items.map((i) => i.markLabel)).toEqual(['3', '2']);
    expect(items[0].description).toMatch(/some useful detail/);
  });

  it('drops a continuation line that has no row above it', () => {
    expect(parseMarkingCriteria('a stray sentence with no row', 4, ANALYSE)).toEqual([]);
  });
});

describe('parseMarkingCriteria: empty and unparsed text', () => {
  it('returns no rows for an empty guide', () => {
    expect(parseMarkingCriteria('', 4, ANALYSE)).toEqual([]);
  });

  it('returns no rows for whitespace only', () => {
    expect(parseMarkingCriteria('   \n  \n', 4, ANALYSE)).toEqual([]);
  });

  it('returns no rows for prose with no mark values, so the caller shows it as text', () => {
    const prose =
      'For full marks the response must clearly relate structure to function throughout.';
    expect(parseMarkingCriteria(prose, 4, ANALYSE)).toEqual([]);
  });

  it('ignores blank lines and table rules between rows', () => {
    const items = parseMarkingCriteria('2 marks: One\n\n|---|\n1 mark: Two', 2, DESCRIBE);
    expect(items.map((i) => i.markLabel)).toEqual(['2', '1']);
  });
});

describe('parseMarkingCriteria: ordering', () => {
  it('sorts rows highest first whatever order they were written in', () => {
    const items = parseMarkingCriteria('1 mark: c\n3 marks: a\n2 marks: b', 3, ANALYSE);
    expect(items.map((i) => i.markLabel)).toEqual(['3', '2', '1']);
  });

  it('places a band row among numeric rows by the mark it starts at', () => {
    const items = parseMarkingCriteria('3 marks: Top\nBand 2: Limited\n1 mark: Bottom', 3, ANALYSE);
    expect(items.map((i) => i.markLabel)).toEqual(['3', 'Band 2', '1']);
  });
});

describe('criterionForMark', () => {
  const items = [
    row('6–7', [6, 7], 6),
    row('3–5', [3, 5], 4),
    row('Band 2', [1, 1], 2),
    row('1', [1, 1], 1),
  ];

  it('finds the numeric row whose range holds the mark, at either end of the range', () => {
    expect(criterionForMark(items, 6, 6)).toBe(items[0]);
    expect(criterionForMark(items, 7, 6)).toBe(items[0]);
    expect(criterionForMark(items, 3, 4)).toBe(items[1]);
    expect(criterionForMark(items, 5, 4)).toBe(items[1]);
  });

  it('matches a band-labelled row on its band, not its mark', () => {
    // Band 2 sits at mark 1, but the lookup asks for Band 2 by band and gets the row.
    expect(criterionForMark(items, 1, 2)).toBe(items[2]);
  });

  it('falls through a band row to a numeric row when the band does not match', () => {
    expect(criterionForMark(items, 1, 3)).toBe(items[3]);
  });

  it('returns undefined when no row holds the mark', () => {
    expect(criterionForMark(items, 9, 6)).toBeUndefined();
    expect(criterionForMark([], 4, 4)).toBeUndefined();
  });

  it('lets a band row hold a mark outside its own single-mark range', () => {
    const band4 = row('Band 4', [5, 5], 4);
    expect(criterionForMark([band4], 2, 4)).toBe(band4);
  });

  it('lets a numeric row ignore the band it was asked for', () => {
    const five = row('5', [5, 5], 4);
    expect(criterionForMark([five], 5, 1)).toBe(five);
  });

  it('returns the first matching row, so the caller’s ordering decides ties', () => {
    const first = row('4', [4, 4], 4);
    const second = row('3–4', [3, 4], 3);
    expect(criterionForMark([first, second], 4, 3)).toBe(first);
  });
});

describe('exemplarMarkForItem', () => {
  it('returns the highest exemplar mark inside a range row', () => {
    const item = row('6–7', [6, 7], 6);
    expect(
      exemplarMarkForItem(item, [{ mark: 5 }, { mark: 6 }, { mark: 7 }, { mark: 8 }], 8, EVALUATE)
    ).toBe(7);
  });

  it('returns undefined when no exemplar falls inside the row', () => {
    const item = row('6–7', [6, 7], 6);
    expect(exemplarMarkForItem(item, [{ mark: 1 }, { mark: 2 }], 8, EVALUATE)).toBeUndefined();
  });

  it('returns undefined for a row with no exemplars at all', () => {
    expect(exemplarMarkForItem(row('5', [5, 5], 4), [], 5, ANALYSE)).toBeUndefined();
  });

  it('includes both ends of the range', () => {
    const item = row('3–4', [3, 4], 3);
    expect(exemplarMarkForItem(item, [{ mark: 3 }], 4, ANALYSE)).toBe(3);
    expect(exemplarMarkForItem(item, [{ mark: 4 }], 4, ANALYSE)).toBe(4);
  });

  it('picks the highest of several exemplars at the same level', () => {
    const item = row('5', [5, 5], 4);
    expect(exemplarMarkForItem(item, [{ mark: 5 }, { mark: 5 }], 5, ANALYSE)).toBe(5);
  });

  it('ignores an exemplar whose mark is not a finite number', () => {
    const item = row('6–7', [6, 7], 6);
    expect(exemplarMarkForItem(item, [{ mark: Number.NaN }, { mark: 6 }], 8, EVALUATE)).toBe(6);
  });

  it('matches a band row by the band each exemplar mark earns on this question', () => {
    // EVALUATE on 4 marks: marks 4, 3, 2, 1 earn Bands 6, 5, 4, 3.
    const band3 = row('Band 3', [1, 1], 3);
    expect(exemplarMarkForItem(band3, [{ mark: 1 }, { mark: 2 }], 4, EVALUATE)).toBe(1);
    expect(exemplarMarkForItem(band3, [{ mark: 2 }], 4, EVALUATE)).toBeUndefined();
  });

  it('matches a band row on its band even when the exemplar mark is outside its range', () => {
    // Mark 4 is not in the row's [1,1] range, but it earns Band 6, which is the row's band.
    const band6 = row('Band 6', [4, 4], 6);
    expect(exemplarMarkForItem(band6, [{ mark: 4 }], 4, EVALUATE)).toBe(4);
  });

  it('returns undefined for a band no exemplar earns, including one the question cannot award', () => {
    // A 4-mark EVALUATE cannot award Band 2, so no exemplar can sit on that row.
    const band2 = row('Band 2', [1, 1], 2);
    expect(
      exemplarMarkForItem(band2, [{ mark: 1 }, { mark: 2 }, { mark: 3 }, { mark: 4 }], 4, EVALUATE)
    ).toBeUndefined();
  });

  it('reads the parsed guide and the exemplars together, as the two panels do', () => {
    const items = parseMarkingCriteria(
      '4 marks: Full\n3 marks: Most\n2 marks: Some\n1 mark: One',
      4,
      ANALYSE
    );
    const samples = [{ mark: 4 }, { mark: 2 }];
    expect(items.map((i) => exemplarMarkForItem(i, samples, 4, ANALYSE))).toEqual([
      4,
      undefined,
      2,
      undefined,
    ]);
  });
});
