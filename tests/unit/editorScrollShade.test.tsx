import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import Editor from '../../components/Editor';
import { PromptVerb } from '../../types';

/**
 * The shade under the "How to answer" strip. A scrolled writing surface lets its
 * top line run up under the strip, and that line used to be cut flat. The shade
 * is a soft fade over the top of the surface, shown only once it has scrolled.
 */

afterEach(cleanup);

const longDraft = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of a long draft.`).join('\n');

const setup = (writingMode: 'coach' | 'exam' = 'coach') => {
  const view = render(
    <Editor
      value={longDraft}
      onChange={() => {}}
      verb={'DESCRIBE' as PromptVerb}
      writingMode={writingMode}
    />
  );
  const body = document
    .querySelector('textarea')!
    .closest('[class*="overflow-y-auto"]') as HTMLElement;
  const shade = document.querySelector('[data-scrolled]') as HTMLElement;
  return { ...view, body, shade };
};

const scrollTo = (body: HTMLElement, top: number) => {
  body.scrollTop = top;
  fireEvent.scroll(body);
};

describe('the shade under the strip', () => {
  it('is hidden while the writing surface is at the top', () => {
    const { shade } = setup();

    expect(shade.getAttribute('data-scrolled')).toBe('false');
    expect(shade.className).toContain('opacity-0');
    expect(shade.className).not.toContain('opacity-100');
  });

  it('appears once the surface is scrolled, and goes again at the top', () => {
    const { body, shade } = setup();

    scrollTo(body, 40);
    expect(shade.getAttribute('data-scrolled')).toBe('true');
    expect(shade.className).toContain('opacity-100');

    scrollTo(body, 0);
    expect(shade.getAttribute('data-scrolled')).toBe('false');
    expect(shade.className).toContain('opacity-0');
  });

  it('is decorative: hidden from assistive technology and never takes a pointer', () => {
    const { shade } = setup();

    expect(shade.getAttribute('aria-hidden')).toBe('true');
    expect(shade.className).toContain('pointer-events-none');
  });

  it('takes no room in the flow, so the ruled lines do not move', () => {
    const { shade } = setup();

    // Sticky so it stays at the top of the scrolling surface, and pulled back by its
    // own height so the grid under it starts where it did without it.
    expect(shade.className).toContain('sticky top-0');
    expect(shade.className).toContain('-mb-3');
    expect(shade.className).toContain('h-3');
  });

  it('is themed by the surface token it sits on, in Exam Mode too', () => {
    const { shade } = setup('exam');

    expect(shade.getAttribute('style')).toContain('--color-bg-surface-inset');
  });
});
