import { describe, it, expect } from 'vitest';
import config from '../../tailwind.config.js';

/**
 * A toast must be seen over every dialog it can be raised from.
 *
 * The toast was 1250, and the improvement review 1300, so a notice raised while
 * the review was open (an export that failed, an Undo) was painted under a
 * full-screen dialog and never seen. The toast is portalled to <body> beside the
 * modals, so the z-index scale is the whole decision.
 *
 * The one layer above it is `critical` (2200): the confirm, rename and flag
 * dialogs decide something, and a toast must not sit over their buttons.
 */

const z = (name: string): number => {
  const value = (config.theme?.extend?.zIndex as Record<string, string> | undefined)?.[name];
  if (value === undefined) throw new Error(`tailwind.config.js has no z-${name}`);
  return Number(value);
};

describe('toast stacking', () => {
  it('sits above the improvement review, the full-screen dialog it was buried under', () => {
    expect(z('toast')).toBeGreaterThan(z('improvement'));
  });

  it.each([
    'modal',
    'popover',
    'modal-elevated',
    'upgrade',
    'quickstart',
    'legal',
    'agreement',
    'recalibrate',
  ])('sits above the %s tier', (tier) => {
    expect(z('toast')).toBeGreaterThan(z(tier));
  });

  it('stays below the confirm, rename and flag dialogs, which decide something', () => {
    expect(z('toast')).toBeLessThan(z('critical'));
  });
});
