import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * One weight per job (DesignSpec §4, "Weight").
 *
 * `font-bold` and `font-black` were used 842 times against 4 uses of
 * `font-normal`, which is the state in which weight stops encoding anything.
 * These two gates hold the ends of the ladder: prose does not get heavy, and
 * 900 stays on type big enough to carry it.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(full) ? [full] : [];
  });

const SOURCES = ['components'].filter(existsSync).flatMap(walk).concat(['App.tsx']);

const stripInterpolations = (cls: string): string =>
  cls.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ');

/** Opening tags that carry a className, paired with the element name. */
const tagged = (src: string, tags: string): [string, string][] => {
  const rx = new RegExp(
    `<(${tags})\\b[^>]*?className=(?:"([^"]*)"|\\{\`([^\`]*)\`\\}|\\{'([^']*)'\\})`,
    'gs'
  );
  return [...src.matchAll(rx)].map((m) => [m[1], stripInterpolations(m[2] ?? m[3] ?? m[4] ?? '')]);
};

const HEAVY = /(?<![\w-])(?:[a-z-]+:)*font-(?:bold|black)(?![\w-])/;
const BODY_SIZE = /(?<![\w-])text-(?:\[(?:8|9|10|11|12|13)px\]|xs|sm)(?![\w-])/;
/** 600 is the ladder's step for a title inside a block — see DesignSpec §4. */
const TITLE = /(?<![\w-])font-semibold(?![\w-])/;

describe('weight is assigned by job', () => {
  it('never sets prose in bold', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const [tag, cls] of tagged(readFileSync(file, 'utf8'), 'p|li|td')) {
        if (!HEAVY.test(cls) || !BODY_SIZE.test(cls)) continue;
        if (TITLE.test(cls)) continue;
        // A figure in a table cell is telemetry, not prose: numbers take 700.
        if (/tabular-nums/.test(cls)) continue;
        offenders.push(`${file} <${tag}>`);
      }
    }
    expect(
      offenders,
      `a sentence is 400; a title inside a block is font-semibold:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('keeps font-black on type big enough to carry it', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const [tag, cls] of tagged(readFileSync(file, 'utf8'), 'span|div|a|button|label|p|li')) {
        if (!/(?<![\w-])(?:[a-z-]+:)*font-black(?![\w-])/.test(cls)) continue;
        // Display type, telemetry figures and large headings keep 900.
        if (/italic|tabular-nums/.test(cls)) continue;
        if (/(?<![\w-])text-(?:xl|\dxl)(?![\w-])/.test(cls)) continue;
        offenders.push(`${file} <${tag}>`);
      }
    }
    expect(offenders, `900 is display weight; use font-bold:\n${offenders.join('\n')}`).toEqual([]);
  });
});
