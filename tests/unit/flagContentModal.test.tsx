import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import FlagContentModal from '../../components/FlagContentModal';
import type { ContentFlag } from '../../types';

/**
 * The "something looks off" report. What has to hold: it is a labelled dialog that
 * closes the ways every other dialog here closes, its field has a visible label,
 * the quick starters only type into the box (so what is stored is still the
 * reporter's own sentence), and a flag that is already open is shown, not re-asked.
 */

afterEach(cleanup);

const renderModal = (props: Partial<React.ComponentProps<typeof FlagContentModal>> = {}) => {
  const handlers = { onClose: vi.fn(), onFlag: vi.fn(), onResolve: vi.fn() };
  const utils = render(<FlagContentModal isOpen itemLabel="question" {...handlers} {...props} />);
  return { ...utils, ...handlers };
};

const OPEN_FLAG: ContentFlag = {
  reason: 'The marking guide adds to 7.',
  flaggedAt: Date.UTC(2026, 9, 1, 3),
  status: 'open',
};

describe('FlagContentModal', () => {
  it('is a modal dialog named by its visible title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Flag this question' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The name comes from the heading on screen, not from a separate string.
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Flag this question' })).toBeTruthy();
  });

  it('labels the field, and says what happens next', () => {
    renderModal();
    expect(screen.getByLabelText('What looks wrong?')).toBeTruthy();
    expect(screen.getByText(/review list that admins check/i)).toBeTruthy();
  });

  it('keeps Flag for review shut until there is a reason, then sends it trimmed', () => {
    const { onFlag, onClose } = renderModal();
    const submit = screen.getByRole('button', { name: 'Flag for review' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('What looks wrong?'), {
      target: { value: '  The marks add to 7.  ' },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(onFlag).toHaveBeenCalledWith('The marks add to 7.');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('types a starter into the box, and adds the next one on its own line', () => {
    renderModal();
    const box = screen.getByLabelText('What looks wrong?') as HTMLTextAreaElement;

    fireEvent.click(screen.getByRole('button', { name: 'The marks don’t add up' }));
    expect(box.value).toBe('The marks don’t add up: ');

    fireEvent.click(screen.getByRole('button', { name: 'A fact looks wrong' }));
    expect(box.value).toBe('The marks don’t add up:\nA fact looks wrong: ');
  });

  it('stops the box at 500 characters and counts them', () => {
    renderModal();
    const box = screen.getByLabelText('What looks wrong?') as HTMLTextAreaElement;
    expect(box.maxLength).toBe(500);
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(screen.getByText('3 / 500')).toBeTruthy();
  });

  it('gives every control a 44px target on a phone', () => {
    renderModal();
    const names = ['Close', 'Cancel', 'Flag for review', 'A fact looks wrong'];
    for (const name of names) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
  });

  it('closes on Escape and on a press that starts and ends on the backdrop', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stays open when a selection in the box is released over the backdrop', () => {
    const { onClose } = renderModal();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(screen.getByLabelText('What looks wrong?'));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('puts focus in the field when it opens, and keeps it inside the dialog', () => {
    renderModal();
    expect(document.activeElement).toBe(screen.getByLabelText('What looks wrong?'));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('shows an open flag with its reason and date, and resolves it on request', () => {
    const { onResolve, onClose } = renderModal({ existingFlag: OPEN_FLAG });

    expect(screen.getByRole('dialog', { name: 'This question is flagged' })).toBeTruthy();
    expect(screen.getByText(/The marking guide adds to 7\./)).toBeTruthy();
    // Dates are written the Australian way, day first. Computed the same way, so
    // the test does not depend on the machine's time zone.
    expect(
      screen.getByText(`Flagged ${new Date(OPEN_FLAG.flaggedAt).toLocaleDateString('en-AU')}`)
    ).toBeTruthy();
    // It is not re-asked for a reason while one is open.
    expect(screen.queryByLabelText('What looks wrong?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats a resolved flag as no flag, so the question can be flagged again', () => {
    renderModal({ existingFlag: { ...OPEN_FLAG, status: 'resolved' } });
    expect(screen.getByRole('dialog', { name: 'Flag this question' })).toBeTruthy();
  });

  it('uses the item’s own name in its copy', () => {
    renderModal({ itemLabel: 'sample answer' });
    expect(screen.getByRole('dialog', { name: 'Flag this sample answer' })).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
