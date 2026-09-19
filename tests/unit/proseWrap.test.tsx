import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROSE_BLOCK, PROSE_FLOW } from '../../utils/prose';

/**
 * How a block of text is allowed to break is one decision, made in
 * `utils/prose` and imported.
 *
 * Reported from use as "the text wraps weirdly on wider screens", and measured
 * at 1920 it was true on every surface that carries the app's short prose. The
 * fix is two Tailwind utilities, which is exactly the kind of thing that gets
 * pasted at the next call site with a slightly different spelling and then
 * quietly disagrees with itself. So the rule is a constant, and this is what
 * says the constant is the only way in.
 *
 * Deliberately a source scan rather than a render: what it guards is the
 * absence of a literal, and a rendered tree cannot tell a component that never
 * had the class from one that spells it inline.
 */

/**
 * Every file that renders the app's short prose. None of them may spell the
 * rule inline.
 */
const SURFACES = [
  'components/StrategyBrief.tsx',
  'components/CommandTermGuideModal.tsx',
  'components/OutcomeDetailModal.tsx',
  'components/DraftCheck.tsx',
  'components/ReferenceMaterials.tsx',
  'components/CommandVerbHierarchy.tsx',
  'utils/verbRibbonChrome.ts',
];

/**
 * …and the subset that must actually import the constants.
 *
 * `utils/verbRibbonChrome.ts` is deliberately not one of them. Its constants
 * are module-scope strings, so interpolating an imported value into them would
 * be a module-init read of that value — the temporal-dead-zone crash class
 * `npm run check:eager-reads` exists to catch, and it rejected exactly this.
 * The ribbon applies the rule at its call site instead, which is what that file
 * already does with everything tier-coloured.
 */
const MUST_IMPORT = SURFACES.filter((f) => f !== 'utils/verbRibbonChrome.ts');

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('the prose-wrapping rule', () => {
  it('is two utilities, named once', () => {
    expect(PROSE_BLOCK).toBe('text-balance');
    expect(PROSE_FLOW).toBe('text-pretty');
  });

  it('is never written out by hand on a surface that carries prose', () => {
    for (const file of SURFACES) {
      const source = read(file);
      for (const literal of ["'text-balance", '"text-balance', "'text-pretty", '"text-pretty']) {
        expect(
          source.includes(literal),
          `${file} spells the wrapping rule inline instead of importing it from utils/prose`
        ).toBe(false);
      }
      // …and a bare utility inside a template literal is the same mistake.
      expect(
        /(?:^|[\s`])text-(?:balance|pretty)(?:[\s`]|$)/m.test(
          source.replace(/PROSE_(?:BLOCK|FLOW)/g, '')
        ),
        `${file} spells the wrapping rule inline instead of importing it from utils/prose`
      ).toBe(false);
    }
  });

  it('reaches every surface the report named', () => {
    for (const file of MUST_IMPORT) {
      expect(read(file), `${file} does not use the shared wrapping rule at all`).toMatch(
        /PROSE_(?:BLOCK|FLOW)/
      );
    }
  });

  /**
   * The one place balancing looks obviously right and is wrong. Balance chooses
   * the line COUNT and a clamp then cuts it, so the two argue and the clamp
   * wins — on the ribbon's tier names that means an ellipsis, which those names
   * have been rescued from three times now.
   */
  it('keeps balance off the clamped tier name', async () => {
    const { RIBBON_TIER_HEADER_TITLE } = await import('../../utils/verbRibbonChrome');

    expect(RIBBON_TIER_HEADER_TITLE).toContain('line-clamp');
    expect(RIBBON_TIER_HEADER_TITLE).not.toContain(PROSE_BLOCK);
  });
});
