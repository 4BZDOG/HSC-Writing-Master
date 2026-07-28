import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Editor from '../../components/Editor';
import { getCommandTermInfo } from '../../data/commandTerms';
import { parseStrategyTip } from '../../utils/strategyTip';
import { PromptVerb } from '../../types';

/**
 * The writing card's chrome. Two things it has to get right: the controls a
 * student reaches for are not crowded out by ones they never touch (bold and
 * italic in a prose exam answer), and the command-verb strategy — the coaching
 * that matters most before the first sentence — is visible enough to be worth
 * opening.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

const renderEditor = (props: Partial<React.ComponentProps<typeof Editor>> = {}) =>
  render(
    <Editor
      value=""
      onChange={vi.fn()}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      {...props}
    />
  );

const formatToggle = () => screen.getByRole('button', { name: /formatting/i });

describe('editor formatting tools', () => {
  it('keeps bold and italic folded away until asked for', () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Italic' })).toBeNull();
    expect(formatToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals them on the toggle, and folds them away again', () => {
    renderEditor();

    fireEvent.click(formatToggle());
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /hide formatting/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /hide formatting/i }));
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('offers no formatting at all in Exam Mode', () => {
    renderEditor({ writingMode: 'exam' });

    expect(screen.queryByRole('button', { name: /formatting/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });
});

describe('writing strategy panel', () => {
  const firstTip = (verb: string) => {
    const segment = parseStrategyTip(getCommandTermInfo(verb as PromptVerb).tip).find(
      (s) => s.kind === 'point'
    );
    return segment && segment.kind === 'point' ? segment.text : '';
  };

  const strategyToggle = () => screen.getByRole('button', { name: /strategy/i });

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
  });

  afterEach(() => vi.unstubAllGlobals());

  // Folded on arrival at every width, like every other panel in the
  // workspace. It used to open itself on a desktop and re-decide on each
  // resize — the one disclosure whose state the student did not own.
  it('starts folded, and opens to the verb definition and its tips', () => {
    renderEditor();

    expect(strategyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(getCommandTermInfo('DESCRIBE' as PromptVerb).definition)).toBeNull();

    fireEvent.click(strategyToggle());

    expect(strategyToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(getCommandTermInfo('DESCRIBE' as PromptVerb).definition)).toBeTruthy();
    expect(screen.getByText(firstTip('DESCRIBE'))).toBeTruthy();
  });

  // The whole point of the collapsed row: something to read, not a promise of
  // something to read.
  it('quotes the first tip while it is folded', () => {
    renderEditor();

    expect(strategyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(firstTip('DESCRIBE'))).toBeTruthy();
  });

  it('marks itself read once it has been opened and shut again', () => {
    renderEditor();

    expect(screen.queryByText(/^Read$/i)).toBeNull();
    fireEvent.click(strategyToggle());
    fireEvent.click(strategyToggle());
    expect(screen.getByText(/^Read$/i)).toBeTruthy();
  });

  it('quotes the tip for whichever verb the question uses', () => {
    renderEditor({ verb: 'EVALUATE' as PromptVerb });

    expect(screen.getByText(firstTip('EVALUATE'))).toBeTruthy();
    expect(screen.getByText(/EVALUATE Strategy/i)).toBeTruthy();
  });

  it('is absent in Exam Mode — the strategy is assistance', () => {
    renderEditor({ writingMode: 'exam' });
    expect(screen.queryByRole('button', { name: /strategy/i })).toBeNull();
  });
});
