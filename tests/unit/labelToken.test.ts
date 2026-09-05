import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `.t-label` is the only place a small label's look is decided
 * (DesignSpec §4, "Labels"). This is the gate that keeps it that way.
 *
 * The pattern it replaced was written inline — `text-[10px] font-black
 * uppercase tracking-[0.2em]` and near-variants — in 467 className regions
 * across 73 of 106 component files, with four sizes and eight tracking steps
 * in play. It came back every time it was fixed by hand, because nothing
 * stopped the next component from restating it. This does.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const SOURCES = ['components', 'utils', 'hooks', 'contexts'].filter(existsSync).flatMap(walk);

/** The house display treatment — a masthead, not a label. See DesignSpec §4. */
const DISPLAY_TREATMENT = /italic/;

describe('the label token is the only rule for labels', () => {
  it('has no uppercase micro-label left in the source', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/(?<![\w:-])uppercase(?![\w-])/.test(line)) return;
          if (DISPLAY_TREATMENT.test(line)) return;
          // `toUpperCase()` and prose mentioning the word are not class lists.
          if (!/(px-|py-|rounded-|text-|font-|tracking-|border|flex)/.test(line)) return;
          offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders, `write \`t-label\` instead:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('never restates size, weight or tracking beside the token', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes('t-label')) return;
          const restated = [
            /(?<![\w:-])text-\[[0-9.]+(px|em)\]/,
            /(?<![\w:-])text-(xs|sm|base)(?![\w-])/,
            /(?<![\w:-])font-(bold|black)(?![\w-])/,
            /(?<![\w:-])tracking-/,
          ].filter((re) => re.test(line));
          if (restated.length) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders, `the token owns these:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('defines the token exactly once, in index.css', () => {
    const css = readFileSync('index.css', 'utf8');
    expect(css.match(/^\.t-label\s*\{/gm)).toHaveLength(1);
    expect(css).toMatch(/text-transform:\s*none/);
    expect(css).toMatch(/letter-spacing:\s*normal/);
  });
});
