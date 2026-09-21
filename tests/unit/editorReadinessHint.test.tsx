import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import ReadinessMeter from '../../components/ReadinessMeter';
import type { ReadinessResult } from '../../utils/draftReadiness';
import { PromptVerb } from '../../types';

/**
 * The writing card's live draft-readiness accents (Surface B). The tier hue is
 * the question's fixed identity; readiness is layered on as a soft glow and a
 * caret tint — never a band name, and never under exam conditions or on a
 * blank page.
 *
 * SAY IT ONCE. This card has now shed two copies of the same signal, in the
 * same shape both times:
 *
 *   - The completeness WORD. The editor appended it to the target-band pill as
 *     `Band 5 Target · Excellent · Coming along` while the `ReadinessMeter` in
 *     the same footer row carried it again beside the bar and percentage it
 *     belongs to — the same two words twice, a few inches apart, once hanging
 *     off a statement about the QUESTION and once attached to the meter
 *     measuring the DRAFT.
 *   - The PERCENTAGE and its bar. The header carried its own `role="progressbar"`
 *     fed by `progress={readiness.score / 100}` — the meter's own number,
 *     rendered a second time in the title block, white on the band gradient,
 *     with neither the completeness word nor the band hue that make it mean
 *     anything.
 *
 * Both times the meter's copy is the one that survives: it is the one with
 * something to explain, and it sits where the decision is made, beside
 * Evaluate. What is left in the header is the question's fixed goal.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

// A non-neutral readiness signal — completeness words, never a band name.
const readyish: ReadinessResult = {
  score: 62,
  level: 4,
  chromaLevel: 4,
  isNeutral: false,
  label: 'Getting there',
  subscores: { length: 0.7, structure: 0.6, keywords: 0.5, variety: 1 },
};

// The calm, off-palette level-0 state for an empty / barely-started draft.
const neutral: ReadinessResult = {
  score: 0,
  level: 0,
  chromaLevel: 0,
  isNeutral: true,
  label: 'Start writing',
  subscores: { length: 0, structure: 0, keywords: 0, variety: 0 },
};

const renderEditor = (props: Partial<React.ComponentProps<typeof Editor>> = {}) =>
  render(
    <Editor
      value="Some drafted words."
      onChange={vi.fn()}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      {...props}
    />
  );

describe('editor readiness hint (Surface B)', () => {
  it('draws no progress bar of its own — the meter is the card\'s only one', () => {
    renderEditor({ readiness: readyish, progress: 0.62 });

    // The header's bar restated `readiness.score` without the word or the hue.
    // The editor alone is now silent about it; the card's single meter arrives
    // through `footerAction`, which the test below assembles.
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('keeps the question\'s fixed goal in the header, which is not the draft', () => {
    renderEditor({ readiness: readyish, progress: 0.62 });

    // "Band 2" as the target is identity — what this card is FOR — and stays.
    // A percentage is telemetry about the draft, and belongs with the meter.
    expect(screen.getByText(/^Band \d$/)).toBeTruthy();
    expect(screen.queryByText(/62%/)).toBeNull();
  });

  it('leaves the completeness word to the meter, and keeps the goal pill', () => {
    renderEditor({ readiness: readyish, progress: 0.62 });

    expect(screen.queryByText(/Getting there/)).toBeNull();
    // The question's fixed goal pill is what this row was always for, and is
    // untouched.
    expect(screen.getByText(/Band \d Target/)).toBeTruthy();
  });

  /**
   * The composition the app actually renders: `WorkspaceRightPanel` hands the
   * editor a `footerAction` holding the meter, so both copies lived in one row.
   * Asserting the editor alone is silent proves half of it; this proves the
   * half that was visible.
   */
  it('says it exactly once in the footer the workspace assembles', () => {
    renderEditor({
      readiness: readyish,
      progress: 0.62,
      footerAction: <ReadinessMeter readiness={readyish} />,
    });

    expect(screen.getAllByText('Getting there')).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: /Getting there/ })).toBeTruthy();
  });

  it('shows no readiness word for a neutral (empty) draft', () => {
    renderEditor({ readiness: neutral, value: '', progress: 0 });

    expect(screen.queryByText(/Start writing/)).toBeNull();
  });

  it('stays fully neutral in exam mode — no readiness word, no progress bar', () => {
    renderEditor({ readiness: readyish, writingMode: 'exam', progress: 0.62 });

    expect(screen.queryByText(/Getting there/)).toBeNull();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.getByText(/Exam Conditions/)).toBeTruthy();
  });
});
