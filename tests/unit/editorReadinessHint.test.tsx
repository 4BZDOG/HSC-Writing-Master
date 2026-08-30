import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import type { ReadinessResult } from '../../utils/draftReadiness';
import { PromptVerb } from '../../types';

/**
 * The writing card's live draft-readiness accents (Surface B). The tier hue is
 * the question's fixed identity; readiness is layered on only as a header
 * progress bar (given an accessible name), a soft glow, a caret tint and a
 * muted footer completeness word — never a band name, and never under exam
 * conditions or on a blank page.
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

  it('shows the readiness completeness word in the footer when non-neutral', () => {
    renderEditor({ readiness: readyish, progress: 0.62 });

    expect(screen.getByText(/Getting there/)).toBeTruthy();
    // The question's fixed goal pill is untouched and still present.
    expect(screen.getByText(/Band \d Target/)).toBeTruthy();
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
