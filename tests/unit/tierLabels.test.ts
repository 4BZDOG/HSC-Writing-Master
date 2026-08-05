import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { commandTerms, TIER_GROUPS, tierShortLabel } from '../../data/commandTerms';

/**
 * The tier column headings in the admin heatmap and the student progress profile.
 *
 * Both components used to hard-code their own copy of the labels, and both had
 * drifted from the verb registry:
 *
 *   tier 3 — verbs EXPLAIN, COMPARE, CONTRAST … — was labelled "Apply"
 *   tier 5 — verbs DISCUSS, ASSESS, JUSTIFY …  — was labelled "Synth"/"Synthesise"
 *
 * APPLY is a tier-4 verb and SYNTHESISE is a tier-6 verb, so each wrong label
 * named a tier that ALSO appears in the same table. That is what made it
 * invisible: nothing looked out of place. A teacher reading "Noah — Synthesise
 * 20%" and planning synthesis work would have been looking at his
 * Discuss/Assess/Justify attempts, with his actual synthesis in the column
 * marked "Evaluate".
 *
 * The labels are now derived from TIER_GROUPS. These tests assert the derivation
 * is faithful to the verbs, and that no component has quietly reintroduced a
 * local copy.
 */

const COMPONENTS = [
  'components/admin/CohortBreakdown.tsx',
  'components/admin/StudentProgressModal.tsx',
] as const;

/** Every command verb registered at a given tier. */
const verbsAtTier = (tier: number): string[] =>
  [...commandTerms.entries()].filter(([, def]) => def.tier === tier).map(([term]) => term);

describe('cognitive tier labels', () => {
  it('derives each label from the tier group title, so it cannot be written twice', () => {
    // The labels are category names from Bloom's ladder, not necessarily verbs —
    // tier 1 is "Remember" though no command term is literally REMEMBER. What
    // must hold is that the label comes from the group, not from a second list.
    for (const group of TIER_GROUPS) {
      expect(group.title.toUpperCase()).toMatch(
        new RegExp('^' + tierShortLabel(group.tier).toUpperCase())
      );
    }
  });

  it('never labels a tier with a verb belonging to a different tier', () => {
    // Stronger and more direct: if the label matches a verb, that verb's tier
    // must be this tier. This is what catches "Apply" on tier 3 exactly.
    for (const group of TIER_GROUPS) {
      const label = tierShortLabel(group.tier).toUpperCase();
      for (const [term, def] of commandTerms.entries()) {
        if (term === label) {
          expect(
            def.tier,
            `tier ${group.tier} is labelled "${label}", but ${label} is a tier-${def.tier} verb`
          ).toBe(group.tier);
        }
      }
    }
  });

  it('gives every tier a distinct, non-empty label', () => {
    const labels = TIER_GROUPS.map((g) => tierShortLabel(g.tier));
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('falls back rather than returning undefined for an unknown tier', () => {
    // `tierOf` can return values outside 1–6 only if the registry changes, but a
    // heading of "undefined" would be worse than a dull one.
    expect(tierShortLabel(99)).toMatch(/Tier 99/);
  });

  for (const file of COMPONENTS) {
    it(`${file} derives its labels rather than keeping a local copy`, () => {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(
        source.includes('TIER_LABELS'),
        `${file} has reintroduced a hard-coded TIER_LABELS map — it will drift from ` +
          'data/commandTerms.ts again'
      ).toBe(false);
      expect(source).toContain('tierShortLabel');
    });
  }
});
