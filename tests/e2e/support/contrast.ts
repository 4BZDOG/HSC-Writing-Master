import { Page } from '@playwright/test';

/**
 * Text-contrast measurement, run inside the page.
 *
 * Both light-theme defects found by hand in the last release pass were the same
 * story: a tone chosen against a near-black surface, reused unchanged on white,
 * landing somewhere between hard-to-read and invisible. Neither was caught by
 * anything, because nothing in the suite ever looked at a colour.
 *
 * What this can and cannot see, stated plainly, because a checker that quietly
 * skips things is worse than none:
 *
 *   - **Gradients and images are not assessed.** Where the resolved background
 *     is a gradient the true contrast depends on which pixel the glyph lands
 *     on, so those nodes are counted and reported, never failed.
 *   - **The app header is measured like everything else, as of the redesign
 *     that gave it a light theme.** It used to be skipped: its background was a
 *     full-bleed gradient painted by an absolutely-positioned child, so the text
 *     above it resolved to the page background and every reading was wrong by
 *     construction. The bar now paints its own translucent token colour, which
 *     `resolveBackground` composites correctly, so it is held to the same AA
 *     floor as the rest of the app. Two parts of it still are not covered, and
 *     neither is an oversight: the wordmark tile carries an icon rather than
 *     text, and the storage-error chip renders only when storage has actually
 *     failed, which a normal run never reaches. The chip calculates at about
 *     5.9:1 (`#b91c1c` on `#fee2e2`) — calculated, not measured, which is the
 *     weaker of the two claims and is why it is written down here.
 *   - **Disabled controls are skipped**, as WCAG exempts them.
 *   - **Only the element's own background chain is composited.** An overlay
 *     sibling laid over the text is invisible to this, same as above.
 *   - **`sr-only` text is already skipped, and by accident rather than by
 *     design.** Tailwind's utility is a 1×1px clipped box, so the
 *     `rect.width < 2` guard above drops it before a colour is ever read. That
 *     is the right answer — a node with no painted background of its own has no
 *     contrast to measure — but it is worth naming, because the navigator's
 *     live region and its five step names are all `sr-only` and a reader
 *     counting text nodes will otherwise go looking for them.
 *
 * What the suite reaches, as of the navigator work:
 *
 *   - **The expanded syllabus navigator is now measured** (`light-theme.spec.ts`).
 *     It never was: every spec reaches the workspace through `openFirstQuestion`,
 *     and choosing a question folds the navigator away, so the app's *first*
 *     screen was exempt by accident. That is how a selected focus area came to
 *     be white on near-white at 1.10:1 in the open.
 *   - **Its question rows are measured but mostly not gated.** They sit on the
 *     tier washes, and `neutralBackground` is false for red, orange, yellow,
 *     green and blue. Only tier 6's purple is near-grey enough to count — which
 *     is why the marks label's 4.03:1 was caught there and nowhere else, and
 *     why the same label passes unexamined on the other five.
 *   - **The navigator's chrome is largely invisible to a text-node walker.** The
 *     rail line and its five nodes, the step-header icon tiles, and the
 *     icon-only action buttons (Rename, Delete, Reset Focus, Edit focus areas)
 *     carry no text at all. Their 3:1 non-text floor is still on the honour
 *     system, and the tick inside a completed rail node with it.
 */

export interface ContrastReading {
  /** Stable id assigned on the first pass so two themes can be compared. */
  id: number;
  text: string;
  ratio: number;
  /** 4.5, or 3 for large text. */
  floor: number;
  color: string;
  background: string;
  /** True when the resolved background is a flat, near-grey colour — the
   *  reading surfaces, as opposed to brand-coloured chrome. */
  neutralBackground: boolean;
  /** The element's full class list — what a reader has to change to fix it. */
  classes: string;
  selector: string;
}

export interface ContrastReport {
  readings: ContrastReading[];
  /** Nodes over a gradient or image, which cannot be measured this way. */
  unassessed: number;
}

/**
 * Stops every animation and transition dead before measuring.
 *
 * A pulsing badge has a different contrast in every frame, so a reading taken
 * from one is whatever moment the run happened to sample — the difference
 * between a 7:1 and a 2:1 for the same element, and a test that fails once a
 * fortnight for no reason anyone can reproduce. Frozen, every run measures the
 * settled state, which is also the one a reader spends their time looking at.
 */
export const freezeAnimations = (page: Page) =>
  page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }`,
  });

/** Runs the audit in the page and tags each measured element for a re-run. */
export const measureContrast = (page: Page): Promise<ContrastReport> =>
  page.evaluate(() => {
    const chan = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (rgb: number[]) =>
      0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const parse = (value: string) => {
      const m = String(value).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
    };
    const composite = (fg: { rgb: number[]; a: number }, bg: number[]) =>
      fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a)));

    /** Walks up compositing background layers until one is opaque. */
    const resolveBackground = (el: Element): { rgb?: number[]; unassessable?: boolean } => {
      const layers: { rgb: number[]; a: number }[] = [];
      let node: Element | null = el;
      while (node) {
        const cs = getComputedStyle(node);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unassessable: true };
        const bg = parse(cs.backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 0.999) break;
        }
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) base = composite(layers[i], base);
      return { rgb: base };
    };

    const readings: ContrastReading[] = [];
    let unassessed = 0;
    let nextId = 0;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
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

      let opacity = 1;
      let p: Element | null = el;
      while (p) {
        opacity *= parseFloat(getComputedStyle(p).opacity || '1');
        p = p.parentElement;
      }
      // Something faded almost out of sight is decoration, not reading matter.
      if (opacity < 0.15) continue;

      const bg = resolveBackground(el);
      if (bg.unassessable || !bg.rgb) {
        unassessed++;
        continue;
      }
      const fg = parse(cs.color);
      if (!fg) continue;

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      // A background counts as neutral when its channels sit within a few
      // points of each other — white, slate, near-black. Brand-coloured chrome
      // (a band chip, an amber badge) is a design decision taken once for both
      // themes, not a light-theme oversight, so it is measured but not gated.
      const [r, g, b] = bg.rgb;
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) <= 24;

      const id = nextId++;
      (el as HTMLElement).dataset.contrastId = String(id);
      readings.push({
        id,
        text: text.slice(0, 48),
        ratio:
          Math.round(ratio(composite({ rgb: fg.rgb, a: fg.a * opacity }, bg.rgb), bg.rgb) * 100) /
          100,
        floor: large ? 3 : 4.5,
        color: cs.color,
        background: `rgb(${bg.rgb.join(',')})`,
        neutralBackground: neutral,
        classes: typeof el.className === 'string' ? el.className.replace(/\s+/g, ' ').trim() : '',
        selector:
          el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : ''),
      });
    }
    return { readings, unassessed };
  });

/** What a re-measured element looks like in the second theme. */
export interface Remeasured {
  ratio: number;
  color: string;
  background: string;
  /** Compared with the first pass: a node whose text changed is a different
   *  state of the same component, not the same reading. */
  text: string;
}

/** Re-measures only the elements the first pass tagged, keyed by that tag. */
export const remeasureTagged = (page: Page): Promise<Record<number, Remeasured>> =>
  page.evaluate(() => {
    const chan = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (rgb: number[]) =>
      0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const parse = (value: string) => {
      const m = String(value).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
    };
    const composite = (fg: { rgb: number[]; a: number }, bg: number[]) =>
      fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a)));

    const out: Record<number, Remeasured> = {};
    document.querySelectorAll<HTMLElement>('[data-contrast-id]').forEach((el) => {
      const cs = getComputedStyle(el);
      const layers: { rgb: number[]; a: number }[] = [];
      let node: Element | null = el;
      let unassessable = false;
      while (node) {
        const s = getComputedStyle(node);
        if (s.backgroundImage && s.backgroundImage !== 'none') {
          unassessable = true;
          break;
        }
        const bg = parse(s.backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 0.999) break;
        }
        node = node.parentElement;
      }
      if (unassessable) return;
      let base = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) base = composite(layers[i], base);
      const fg = parse(cs.color);
      if (!fg) return;
      let opacity = 1;
      let p: Element | null = el;
      while (p) {
        opacity *= parseFloat(getComputedStyle(p).opacity || '1');
        p = p.parentElement;
      }
      out[Number(el.dataset.contrastId)] = {
        ratio:
          Math.round(ratio(composite({ rgb: fg.rgb, a: fg.a * opacity }, base), base) * 100) / 100,
        color: cs.color,
        background: `rgb(${base.join(',')})`,
        text: (el.textContent ?? '').trim().slice(0, 48),
      };
    });
    return out;
  });

/** One line per finding, for a failure message someone can act on. */
export const describeReadings = (readings: ContrastReading[]): string =>
  readings
    .map(
      (r) =>
        `  ${r.ratio}:1 (needs ${r.floor})  ${r.color} on ${r.background}  "${r.text}"\n` +
        `      ${r.classes}`
    )
    .join('\n');
