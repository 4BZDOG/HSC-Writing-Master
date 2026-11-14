import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import { getBandInkRgb } from '../../utils/renderUtils';
import { PromptVerb } from '../../types';

/**
 * The writing card's header tools, at the sizes the design asks for.
 *
 * From `sm` every tool is 32px square, so the row is no taller than its 36px bar;
 * the phone keeps its 44px touch targets. The mode switch names itself "Coach" from
 * `xl`. The inactive mode labels are solid white: a translucent white did not clear
 * 4.5:1 on the worst band (see the contrast cases below).
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

const renderCoach = () =>
  render(
    <Editor
      value="A draft."
      onChange={() => {}}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      onWritingModeChange={() => {}}
      onToggleFocusMode={() => {}}
      syncedFontSize={18}
      onFontSizeChange={() => {}}
    />
  );

describe('the header tools', () => {
  it.each(['Formatting (bold, italic)', 'Decrease writing size', 'Increase writing size', 'Copy'])(
    '%s is 32px square from sm up and 44px on a phone',
    (name) => {
      renderCoach();

      const tool = screen.getByRole('button', { name });
      expect(tool.className).toContain('sm:min-w-8 sm:min-h-8');
      expect(tool.className).toContain('max-sm:size-11');
    }
  );

  it('keeps the mode switch and Focus at 32px tall from sm up', () => {
    renderCoach();

    for (const name of ['Coach mode', 'Exam mode', 'Focus mode']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toContain('h-6 sm:h-8');
      expect(button.className).toContain('max-sm:size-11');
    }
  });

  it('keeps every accessible name the controls already had', () => {
    renderCoach();

    expect(screen.getByRole('button', { name: 'Coach mode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exam mode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Focus mode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });
});

describe('the mode switch label', () => {
  it('shows "Coach" beside the compass from 2xl, where the tray has room', () => {
    renderCoach();

    const coach = screen.getByRole('button', { name: 'Coach mode' });
    const label = Array.from(coach.querySelectorAll('span')).find((s) => s.textContent === 'Coach');
    // Not below `2xl`: at 1280 and 1400 the word wrapped the tray and grew the header.
    expect(label?.className).toContain('hidden 2xl:inline');
  });

  it('keeps the Exam label at 2xl, so the header holds its height at 1280px', () => {
    renderCoach();

    const exam = screen.getByRole('button', { name: 'Exam mode' });
    const label = Array.from(exam.querySelectorAll('span')).find((s) => s.textContent === 'Exam');
    expect(label?.className).toContain('hidden 2xl:inline');
  });
});

/**
 * The inactive mode labels were `text-white/60`, measured at 3.6:1 on the header wash.
 * The same method as cardHeaderWashContrast: white over the band ink, through the
 * progress veil in each theme, for every band and progress level.
 */
describe('the inactive mode labels clear 4.5:1', () => {
  type Rgb = [number, number, number];
  const WHITE: Rgb = [255, 255, 255];
  const THEMES = {
    light: { veil: [15, 23, 42] as Rgb, veilOpacity: 0.45 },
    dark: { veil: [2, 6, 23] as Rgb, veilOpacity: 1 },
  };
  const triplet = (t: string): Rgb => t.split(' ').map(Number) as Rgb;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const contrast = (a: Rgb, b: Rgb) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (top: Rgb, a: number, bottom: Rgb): Rgb =>
    [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)) as Rgb;

  it('uses solid white, not a translucent white, for the inactive label', () => {
    renderCoach();
    const exam = screen.getByRole('button', { name: 'Exam mode' });

    expect(exam.className).toContain('text-white');
    expect(exam.className).not.toMatch(/text-white\/\d+/);
  });

  it('clears 4.5:1 for solid white on every band, theme and progress level', () => {
    for (const [, { veil, veilOpacity }] of Object.entries(THEMES)) {
      for (let band = 1; band <= 6; band++) {
        for (const progress of [0, 0.5, 1]) {
          const base = triplet(getBandInkRgb(band));
          const a = (1 - progress) * 0.6 * veilOpacity;
          const ground = a > 0 ? over(veil, a, base) : base;
          expect(contrast(WHITE, ground)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
