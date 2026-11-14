import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import Editor from '../../components/Editor';
import { PromptVerb } from '../../types';

/**
 * Keyboard and clipboard behaviour of the writing surface.
 *
 * - Plain Tab writes two spaces; Shift+Tab is never taken, so a keyboard user can
 *   always leave the writing area (WCAG 2.1.2). The textarea says so, through a
 *   visually-hidden hint it points at.
 * - The textarea has a name of its own. Its placeholder is painted transparent and
 *   is not a name for assistive technology.
 * - Copy says when it failed, and its timer is cleared with the card.
 * - Ctrl + Enter on an empty draft submits nothing.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const surface = () => document.querySelector('textarea') as HTMLTextAreaElement;

describe('Tab in the writing surface', () => {
  it('writes two spaces for a plain Tab', () => {
    const onChange = vi.fn();
    render(
      <Editor value="" onChange={onChange} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );

    const notCancelled = fireEvent.keyDown(surface(), { key: 'Tab' });

    expect(notCancelled).toBe(false); // the default (focus move) was prevented
    expect(onChange).toHaveBeenLastCalledWith('  ');
  });

  it('never takes Shift+Tab, so focus can move back out of the writing area', () => {
    const onChange = vi.fn();
    render(
      <Editor value="" onChange={onChange} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );

    const notCancelled = fireEvent.keyDown(surface(), { key: 'Tab', shiftKey: true });

    expect(notCancelled).toBe(true); // not prevented: the browser moves focus
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the textarea has a name and a hint', () => {
  it.each(['coach', 'exam'] as const)('is named "Your response" in %s mode', (writingMode) => {
    render(<Editor value="" onChange={vi.fn()} writingMode={writingMode} />);

    expect(screen.getByRole('textbox', { name: 'Your response' })).toBe(surface());
  });

  it('is described by the Tab hint, which says how to leave', () => {
    render(<Editor value="" onChange={vi.fn()} writingMode="coach" />);

    const describedBy = surface().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint?.textContent).toBe(
      'Tab inserts spaces. Press Shift+Tab to leave the writing area.'
    );
    // Visually hidden, not hidden from assistive technology.
    expect(hint?.className).toContain('sr-only');
    expect(hint?.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('Ctrl + Enter on an empty draft', () => {
  it('submits nothing', () => {
    const onEvaluate = vi.fn();
    const onSave = vi.fn();
    render(
      <Editor
        value="   "
        onChange={vi.fn()}
        onEvaluate={onEvaluate}
        onSave={onSave}
        writingMode="coach"
      />
    );

    fireEvent.keyDown(surface(), { key: 'Enter', ctrlKey: true });

    expect(onEvaluate).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits a written draft, as before', () => {
    const onEvaluate = vi.fn();
    render(
      <Editor value="Written." onChange={vi.fn()} onEvaluate={onEvaluate} writingMode="coach" />
    );

    fireEvent.keyDown(surface(), { key: 'Enter', ctrlKey: true });

    expect(onEvaluate).toHaveBeenCalledTimes(1);
  });
});

describe('Copy', () => {
  const copyButton = () => screen.getByRole('button', { name: /^Copy/ });

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('says "Copy failed" when the clipboard refuses, and does not throw', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
      configurable: true,
    });
    render(<Editor value="Words to copy" onChange={vi.fn()} writingMode="coach" />);

    fireEvent.click(copyButton());

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeTruthy();
  });

  it('copies the draft when the clipboard accepts it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<Editor value="Words to copy" onChange={vi.fn()} writingMode="coach" />);

    fireEvent.click(copyButton());

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Words to copy'));
    expect(screen.queryByRole('button', { name: 'Copy failed' })).toBeNull();
  });

  it('clears its feedback timer when the card unmounts', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    vi.useFakeTimers();
    const { unmount } = render(<Editor value="Words" onChange={vi.fn()} writingMode="coach" />);
    const before = vi.getTimerCount();

    fireEvent.click(copyButton());
    await act(async () => {
      await Promise.resolve();
    });
    // The two-second reset is now pending.
    expect(vi.getTimerCount()).toBe(before + 1);

    unmount();

    expect(vi.getTimerCount()).toBe(before);
  });
});
