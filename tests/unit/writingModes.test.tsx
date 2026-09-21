import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import Editor from '../../components/Editor';
import { getCommandTermInfo } from '../../data/commandTerms';

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

  it('Exam Mode hides the writing strategy tip', () => {
    const { container } = render(
      <Editor
        value={answer}
        onChange={() => {}}
        verb="DESCRIBE"
        writingMode="exam"
      />
    );
    expect(container.textContent).not.toContain(getCommandTermInfo('DESCRIBE').definition);
    expect(container.textContent).not.toContain('How to answer');
  });

  it('Coach Mode shows the command verb and what it wants', () => {
    const { container } = render(
      <Editor value={answer} onChange={() => {}} verb="DESCRIBE" writingMode="coach" />
    );
    // The row read "DESCRIBE strategy" and nothing else while the meaning was
    // carried by a brief drawn on the blank writing surface. It states the
    // term and its definition now, and it stays on screen mid-draft — which is
    // the state this test renders.
    expect(container.textContent).toContain('DESCRIBE');
    expect(container.textContent).toContain(getCommandTermInfo('DESCRIBE').definition);
  });

  it('Exam Mode hides the band progress bar in the header', () => {
    const { container } = render(
      <Editor
        value={answer}
        onChange={() => {}}
        maxBand={4}
        progress={0.5}
        writingMode="exam"
      />
    );
    expect(container.textContent).not.toContain('Band 4');
    expect(container.textContent).not.toContain('50%');
  });

  it('Exam Mode uses a neutral header without band-coloured glow', () => {
    const { container } = render(
      <Editor
        value={answer}
        onChange={() => {}}
        maxBand={6}
        progress={0.9}
        writingMode="exam"
      />
    );
    const header = container.querySelector('[class*="rounded-t"]');
    expect(header).toBeTruthy();
    const style = header?.getAttribute('style') || '';
    expect(style).toContain('#334155');
    expect(style).not.toContain('#a855f7');
  });

  it('Exam Mode still renders the placeholder with exam language', () => {
    const { container } = render(
      <Editor
        value=""
        onChange={() => {}}
        writingMode="exam"
        placeholder="Draft your response..."
      />
    );
    const textarea = container.querySelector('textarea');
    expect(textarea?.getAttribute('placeholder')).toContain('clock is running');
  });

  it('Exam Mode offers no formatting at all — not even the disclosure', () => {
    const { queryByLabelText } = render(
      <Editor
        value={answer}
        onChange={() => {}}
        writingMode="exam"
        onWritingModeChange={() => {}}
      />
    );
    expect(queryByLabelText(/formatting/i)).toBeNull();
    expect(queryByLabelText('Bold')).toBeNull();
    expect(queryByLabelText('Italic')).toBeNull();
  });

  // Coach Mode still offers bold and italic, but behind a disclosure — they are
  // pressed once a session at most in a prose answer, and were taking room in
  // the toolbar from the controls a student does use.
  it('Coach Mode offers bold/italic behind the formatting toggle', () => {
    const { getByLabelText, queryByLabelText } = render(
      <Editor
        value={answer}
        onChange={() => {}}
        writingMode="coach"
        onWritingModeChange={() => {}}
      />
    );
    expect(queryByLabelText('Bold')).toBeNull();

    fireEvent.click(getByLabelText(/formatting/i));
    expect(getByLabelText('Bold')).toBeTruthy();
    expect(getByLabelText('Italic')).toBeTruthy();
  });
});
