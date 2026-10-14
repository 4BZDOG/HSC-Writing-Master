import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import colors from 'tailwindcss/colors';
import { PlusLockChip } from '../../components/UpgradeModal';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

/**
 * A fill and its ink are one decision, and the two halves were drawn by
 * different people. White on `amber-400` measures 1.67:1 and it sat on the
 * verb ribbon's upgrade button, the workspace lock and the chip beside every
 * gated control. White on the accent was fine in one theme and 2.8:1 in the
 * other, because `--color-accent` is sky-700 on paper and sky-500 on the dark
 * desk, and the same class string was written once for both.
 *
 * So this pins the pairs the app actually paints, in both themes, against the
 * palette and the live tokens in `index.css`, and then reads every class string
 * in `components/` and `utils/` for a white ink on an amber or accent fill that
 * has no ink of its own. Retuning a token or a palette step fails here instead
 * of quietly unreadable buttons.
 *
 * The thresholds are WCAG 1.4.3 for text. The lock chip's icon and the badge
 * glyphs are graphical objects (1.4.11, 3:1), and every pair below clears 4.5
 * anyway, so the stricter number is the one checked.
 */

const CSS = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

type RGB = [number, number, number];

/** `--color-*: r g b;` out of a CSS block. `:root` is the dark theme. */
const token = (selector: string, name: string): RGB => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!block) throw new Error(`index.css: no ${selector} block`);
  const decl = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block[1]);
  if (!decl) throw new Error(`index.css: ${selector} does not define --${name}`);
  return [Number(decl[1]), Number(decl[2]), Number(decl[3])];
};

/** `#rrggbb` out of the Tailwind palette, as RGB. */
const hex = (value: string): RGB => {
  const n = parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = ([r, g, b]: RGB): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE: RGB = [255, 255, 255];
const DARK_ACCENT: RGB = token(':root', 'color-accent');
const DARK_ACCENT_DARK: RGB = token(':root', 'color-accent-dark');
const LIGHT_ACCENT: RGB = token("\\[data-theme='light'\\]", 'color-accent');
const LIGHT_ACCENT_DARK: RGB = token("\\[data-theme='light'\\]", 'color-accent-dark');

const SLATE_950 = hex(colors.slate[950]);
const SLATE_900 = hex(colors.slate[900]);

describe('the ink on an accent fill clears AA in both themes', () => {
  it('pairs dark ink with the dark theme accent, which is too light for white', () => {
    // `dark:text-slate-950` on the accent gradient. The dark theme's accent is
    // sky-500, which white reads at 2.8:1, and both ends of the gradient
    // (sky-600 and sky-500) clear 4.5:1 with slate-950.
    expect(contrast(SLATE_950, DARK_ACCENT)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(SLATE_950, DARK_ACCENT_DARK)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps white ink on the light theme accent, which is deep enough for it', () => {
    // The light accent is sky-700 and its gradient end sky-800, both well over
    // 4.5:1 with white, so the light side of the pair stays white.
    expect(contrast(WHITE, LIGHT_ACCENT)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, LIGHT_ACCENT_DARK)).toBeGreaterThanOrEqual(4.5);
  });

  it('measures the failure it replaces, so the check cannot pass vacuously', () => {
    // White on the dark accent is the pair this file exists to stop shipping.
    expect(contrast(WHITE, DARK_ACCENT)).toBeLessThan(3);
  });

  it('steps the hard-coded sky gradients to sky-700, which white clears in both themes', () => {
    // Two buttons used `from-indigo-* to-sky-500` with white ink. sky-500 is the
    // dark accent, so it fails in both themes; sky-700 and indigo-600 both
    // clear with white, and so does the midpoint between them.
    expect(contrast(WHITE, hex(colors.sky[700]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex(colors.indigo[600]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex(colors.sky[500]))).toBeLessThan(3);
  });
});

describe('the ink on an amber fill clears AA', () => {
  it('uses slate-900 on every amber and orange step the app fills with', () => {
    // The lock CTA and the amber chips are the ones that failed with white. The
    // ink is the same in both themes because amber is not themed.
    for (const step of [400, 500, 600] as const) {
      expect(contrast(SLATE_900, hex(colors.amber[step])), `amber-${step}`).toBeGreaterThanOrEqual(
        4.5
      );
    }
    expect(contrast(SLATE_900, hex(colors.orange[500]))).toBeGreaterThanOrEqual(4.5);
  });

  it('measures white on amber as the failure it is', () => {
    expect(contrast(WHITE, hex(colors.amber[400]))).toBeLessThan(2);
    expect(contrast(WHITE, hex(colors.amber[500]))).toBeLessThan(3);
  });
});

describe('the upgrade lock chip reads on its own ground', () => {
  // The chip sits on the band-coloured card headers as often as on paper, so
  // its ground is opaque and its ink is set against that ground.
  it('pairs amber-800 with amber-100 in light and amber-200 with amber-950 in dark', () => {
    expect(contrast(hex(colors.amber[800]), hex(colors.amber[100]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(colors.amber[200]), hex(colors.amber[950]))).toBeGreaterThanOrEqual(4.5);
  });

  it('renders the chip on those opaque grounds, not on a wash of whatever is beneath', () => {
    const { container } = render(<PlusLockChip feature="sampleAnswers" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).toContain('bg-amber-100');
    expect(chip.className).toContain('text-amber-800');
    expect(chip.className).toContain('dark:bg-amber-950');
    expect(chip.className).toContain('dark:text-amber-200');
    // The translucent tint it replaced took the red band's colour with it.
    expect(chip.className).not.toContain('bg-amber-400/15');
  });
});

/**
 * The source half. Every class string in `components/` and `utils/` that paints
 * a fill and sets white ink on it is read, because a fill and its ink are only
 * ever written together and a grep for `text-white` finds the ink without
 * knowing what it is on.
 */

const ROOTS = ['components', 'utils'];
const EXTS = ['.ts', '.tsx'];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return EXTS.some((e) => full.endsWith(e)) && !full.includes('.test.') ? [full] : [];
  });

/** Comments are prose, and prose may quote a class name. Strip them first. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/**
 * Every class string, one per branch. A ternary inside a template puts each of
 * its quoted branches in a string of its own, so `isOn ? 'bg-amber-…' : 'text-white'`
 * is two strings and not a pairing that never exists. The template's own text
 * keeps everything outside its `${…}` holes, which is where a fixed class sits.
 */
const literals = (src: string): string[] => {
  const out: string[] = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
    out.push(m[1] ?? m[2] ?? '');
  }
  for (const m of src.matchAll(/`((?:[^`\\]|\\[\s\S])*)`/g)) {
    out.push(m[1].replace(/\$\{[^{}]*\}/g, ' '));
  }
  return out;
};

/*
 * A class token starts after a space, a quote or a brace (a ternary branch opens
 * with a quote, and so does a template's `${…}`), and never after a `:` (a
 * variant such as `hover:bg-…` is a different state) or a word character.
 */
const TOKEN_START = '(?<![\\w:./\\-])';
const TOKEN_END = `(?=[\\s'"\`}/]|$)`;
const classToken = (body: string) => new RegExp(`${TOKEN_START}${body}${TOKEN_END}`);

const WHITE_INK = classToken('text-white');
/** The dark-theme ink that the accent fill takes over from white. */
const DARK_INK = classToken('dark:text-slate-9[05]0');
const AMBER_FILL = classToken('(?:bg|from|via|to)-amber-(?:300|400|500|600)');
/** The theme accent, in both its Tailwind-arbitrary and its colour-name spellings. */
const ACCENT_FILL = classToken(
  '(?:bg|from|via|to)-(?:accent(?:-dark|-glow)?|\\[rgb\\(var\\(--color-accent(?:-dark)?\\)\\)\\])'
);
/** A hard-coded sky step at the accent's dark value. Same in both themes, so no ink saves it. */
const SKY_FILL = classToken('(?:bg|from|via|to)-sky-(?:400|500)');

interface Checked {
  file: string;
  /** The whole class string, for the matchers. */
  text: string;
  amber: boolean;
  accent: boolean;
}

const scan = (): Checked[] => {
  const found: Checked[] = [];
  for (const file of ROOTS.flatMap(walk)) {
    for (const lit of literals(stripComments(readFileSync(file, 'utf8')))) {
      if (!WHITE_INK.test(lit)) continue;
      const amber = AMBER_FILL.test(lit);
      const accent = ACCENT_FILL.test(lit) || SKY_FILL.test(lit);
      if (amber || accent) found.push({ file, text: lit, amber, accent });
    }
  }
  return found;
};

/** A readable line for a failure message; the matchers see the whole string. */
const show = (c: Checked): string =>
  `${c.file}: ${c.text.replace(/\s+/g, ' ').trim().slice(0, 110)}`;

describe('no white ink is left on an amber or accent fill', () => {
  it('finds the class strings it is meant to check, so a broken matcher cannot pass silently', () => {
    // Every accent button that keeps white for light is a match, and so is
    // every amber fill that once had white. A regex that stopped matching
    // would empty this list, and "nothing to check" would read as a pass.
    expect(scan().length).toBeGreaterThan(10);
  });

  it('never sets white on an amber fill', () => {
    const offenders = scan()
      .filter((c) => c.amber)
      .map(show);
    expect(
      offenders,
      'White is 1.7:1 on amber-400 and 2.2:1 on amber-500. Use text-slate-900.'
    ).toEqual([]);
  });

  it('never sets white on the sky-500 gradient ends, which are the dark accent', () => {
    const offenders = scan()
      .filter((c) => SKY_FILL.test(c.text) && WHITE_INK.test(c.text))
      .map(show);
    expect(offenders).toEqual([]);
  });

  it('gives every white-on-accent button a dark-theme ink', () => {
    // In light the accent is sky-700 and white reads at 5.9:1. In dark it is
    // sky-500, where white reads at 2.8:1, so the dark theme takes slate-950.
    const offenders = scan()
      .filter((c) => c.accent && !SKY_FILL.test(c.text) && !DARK_INK.test(c.text))
      .map(show);
    expect(offenders, 'add dark:text-slate-950 beside text-white on each accent fill').toEqual([]);
  });
});

/**
 * Emerald, teal, green and red are fills too, and white on their `-500` and
 * `-600` steps was the same failure as amber: 2.5:1 on emerald-500 and 3.8:1 on
 * emerald-600 for the Flag button and the focus-area and syllabus import
 * actions. The `-700` steps clear white with room (5.0 to 5.5:1), and a hover
 * darkens to `-800` so the white stays readable where the pointer is.
 *
 * Red took the same shape: `hover:bg-red-500 hover:text-white` read 3.8:1 under
 * the pointer on the question filter, the sample-answer discard and the content
 * audit's destructive buttons. `red-600` is the step that clears (4.8:1).
 *
 * Hover and gradient stops are fills as well, so every variant of the fill is
 * read. A wash (`/10`) is not: its ink is judged against its own surface.
 */

/**
 * Files that still paint white on an emerald, teal, green or red fill, each with
 * the reason it is not changed here. The check below also fails when an entry
 * stops having such a fill, so an entry cannot outlive the defect it names.
 *
 * Both entries are red-500 with white ink, which is 3.8:1. They are owned by
 * another piece of work this round and are a one-token follow-up there
 * (`hover:bg-red-600` / `bg-red-600`); the staff tools and the authoring modals
 * are already on the step that clears.
 */
const GREEN_FAMILY_EXEMPT = new Map<string, string>([
  [
    'components/Editor.tsx',
    'the exam-mode toggle paints bg-red-500 with white (3.8:1); Editor.tsx is out of scope here',
  ],
  [
    'components/PromptSelector.tsx',
    'the discard control hovers to red-500 with white (3.8:1); PromptSelector.tsx is out of scope here',
  ],
]);

const GREEN_FAMILY_FILL =
  /(?<![\w/.-])((?:[\w-]+:)*)(?:bg|from|via|to)-(emerald|teal|green|red)-(\d{3})(?![\w/.-])/g;
const ANY_WHITE_INK = /(?<![\w/.-])(?:[\w-]+:)*text-white(?=[\s'"`}]|$)/;

const greenFamilyOffenders = () => {
  const found: { file: string; fill: string; ratio: number; text: string }[] = [];
  let checked = 0;
  for (const file of ROOTS.flatMap(walk)) {
    for (const lit of literals(stripComments(readFileSync(file, 'utf8')))) {
      if (!ANY_WHITE_INK.test(lit)) continue;
      for (const m of lit.matchAll(GREEN_FAMILY_FILL)) {
        const [, variant, family, step] = m;
        const fill = (colors as unknown as Record<string, Record<string, string>>)[family]?.[step];
        if (!fill) continue;
        checked++;
        const ratio = contrast(WHITE, hex(fill));
        if (ratio >= 4.5) continue;
        found.push({
          file,
          fill: `${variant}${family}-${step}`,
          ratio,
          text: lit.replace(/\s+/g, ' ').trim().slice(0, 110),
        });
      }
    }
  }
  return { found, checked };
};

describe('no white ink sits on an emerald, teal, green or red fill below AA', () => {
  it('measures the fills it replaces, so a broken scan cannot pass silently', () => {
    expect(contrast(WHITE, hex(colors.emerald[600]))).toBeLessThan(4);
    expect(contrast(WHITE, hex(colors.emerald[500]))).toBeLessThan(3);
    expect(contrast(WHITE, hex(colors.teal[500]))).toBeLessThan(3);
    expect(contrast(WHITE, hex(colors.red[500]))).toBeLessThan(4);
    expect(contrast(WHITE, hex(colors.red[600]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex(colors.emerald[700]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex(colors.green[700]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, hex(colors.teal[700]))).toBeGreaterThanOrEqual(4.5);
  });

  it('finds the white-on-fill pairs it is meant to check', () => {
    // The Flag button alone is one; a scan that matched nothing would pass.
    expect(greenFamilyOffenders().checked).toBeGreaterThan(5);
  });

  it('never sets white on an emerald, teal or green fill that fails AA', () => {
    const { found } = greenFamilyOffenders();
    const offenders = found
      .filter((o) => !GREEN_FAMILY_EXEMPT.has(o.file))
      .map((o) => `${o.file}: ${o.fill} is ${o.ratio.toFixed(2)}:1 with white — ${o.text}`);
    expect(offenders, 'use the -700 step, and -800 on hover').toEqual([]);
  });

  it('keeps its exemptions honest: each still has a failing fill to excuse', () => {
    const { found } = greenFamilyOffenders();
    const stale = [...GREEN_FAMILY_EXEMPT.keys()].filter(
      (file) => !found.some((o) => o.file === file)
    );
    expect(stale, 'remove these from GREEN_FAMILY_EXEMPT — they are clean now').toEqual([]);
  });
});
