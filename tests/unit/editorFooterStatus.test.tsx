import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import ReadinessMeter from '../../components/ReadinessMeter';
import type { ReadinessResult } from '../../utils/draftReadiness';
import { PromptVerb } from '../../types';
import { publishExamClock } from '../../utils/examClockStore';

/**
 * The writing card's footer, as one row of three groups:
 *
 *   status (words, saved)  |  readiness (grows)  |  markings chip, Evaluate
 *
 * What these pin: the save claim is never "Saved" once storage has failed; the
 * band is stated once in the card; the completeness word appears once and at
 * every width; and the groups fall in reading order.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

const readyish: ReadinessResult = {
  score: 60,
  percent: 62,
  level: 4,
  chromaLevel: 4,
  isNeutral: false,
  label: 'Getting there',
  subscores: { length: 0.7, structure: 0.6, keywords: 0.5, variety: 1 },
};

const baseProps = {
  onChange: vi.fn(),
  verb: 'DESCRIBE' as PromptVerb,
  writingMode: 'coach' as const,
  maxBand: 2,
};

describe('the save claim in the footer', () => {
  it('says "Not saved", never "Saved", once the storage layer has failed', () => {
    render(<Editor {...baseProps} value="Some drafted words." draftSaved draftSaveFailed />);

    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Not saved')).toBeTruthy();
    // The same wording as the header's storage badge, for a screen reader too.
    expect(
      screen.getByRole('status', { name: 'Your draft is not saving on this device' })
    ).toBeTruthy();
  });

  it('still says "Not saved" while the write is pending, when storage has failed', () => {
    render(<Editor {...baseProps} value="Some words." draftSaved={false} draftSaveFailed />);

    expect(screen.queryByText('Saving')).toBeNull();
    expect(screen.getByText('Not saved')).toBeTruthy();
  });

  it('says "Saved" when the draft is stored and storage is healthy', () => {
    render(
      <Editor {...baseProps} value="Some drafted words." draftSaved draftSaveFailed={false} />
    );

    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('shows no save state for an empty draft, failed or not', () => {
    render(<Editor {...baseProps} value="" draftSaved={false} draftSaveFailed />);

    expect(screen.queryByText('Not saved')).toBeNull();
    expect(screen.queryByText('Saving')).toBeNull();
  });
});

describe('the footer says each figure once', () => {
  it('no longer repeats the band as "Band N target" in Coach Mode', () => {
    render(<Editor {...baseProps} value="A draft." readiness={readyish} />);

    expect(screen.queryByText(/Band \d target/i)).toBeNull();
    // The header chip is the one place the band is stated.
    expect(screen.getAllByText(/^Band \d$/)).toHaveLength(1);
  });

  // Was: 'keeps "Exam conditions" in the footer in Exam Mode'. The footer now shows the
  // exam clock in that place (the placard, header chip and timer row still say "Exam
  // conditions"), so the footer must not repeat the phrase and must show the clock.
  it('shows the exam clock in the footer in Exam Mode, and not "Exam conditions"', () => {
    publishExamClock({ text: '05:07', caption: 'left of 6 min', over: false });
    try {
      render(<Editor {...baseProps} writingMode="exam" value="A draft." />);

      expect(screen.queryByText('Exam conditions')).toBeNull();
      expect(screen.getByText('05:07')).toBeTruthy();
      expect(screen.getByText('left of 6 min')).toBeTruthy();
    } finally {
      publishExamClock(null);
    }
  });

  it('shows no exam clock in the footer in Coach Mode', () => {
    publishExamClock({ text: '05:07', caption: 'left of 6 min', over: false });
    try {
      render(<Editor {...baseProps} value="A draft." />);

      expect(screen.queryByText('05:07')).toBeNull();
    } finally {
      publishExamClock(null);
    }
  });
});

describe('the status group reads as the words and the saved state', () => {
  it('writes "words" in lower case', () => {
    render(<Editor {...baseProps} value="Two words" />);

    expect(screen.getByText('2 words')).toBeTruthy();
    expect(screen.queryByText(/Words/)).toBeNull();
  });

  it('is singular at one word', () => {
    render(<Editor {...baseProps} value="One" />);

    expect(screen.getByText('1 word')).toBeTruthy();
  });
});

describe('the readiness word', () => {
  it('appears exactly once, and is not hidden at any width', () => {
    render(
      <Editor
        {...baseProps}
        value="A draft with several words in it."
        readiness={readyish}
        footerProgress={<ReadinessMeter readiness={readyish} />}
      />
    );

    const word = screen.getAllByText('Getting there');
    expect(word).toHaveLength(1);
    // The label used to be hidden between 1280 and 1535px; no breakpoint class
    // may hide it now.
    expect(word[0].className).not.toMatch(/\bhidden\b|xl:hidden|2xl:inline/);
  });
});

describe('the footer order and gaps', () => {
  it('lays out status, then readiness, then the chip and Evaluate, in reading order', () => {
    render(
      <Editor
        {...baseProps}
        value="A draft."
        readiness={readyish}
        footerCounter={<span>Markings chip</span>}
        footerProgress={<ReadinessMeter readiness={readyish} />}
        footerAction={<button type="button">Evaluate</button>}
      />
    );

    const words = screen.getByText('2 words');
    const chip = screen.getByText('Markings chip');
    const readiness = screen.getByText('Getting there');
    const evaluate = screen.getByRole('button', { name: 'Evaluate' });

    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(words, chip)).toBe(true);
    expect(follows(chip, readiness)).toBe(true);
    expect(follows(readiness, evaluate)).toBe(true);
  });

  it('uses one gap scale: 12px inside a group, 16px between groups, 8px between wrapped rows', () => {
    render(<Editor {...baseProps} value="A draft." />);

    // The footer's own row, found from the words in it (the header has a row too).
    const footerRow = screen.getByText('2 words').closest('[class*="lg:flex-nowrap"]');
    expect(footerRow?.className).toContain('gap-x-4');
    expect(footerRow?.className).toContain('gap-y-2');
    // The status group: the words and the saved state, 12px apart.
    const status = screen.getByText('2 words').parentElement;
    expect(status?.className).toContain('gap-x-3');
  });
});
