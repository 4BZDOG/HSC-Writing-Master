import { Page } from '@playwright/test';

/**
 * Text cut off by its own box — on EITHER axis.
 *
 * Written because the same defect got past three checks in a row. The verb
 * ribbon's tier names were ellipsised, fixed, and ellipsised again, and each
 * time the assertion guarding them compared `scrollWidth` against
 * `clientWidth`. A VERTICAL clamp never trips that: with `line-clamp-2` the
 * text fits its line perfectly and is cut off below it, so the width check
 * reports a clean bill on a card reading "EVALUATE, SYNTHESISE &…".
 *
 * So the rule is both axes, and it lives here rather than being written out at
 * each call site, because writing it out at each call site is how it came to be
 * half-written three times.
 *
 * ## What counts as clipped
 *
 * Only `hidden` and `clip` cut text off. `auto` and `scroll` make a box
 * scrollable, which means the words are still reachable — the previous version
 * of this check used `overflow !== 'visible'` and so counted those as clipped
 * too, which is wrong in the opposite direction.
 *
 * Each axis is judged by ITS OWN overflow property. A row that scrolls
 * sideways and hides vertically is clipped only downward, and `overflow` (the
 * shorthand) cannot answer that.
 *
 * ## What is allowed to be clipped
 *
 * Truncation is a legitimate design choice — a breadcrumb, a long course name,
 * a chip — but only when the whole string is still recoverable. So an element
 * is exempt when a `title` or `aria-label` on IT OR ON AN ANCESTOR carries the
 * full text, which is the same bargain the app already makes wherever it
 * truncates on purpose; the attribute usually sits on the button, not on the
 * span inside it. Anything cut off with no way back to the words is a defect.
 *
 * Visually-hidden text is skipped, because being clipped to nothing is the
 * whole mechanism: `sr-only` is a 1px box with `overflow: hidden`, so the six
 * `sr-only` "ceiling" spans in the verb ribbon are the check working correctly
 * on text that is not meant to be seen. A box a pixel or less on either side is
 * not on screen to be cut off.
 */
export interface ClippedText {
  /** The visible text, trimmed, first 60 characters. */
  text: string;
  axis: 'across' | 'down' | 'both';
  /** e.g. "needs 3 lines, shows 2" or "needs 187px, shows 149". */
  by: string;
  /** A rough path to the element, for the failure message. */
  where: string;
}

export const findClippedText = (page: Page, scope = 'body'): Promise<ClippedText[]> =>
  page.evaluate((sel: string) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out: ClippedText[] = [];

    const cuts = (value: string) => value === 'hidden' || value === 'clip';

    const path = (el: Element) => {
      const parts: string[] = [];
      let node: Element | null = el;
      for (let i = 0; node && i < 3; i += 1) {
        const tag = node.tagName.toLowerCase();
        const cls = String((node as HTMLElement).className || '')
          .split(/\s+/)
          .filter((c) => /^(t-|rounded-panel|ribbon|card)/.test(c))
          .slice(0, 1)
          .join('');
        parts.unshift(cls ? `${tag}.${cls}` : tag);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };

    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      // Its OWN words, not a container reporting its children's overflow.
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1
      );
      if (!ownText) continue;
      const rect = el.getBoundingClientRect();
      // Off screen, or hidden from sight on purpose (see the note above).
      if (rect.width <= 1 || rect.height <= 1) continue;

      const style = getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight) || 0;
      const across = cuts(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
      // A whole LINE short, not a fraction of one. Sub-pixel line boxes make
      // `scrollHeight` a pixel taller than `clientHeight` on plenty of headings
      // that are not clipped at all, and "needs 1 line, shows 1" is not a
      // defect report.
      const down =
        cuts(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 1 &&
        (!lineHeight ||
          Math.round(el.scrollHeight / lineHeight) > Math.round(el.clientHeight / lineHeight));
      if (!across && !down) continue;

      // Recoverable elsewhere? Then the truncation is a choice, not a loss.
      // Up the chain, because the attribute is usually on the control rather
      // than on the span that happens to hold the words.
      const full = (el.textContent || '').trim();
      let recoverable = false;
      for (let a: HTMLElement | null = el; a && !recoverable; a = a.parentElement) {
        const spare = `${a.getAttribute('title') || ''} ${a.getAttribute('aria-label') || ''}`;
        recoverable = full.length > 0 && spare.includes(full);
      }
      if (recoverable) continue;

      const by = down
        ? lineHeight
          ? `needs ${Math.round(el.scrollHeight / lineHeight)} lines, shows ${Math.round(el.clientHeight / lineHeight)}`
          : `needs ${el.scrollHeight}px tall, shows ${el.clientHeight}`
        : `needs ${el.scrollWidth}px wide, shows ${el.clientWidth}`;

      out.push({
        text: full.slice(0, 60),
        axis: across && down ? 'both' : across ? 'across' : 'down',
        by,
        where: path(el),
      });
    }
    return out;
  }, scope);

/** One line per finding, for a failure message that says what to go and look at. */
export const describeClipped = (found: ClippedText[]): string =>
  found.map((c) => `  [${c.axis}] ${c.by} — "${c.text}"  (${c.where})`).join('\n');
