import { expect, type Locator } from '@playwright/test';

/**
 * Paint order, checked without a screenshot.
 *
 * An element can be present, visible and in the accessibility tree while
 * something painted over it hides it. That is how the parent dashboard shipped
 * blank: its `<main>` sat beneath the app's animated background, so every check
 * that asked "is it there?" passed. This asks the browser what is actually on
 * top at the middle of the target, and only the target or something inside it
 * may answer.
 *
 * The decorative layers are `pointer-events: none`, and hit testing skips them,
 * so a plain `elementFromPoint` would look straight through a full-screen
 * background to the content beneath it: the very case this exists to catch. So
 * for one synchronous read every element is made hit-testable, which asks the
 * question the reader's eye answers. The style is added and removed inside the
 * same task, so nothing is painted differently.
 *
 * The target is scrolled into view first. Where it is taller than the screen,
 * the middle of the part that is on screen is tested.
 *
 * A decorative overlay that is meant to sit over content will be reported too.
 * That is intended: a layer painted over text changes what the reader sees.
 */
export const expectOnTop = async (target: Locator): Promise<void> => {
  await target.scrollIntoViewIfNeeded();
  const verdict = await target.evaluate((el) => {
    const describe = (node: Element): string => {
      const cls = typeof node.className === 'string' ? node.className : '';
      const shortCls = cls.trim().split(/\s+/).slice(0, 3).join('.');
      const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `<${node.tagName.toLowerCase()}${shortCls ? ` class="${shortCls}"` : ''}>${text ? ` "${text}"` : ''}`;
    };

    const probe = document.createElement('style');
    probe.textContent = '* { pointer-events: auto !important; }';
    document.head.appendChild(probe);
    try {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, 0);
      const top = Math.max(r.top, 0);
      const right = Math.min(r.right, window.innerWidth);
      const bottom = Math.min(r.bottom, window.innerHeight);
      if (right <= left || bottom <= top) {
        return { onTop: false, hit: 'nothing: the element is not on the screen' };
      }
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (!hit) return { onTop: false, hit: 'nothing at its centre point' };
      return { onTop: el === hit || el.contains(hit), hit: describe(hit) };
    } finally {
      probe.remove();
    }
  });
  expect(verdict.onTop, `${target} is painted over at its centre by ${verdict.hit}`).toBe(true);
};
