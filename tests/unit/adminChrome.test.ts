import { describe, it, expect } from 'vitest';
import {
  railTabClass,
  SECTION_TITLE,
  TOOL_HEAD,
  TOOL_RAIL,
  TOOL_WELL,
} from '../../utils/adminChrome';

/**
 * The staff tools' shared chrome. These are class strings, so the checks are on
 * which ladder rung each one names and on the voice of a section title, which
 * is what the light-theme audit found wrong. The pairs themselves are held by
 * `themePairDirection.test.ts`; this file holds the rung each region is drawn on.
 */
describe('admin tool chrome', () => {
  it('draws a rail on the elevated rung, not on white', () => {
    expect(TOOL_RAIL).toBe('bg-surface-elevated');
    expect(TOOL_RAIL).not.toMatch(/bg-white|light:bg-white/);
  });

  it('cuts a well into the paper, so a body of cards reads as a body', () => {
    expect(TOOL_WELL).toBe('bg-surface-inset');
  });

  it('gives a head a tinted wash over the paper rather than a flat fill', () => {
    expect(TOOL_HEAD).toContain('bg-[rgb(var(--color-bg-surface))]');
    expect(TOOL_HEAD).toContain('linear-gradient');
    expect(TOOL_HEAD).toContain('--color-primary');
    // The wash fades to the primary hue at zero alpha, not to `transparent`,
    // which Safari takes through grey on a gradient.
    expect(TOOL_HEAD).not.toContain('transparent');
  });

  it('sets section titles in the section voice but in sentence case', () => {
    expect(SECTION_TITLE).toContain('t-section');
    expect(SECTION_TITLE).toContain('!normal-case');
    expect(SECTION_TITLE).toContain('!tracking-normal');
    expect(SECTION_TITLE).toContain('!text-sm');
  });

  describe('the rail tab', () => {
    const TONE = 'bg-amber-500/10 text-amber-400';

    it('stacks its icon over its label below md, so three tabs share a phone row', () => {
      const tab = railTabClass(true, TONE);
      expect(tab).toContain('flex-col');
      expect(tab).toContain('md:flex-row');
      expect(tab).toContain('min-w-0');
      // The label is the 12px step on a phone; the 14px step is from md.
      expect(tab).toContain('text-xs md:text-sm');
      expect(tab).not.toContain('overflow-x');
    });

    it('takes the tab’s own tint when it is the current one, and the quiet treatment otherwise', () => {
      expect(railTabClass(true, TONE)).toContain(TONE);
      const idle = railTabClass(false, TONE);
      expect(idle).not.toContain(TONE);
      expect(idle).toContain('text-[rgb(var(--color-text-secondary))]');
    });
  });
});
