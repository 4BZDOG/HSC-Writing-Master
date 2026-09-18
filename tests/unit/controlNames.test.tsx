import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import type { PromptVerb } from '../../types';

/**
 * A control is named by what you call it, not by what it does for you.
 *
 * Several of the workspace's controls collapse their visible label at a
 * breakpoint — `<span className="hidden 2xl:inline">Coach</span>` — leaving an
 * icon and a `title`. Below that breakpoint the accessible name falls back to
 * the title, and a screen reader announced the writing-mode toggle as "Coach
 * Mode — live highlighting, draft checks and exemplars, button".
 *
 * That is not only long. A name that swallows a sentence collides with
 * everything else on the page: while building the draft-check panel, a
 * Playwright locator for a button named /Draft check/ matched the COACH
 * toggle, because the words "draft checks" sit inside its tooltip. The
 * question flag chip was worse again — its title interpolates the flag reason,
 * so whatever a curator typed became the name of the control.
 *
 * jsdom applies no media queries, so the labels are "visible" here and the
 * fallback never fires. This asserts the explicit name instead, which is the
 * thing that has to exist for the collapsed case to be correct.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

/** Long enough to be a description rather than a name. */
const NAME_CEILING = 40;

describe('controls whose label collapses at a breakpoint', () => {
  it('names the writing-mode toggles, rather than describing them', () => {
    render(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        onWritingModeChange={vi.fn()}
      />
    );

    const coach = screen.getByRole('button', { name: 'Coach mode' });
    const exam = screen.getByRole('button', { name: 'Exam mode' });

    // The sentence still exists — as the description, which is what it is.
    expect(coach.getAttribute('title')).toMatch(/live highlighting/i);
    expect(exam.getAttribute('title')).toMatch(/exam simulation/i);

    for (const control of [coach, exam]) {
      expect(control.getAttribute('aria-label')!.length).toBeLessThanOrEqual(NAME_CEILING);
    }
  });

  // The regression that started this: "draft checks" inside the coach tooltip
  // made that button answer to the draft-check panel's name.
  it('does not let the coach toggle answer to the panel below it', () => {
    render(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        onWritingModeChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /draft check/i })).toBeNull();
  });
});
