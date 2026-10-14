import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import colors from 'tailwindcss/colors';
import { toastConfig } from '../../components/Toast';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

/**
 * The authoring modals (prompt generator, manual prompt, sub-topic and topic
 * import, sample answers, starter questions, course request) and their shared
 * error card and toast. An audit measured each of them in both themes and
 * found the same few shapes of failure, and this pins the pairs the fixes
 * introduced so a retuned token or palette step fails here, not on a student's
 * screen:
 *
 *   - muted and dim labels on the ladder rungs they sit on. `text-slate-500` was
 *     written once for a white page and read 3.7:1 on the dark card; the ladder
 *     token is the same ink in both themes and clears on every rung.
 *   - a light-theme ink for each accent. `text-indigo-400` on the paper is
 *     2.9:1; the light side of a pair is the higher step.
 *   - white ink on a solid fill, at rest AND on hover. A hover that darkened
 *     nothing, or stepped to -500, dropped white under 4.5:1.
 *   - the toast chrome, read from the same `toastConfig` the component renders.
 *
 * WCAG 1.4.3 thresholds throughout: 4.5:1 for text.
 */

type RGB = [number, number, number];

const CSS = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

/** `--color-*: r g b;` out of a CSS block. `:root` is the dark theme. */
const token = (selector: string, name: string): RGB => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!block) throw new Error(`index.css: no ${selector} block`);
  const decl = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block[1]);
  if (!decl) throw new Error(`index.css: ${selector} does not define --${name}`);
  return [Number(decl[1]), Number(decl[2]), Number(decl[3])];
};

const hex = (value: string): RGB => {
  const n = parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** A Tailwind palette step, as RGB, e.g. `tw('emerald', 700)`. */
const tw = (family: string, step: number): RGB => {
  const palette = (colors as unknown as Record<string, Record<number, string>>)[family];
  if (!palette || !palette[step]) throw new Error(`no tailwind colour ${family}-${step}`);
  return hex(palette[step]);
};

const WHITE: RGB = [255, 255, 255];

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

/** `top` at `alpha` laid over `under`. */
const over = (top: RGB, alpha: number, under: RGB): RGB =>
  [0, 1, 2].map((i) => top[i] * alpha + under[i] * (1 - alpha)) as RGB;

/** The ladder rungs the modals sit on, read from index.css so a retune moves the test with it. */
const LIGHT = {
  base: token("\\[data-theme='light'\\]", 'color-bg-base'),
  surface: token("\\[data-theme='light'\\]", 'color-bg-surface'),
  elevated: token("\\[data-theme='light'\\]", 'color-bg-surface-elevated'),
  inset: token("\\[data-theme='light'\\]", 'color-bg-surface-inset'),
  surfaceLight: token("\\[data-theme='light'\\]", 'color-bg-surface-light'),
  muted: token("\\[data-theme='light'\\]", 'color-text-muted'),
  dim: token("\\[data-theme='light'\\]", 'color-text-dim'),
  primary: token("\\[data-theme='light'\\]", 'color-text-primary'),
};
const DARK = {
  base: token(':root', 'color-bg-base'),
  surface: token(':root', 'color-bg-surface'),
  elevated: token(':root', 'color-bg-surface-elevated'),
  inset: token(':root', 'color-bg-surface-inset'),
  surfaceLight: token(':root', 'color-bg-surface-light'),
  muted: token(':root', 'color-text-muted'),
  dim: token(':root', 'color-text-dim'),
  primary: token(':root', 'color-text-primary'),
};

describe('the ladder labels clear AA on every rung they sit on', () => {
  for (const [theme, t] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`${theme}: text-muted reads on paper, strips, wells and chips`, () => {
      for (const ground of [t.surface, t.elevated, t.inset, t.surfaceLight, t.base]) {
        expect(contrast(t.muted, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme}: text-dim is the placeholder ink on the paper and the wells the inputs sit in`, () => {
      // A placeholder is text, so it owes the same 4.5:1 as the label beside it.
      for (const ground of [t.surface, t.inset]) {
        expect(contrast(t.dim, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('measures the slate tones the placeholders and labels used to be, so the check cannot pass vacuously', () => {
    expect(contrast(tw('slate', 500), DARK.surface)).toBeLessThan(4.5);
    expect(contrast(tw('slate', 500), tw('amber', 100))).toBeLessThan(4.5);
    expect(contrast(tw('slate', 600), DARK.inset)).toBeLessThan(4.5);
  });
});

describe('the light-theme ink for each accent is the deeper step', () => {
  // Each `text-<accent>-400 light:text-<accent>-700` pair. The light ink has to
  // clear on the paper and the strip on it, and on the wash a chip of that
  // accent sits on. Accent ink is not set on the wells: amber-700 is 4.26:1 on
  // the inset well, which is why the wells carry the neutral muted and dim
  // tones and the amber chips stay on the paper. A 15% amber chip steps to -800,
  // because amber-700 on that wash is 4.48:1.
  const ink = (family: string) => (family === 'amber' ? 800 : 700);
  it.each(['indigo', 'emerald', 'amber', 'red', 'blue', 'purple', 'sky'] as const)(
    '%s light ink clears 4.5:1 on paper, the strip on it, and its own 10% wash',
    (family) => {
      const grounds = [LIGHT.surface, LIGHT.elevated, over(tw(family, 500), 0.1, LIGHT.surface)];
      for (const ground of grounds) {
        expect(contrast(tw(family, 700), ground), `${family}-700`).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(tw(family, ink(family)), over(tw(family, 500), 0.15, LIGHT.surface)),
        family
      ).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('measures the -400 and -500 inks the light theme used to get, so the check cannot pass vacuously', () => {
    expect(contrast(tw('indigo', 400), LIGHT.surface)).toBeLessThan(4.5);
    expect(contrast(tw('emerald', 400), tw('emerald', 100))).toBeLessThan(4.5);
    expect(contrast(tw('amber', 500), LIGHT.surface)).toBeLessThan(4.5);
    expect(contrast(tw('red', 500), LIGHT.surface)).toBeLessThan(4.5);
  });

  it('keeps the dark theme accents at their -400 step on the dark surfaces', () => {
    for (const family of ['indigo', 'emerald', 'amber', 'red', 'sky', 'purple'] as const) {
      expect(contrast(tw(family, 400), DARK.surface), family).toBeGreaterThanOrEqual(4.5);
    }
    // Red text on a red wash over the dark card, as the error notice paints it.
    expect(
      contrast(tw('red', 400), over(tw('red', 500), 0.1, DARK.surface))
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tw('red', 300), over(tw('red', 500), 0.1, DARK.surface))
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('white ink on a solid fill clears AA, at rest and on hover', () => {
  it.each([
    ['emerald-700 chip (syllabus badge)', tw('emerald', 700)],
    ['emerald-700 save button', tw('emerald', 700)],
    ['teal-700 save button end', tw('teal', 700)],
    ['indigo-600 refine button', tw('indigo', 600)],
    ['purple-600 refine button end', tw('purple', 600)],
    ['indigo-600 active step pill', tw('indigo', 600)],
    ['indigo-700 hover', tw('indigo', 700)],
    ['red-600 retry button', tw('red', 600)],
    ['red-700 retry hover', tw('red', 700)],
    ['blue-600 selected scenario', tw('blue', 600)],
    ['sky-700 recalibrate end', tw('sky', 700)],
  ])('%s', (_name, fill) => {
    expect(contrast(WHITE, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('measures the fills the buttons used to paint, so the check cannot pass vacuously', () => {
    expect(contrast(WHITE, tw('emerald', 600))).toBeLessThan(4.5);
    expect(contrast(WHITE, tw('indigo', 500))).toBeLessThan(4.5);
    expect(contrast(WHITE, tw('red', 500))).toBeLessThan(4.5);
    expect(contrast(WHITE, tw('blue', 500))).toBeLessThan(4.5);
  });

  it('keeps the retry button solid, not a translucent wash that lets the light card through', () => {
    // `bg-red-600/60` over the light card was a pink-red the white ink could not
    // clear, and the fill was translucent so the card showed through it.
    const washed = over(tw('red', 600), 0.6, LIGHT.surface);
    expect(contrast(WHITE, washed)).toBeLessThan(4.5);
  });
});

describe('the toast chrome clears AA in both themes, for every type it can show', () => {
  // The title, the action and the message are read from the same config the
  // component renders, so a retuned shade fails here.
  const CONTAINER_ALPHA = 0.9; // `bg-[rgb(var(--color-bg-surface))]/90`

  const inkOf = (classes: string, theme: 'light' | 'dark'): RGB => {
    const parts = classes.split(' ');
    const match = parts.find((p) =>
      theme === 'light' ? p.startsWith('text-') : p.startsWith('dark:text-')
    );
    if (!match) throw new Error(`no ${theme} text class in "${classes}"`);
    const [, family, step] = /text-([a-z]+)-(\d+)/.exec(match)!;
    return tw(family, Number(step));
  };

  const tintOf = (classes: string): { rgb: RGB; alpha: number } => {
    const match = /bg-([a-z]+)-(\d+)\/(\d+)/.exec(classes);
    if (!match) throw new Error(`no tint in "${classes}"`);
    return { rgb: tw(match[1], Number(match[2])), alpha: Number(match[3]) / 100 };
  };

  for (const type of Object.keys(toastConfig) as Array<keyof typeof toastConfig>) {
    for (const [theme, t] of [
      ['light', LIGHT],
      ['dark', DARK],
    ] as const) {
      it(`${type} (${theme}): title, action and body read on the toast`, () => {
        const config = toastConfig[type];
        const container = over(t.surface, CONTAINER_ALPHA, t.base);
        const title = inkOf(config.iconColor, theme);
        expect(contrast(title, container), `${type} title`).toBeGreaterThanOrEqual(4.5);

        const tint = tintOf(config.iconBg);
        const actionGround = over(tint.rgb, tint.alpha, container);
        expect(contrast(title, actionGround), `${type} action`).toBeGreaterThanOrEqual(4.5);

        expect(contrast(t.primary, container), `${type} body`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, container), `${type} close`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('the staff tools keep their light inks on the wells they sit in', () => {
  // The Data Vault, Content Audit and the usage and key dashboards paint their chips
  // and logs on the inset well (`TOOL_WELL`), which is darker than the paper. An ink
  // that clears on white can fail there, so each pair below is read against the
  // ground its markup sits on. The `-` side is the value a tool shipped with.
  const LIGHT_ACCENT = token("\\[data-theme='light'\\]", 'color-accent');
  const LIGHT_ACCENT_DARK = token("\\[data-theme='light'\\]", 'color-accent-dark');

  it('accent chips read in accent-dark: the accent ink is 4.09:1 on the chip it tints', () => {
    const chip = over(LIGHT_ACCENT, 0.15, LIGHT.inset);
    expect(contrast(LIGHT_ACCENT_DARK, chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT_ACCENT, chip)).toBeLessThan(4.5);
  });

  it('emerald tints take emerald-800: emerald-700 reads 4.30:1 on the tint over the well', () => {
    const tint = over(tw('emerald', 500), 0.1, LIGHT.inset);
    expect(contrast(tw('emerald', 800), tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('emerald', 700), tint)).toBeLessThan(4.5);
  });

  it('the status line on white takes green-700; green-600 reads 3.30:1', () => {
    expect(contrast(tw('green', 700), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('green', 600), WHITE)).toBeLessThan(4.5);
  });

  it('the processing log inks clear the well: amber-800, red-700 and indigo-700', () => {
    expect(contrast(tw('amber', 800), LIGHT.inset)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('red', 700), LIGHT.inset)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('indigo', 700), LIGHT.inset)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('amber', 700), LIGHT.inset)).toBeLessThan(4.5);
    expect(contrast(tw('red', 600), LIGHT.inset)).toBeLessThan(4.5);
  });

  it('a Clear chip on slate-100 takes slate-600; slate-500 reads 4.34:1', () => {
    expect(contrast(tw('slate', 600), tw('slate', 100))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tw('slate', 500), tw('slate', 100))).toBeLessThan(4.5);
  });

  it('a hover fill darkens to a step white clears: red-600 and indigo-700', () => {
    expect(contrast(WHITE, tw('red', 600))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, tw('indigo', 700))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, tw('red', 500))).toBeLessThan(4.5);
    expect(contrast(WHITE, tw('indigo', 500))).toBeLessThan(4.5);
  });
});
