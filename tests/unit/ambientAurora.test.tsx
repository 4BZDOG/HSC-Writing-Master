import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import AmbientAurora from '../../components/AmbientAurora';

/**
 * The background aurora.
 *
 * It was four circles on one 10-second keyframe, two seconds apart — a single
 * visible loop — each under an 80px `filter: blur`, which at these sizes is
 * rasterised in tiles that showed as hard vertical seams. These pin the two
 * decisions that fixed it.
 */

afterEach(cleanup);

const orbs = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[style*="aurora-drift"]'));

describe('AmbientAurora', () => {
  it('gives no two orbs in a layer the same clock, so the sky has no beat', () => {
    const { container } = render(<AmbientAurora />);
    const layer = container.querySelector('.aurora > div')!;
    const durations = Array.from(layer.children).map(
      (el) => (el as HTMLElement).style.animation.match(/(\d+)s/)![1]
    );
    expect(durations.length).toBeGreaterThanOrEqual(4);
    expect(new Set(durations).size).toBe(durations.length);
  });

  it('starts each orb part-way through its drift, not every orb at rest', () => {
    const { container } = render(<AmbientAurora />);
    for (const orb of orbs(container)) {
      expect(orb.style.animationDelay).toMatch(/^-/);
    }
  });

  it('paints soft orbs with gradients, not a blur filter', () => {
    const { container } = render(<AmbientAurora variant="auth" />);
    for (const orb of orbs(container)) {
      expect(orb.className).not.toMatch(/blur-/);
      expect(orb.style.backgroundImage).toContain('radial-gradient');
    }
  });
});
