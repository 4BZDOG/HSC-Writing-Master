import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A class list built by concatenation needs a space at the seam.
 *
 * Six shipped without one. A codemod that stripped utilities from the shared
 * chrome constants trimmed each line as it went, which ate the trailing space
 * that separated `'…truncate ' + 'text-slate-500…'` — fusing the two class
 * names into `truncatetext-slate-500`, a token that matches no rule. The header
 * sub-label silently lost both its truncation and its colour, and nothing
 * failed: the app compiles, renders, and quietly drops the styles.
 *
 * Tailwind cannot warn about this and neither can the type checker, so this is
 * the only thing that will.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const SOURCES = ['components', 'utils', 'hooks'].filter(existsSync).flatMap(walk);

/** `'a' + 'b'`, across a line break or not. */
const CONCAT = /(['"])([^'"\n]*?)\1\s*\+\s*\n?\s*(['"])([^'"\n]*?)\3/g;

describe('concatenated class lists keep their seams', () => {
  it('never fuses two class names together', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const m of readFileSync(file, 'utf8').matchAll(CONCAT)) {
        const [left, right] = [m[2], m[4]];
        if (!left || !right) continue;
        // Only when both sides look like class lists and neither supplies the
        // space: a sentence split across two literals is not this bug.
        if (!/[a-z0-9\]]$/.test(left) || !/^[a-z[]/.test(right)) continue;
        if (left.endsWith(' ') || right.startsWith(' ')) continue;
        if (
          !/(?:^|\s)(?:px-|py-|p-|gap-|flex|border|bg-|text-|rounded|shadow|w-|h-|t-label|hidden|truncate|font-)/.test(
            left
          )
        )
          continue;
        offenders.push(`${file}: …${left.slice(-30)}' + '${right.slice(0, 30)}…`);
      }
    }
    expect(offenders, `add a trailing space to the left literal:\n${offenders.join('\n')}`).toEqual(
      []
    );
  });
});
