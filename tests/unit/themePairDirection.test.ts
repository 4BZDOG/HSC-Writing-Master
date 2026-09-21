import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A theme pair has a DIRECTION, and six of them shipped pointing the wrong way.
 *
 * Text is read against its surface, so the tone has to move opposite to the
 * surface: dark on a light theme, light on a dark one. In Tailwind's scale that
 * is one rule — **the light side is the higher step.** `text-slate-600
 * dark:text-slate-400` is right; `text-slate-400 dark:text-slate-500` is the
 * same declaration with its two values swapped.
 *
 * The consequence is never symmetrical, which is why this is worth a guard
 * rather than a style note. A swapped pair does not make one theme slightly
 * worse and the other slightly better — it makes BOTH sides the wrong tone for
 * the ground they land on, and the failure is silent in code review because
 * each half looks like a tone somebody chose. What shipped:
 *
 * | where | pair | measured |
 * | --- | --- | --- |
 * | the header menu's group labels | `text-slate-400 dark:text-slate-500` | 2.56:1 on the white panel |
 * | a criterion's number, which its own comment says exists to be read out loud | `text-slate-300 dark:text-slate-600` | 1.60:1 on white |
 * | the band ladder's unreached rungs | `text-slate-300 dark:text-slate-600` | 1.60:1 on white |
 * | the exemplars' empty state | `text-slate-300 dark:text-slate-600` | 1.60:1, under an `opacity-60` |
 * | the audit studio's empty state | `text-slate-700 light:text-slate-300` | 1.25:1 on its own tile |
 * | the quick-start guide's step numbers | `text-slate-600 light:text-slate-500` | 4.34:1 on the step card |
 *
 * **Only `text-*` is checked, and that is not laziness.** For a FILL or a
 * BORDER the relationship genuinely reverses: a divider is darker than white
 * and lighter than near-black, so `bg-slate-300 dark:bg-slate-700` is correct
 * and reads as "inverted" to the rule above. Nineteen such pairs are in the
 * codebase and every one of them is right. A check that flagged them would be
 * turned off within a week.
 *
 * `tests/e2e/light-theme.spec.ts` measures the real ratio and is the better
 * instrument, but it only sees the states it is driven into — five of the six
 * above sit in modals and empty states it has never rendered. This is decidable
 * from the source, so it covers everywhere the sweep has not reached.
 */

const ROOTS = ['components', 'utils'];
const EXTS = ['.ts', '.tsx'];

/** The Tailwind greys whose numeric steps are comparable to each other. */
const HUE = '(?:slate|gray|zinc|neutral|stone)';

/**
 * Pairs that are correct despite pointing the "wrong" way.
 *
 * WCAG 1.4.3 exempts text that is part of a disabled control, and this is one:
 * the audit studio's tone filters render `disabled` when their count is zero,
 * and the pale tone IS the statement that there is nothing to filter by.
 */
const EXEMPT = new Map<string, string>([
  [
    'components/admin/contentAudit/AuditPieces.tsx:text-slate-600 light:text-slate-400',
    'the `empty` branch of a filter button that is `disabled` in the same expression — WCAG 1.4.3',
  ],
]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return EXTS.some((e) => full.endsWith(e)) ? [full] : [];
  });

interface Pair {
  file: string;
  line: number;
  text: string;
  lightStep: number;
  darkStep: number;
}

/** Every `text-<grey>-<step>` paired with a `dark:`/`light:` twin of itself. */
const findPairs = (): Pair[] => {
  const found: Pair[] = [];
  // `(?<![-:\w])` keeps us off `hover:text-…`, `group-hover/x:text-…` and the
  // tail of a longer utility — those are separate decisions with their own
  // direction, and a hover state is allowed to go either way.
  const withDark = new RegExp(`(?<![-:\\w])text-${HUE}-(\\d{2,3})\\s+dark:text-${HUE}-(\\d{2,3})`, 'g');
  const withLight = new RegExp(`(?<![-:\\w])text-${HUE}-(\\d{2,3})\\s+light:text-${HUE}-(\\d{2,3})`, 'g');

  for (const file of ROOTS.flatMap(walk)) {
    if (file.includes('.test.')) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // base + `dark:` → the base IS the light value
        for (const m of line.matchAll(withDark)) {
          found.push({ file, line: i + 1, text: m[0], lightStep: +m[1], darkStep: +m[2] });
        }
        // base + `light:` → the base is the DARK value
        for (const m of line.matchAll(withLight)) {
          found.push({ file, line: i + 1, text: m[0], lightStep: +m[2], darkStep: +m[1] });
        }
      });
  }
  return found;
};

describe('a theme pair points the right way', () => {
  it('finds pairs to check at all, so a broken matcher cannot pass silently', () => {
    // The whole file is worthless if the regex stops matching, and "zero
    // inverted pairs" is exactly what that failure looks like.
    expect(findPairs().length).toBeGreaterThan(20);
  });

  it('never gives the light theme the paler tone of the two', () => {
    const inverted = findPairs()
      .filter((p) => p.lightStep < p.darkStep)
      .filter((p) => !EXEMPT.has(`${p.file}:${p.text}`));

    expect(
      inverted.map((p) => `${p.file}:${p.line}  ${p.text}`),
      'These read as the paler tone on the LIGHTER ground, which is the two ' +
        'values of the pair swapped — and it is wrong on both sides, not one'
    ).toEqual([]);
  });

  it('keeps its exemptions honest', () => {
    // An exemption that no longer matches anything is a comment pretending to
    // be a rule, and the next person reads it as coverage.
    const all = new Set(findPairs().map((p) => `${p.file}:${p.text}`));
    for (const key of EXEMPT.keys()) {
      expect(all.has(key), `the exemption \`${key}\` no longer matches any pair — delete it`).toBe(
        true
      );
    }
  });
});
