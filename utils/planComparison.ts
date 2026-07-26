import {
  FREE_TIER_EVAL_LIMIT,
  FREE_TIER_MAX_QUESTION_TIER,
  FREE_TIER_MAX_SAMPLE_BAND,
  FREE_DAILY_AI_CALLS,
  PAID_DAILY_AI_CALLS,
  PREMIUM_FEATURES,
  planFeatureKeys,
  type Plan,
  type PremiumFeatureKey,
} from '../services/entitlements';

/**
 * The Free / Plus / School comparison, DERIVED from the entitlement rules
 * rather than written out by hand.
 *
 * The point of deriving it: a marketing table that is maintained separately
 * from the gates it describes will eventually lie. Here, unlocking a feature
 * for Plus in `services/entitlements.ts` moves the tick in this table on the
 * next render, and removing a feature key removes its row entirely.
 *
 * To add a row for a NEW gated feature: add the key to `PREMIUM_FEATURES` and
 * `PLAN_FEATURES` in entitlements, then give it a short label in `ROW_LABELS`
 * below. Features with no label are skipped, so a half-finished feature never
 * leaks into the table.
 */

export const COMPARED_PLANS: Plan[] = ['free', 'plus', 'school'];

export interface PlanCell {
  /** `partial` renders in amber — free gets some of this, not all of it. */
  kind: 'yes' | 'no' | 'partial' | 'text';
  /** Shown instead of a tick/cross when present. */
  text?: string;
}

export interface PlanRow {
  id: string;
  label: string;
  /** One line of context under the label. */
  note?: string;
  cells: Record<Plan, PlanCell>;
}

/**
 * Short table labels for each gated feature. `PREMIUM_FEATURES[key].title` is
 * written for the upgrade prompt ("AI Answer Upgrades"); a table column wants
 * something terser and lower-case-friendly. Keyed so the compiler flags a new
 * feature that nobody has labelled.
 */
const ROW_LABELS: Record<PremiumFeatureKey, { label: string; note?: string }> = {
  advancedQuestions: {
    label: 'Question difficulty',
    note: 'Command-term tiers, from Identify through to Evaluate',
  },
  fullFeedback: {
    label: 'Marking feedback',
    note: 'How much of the marker’s reasoning you see',
  },
  sampleAnswers: {
    label: 'Sample answers',
    note: 'Band-level exemplars to compare your writing against',
  },
  answerUpgrades: {
    label: 'AI answer upgrades',
    note: 'Your own words rewritten one band higher',
  },
  examMode: {
    label: 'Exam simulation',
    note: 'Timed, unassisted, with post-exam analysis',
  },
  pdfExport: {
    label: 'PDF report export',
    note: 'Marking reports you can keep, print or hand in',
  },
  aiContentStudio: {
    label: 'AI Content Studio',
    note: 'Generate questions, rubrics and sample answers',
  },
};

/**
 * What the free tier gets for the features it holds PARTIALLY. Without this
 * the table would show a bare cross against "Sample answers" for a plan that
 * does, in fact, include Bands 1–3 — technically derived, and misleading.
 */
const FREE_PARTIAL: Partial<Record<PremiumFeatureKey, string>> = {
  advancedQuestions: `Tiers 1–${FREE_TIER_MAX_QUESTION_TIER}`,
  fullFeedback: 'Summary + band',
  sampleAnswers: `Bands 1–${FREE_TIER_MAX_SAMPLE_BAND}`,
};

/** What a paid plan gets for those same partial features. */
const PAID_FULL: Partial<Record<PremiumFeatureKey, string>> = {
  advancedQuestions: 'All tiers 1–6',
  fullFeedback: 'Every criterion',
  sampleAnswers: 'All bands',
};

const cellFor = (plan: Plan, key: PremiumFeatureKey): PlanCell => {
  const unlocked = planFeatureKeys(plan).includes(key);
  if (!unlocked) {
    const partial = plan === 'free' ? FREE_PARTIAL[key] : undefined;
    return partial ? { kind: 'partial', text: partial } : { kind: 'no' };
  }
  const full = PAID_FULL[key];
  return full ? { kind: 'text', text: full } : { kind: 'yes' };
};

const emptyCells = (): Record<Plan, PlanCell> => ({
  free: { kind: 'no' },
  plus: { kind: 'no' },
  school: { kind: 'no' },
});

/** The comparison rows, in reading order: limits first, then features. */
export const buildPlanComparison = (): PlanRow[] => {
  const rows: PlanRow[] = [
    {
      id: 'evaluations',
      label: 'Marked evaluations',
      note: 'Full AI marking of an answer you have written',
      cells: {
        free: { kind: 'text', text: `${FREE_TIER_EVAL_LIMIT} per day` },
        plus: { kind: 'text', text: 'Unlimited' },
        school: { kind: 'text', text: 'Unlimited' },
      },
    },
    {
      id: 'ai-allowance',
      label: 'Daily AI allowance',
      note: 'Total AI calls a day, including hints and generation',
      cells: {
        free: { kind: 'text', text: `${FREE_DAILY_AI_CALLS} calls` },
        plus: { kind: 'text', text: `${PAID_DAILY_AI_CALLS} calls` },
        school: { kind: 'text', text: `${PAID_DAILY_AI_CALLS} calls` },
      },
    },
  ];

  // Feature rows, in the display order of PREMIUM_FEATURES so the table and
  // the upgrade prompt always agree on ordering.
  (Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[]).forEach((key) => {
    const meta = ROW_LABELS[key];
    if (!meta) return;
    rows.push({
      id: key,
      label: meta.label,
      note: meta.note,
      cells: {
        free: cellFor('free', key),
        plus: cellFor('plus', key),
        school: cellFor('school', key),
      },
    });
  });

  rows.push({
    id: 'coverage',
    label: 'Who it covers',
    note: 'A School licence is bought per seat and covers everyone in the school',
    cells: {
      ...emptyCells(),
      free: { kind: 'text', text: 'You' },
      plus: { kind: 'text', text: 'You' },
      school: { kind: 'text', text: 'Your whole school' },
    },
  });

  return rows;
};

/**
 * The one-line pitch for each plan, used above the table and anywhere a full
 * table would be too much.
 */
export const PLAN_TAGLINES: Record<Plan, string> = {
  free: 'Enough to practise with, every day, at no cost.',
  plus: 'The full marking toolkit for one student.',
  school: 'Every student and teacher in the school, plus content authoring.',
};
