import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Copy rules for the surfaces where someone is deciding whether to pay. They
 * are read from source, the way accentFillContrast.test.tsx reads it, because
 * the sentences are literals inside JSX and mounting every modal to read one
 * would test far less.
 *
 * The rules, in the order a reader meets them:
 *   - no exclamation marks in the sentences a payer reads;
 *   - no "unlimited" for a paid plan, because every plan's AI calls are capped;
 *   - the daily-limit sentence in the prompt and the one in evalLimitMessage()
 *     name the same plan and the same reset clock, so the two routes into the
 *     same moment cannot disagree.
 */

const ROOT = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** A quoted or template string literal that contains an exclamation mark. */
const EXCLAIMED_LITERAL = /(['"`])[^'"`\n]*![^'"`\n]*\1/g;

const PAYER_SURFACES = [
  'components/UpgradeModal.tsx',
  'components/SchoolLicencePanel.tsx',
  'components/PlanComparison.tsx',
  'components/BillingAlertBanner.tsx',
  'utils/billingMessages.ts',
];

describe('paywall copy', () => {
  it.each(PAYER_SURFACES)('%s has no exclamation mark in a sentence', (file) => {
    const literals = read(file).match(EXCLAIMED_LITERAL) ?? [];
    // `!` inside code (`!stripeReady`, `!==`) is not a sentence; the matcher
    // only sees quotes, so anything it finds is a string a person can read.
    const sentences = literals.filter((literal) => /[a-z]{3,}.*!/i.test(literal));
    expect(sentences).toEqual([]);
  });

  it.each(['components/UpgradeModal.tsx', 'components/PlanComparison.tsx'])(
    '%s does not call a paid plan unlimited',
    (file) => {
      expect(read(file)).not.toMatch(/unlimited/i);
    }
  );

  it('states the daily limit in the prompt and in evalLimitMessage() with the same plan name and reset clock', () => {
    const prompt = read('components/UpgradeModal.tsx');
    const message = read('services/entitlements.ts');
    expect(prompt).toContain('dailyResetPhrase()');
    expect(message).toContain('dailyResetPhrase()');
    expect(prompt).toContain('${PLAN_LABELS.plus} removes the daily limit on marked answers.');
    expect(message).toContain('${PLAN_LABELS.plus} removes the limit.');
  });

  it('says what is charged, when it renews and how to stop, in the prompt', () => {
    const prompt = read('components/UpgradeModal.tsx');
    expect(prompt).toContain('and renews automatically');
    expect(prompt).toContain('Cancel from your profile at any time');
    expect(prompt).toContain('end of the period you have paid for');
  });
});
