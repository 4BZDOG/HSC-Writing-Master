import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Editor from '../../components/Editor';
import { PromptVerb } from '../../types';

/**
 * A response is only worth marking if the student wrote it, so the writing
 * surface refuses pasted and dragged-in text — and says why, rather than
 * leaving a student to wonder why ⌘V did nothing.
 *
 * Curators keep paste: moving sample answers and test material through this
 * surface is part of curating content.
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
      placeholder="Draft your Describe response here..."
      {...props}
    />
  );

const surface = () => screen.getByPlaceholderText(/draft your/i);

/** `fireEvent.paste` needs a clipboard payload to be a realistic paste. */
const paste = (el: Element, text = 'a borrowed paragraph') =>
  fireEvent.paste(el, { clipboardData: { getData: () => text, types: ['text/plain'] } });

describe('paste into the writing surface', () => {
  it('is refused for a student, with an explanation', () => {
    renderEditor({ blockPaste: true });

    const event = paste(surface());

    // `false` from fireEvent means a handler called preventDefault — the
    // browser never inserts the text.
    expect(event).toBe(false);
    expect(screen.getByRole('status').textContent).toMatch(/own words/i);
  });

  it('refuses dragged-in text too — the same gesture, a different hand', () => {
    renderEditor({ blockPaste: true });

    const event = fireEvent.drop(surface(), {
      dataTransfer: { getData: () => 'a borrowed paragraph', types: ['text/plain'] },
    });

    expect(event).toBe(false);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('can be dismissed once read', () => {
    renderEditor({ blockPaste: true });
    paste(surface());

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves a curator alone — no refusal, no notice', () => {
    renderEditor({ blockPaste: false });

    const event = paste(surface());

    expect(event).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('defaults to allowing paste, so nothing else is silently affected', () => {
    renderEditor();

    expect(paste(surface())).toBe(true);
  });
});
