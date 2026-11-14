import { describe, it, expect } from 'vitest';
import { FOCUS_SHORT, FOCUS_SHORT_CLASSES } from '../../utils/cardChrome';

/**
 * Every short-window Focus class must sit behind the one media query. A class
 * written without it would compact the full-height screens and phones too.
 */
describe('Focus Mode short-window classes', () => {
  it('gate on a 1280px-wide, 819px-or-shorter window', () => {
    expect(FOCUS_SHORT).toBe('[@media(min-width:1280px)_and_(max-height:819px)]');
  });

  it('start every class with that variant', () => {
    for (const [name, value] of Object.entries(FOCUS_SHORT_CLASSES)) {
      const tokens = value.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        expect(token.startsWith(`${FOCUS_SHORT}:`), `${name}: ${token}`).toBe(true);
      }
    }
  });
});
