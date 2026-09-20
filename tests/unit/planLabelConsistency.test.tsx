import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { Plan, PremiumFeatureKey } from '../../services/entitlements';

/**
 * A lock and the sentence next to it must name the SAME plan.
 *
 * The chips and the upgrade prompt already derived their label from the
 * feature key; the prose around them spelled "Band 6 Plus" out by hand in a
 * dozen places. A deployment only has to use a lever the app already ships —
 * `PLAN_FEATURE_OVERRIDES=advancedQuestions:school` — for the chip to say
 * "School" while the tooltip beside it says "part of Band 6 Plus", and for the
 * prompt to sell a plan the caption never mentioned.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

let minPlans: Partial<Record<PremiumFeatureKey, Plan>> = {};

vi.mock('../../services/planPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/planPolicy')>();
  return {
    ...actual,
    featureMinPlan: (feature: PremiumFeatureKey) =>
      minPlans[feature] ?? actual.featureMinPlan(feature),
  };
});

import { planLabelForFeature, PLAN_LABELS } from '../../services/entitlements';
import { PlusLockChip } from '../../components/UpgradeModal';

beforeEach(() => {
  minPlans = {};
});
afterEach(cleanup);

describe('planLabelForFeature', () => {
  it('names the plan that actually unlocks the feature', () => {
    expect(planLabelForFeature('advancedQuestions')).toBe(PLAN_LABELS.plus);
    minPlans = { advancedQuestions: 'school' };
    expect(planLabelForFeature('advancedQuestions')).toBe(PLAN_LABELS.school);
  });

  it('follows a deployment override for every gated feature, not a fixed string', () => {
    minPlans = { sampleAnswers: 'school', pdfExport: 'free' };
    expect(planLabelForFeature('sampleAnswers')).toBe(PLAN_LABELS.school);
    expect(planLabelForFeature('pdfExport')).toBe(PLAN_LABELS.free);
  });
});

describe('the chip and the prose agree', () => {
  it('both move to School when a gate is priced there', () => {
    minPlans = { sampleAnswers: 'school' };
    render(<PlusLockChip feature="sampleAnswers" />);
    // The chip keeps the short form for space; the full label it abbreviates
    // is the same plan, so the two can never name different products.
    expect(screen.getByText('School')).toBeTruthy();
    expect(planLabelForFeature('sampleAnswers')).toContain('School');
  });
});
