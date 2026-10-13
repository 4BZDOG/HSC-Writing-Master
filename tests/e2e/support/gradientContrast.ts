import type { Locator } from '@playwright/test';
import { ChainNode, Rgb, parseCssColour, resolveGrounds, worstContrast } from './gradientMath';

/**
 * Text contrast over gradients, measured inside one element.
 *
 * The solid harness (`measureContrast`) skips any text whose background is an
 * image and counts it as "unassessed". Over a gradient the answer depends on
 * the pixel, so that was a fair thing to say, and it was also the gap the
 * marking report's band gradients shipped through: white text on 1.9-2.8:1
 * grounds, never once failed. This measures the same text, but against every
 * ground the gradient can paint (see gradientMath.ts for the arithmetic and the
 * worst-case choice), and it is scoped to a surface so a reading is always
 * attributable to something a reader can name.
 *
 * What it still does NOT do, so a green run is not read as more than it is:
 *   - Text over a `url()` image or an oklch() colour is UNASSESSABLE, reported
 *     with its reason and counted, never passed. Nothing in the light-theme
 *     surfaces uses one today; if that changes the count says so.
 *   - Disabled controls, aria-hidden subtrees, fully transparent text and text
 *     below 15% inherited opacity are skipped, for the reasons `measureContrast`
 *     gives in contrast.ts.
 *   - It walks the DOM text, not the paint. An overlay laid over the words is
 *     invisible here, as it is to the solid harness.
 */

export interface GradientReading {
  text: string;
  /** Worst contrast over every ground the text can sit on. */
  ratio: number;
  /** 4.5, or 3 for large text. */
  floor: number;
  color: string;
  /** The ground that produced `ratio`. */
  background: string;
  /** True when at least one ancestor paints a gradient. */
  gradient: boolean;
  /** How many distinct grounds the text was measured against. */
  grounds: number;
  classes: string;
  selector: string;
}

export interface GradientReport {
  readings: GradientReading[];
  /** Readings whose ground came from a gradient — zero means the gradient path never ran. */
  gradientReadings: number;
  unassessed: { selector: string; text: string; reason: string }[];
}

/** Raw facts pulled from the page; the arithmetic happens in Node. */
interface RawText {
  text: string;
  color: string;
  opacity: number;
  large: boolean;
  classes: string;
  selector: string;
  chain: ChainNode[];
}

/**
 * Measures every text run inside every element `scope` matches against its
 * resolved grounds. `scope` is a locator for the surface's own root(s); a
 * locator matching nothing is a failure to reach the surface, not a pass, and
 * the caller's non-vacuity floor is what says so.
 */
export const measureGradientContrast = async (scope: Locator): Promise<GradientReport> => {
  const raw = await scope.evaluateAll((roots): RawText[] => {
    const out: RawText[] = [];
    const seen = new Set<Element>();
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.nodeValue ?? '').trim();
        if (!text) continue;
        const el = node.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);

        if (el.closest('[aria-hidden="true"]')) continue;
        if (el.closest('[disabled], [aria-disabled="true"]')) continue;

        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;

        const chain: ChainNode[] = [];
        let opacity = 1;
        let p: Element | null = el;
        while (p) {
          const s = getComputedStyle(p);
          opacity *= parseFloat(s.opacity || '1');
          chain.push({ backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage });
          p = p.parentElement;
        }
        if (opacity < 0.15) continue;

        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        out.push({
          text: text.slice(0, 48),
          color: cs.color,
          opacity,
          large: size >= 24 || (size >= 18.66 && weight >= 700),
          classes: typeof el.className === 'string' ? el.className.replace(/\s+/g, ' ').trim() : '',
          selector:
            el.tagName.toLowerCase() +
            (typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
              : ''),
          chain,
        });
      }
    }
    return out;
  });

  const readings: GradientReading[] = [];
  const unassessed: GradientReport['unassessed'] = [];

  for (const item of raw) {
    const text = parseCssColour(item.color);
    if (!text) {
      unassessed.push({
        selector: item.selector,
        text: item.text,
        reason: `text colour ${item.color}`,
      });
      continue;
    }
    // Text that paints no ink is not a reading (see measureContrast).
    if (text.a === 0 || item.opacity === 0) continue;

    const grounds = resolveGrounds(item.chain);
    if ('unassessable' in grounds) {
      unassessed.push({ selector: item.selector, text: item.text, reason: grounds.unassessable });
      continue;
    }

    const worst = worstContrast(text, item.opacity, grounds.candidates);
    readings.push({
      text: item.text,
      ratio: Math.round(worst.ratio * 100) / 100,
      floor: item.large ? 3 : 4.5,
      color: item.color,
      background: `rgb(${(worst.background as Rgb).join(',')})`,
      gradient: grounds.gradient,
      grounds: grounds.candidates.length,
      classes: item.classes,
      selector: item.selector,
    });
  }

  return {
    readings,
    gradientReadings: readings.filter((r) => r.gradient).length,
    unassessed,
  };
};

/** One line per failing run, for a message someone can act on. */
export const describeGradientReadings = (readings: GradientReading[]): string =>
  readings
    .map(
      (r) =>
        `  ${r.ratio}:1 (needs ${r.floor})  ${r.color} on ${r.background} ` +
        `(worst of ${r.grounds} grounds${r.gradient ? ', gradient' : ''})  "${r.text}"\n` +
        `      ${r.selector}  ${r.classes}`
    )
    .join('\n');
