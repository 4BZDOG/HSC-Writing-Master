import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import Editor from '../../components/Editor';

/**
 * The student writing area has two experiences:
 *  - Coach Mode: live keyword/verb highlighting is painted over the textarea.
 *  - Exam Mode: HSC exam simulation — no highlighting, no band "phase" cue.
 *
 * These lock in that Exam Mode strips the assistance the overlay provides, so a
 * regression can't quietly re-enable coaching during a simulated exam.
 */
afterEach(cleanup);

const answer = 'The cell divides and the cell grows during mitosis.';

describe('Editor writing modes', () => {
  it('Coach Mode highlights keywords in the overlay', () => {
    const { container } = render(
      <Editor value={answer} onChange={() => {}} keywords={['cell']} writingMode="coach" />
    );
    // Two "cell" occurrences → two emerald highlight spans in the overlay.
    expect(container.querySelectorAll('span.text-emerald-400').length).toBe(2);
    // Coach shows the target-band chip (default maxBand 6), not the exam badge.
    expect(container.textContent).toContain('Band 6');
    expect(container.textContent).not.toContain('No assistance');
  });

  it('Exam Mode paints no keyword highlights and shows the exam badge', () => {
    const { container } = render(
      <Editor value={answer} onChange={() => {}} keywords={['cell']} writingMode="exam" />
    );
    expect(container.querySelectorAll('span.text-emerald-400').length).toBe(0);
    expect(container.textContent).toContain('Exam');
    expect(container.textContent?.toLowerCase()).toContain('no assistance');
    // The full answer text is still rendered (plainly) in the overlay.
    expect(container.textContent).toContain(answer);
  });

  it('offers a mode toggle when a change handler is supplied', () => {
    const { getByTitle } = render(
      <Editor
        value=""
        onChange={() => {}}
        writingMode="coach"
        onWritingModeChange={() => {}}
      />
    );
    expect(getByTitle(/Coach Mode/i)).toBeTruthy();
    expect(getByTitle(/Exam Mode/i)).toBeTruthy();
  });
});
