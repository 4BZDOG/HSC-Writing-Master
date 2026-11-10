import { describe, it, expect } from 'vitest';
import { reportLevels, levelFrameVars } from '../../utils/reportLevels';
import { getBandForMark, getNextLevelTarget } from '../../data/commandTerms';
import { promptBandForMark } from '../../utils/guideBands';
import { getBandDeepInkRgb, getBandRgb } from '../../utils/renderUtils';

/**
 * A 20-mark DISCUSS whose guide rows are not aligned to the formula's bands: 11-13
 * is Band 4 on the guide (its top mark, 13, reads 4), where ceil(11 × 5 / 20) = 3.
 * The formula and the guide disagree, which is what the two windows used to show.
 */
const RANGED_20 =
  '17-20 marks: Analyses skilfully\n14-16 marks: Analyses effectively\n11-13 marks: Analyses\n7-10 marks: Describes\n1-6 marks: Refers minimally';
const ranged20 = { totalMarks: 20, verb: 'DISCUSS' as const, markingCriteria: RANGED_20 };

describe('reportLevels', () => {
  it('takes the You band from the marking guide, not from the verb formula', () => {
    expect(getBandForMark(11, 20, 5)).toBe(3);
    expect(promptBandForMark(ranged20, 11)).toBe(4);
    expect(reportLevels(ranged20, 11).you).toEqual({ mark: 11, band: 4 });
  });

  it('names the top from the same rule as the You band', () => {
    expect(reportLevels(ranged20, 11).top).toEqual({ mark: 20, band: 5 });
  });

  it('reads the rewrite target through the helper, with its own mark and band', () => {
    const levels = reportLevels(ranged20, 11, {
      revised: { text: 'Improved', mark: 14, keyChanges: [] },
    });
    expect(levels.next).toEqual({
      mark: 14,
      band: promptBandForMark(ranged20, 14),
      isRewrite: true,
    });
  });

  it('takes a caller-held target mark through the same clamp and band rule', () => {
    expect(reportLevels(ranged20, 11, { mark: 14 }).next).toEqual({
      mark: 14,
      band: promptBandForMark(ranged20, 14),
      isRewrite: true,
    });
    expect(reportLevels(ranged20, 11, { mark: 99 }).next?.mark).toBe(20);
  });

  it('falls back to the next-level target, flagged as not a rewrite, with no rewrite to show', () => {
    const target = getNextLevelTarget(3, 8, 4);
    const levels = reportLevels({ totalMarks: 8, verb: 'ANALYSE' }, 3);
    expect(levels.next).toEqual({
      mark: target.targetMark,
      band: target.targetBand,
      isRewrite: false,
    });
    expect(
      reportLevels({ totalMarks: 8, verb: 'ANALYSE' }, 3, { revised: '' }).next?.isRewrite
    ).toBe(false);
  });

  it('has no next level at full marks', () => {
    const levels = reportLevels({ totalMarks: 8, verb: 'ANALYSE' }, 8, {
      revised: { text: 'Marker version', keyChanges: [] },
    });
    expect(levels.next).toBeNull();
    expect(levels.you).toEqual(levels.top);
  });

  it('gives the frame the You band, and the Improved band as its own pair of variables', () => {
    const vars = levelFrameVars(1, 2);
    expect(vars['--band-rgb']).toBe(getBandRgb(1));
    expect(vars['--band-ink-deep-rgb']).toBe(getBandDeepInkRgb(1));
    expect(vars['--next-rgb']).toBe(getBandRgb(2));
    expect(vars['--next-ink-deep-rgb']).toBe(getBandDeepInkRgb(2));
  });
});
