import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CommandTermGuideModal from '../../components/CommandTermGuideModal';
import { getCommandTermInfo } from '../../data/commandTerms';

/**
 * The verb sheet is what a student reads when a verb in their question is unclear.
 * What it has to make true: it names the verb as the dialog's title, it says what
 * the verb means for THIS question, its words are working buttons rather than an
 * inert list, and a selection dragged out of it does not close it.
 */

afterEach(cleanup);

const renderGuide = (props: Partial<React.ComponentProps<typeof CommandTermGuideModal>> = {}) => {
  const onClose = vi.fn();
  const utils = render(
    <CommandTermGuideModal
      isOpen
      onClose={onClose}
      termInfo={getCommandTermInfo('EXPLAIN')}
      {...props}
    />
  );
  return { ...utils, onClose };
};

describe('CommandTermGuideModal', () => {
  it('is a dialog named for the verb, and says what the verb asks for', () => {
    renderGuide();
    const dialog = screen.getByRole('dialog', { name: /EXPLAIN.*what the command verb asks for/ });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('says what this question asks for when it is given the question', () => {
    renderGuide({ marks: 4, band: 3 });
    expect(screen.getByText(/4 marks\. A full-mark answer reaches Band 3\./)).toBeTruthy();
  });

  it('says nothing about a question when it is opened without one', () => {
    renderGuide();
    expect(screen.queryByText(/A full-mark answer reaches/)).toBeNull();
  });

  it('shows each figure once: the tier and the band ceiling are not repeated as stats', () => {
    renderGuide();
    expect(screen.queryByText('Command tier')).toBeNull();
    expect(screen.queryByText('Band ceiling')).toBeNull();
    expect(screen.getByText('Marks')).toBeTruthy();
    expect(screen.getByText('Minutes')).toBeTruthy();
    expect(screen.getByText('Pages')).toBeTruthy();
  });

  it('names the method part in sentence case, with the article that fits the verb', () => {
    renderGuide();
    expect(screen.getByRole('heading', { name: 'How to answer an EXPLAIN question' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Method' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Words to use' })).toBeTruthy();
  });

  it('draws the tip as numbered moves, not as one paragraph per line', () => {
    renderGuide();
    // The EXPLAIN tip's lead line is a move, and its word list is not a move.
    const lead = screen.getByText('Chain every sentence with linking words:');
    expect(lead.tagName).toBe('P');
    expect(lead.parentElement?.tagName).toBe('LI');
  });

  it('offers the words to use as buttons that add the word and close the guide', () => {
    const inserted: string[] = [];
    const listener = (e: Event) => inserted.push((e as CustomEvent<string>).detail);
    window.addEventListener('insert-text', listener);
    try {
      const { onClose } = renderGuide();
      fireEvent.click(screen.getByRole('button', { name: 'because' }));
      expect(inserted).toEqual(['because']);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('insert-text', listener);
    }
  });

  it('merges structural keywords the tip does not already quote into the words', () => {
    // DESCRIBE's tip has no word list of its own, so its keywords are the words.
    renderGuide({ termInfo: getCommandTermInfo('DESCRIBE') });
    expect(screen.getByRole('button', { name: 'characteristics' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'consists of' })).toBeTruthy();
  });

  it('does not repeat a keyword the tip already quotes', () => {
    // EXPLAIN quotes "because" and "therefore" in its tip, so they appear once.
    renderGuide();
    expect(screen.getAllByRole('button', { name: 'because' })).toHaveLength(1);
  });

  it('lays out each band-marked row as a mark gutter, with the range in an en dash', () => {
    renderGuide({ termInfo: getCommandTermInfo('DESCRIBE') });
    expect(screen.getByText('3+')).toBeTruthy();
    expect(screen.getByText('1–2')).toBeTruthy();
  });

  it('gives the close button a 44px target', () => {
    renderGuide();
    const close = screen.getByRole('button', { name: 'Close the command verb guide' });
    expect(close.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-w-11/);
  });

  it('closes on Escape', () => {
    const { onClose } = renderGuide();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a press that starts and ends on the backdrop', () => {
    const { onClose } = renderGuide();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when a selection inside the sheet is released over the backdrop', () => {
    const { onClose } = renderGuide();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(screen.getByText('Chain every sentence with linking words:'));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderGuide({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
