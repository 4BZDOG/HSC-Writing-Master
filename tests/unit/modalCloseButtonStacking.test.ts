import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A modal's close button must be able to receive a click.
 *
 * Two of them could not, and nothing caught it: the button rendered, carried
 * its accessible name and its handler, and sat in the tree exactly where it
 * looked. It was simply painted over.
 *
 * The shape of the bug is a positioned header holding both an absolutely
 * positioned close button and a content wrapper:
 *
 *     <div className="relative ...">
 *       <button aria-label="Close" className="absolute top-4 right-4 ..." />
 *       <div className="relative z-10 ...">{title, intro}</div>
 *     </div>
 *
 * Both are positioned, so they paint by z-index and then by DOM order. The
 * wrapper declares `z-10` and comes LAST, so it wins wherever the two boxes
 * overlap and swallows every click on the button.
 *
 *   - `UpgradeModal` — the button had no z-index at all, so the wrapper
 *     covered it at EVERY width. The close control on the paywall, the
 *     highest-intent surface in the product, did nothing.
 *   - `QuickStartModal` — the button matched the wrapper at `z-10`, so DOM
 *     order decided it. Only bit at a phone width, where the headline wraps
 *     and the content block grows under the button.
 *
 * The rule below is what both fixes amount to: an absolutely positioned close
 * button declares a stacking order that beats the `z-10` content wrappers this
 * codebase writes. A close button is the topmost thing in its corner by
 * design, so this can never hide anything.
 *
 * Close buttons laid out in FLOW (a flex item beside the title) are exempt and
 * not checked: siblings in a flex row cannot overlap, which is why 33 of the
 * 36 close buttons in this codebase were never at risk. Only the three that
 * position themselves over their header are.
 */

const MIN_Z = 20;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });

interface CloseButton {
  file: string;
  className: string;
}

/**
 * Strip comments before scanning.
 *
 * Not tidiness: a fixed look-ahead window is the obvious way to find the
 * className near a label, and it is wrong. The explanatory comment on one of
 * these very buttons is 450 characters long and pushed its own className out
 * of the window, so the scan found nothing and would have reported the file
 * clean. The self-check below is what caught that.
 */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * The span of the opening tag that `labelAt` sits inside: back to its `<tag`,
 * forward to the `>` that closes it.
 *
 * Both ends need care. Reading forward only would miss a className written
 * BEFORE the label, and stopping at the first `>` cuts the tag short at the
 * arrow in `onClick={() => …}`. Braces are tracked so a `>` inside an
 * expression cannot end the tag either.
 */
const openingTagAround = (src: string, labelAt: number): string => {
  let start = labelAt;
  while (start > 0 && !(src[start] === '<' && /[A-Za-z]/.test(src[start + 1] ?? ''))) start--;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const char = src[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '>' && depth === 0 && src[i - 1] !== '=') return src.slice(start, i);
  }
  return '';
};

/** Every `aria-label="Close…"` control, with the className of its own element. */
const closeButtons = (): CloseButton[] => {
  const found: CloseButton[] = [];
  for (const file of walk('components')) {
    const src = withoutComments(readFileSync(file, 'utf8'));
    for (const match of src.matchAll(/aria-label="Close[^"]*"/g)) {
      const tag = openingTagAround(src, match.index);
      const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
      found.push({ file, className: (cls?.[1] ?? cls?.[2] ?? '').replace(/\s+/g, ' ').trim() });
    }
  }
  return found;
};

const zIndexOf = (className: string): number | null => {
  const match = /\bz-(\d+)\b/.exec(className);
  return match ? Number(match[1]) : null;
};

describe('modal close buttons can actually be clicked', () => {
  const buttons = closeButtons();

  it('finds the close buttons to check', () => {
    // A guard on the guard: if the scan silently matched nothing, every
    // assertion below would pass while checking no code at all.
    expect(buttons.length).toBeGreaterThan(20);
    expect(buttons.every((b) => b.className.length > 0)).toBe(true);
  });

  it('gives every absolutely positioned one a stacking order that beats a z-10 wrapper', () => {
    const offenders = buttons
      .filter((b) => /\babsolute\b|\bfixed\b/.test(b.className))
      .filter((b) => (zIndexOf(b.className) ?? 0) < MIN_Z)
      .map((b) => `${b.file} (z-index: ${zIndexOf(b.className) ?? 'none'})`);

    expect(
      offenders,
      `A close button positioned over its header needs z-${MIN_Z} or higher, or its header's ` +
        `own "relative z-10" content wrapper will paint over it and swallow every click:\n  ` +
        offenders.join('\n  ')
    ).toEqual([]);
  });
});
