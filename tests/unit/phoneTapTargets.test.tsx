import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import UrlFetchField from '../../components/UrlFetchField';

/**
 * The phone touch-target pass. Each control is at least 44px below `sm` and
 * returns to its desktop size from `sm` up, so a laptop sees the layout it had.
 *
 * The close buttons are read from source rather than rendered, because each
 * modal needs its own services mocked to mount; the class strings are the thing
 * that drifts, and accentFillContrast.test.tsx reads source for the same reason.
 */

const COMPONENTS = resolve(__dirname, '../../components');
const source = (file: string) => readFileSync(resolve(COMPONENTS, file), 'utf8');
const tokens = (el: HTMLElement) => el.className.split(/\s+/);

describe('UrlFetchField on a phone', () => {
  it('makes the URL input and the Fetch button 44px below sm', () => {
    render(
      <UrlFetchField
        value=""
        onChange={vi.fn()}
        onFetch={vi.fn()}
        onInvalid={vi.fn()}
        isFetching={false}
      />
    );
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button', { name: 'Fetch' });

    expect(tokens(input)).toEqual(expect.arrayContaining(['min-h-11', 'sm:min-h-0']));
    expect(tokens(button)).toEqual(expect.arrayContaining(['min-h-11', 'sm:min-h-0']));
  });

  it('sets the input to 16px on a phone, so iOS does not zoom on focus', () => {
    render(
      <UrlFetchField
        value=""
        onChange={vi.fn()}
        onFetch={vi.fn()}
        onInvalid={vi.fn()}
        isFetching={false}
      />
    );
    const input = screen.getByRole('textbox');

    expect(tokens(input)).toEqual(expect.arrayContaining(['text-base', 'sm:text-sm']));
    // 8px padding either side of a 24px line makes the input's natural height
    // 42px, so the 44px minimum is what sets it, and it matches the button.
    expect(tokens(input)).toEqual(expect.arrayContaining(['py-2', 'sm:py-2.5']));
  });
});

describe('close buttons on a phone', () => {
  // A 36px square becomes 44px on a phone. The min-size idiom is used where the
  // title can take the extra width; the Topic import modal's title cannot, so
  // its target is a pseudo-element and the chip stays 36px.
  it.each([
    'QualityCheckModal.tsx',
    'CourseCreatorModal.tsx',
    'RenameModal.tsx',
    'OutcomesEditorModal.tsx',
  ])('%s grows its close button to 44px below sm', (file) => {
    expect(source(file)).toContain('w-9 h-9 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0');
  });

  it('TopicSyllabusImportModal keeps the 36px chip and adds a 44px hit area', () => {
    const src = source('TopicSyllabusImportModal.tsx');

    expect(src).toContain('relative shrink-0 w-9 h-9');
    expect(src).toContain("before:absolute before:-inset-1 before:content-['']");
    // Off from `sm`, so the desktop hit area is the one it was.
    expect(src).toContain('sm:before:content-none');
  });
});

describe('the API usage pill on a phone', () => {
  it('is 44px tall below sm', () => {
    expect(source('ApiMonitorDisplay.tsx')).toContain('min-h-11 sm:min-h-0 rounded-full');
  });
});
