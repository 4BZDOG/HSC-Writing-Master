import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Radius by role, elevation in two steps (DesignSpec §3).
 *
 * The vocabulary this replaced was ten arbitrary pixel radii across four jobs —
 * modal shells alone used 28, 32, 40, 44 and 48px — plus `rounded`/`sm`/`md`
 * sitting around `rounded-lg` at near-identical values, and seven shadow steps.
 * Nothing stopped the next surface from picking a number that looked about
 * right, which is how it got there. This does.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const SOURCES = ['components', 'utils', 'hooks'].filter(existsSync).flatMap(walk);

/**
 * `${...}` inside a class list is JavaScript, not class names. Without stripping
 * it, `${rounded}` and `${config.shadow}` read as bare utilities and this gate
 * fails on two files that are perfectly correct.
 */
const stripInterpolations = (cls: string): string =>
  cls.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ');

/** Only look inside class lists — `rounded` is also an English word and a prop. */
const classLists = (src: string): string[] => {
  const out: string[] = [];
  const attr = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/gs;
  for (const m of src.matchAll(attr)) out.push(stripInterpolations(m[1] ?? m[2] ?? m[3] ?? ''));
  const str = /(['"`])([^'"`\n]{6,})\1/g;
  for (const m of src.matchAll(str)) {
    const utilities = m[2].match(
      /(?:^|\s)(?:px-|py-|p-|gap-|flex|border|bg-|text-|rounded|shadow|w-|h-)/g
    );
    if (utilities && utilities.length >= 2) out.push(stripInterpolations(m[2]));
  }
  return out;
};

describe('surfaces use the role scale', () => {
  it('has no arbitrary pixel radius left', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const cls of classLists(readFileSync(file, 'utf8'))) {
        const hits = cls.match(/rounded(?:-[tblr])?-\[\d+px\]/g);
        if (hits) offenders.push(`${file}: ${hits.join(', ')}`);
      }
    }
    expect(
      offenders,
      `use rounded-surface / -panel / -tile instead:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('has no radius step below rounded-lg', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const cls of classLists(readFileSync(file, 'utf8'))) {
        const hits = cls.match(/(?<![\w-])(?:[a-z-]+:)*rounded(?:-(?:sm|md))?(?![\w-])/g);
        if (hits) offenders.push(`${file}: ${hits.join(', ')}`);
      }
    }
    expect(offenders, `rounded-lg is the floor:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('uses two elevation steps and no more', () => {
    const allowed = new Set(['shadow-sm', 'shadow-lg', 'shadow-inner', 'shadow-none']);
    const offenders: string[] = [];
    for (const file of SOURCES) {
      for (const cls of classLists(readFileSync(file, 'utf8'))) {
        const hits = cls.match(
          /(?<![\w-])(?:[a-z-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner|none))?(?![\w-/])/g
        );
        for (const hit of hits ?? []) {
          const step = hit.split(':').pop()!;
          if (!allowed.has(step)) offenders.push(`${file}: ${hit}`);
        }
      }
    }
    expect(
      offenders,
      `resting is shadow-sm, lifted is shadow-lg:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('keeps a surface and its inner edge in step', () => {
    // 32px outer, `border-2`, so the inner edge is 30px. If either value moves
    // the other has to, or the corner shows a sliver of the wrong curve.
    const config = readFileSync('tailwind.config.js', 'utf8');
    const value = (name: string) =>
      config.match(new RegExp(`['"]?${name}['"]?:\\s*'(\\d+)px'`))?.[1];
    expect(Number(value('surface')) - Number(value("'surface-inner'"))).toBe(2);
  });
});
