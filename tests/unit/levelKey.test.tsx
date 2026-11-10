import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import LevelKey from '../../components/feedback/LevelKey';
import { reportLevels } from '../../utils/reportLevels';
import { getBandRgb } from '../../utils/renderUtils';

afterEach(cleanup);

const prompt = { totalMarks: 8, verb: 'ANALYSE' as const } as const;

const renderKey = (
  overallMark: number,
  rewrite?: Parameters<typeof reportLevels>[2],
  countingMark?: number
) => {
  const levels = reportLevels(prompt, overallMark, rewrite);
  return render(
    <LevelKey
      you={levels.you}
      next={levels.next}
      top={levels.top}
      total={prompt.totalMarks}
      countingMark={countingMark}
    />
  );
};

describe('LevelKey', () => {
  it('draws three tiles, YOU, IMPROVED and TOP, joined by an arrow and a dotted connector', () => {
    const { container } = renderKey(2, { revised: { text: 'Better', mark: 3, keyChanges: [] } });
    const group = screen.getByRole('group');
    expect(within(group).getByText('You')).toBeTruthy();
    expect(within(group).getByText('Improved')).toBeTruthy();
    expect(within(group).getByText('Top')).toBeTruthy();
    expect(within(group).getByText('2')).toBeTruthy();
    expect(within(group).getByText('3')).toBeTruthy();
    expect(within(group).getByText('8')).toBeTruthy();
    // The dotted connector is the one decorative span with a dotted top border.
    expect(container.querySelector('.border-dotted')).toBeTruthy();
    expect(container.querySelector('svg.lucide-trophy')).toBeNull();
  });

  it('puts the Improved figure in its own band, one step stronger, and marks it for the replay', () => {
    renderKey(2, { revised: { text: 'Better', mark: 3, keyChanges: [] } });
    const improved = document.querySelector('[data-mark-figure="target"]') as HTMLElement;
    expect(improved.textContent).toBe('3');
    expect(improved.className).toContain('bg-white/25');
    expect(improved.className).toContain('font-black');
    expect(improved.style.getPropertyValue('--band-rgb')).toBe(
      getBandRgb(
        reportLevels(prompt, 2, { revised: { text: 'x', mark: 3, keyChanges: [] } }).next!.band
      )
    );
  });

  it('counts the Improved figure with countingMark, and leaves the band alone', () => {
    renderKey(2, { revised: { text: 'Better', mark: 3, keyChanges: [] } }, 2);
    const improved = document.querySelector('[data-mark-figure="target"]') as HTMLElement;
    expect(improved.textContent).toBe('2');
  });

  it('captions the middle tile NEXT when there is no rewrite to show, and says so in the sentence', () => {
    renderKey(3);
    const group = screen.getByRole('group');
    expect(within(group).getByText('Next')).toBeTruthy();
    expect(within(group).queryByText('Improved')).toBeNull();
    expect(
      screen.getByRole('group', {
        name: /You scored 3 out of 8, Band \d\. The next level reaches \d out of 8, Band \d\. The top of this question is 8 out of 8, Band \d\./,
      })
    ).toBeTruthy();
  });

  it('shows two tiles when the improvement reaches the total, the second reading "Band N · top"', () => {
    const { container } = renderKey(7, { revised: { text: 'Full', mark: 8, keyChanges: [] } });
    const group = screen.getByRole('group');
    expect(within(group).getByText('Improved')).toBeTruthy();
    expect(within(group).queryByText('Top')).toBeNull();
    expect(within(group).getByText(/Band \d · top/)).toBeTruthy();
    expect(container.querySelector('.border-dotted')).toBeNull();
    expect(
      screen.getByRole('group', {
        name: /You scored 7 out of 8, Band \d\. The improved response reaches 8 out of 8, Band \d, the top of this question\./,
      })
    ).toBeTruthy();
  });

  it('shows one YOU tile with a trophy at full marks, reading "Band N · top"', () => {
    const { container } = renderKey(8);
    const group = screen.getByRole('group');
    expect(within(group).getByText('You')).toBeTruthy();
    expect(within(group).queryByText('Improved')).toBeNull();
    expect(within(group).queryByText('Top')).toBeNull();
    expect(within(group).getByText(/Band \d · top/)).toBeTruthy();
    expect(container.querySelector('svg.lucide-trophy')).toBeTruthy();
    expect(
      screen.getByRole('group', {
        name: /You scored 8 out of 8, Band \d\. That is the top of this question\./,
      })
    ).toBeTruthy();
  });
});
