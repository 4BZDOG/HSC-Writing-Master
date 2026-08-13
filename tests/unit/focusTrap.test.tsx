import { describe, it, expect, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Every dialog in the app declares `aria-modal="true"`, which tells a screen
 * reader that the page behind it is inert. Nothing made that true: Tab walked
 * straight out of the dialog and through controls the user could not see, in a
 * document their screen reader had been told to ignore. The attribute was a
 * promise the DOM did not keep.
 *
 * The cases below are the ones a hand-rolled trap usually misses — and the one
 * that existed in this codebase did miss: `textarea` and `select` absent from
 * the focusable list, and no focus restoration on close.
 */

afterEach(cleanup);

const Dialog: React.FC<{ active: boolean; children?: React.ReactNode }> = ({
  active,
  children,
}) => {
  const ref = useFocusTrap<HTMLDivElement>(active);
  if (!active) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" data-testid="dialog">
      {children ?? (
        <>
          <button>first</button>
          <button>middle</button>
          <button>last</button>
        </>
      )}
    </div>
  );
};

const Harness: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <button>page control behind</button>
      <Dialog active={open}>{children}</Dialog>
      {open && <button onClick={() => setOpen(false)}>close it</button>}
    </>
  );
};

const tab = (shift = false) =>
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: shift, bubbles: true });

describe('useFocusTrap', () => {
  it('leaves focus where a dialog put it with autoFocus', () => {
    // React applies autoFocus during the commit, which runs BEFORE the trap's
    // effect. Pulling focus back to the first focusable turns every form
    // dialog into one that needs a click before it can be typed in.
    const Dialog = () => {
      const ref = useFocusTrap<HTMLDivElement>(true);
      return (
        <div ref={ref} tabIndex={-1}>
          <button>Close</button>
          <input aria-label="Name" autoFocus />
        </div>
      );
    };
    render(<Dialog />);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('does not hand focus back to a field inside the dialog it just closed', async () => {
    // The opener is remembered so focus can return to it. A dialog that
    // autoFocused its own field would otherwise remember THAT, and restore
    // focus on close to a node that no longer exists — dropping focus to
    // <body>, which is the failure this hook exists to prevent.
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const Dialog = ({ open }: { open: boolean }) => {
      const ref = useFocusTrap<HTMLDivElement>(open);
      if (!open) return null;
      return (
        <div ref={ref} tabIndex={-1}>
          <input aria-label="Name" autoFocus />
        </div>
      );
    };

    const { rerender } = render(<Dialog open />);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    rerender(<Dialog open={false} />);
    // Deferred by a frame: closing re-renders the surface that owns the
    // dialog, and restoring before that settles lands focus on a node React
    // is about to replace.
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));

    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps from the last control back to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));

    screen.getByText('last').focus();
    tab();
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps backwards from the first control to the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));

    screen.getByText('first').focus();
    tab(true);
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('pulls focus back when it has escaped to the page behind', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));

    // Something outside grabbed focus — a stray programmatic focus, a click
    // through a gap in the scrim.
    screen.getByText('page control behind').focus();
    tab();

    expect(screen.getByTestId('dialog').contains(document.activeElement)).toBe(true);
  });

  /**
   * The omission that made the previous trap actively harmful: the one dialog
   * whose entire content is a textarea (the manual question editor) let focus
   * walk straight out of it.
   */
  it('counts textareas and selects as focusable', () => {
    render(
      <Harness>
        <textarea aria-label="body" />
        <select aria-label="pick">
          <option>one</option>
        </select>
      </Harness>
    );
    fireEvent.click(screen.getByText('opener'));

    expect(document.activeElement).toBe(screen.getByLabelText('body'));

    screen.getByLabelText('pick').focus();
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText('body'));
  });

  it('skips disabled controls', () => {
    render(
      <Harness>
        <button disabled>disabled one</button>
        <button>real one</button>
      </Harness>
    );
    fireEvent.click(screen.getByText('opener'));

    expect(document.activeElement).toBe(screen.getByText('real one'));
  });

  it('returns focus to whatever opened it', async () => {
    render(<Harness />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);

    fireEvent.click(screen.getByText('close it'));

    // A frame later: closing re-renders the surface that owns the dialog, and
    // restoring before that settles puts focus on a node React then replaces.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('leaves the page alone while inactive', () => {
    render(<Harness />);
    const behind = screen.getByText('page control behind');
    behind.focus();

    tab();

    expect(document.activeElement).toBe(behind);
  });
});

/**
 * Dialogs stack — the improvement diff opens over the marking feedback — so
 * containment has to follow the same topmost-only rule Escape does, or the
 * dialog underneath fights the one on top for focus.
 */
describe('stacked dialogs', () => {
  it('only the topmost dialog contains focus', () => {
    render(
      <>
        <Dialog active>
          <button>under first</button>
          <button>under last</button>
        </Dialog>
        <Dialog active>
          <button>over first</button>
          <button>over last</button>
        </Dialog>
      </>
    );

    screen.getByText('over last').focus();
    tab();
    expect(document.activeElement).toBe(screen.getByText('over first'));

    // The lower dialog must not have wrapped focus to its own first control.
    expect(document.activeElement).not.toBe(screen.getByText('under first'));
  });
});

/**
 * The other half of "keyboard users can only reach what is on screen".
 *
 * The workspace's disclosure panels animate to zero height with a grid-rows
 * trick, which is a visual collapse and nothing more — every control inside a
 * shut panel stayed in the tab order. A student tabbing from the question to
 * the writing surface travelled through the marking guide's edit button, the
 * exemplar carousel and the keyword editor, none of which were on screen.
 */
describe('collapsed panels are unreachable', () => {
  it('marks a shut disclosure panel inert, and lifts it when opened', async () => {
    const { AccordionSection } = await import('../../components/ReferenceMaterials');

    const { container } = render(
      <AccordionSection title="Marking Guide" icon={<span />}>
        <button>edit criteria</button>
      </AccordionSection>
    );

    const inertPanel = () => container.querySelector('[inert]');
    const innerControl = screen.getByRole('button', { name: 'edit criteria' });
    const toggle = screen.getByRole('button', { name: /Marking Guide/i });

    // Shut by default, so the control inside it must not be reachable.
    expect(inertPanel()).not.toBeNull();
    expect(inertPanel()!.contains(innerControl)).toBe(true);

    fireEvent.click(toggle);
    expect(inertPanel()).toBeNull();

    fireEvent.click(toggle);
    expect(inertPanel()).not.toBeNull();
  });
});
