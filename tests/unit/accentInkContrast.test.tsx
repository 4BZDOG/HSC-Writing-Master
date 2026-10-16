import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VERB_OVERLAY_CLASS } from '../../utils/renderUtils';
import FileDropzone from '../../components/dataManager/FileDropzone';

/**
 * The accent as TEXT. `--color-accent` is a fill colour: white reads on it, and
 * it was the same token read as ink too, so the light theme's sky-700 landed at
 * 3.78:1 on the verb highlight wash and 4.38:1 on the hovered drop zone, and the
 * dark theme's sky-500 at 3.74:1 on the dark drop zone's hover ground.
 *
 * `--color-accent-ink` is the step for text. These pin it against every ground
 * the accent is set on as ink, in both themes, against the live tokens in
 * `index.css`, and pin the two components that use it.
 */

const CSS = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

type RGB = [number, number, number];

/** `--name: r g b;` inside a block. `:root` is the dark theme. */
const token = (selector: string, name: string): RGB => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!block) throw new Error(`index.css: no ${selector} block`);
  const decl = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block[1]);
  if (!decl) throw new Error(`index.css: ${selector} does not define --${name}`);
  return [Number(decl[1]), Number(decl[2]), Number(decl[3])];
};

// The selectors as they appear in index.css, escaped for the RegExp above.
const LIGHT = "\\[data-theme='light'\\]";
const DARK = ':root';

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

/** `top` at `alpha` laid over `bottom`. */
const over = (top: RGB, alpha: number, bottom: RGB): RGB =>
  [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)) as RGB;

describe('the light theme accent ink', () => {
  const ink = token(LIGHT, 'color-accent-ink');
  const accent = token(LIGHT, 'color-accent');
  const paper = token(LIGHT, 'color-bg-surface');
  const surfaceLight = token(LIGHT, 'color-bg-surface-light');
  const inset = token(LIGHT, 'color-bg-surface-inset');

  it('clears 4.5:1 on the verb highlight, which is the accent at 20% over the paper', () => {
    expect(contrast(ink, over(accent, 0.2, paper))).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 on the verb highlight over the writing well, the deeper ground', () => {
    expect(contrast(ink, over(accent, 0.2, inset))).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 on the hovered drop zone, the lightest ground the accent sits on', () => {
    expect(contrast(ink, surfaceLight)).toBeGreaterThanOrEqual(4.5);
  });

  it('is deeper than the fill step, which is the change that was needed', () => {
    expect(contrast(accent, over(accent, 0.2, paper))).toBeLessThan(4.5);
  });
});

describe('the dark theme accent ink', () => {
  const ink = token(DARK, 'color-accent-ink');
  const accent = token(DARK, 'color-accent');
  const surface = token(DARK, 'color-bg-surface');
  const surfaceLight = token(DARK, 'color-bg-surface-light');
  const desk = token(DARK, 'color-bg-base');

  it('clears 4.5:1 on the hovered drop zone, where sky-500 measured 3.74:1', () => {
    expect(contrast(ink, surfaceLight)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, surfaceLight)).toBeLessThan(4.5);
  });

  it('clears 4.5:1 on the verb highlight over the desk and over the card', () => {
    expect(contrast(ink, over(accent, 0.2, desk))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, over(accent, 0.2, surface))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the components that set the accent as ink', () => {
  it('draws the verb highlight overlay in the accent ink, not the fill step', () => {
    expect(VERB_OVERLAY_CLASS).toContain('text-[rgb(var(--color-accent-ink))]');
    expect(VERB_OVERLAY_CLASS).not.toMatch(/text-\[rgb\(var\(--color-accent\)\)\]/);
  });

  it('draws the .json label of the drop zone in the accent ink', () => {
    const { getByText } = render(<FileDropzone onFileDrop={() => {}} />);
    const label = getByText('.json');
    expect(label.className).toContain('text-[rgb(var(--color-accent-ink))]');
    expect(label.className).not.toMatch(/text-\[rgb\(var\(--color-accent\)\)\]/);
  });
});
