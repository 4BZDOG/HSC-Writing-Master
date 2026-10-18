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
  it.each(['QualityCheckModal.tsx', 'RenameModal.tsx', 'OutcomesEditorModal.tsx'])(
    '%s grows its close button to 44px below sm',
    (file) => {
      expect(source(file)).toContain('w-9 h-9 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0');
    }
  );

  it('CourseCreatorModal closes with the shared 44px close button at every width', () => {
    // The creator dialogs share one chrome file. Its close button is the 44px
    // FlagContentModal one, so it is a 44px target from every width, not only below sm.
    expect(source('CourseCreatorModal.tsx')).toContain('CREATOR_CLOSE');
    expect(readFileSync(resolve(COMPONENTS, '../utils/creatorChrome.ts'), 'utf8')).toContain(
      'min-h-11 min-w-11'
    );
  });

  it('TopicSyllabusImportModal keeps the 36px chip and adds a 44px hit area', () => {
    const src = source('TopicSyllabusImportModal.tsx');

    expect(src).toContain('relative z-20 shrink-0 w-9 h-9');
    expect(src).toContain("before:absolute before:-inset-1 before:content-['']");
    // Off from `sm`, so the desktop hit area is the one it was.
    expect(src).toContain('sm:before:content-none');
  });
});

describe('the API usage pill on a phone', () => {
  // Below sm the closed chip is a 44px round button holding the bolt alone, and the
  // counts are hidden there (they moved into its aria-label). From sm it is the chip.
  it('is a 44px round button below sm, and the full chip from sm', () => {
    const chip = source('ApiMonitorDisplay.tsx');
    expect(chip).toContain('h-11 w-11 p-0 sm:h-auto sm:w-auto sm:px-4 sm:py-2 rounded-full');
    expect(chip.split('max-sm:hidden').length - 1).toBe(3);
  });
});

describe('the paywall on a phone', () => {
  // The prompt, the plan comparison, the School route and the past-due banner
  // are the surfaces a person is in when they are deciding whether to pay, so
  // their controls get the same 44px floor as the rest of the app.
  it('makes the upgrade prompt close button 44px at every width', () => {
    expect(source('UpgradeModal.tsx')).toContain('absolute top-3 right-3 w-11 h-11');
  });

  it('makes the upgrade prompt’s Maybe later button 44px tall on a phone', () => {
    expect(source('UpgradeModal.tsx')).toContain('t-label min-h-11 ');
  });

  it('makes the upgrade prompt’s primary button 44px tall on a phone', () => {
    expect(source('UpgradeModal.tsx')).toContain('min-h-11 flex-1 px-5 py-3.5');
  });

  it('makes the seat stepper 44px below sm, and returns it to 32px from sm up', () => {
    const stepper = 'w-11 h-11 sm:w-8 sm:h-8';
    const count = source('SchoolLicencePanel.tsx').split(stepper).length - 1;
    expect(count).toBe(2);
  });

  it('makes the Buy seats button and the enquiry route 44px tall', () => {
    const panel = source('SchoolLicencePanel.tsx');
    expect(panel).toContain('min-h-11 text-sm font-bold px-4 py-2.5');
    expect(panel).toContain('inline-flex min-h-11 items-center justify-center text-xs');
    expect(panel).toContain('className="min-h-11 text-xs font-bold');
  });

  it('makes the past-due banner’s dismiss control and update button 44px on a phone', () => {
    const banner = source('BillingAlertBanner.tsx');
    expect(banner).toContain('w-11 h-11 sm:w-8 sm:h-8');
    expect(banner).toContain('min-h-11 sm:min-h-0 t-label');
  });

  it('makes the plan comparison’s upgrade button 44px tall', () => {
    expect(source('PlanComparison.tsx')).toContain('t-label min-h-11 shrink-0');
  });

  it('keeps 10px and 11px text out of the paywall surfaces a person must read to pay', () => {
    for (const file of [
      'UpgradeModal.tsx',
      'SchoolLicencePanel.tsx',
      'PlanComparison.tsx',
      'BillingAlertBanner.tsx',
    ]) {
      expect(source(file), file).not.toMatch(/text-\[1[01]px\]/);
    }
  });
});
