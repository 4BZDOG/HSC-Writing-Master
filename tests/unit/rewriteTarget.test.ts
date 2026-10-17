import { describe, it, expect } from 'vitest';
import { rewriteTarget } from '../../components/feedback/rewriteText';
import { getBandForMark, getNextLevelTarget } from '../../data/commandTerms';
import type { EvaluationResult } from '../../types';

/**
 * The rewrite's mark and band are read by the review header, the report and the
 * saved exemplar. They used to be worked out three different ways, and the header
 * could promise a band the report did not give. `rewriteTarget` is the one answer.
 *
 * Tier 2 (DESCRIBE) tops out at Band 2; Tier 4 (ANALYSE) at Band 4.
 */
const DESCRIBE = 2;
const ANALYSE = 4;

type Revised = NonNullable<EvaluationResult['revisedAnswer']>;

describe('rewriteTarget', () => {
  it('uses the mark the structured rewrite reports, and derives its band from that mark', () => {
    const revised: Revised = { text: 'A fuller answer.', mark: 6, keyChanges: [] };

    const target = rewriteTarget(revised, 4, 8, ANALYSE);

    expect(target.mark).toBe(6);
    expect(target.band).toBe(getBandForMark(6, 8, ANALYSE));
  });

  it('ignores a band the model reports and derives it from the mark instead', () => {
    // 2/8 is Band 1 on a Tier 4 verb. The model said Band 2, and the header must
    // not repeat that: the band follows the mark, the same as the marker's own rule.
    const revised: Revised = { text: 'A fuller answer.', mark: 2, band: 2, keyChanges: [] };

    expect(rewriteTarget(revised, 1, 8, ANALYSE)).toEqual({
      mark: 2,
      band: getBandForMark(2, 8, ANALYSE),
    });
    expect(rewriteTarget(revised, 1, 8, ANALYSE).band).toBe(1);
  });

  it('never reports a band above the verb ceiling, even when the model asks for one', () => {
    // A DESCRIBE question cannot reach Band 5. The model's band of 5 must not
    // leak into the header, the modal or the saved exemplar.
    const revised: Revised = { text: 'A fuller answer.', mark: 8, band: 5, keyChanges: [] };

    const target = rewriteTarget(revised, 4, 8, DESCRIBE);

    expect(target.band).toBe(2);
    expect(target.band).toBe(getBandForMark(target.mark, 8, DESCRIBE));
  });

  it('clamps a reported mark above the total to the total', () => {
    const revised: Revised = { text: 'A fuller answer.', mark: 12, keyChanges: [] };

    const target = rewriteTarget(revised, 4, 8, ANALYSE);

    expect(target.mark).toBe(8);
    expect(target.band).toBe(getBandForMark(8, 8, ANALYSE));
  });

  it('clamps a negative reported mark to zero', () => {
    const revised: Revised = { text: 'A fuller answer.', mark: -3, keyChanges: [] };

    expect(rewriteTarget(revised, 4, 8, ANALYSE)).toEqual({ mark: 0, band: 1 });
  });

  it('falls back to the briefed next-level target for the plain-string form', () => {
    const next = getNextLevelTarget(4, 8, ANALYSE);

    const target = rewriteTarget('A fuller answer.', 4, 8, ANALYSE);

    expect(target.mark).toBe(next.targetMark);
    expect(target.band).toBe(getBandForMark(next.targetMark, 8, ANALYSE));
  });

  it('falls back to the briefed next-level target when the structured form has no mark', () => {
    // The structured form the prompt asks for omits the mark, so this is the
    // common case in production, not an edge.
    const revised: Revised = { text: 'A fuller answer.', keyChanges: ['Named the term.'] };
    const next = getNextLevelTarget(4, 8, ANALYSE);

    const target = rewriteTarget(revised, 4, 8, ANALYSE);

    expect(target.mark).toBe(next.targetMark);
    expect(Number.isFinite(target.mark)).toBe(true);
    expect(target.band).toBe(getBandForMark(next.targetMark, 8, ANALYSE));
  });

  it('falls back when the reported mark is not a finite number', () => {
    const revised = { text: 'A fuller answer.', mark: Number.NaN, keyChanges: [] } as Revised;

    expect(rewriteTarget(revised, 4, 8, ANALYSE).mark).toBe(
      getNextLevelTarget(4, 8, ANALYSE).targetMark
    );
  });

  it('handles a missing rewrite without throwing', () => {
    const next = getNextLevelTarget(4, 8, ANALYSE);

    expect(rewriteTarget(undefined, 4, 8, ANALYSE)).toEqual({
      mark: next.targetMark,
      band: getBandForMark(next.targetMark, 8, ANALYSE),
    });
  });
});
