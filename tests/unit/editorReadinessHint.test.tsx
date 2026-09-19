import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import ReadinessMeter from '../../components/ReadinessMeter';
import type { ReadinessResult } from '../../utils/draftReadiness';
import { PromptVerb } from '../../types';

/**
 * The writing card's live draft-readiness accents (Surface B). The tier hue is
 * the question's fixed identity; readiness is layered on only as a header
 * progress bar (given an accessible name), a soft glow and a caret tint —
 * never a band name, and never under exam conditions or on a blank page.
 *
 * The completeness WORD is not one of them, and that is the point of the last
 * two tests here. The editor used to append it to the target-band pill as
 * `Band 5 Target · Excellent · Coming along`, while the `ReadinessMeter` in
 * the same footer row carried it again beside the bar and percentage it
 * belongs to. Reported from use: the same two words twice, a few inches apart,
 * once hanging off a statement about the QUESTION and once attached to the
 * meter measuring the DRAFT.
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
  it('names the header progress bar and reflects the progress value', () => {
    renderEditor({ readiness: readyish, progress: 0.62 });

    const bar = screen.getByRole('progressbar', { name: /draft readiness/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
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
    expect(screen.queryByRole('progressbar', { name: /draft readiness/i })).toBeNull();
    expect(screen.getByText(/Exam Conditions/)).toBeTruthy();
  });
});
