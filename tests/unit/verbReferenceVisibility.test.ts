import { describe, it, expect } from 'vitest';
import { showsVerbReference } from '../../utils/verbReferenceVisibility';

/**
 * The command verb reference is assistance. It is on screen in Coach Mode and off
 * in Exam Mode, and Focus Mode hides it as it always has. App renders the bar
 * from this rule, and no test renders App.
 */
describe('showsVerbReference', () => {
  it('is on screen in Coach Mode', () => {
    expect(showsVerbReference('coach', false)).toBe(true);
  });

  it('is off screen in Exam Mode', () => {
    expect(showsVerbReference('exam', false)).toBe(false);
  });

  it('is off screen in Focus Mode', () => {
    expect(showsVerbReference('coach', true)).toBe(false);
  });
});
