import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Reading surfaces keep a measure (DesignSpec §4, "Measure").
 *
 * The three main ones carried `prose prose-slate dark:prose-invert max-w-none`.
 * `@tailwindcss/typography` is not installed, so every one of those classes was
 * inert except `max-w-none` — which switched off a measure that had never been
 * on. Lines ran to 114 characters.
 *
 * This is a named list rather than a rule inferred from the markup, and
 * deliberately so: most `font-serif` in the app is an 11px row in a 300px
 * column or a textarea, neither of which wants a cap. A rule broad enough to
 * catch the reading surfaces would drag those in too.
 */

/** file → how many capped reading blocks it holds. */
const READING_SURFACES: Record<string, number> = {
  'components/EvaluationDisplay.tsx': 3, // your response, the commentary, the rewrite
  'components/SampleAnswersAccordion.tsx': 1, // an exemplar
  'components/ImprovementReviewModal.tsx': 1, // the before/after panes
};

describe('reading surfaces keep a measure', () => {
  it('caps every reading block in characters', () => {
    for (const [file, expected] of Object.entries(READING_SURFACES)) {
      const caps = readFileSync(file, 'utf8').match(/max-w-\[\d+ch\]/g) ?? [];
      expect(caps.length, `${file} lost a measure`).toBe(expected);
    }
  });

  it('sets the cap at 56ch, which measures 74-76 real characters', () => {
    // Not 65 or 68: `ch` is the width of "0", about 1.35x narrower than
    // Newsreader's average lowercase, so those render at 86-93 characters.
    for (const file of Object.keys(READING_SURFACES)) {
      for (const cap of readFileSync(file, 'utf8').match(/max-w-\[(\d+)ch\]/g) ?? []) {
        expect(cap, `${file} uses a cap other than 56ch`).toBe('max-w-[56ch]');
      }
    }
  });

  it('never turns a measure off with max-w-none on a serif block', () => {
    const offenders: string[] = [];
    for (const file of Object.keys(READING_SURFACES)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/gs)) {
        const cls = m[1] ?? m[2] ?? '';
        if (cls.includes('font-serif') && cls.includes('max-w-none')) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
