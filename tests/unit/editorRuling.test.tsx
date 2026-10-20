import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import Editor from '../../components/Editor';
import { PromptVerb } from '../../types';

/**
 * The writing surface's ruling and its write-in invitation. The ruling is CSS
 * (index.css, `.editor-ruling`), so these tests pin what the component hands
 * the stylesheet: the class on the grid the rules are painted from, and the
 * reading size as a custom property the rules are computed from. They also pin
 * the invitation: it is on the first ruled line while the draft is empty, it is
 * gone the moment there is text, and the textarea still carries the same words
 * as its placeholder for assistive technology.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

afterEach(cleanup);

const PROMPT = 'Write your DESCRIBE response here, in your own words.';

const renderEditor = (props: Partial<React.ComponentProps<typeof Editor>> = {}) =>
  render(
    <Editor
      value=""
      onChange={vi.fn()}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      placeholder={PROMPT}
      {...props}
    />
  );

const ruledGrid = () => document.querySelector('.editor-ruling') as HTMLElement;
const hintWords = () => document.querySelector('.editor-hint-words');
const textarea = () => document.querySelector('textarea') as HTMLTextAreaElement;

describe('Editor writing surface ruling', () => {
  it('rules the grid the text sits in, and hands it the reading size', () => {
    renderEditor({ syncedFontSize: 18 });
    expect(ruledGrid()).toBeTruthy();
    // The grid holds the three text layers, so the ruling scrolls with them.
    expect(ruledGrid().contains(textarea())).toBe(true);
    expect(ruledGrid().style.getPropertyValue('--editor-fs')).toBe('18px');
  });

  it('follows the reading size, so a zoom re-rules the page', () => {
    const { rerender } = renderEditor({ syncedFontSize: 18 });
    rerender(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        placeholder={PROMPT}
        syncedFontSize={24}
      />
    );
    expect(ruledGrid().style.getPropertyValue('--editor-fs')).toBe('24px');
  });

  it('passes the Band 1 margin red to the stylesheet', () => {
    renderEditor();
    // The margin is painted from this value, so it must be a real colour and
    // not an empty custom property that would paint nothing.
    expect(ruledGrid().style.getPropertyValue('--editor-margin')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('Editor write-in invitation', () => {
  it('writes the invitation on the first ruled line while the draft is empty', () => {
    renderEditor();
    const words = hintWords();
    expect(words).toBeTruthy();
    expect(words?.textContent).toBe(PROMPT);
    // It sits in the highlights layer, which is hidden from assistive technology:
    // the textarea's placeholder attribute is what a screen reader announces.
    expect(words?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('keeps the same words as the textarea placeholder attribute', () => {
    renderEditor();
    expect(textarea().placeholder).toBe(PROMPT);
    // The native placeholder is painted transparent so it does not draw over
    // the handwritten line.
    expect(textarea().className).toContain('placeholder:text-transparent');
  });

  it('is removed as soon as there is any text', () => {
    const { rerender } = renderEditor();
    expect(hintWords()).toBeTruthy();
    rerender(
      <Editor
        value="C"
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        placeholder={PROMPT}
      />
    );
    expect(hintWords()).toBeNull();
    expect(ruledGrid().textContent).toContain('C');
  });

  it('is written again when the draft is cleared', () => {
    const { rerender } = renderEditor({ value: 'A draft' });
    expect(hintWords()).toBeNull();
    rerender(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        placeholder={PROMPT}
      />
    );
    // A freshly mounted element, so the CSS animation plays from its first frame.
    expect(hintWords()?.textContent).toBe(PROMPT);
  });

  it('gives Exam Mode its own line, written the same way', () => {
    renderEditor({ writingMode: 'exam', placeholder: PROMPT });
    expect(hintWords()?.textContent).toBe('Begin your response. The clock is running…');
  });

  it('draws the pen nib in the tier accent, and not as an interactive element', () => {
    const { container } = renderEditor();
    const nib = container.querySelector('.editor-hint-nib');
    expect(nib).toBeTruthy();
    expect(nib?.getAttribute('aria-hidden')).toBe('true');
    expect((nib as SVGElement | null)?.style.color).not.toBe('');
  });
});
