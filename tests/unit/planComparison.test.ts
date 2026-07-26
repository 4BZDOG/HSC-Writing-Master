import { describe, it, expect } from 'vitest';
import { buildPlanComparison, COMPARED_PLANS, PLAN_TAGLINES } from '../../utils/planComparison';
import {
  FREE_TIER_EVAL_LIMIT,
  FREE_TIER_MAX_QUESTION_TIER,
  FREE_TIER_MAX_SAMPLE_BAND,
  planFeatureKeys,
  PREMIUM_FEATURES,
  type PremiumFeatureKey,
} from '../../services/entitlements';

/**
 * The plan comparison is DERIVED from the entitlement rules precisely so it
 * cannot advertise something the app does not grant. These tests hold that
 * line: every tick in the table must correspond to a feature the plan really
 * unlocks, and every free-tier number must be the number the gate uses.
 */

const rowsById = () => Object.fromEntries(buildPlanComparison().map((r) => [r.id, r]));

describe('plan comparison', () => {
  it('compares free, plus and school', () => {
    expect(COMPARED_PLANS).toEqual(['free', 'plus', 'school']);
    COMPARED_PLANS.forEach((plan) => expect(PLAN_TAGLINES[plan].length).toBeGreaterThan(0));
  });

  it('quotes the free-tier limits the gates actually enforce', () => {
    const rows = rowsById();
    expect(rows.evaluations.cells.free.text).toBe(`${FREE_TIER_EVAL_LIMIT} per day`);
    expect(rows.advancedQuestions.cells.free.text).toBe(`Tiers 1–${FREE_TIER_MAX_QUESTION_TIER}`);
    expect(rows.sampleAnswers.cells.free.text).toBe(`Bands 1–${FREE_TIER_MAX_SAMPLE_BAND}`);
  });

  it('never shows a tick for a feature the plan does not unlock', () => {
    buildPlanComparison().forEach((row) => {
      if (!(row.id in PREMIUM_FEATURES)) return;
      const key = row.id as PremiumFeatureKey;
      COMPARED_PLANS.forEach((plan) => {
        const unlocked = planFeatureKeys(plan).includes(key);
        const cell = row.cells[plan];
        const advertised = cell.kind === 'yes' || cell.kind === 'text';
        expect(
          advertised,
          `"${row.label}" is advertised as ${advertised ? 'included' : 'excluded'} for ${plan}, ` +
            `but the entitlement rules say ${unlocked ? 'included' : 'excluded'}`
        ).toBe(unlocked);
      });
    });
  });

  it('marks the free tier partial — not absent — where it gets some of a feature', () => {
    const rows = rowsById();
    // Free genuinely gets Bands 1–3 and tiers 1–3. Showing a bare cross there
    // would be derived-but-wrong, which is the failure this guards.
    ['advancedQuestions', 'sampleAnswers', 'fullFeedback'].forEach((id) => {
      expect(rows[id].cells.free.kind).toBe('partial');
      expect(rows[id].cells.free.text).toBeTruthy();
    });
  });

  it('keeps the AI Content Studio a School-only row', () => {
    const row = rowsById().aiContentStudio;
    expect(row.cells.free.kind).toBe('no');
    expect(row.cells.plus.kind).toBe('no');
    expect(row.cells.school.kind).toBe('yes');
  });

  it('gives every gated feature a labelled row', () => {
    const ids = new Set(buildPlanComparison().map((r) => r.id));
    (Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[]).forEach((key) => {
      expect(ids.has(key), `feature "${key}" has no row in the plan comparison`).toBe(true);
    });
  });

  it('orders limits before features so the table reads top-down', () => {
    const rows = buildPlanComparison();
    expect(rows[0].id).toBe('evaluations');
    expect(rows[1].id).toBe('ai-allowance');
    expect(rows[rows.length - 1].id).toBe('coverage');
  });
});
