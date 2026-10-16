import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useFocusTrap, focusTrapCompanion } from '../../hooks/useFocusTrap';
import Toast from '../../components/Toast';

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

/** Returns false when the trap called `preventDefault`, i.e. took the key over. */
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
/**
 * Under StrictMode, React runs a mounted effect, cleans it up, and runs it again
 * in development. A modal that mounts already open (the outcome brief is mounted
 * on the click that opens it) gets that double run, and the cleanup of the first
 * run schedules the focus restore for the opener. Without cancelling that restore,
 * it lands one frame later and takes focus out of the dialog it has just opened.
 */
describe('under StrictMode', () => {
  const twoFrames = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

  it('keeps focus inside a dialog that mounts open', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    render(
      <React.StrictMode>
        <Dialog active />
      </React.StrictMode>
    );
    await twoFrames();

    expect(screen.getByTestId('dialog').contains(document.activeElement)).toBe(true);
    opener.remove();
  });

  it('still hands focus back to the opener when the dialog really closes', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>dismiss</button>
          <Dialog active={open} />
        </>
      );
    };
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    render(
      <React.StrictMode>
        <Harness />
      </React.StrictMode>
    );
    await twoFrames();
    expect(screen.getByTestId('dialog').contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByText('dismiss'));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });
});

/**
 * A dialog that closes and another that opens in the same tick are two hook
 * instances, so nothing the closing one keeps can see the opening one. The
 * focus restore has to look at who holds focus when it lands, or it takes focus
 * out of the new dialog and drops it on the page behind.
 */
describe('close-then-open in the same tick', () => {
  const twoFrames = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

  it('does not take focus back from the dialog that replaced the one that closed', async () => {
    const Panel: React.FC<{ label: string; active: boolean; onNext: () => void }> = ({
      label,
      active,
      onNext,
    }) => {
      const ref = useFocusTrap<HTMLDivElement>(active);
      if (!active) return null;
      return (
        <div ref={ref} tabIndex={-1} role="dialog" aria-label={label}>
          <button onClick={onNext}>{`${label} next`}</button>
        </div>
      );
    };
    const Swap = () => {
      const [shown, setShown] = useState<'first' | 'second' | null>(null);
      return (
        <>
          <button onClick={() => setShown('first')}>open first</button>
          <Panel label="first" active={shown === 'first'} onNext={() => setShown('second')} />
          <Panel label="second" active={shown === 'second'} onNext={() => setShown(null)} />
        </>
      );
    };
    render(<Swap />);
    const opener = screen.getByText('open first');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByText('first next'));

    // One click: the first dialog closes and the second opens in the same tick.
    fireEvent.click(screen.getByText('first next'));
    expect(document.activeElement).toBe(screen.getByText('second next'));

    await twoFrames();
    expect(document.activeElement).toBe(screen.getByText('second next'));
  });

  it('still returns focus to its parent when a dialog opened inside another closes', async () => {
    const Nested = () => {
      const [outer, setOuter] = useState(false);
      const [inner, setInner] = useState(false);
      const outerRef = useFocusTrap<HTMLDivElement>(outer);
      const innerRef = useFocusTrap<HTMLDivElement>(inner);
      return (
        <>
          <button onClick={() => setOuter(true)}>open outer</button>
          {outer && (
            <div ref={outerRef} tabIndex={-1} role="dialog" aria-label="outer">
              <button onClick={() => setInner(true)}>open inner</button>
            </div>
          )}
          {inner && (
            <div ref={innerRef} tabIndex={-1} role="dialog" aria-label="inner">
              <button onClick={() => setInner(false)}>close inner</button>
            </div>
          )}
        </>
      );
    };
    render(<Nested />);
    fireEvent.click(screen.getByText('open outer'));

    const openInner = screen.getByText('open inner');
    openInner.focus();
    fireEvent.click(openInner);
    expect(document.activeElement).toBe(screen.getByText('close inner'));

    fireEvent.click(screen.getByText('close inner'));
    await twoFrames();

    // The outer dialog is still open and holds the control that opened the inner
    // one, so that control gets the focus back.
    expect(document.activeElement).toBe(screen.getByText('open inner'));
  });

  it('puts focus back into an open dialog when a dialog opened from outside it closes', async () => {
    const Stray = () => {
      const [inner, setInner] = useState(false);
      const outerRef = useFocusTrap<HTMLDivElement>(true);
      const innerRef = useFocusTrap<HTMLDivElement>(inner);
      return (
        <>
          <button onClick={() => setInner(true)}>page opener</button>
          <div ref={outerRef} tabIndex={-1} role="dialog" aria-label="outer">
            <button>outer first</button>
          </div>
          {inner && (
            <div ref={innerRef} tabIndex={-1} role="dialog" aria-label="inner">
              <button onClick={() => setInner(false)}>close inner</button>
            </div>
          )}
        </>
      );
    };
    render(<Stray />);
    const pageOpener = screen.getByText('page opener');
    pageOpener.focus();
    fireEvent.click(pageOpener);
    expect(document.activeElement).toBe(screen.getByText('close inner'));

    fireEvent.click(screen.getByText('close inner'));
    await twoFrames();

    // The page button is not inside the dialog still open, so focus does not go
    // back to it; it goes to the open dialog rather than being dropped.
    expect(document.activeElement).toBe(screen.getByText('outer first'));
  });
});

/**
 * The profile's Terms link closes the profile and opens the legal reader in one
 * click. The reader's opener is the Terms link, which is removed with the profile,
 * so the reader has to hand focus back to the page that opened the profile.
 */
describe('a hand-off from one dialog to another', () => {
  const twoFrames = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

  it('returns focus to the page when the second dialog closes', async () => {
    const Handoff = () => {
      const [profile, setProfile] = useState(false);
      const [legal, setLegal] = useState(false);
      const profileRef = useFocusTrap<HTMLDivElement>(profile);
      const legalRef = useFocusTrap<HTMLDivElement>(legal);
      return (
        <>
          <button onClick={() => setProfile(true)}>open profile</button>
          {profile && (
            <div ref={profileRef} tabIndex={-1} role="dialog" aria-label="profile">
              <button
                onClick={() => {
                  setProfile(false);
                  setLegal(true);
                }}
              >
                terms
              </button>
            </div>
          )}
          {legal && (
            <div ref={legalRef} tabIndex={-1} role="dialog" aria-label="legal">
              <button onClick={() => setLegal(false)}>close legal</button>
            </div>
          )}
        </>
      );
    };
    render(<Handoff />);
    const opener = screen.getByText('open profile');
    opener.focus();
    fireEvent.click(opener);

    const terms = screen.getByText('terms');
    terms.focus();
    fireEvent.click(terms);
    // The reader stays open across a frame: the profile's restore runs then, and
    // must leave focus in the reader.
    await twoFrames();
    expect(document.activeElement).toBe(screen.getByText('close legal'));

    fireEvent.click(screen.getByText('close legal'));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

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

/**
 * A toast is painted above the improvement review (z 1350 against 1300) so that
 * "Undo" and a failed export are SEEN — but it is portalled to <body>, outside
 * the dialog, and the trap wrapped Tab round the dialog's own controls. A mouse
 * user could press the toast's action; a keyboard user could not reach it at all.
 *
 * The fix is a deliberate, marked hand-off (`focusTrapCompanion` on the toast's
 * mount), not a loosening: anything NOT marked is still pulled back into the
 * dialog, and the dialog's own controls still wrap exactly as before.
 */
describe('a toast painted above the dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  /** The toast's mount as `App` renders it: portalled to <body>, marked as a companion. */
  const ToastMount: React.FC<{ marked?: boolean; action?: boolean }> = ({
    marked = true,
    action = true,
  }) =>
    createPortal(
      <div {...(marked ? focusTrapCompanion : {})} data-testid="toast-mount">
        <Toast
          message="Draft replaced."
          type="success"
          duration={600000}
          onClose={() => {}}
          action={action ? { label: 'Undo', onClick: () => {} } : undefined}
        />
      </div>,
      document.body
    );

  const renderReview = (toast: React.ReactNode = <ToastMount />, dialog?: React.ReactNode) =>
    render(
      <>
        <button>page control behind</button>
        <Dialog active>{dialog}</Dialog>
        {toast}
      </>
    );

  const undo = () => screen.getByRole('button', { name: 'Undo' });
  const dismiss = () => screen.getByRole('button', { name: 'Close notification' });

  it('is reached by Tab from the dialog’s last control, rather than wrapping past it', () => {
    renderReview();
    screen.getByText('last').focus();

    const left = tab();

    expect(left).toBe(false);
    expect(document.activeElement).toBe(undo());
  });

  it('leaves Tab between the toast’s own controls to the browser', () => {
    renderReview();
    undo().focus();

    // Not the edge of the toast, so the trap has no business intercepting.
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(undo());
  });

  it('wraps from the toast’s last control back to the dialog’s first', () => {
    renderReview();
    dismiss().focus();

    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('runs the same cycle backwards with Shift+Tab', () => {
    renderReview();

    screen.getByText('first').focus();
    tab(true);
    expect(document.activeElement).toBe(dismiss());

    undo().focus();
    tab(true);
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('reaches the toast whichever way round it sits in the document', () => {
    // Raised BEFORE the dialog opened, so it comes first in DOM order. Tab order
    // is the trap’s to decide, not the markup’s.
    render(
      <>
        <ToastMount />
        <Dialog active />
      </>
    );
    screen.getByText('last').focus();

    tab();
    expect(document.activeElement).toBe(undo());
  });

  it('still reaches a toast with nothing to do but be dismissed', () => {
    renderReview(<ToastMount action={false} />);
    screen.getByText('last').focus();

    tab();
    expect(document.activeElement).toBe(dismiss());
  });

  it('follows the toast as it comes and goes while the dialog stays open', () => {
    const { rerender } = renderReview(null);
    screen.getByText('last').focus();

    // No toast: the dialog wraps exactly as it always has.
    tab();
    expect(document.activeElement).toBe(screen.getByText('first'));

    rerender(
      <>
        <button>page control behind</button>
        <Dialog active />
        <ToastMount />
      </>
    );
    screen.getByText('last').focus();
    tab();
    expect(document.activeElement).toBe(undo());

    rerender(
      <>
        <button>page control behind</button>
        <Dialog active />
      </>
    );
    screen.getByText('last').focus();
    tab();
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  describe('without weakening the trap', () => {
    it('does not hand a toast to the dialog’s controls: they still wrap when no toast is up', () => {
      renderReview(null);

      screen.getByText('last').focus();
      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));

      tab(true);
      expect(document.activeElement).toBe(screen.getByText('last'));
    });

    it('still pulls focus back from the page behind while a toast is up', () => {
      renderReview();

      screen.getByText('page control behind').focus();
      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));

      screen.getByText('page control behind').focus();
      tab(true);
      expect(document.activeElement).toBe(screen.getByText('last'));
    });

    it('does not treat an unmarked portalled layer as part of the cycle', () => {
      // Same shape as the toast, minus the marker: only a deliberate hand-off
      // is exempt, so a stray portal cannot become a way out of the dialog.
      renderReview(<ToastMount marked={false} />);
      screen.getByText('last').focus();

      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));

      // And focus that has strayed onto it is pulled back like any other.
      undo().focus();
      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));
    });

    it('skips a toast that is hidden from assistive technology', () => {
      renderReview(
        createPortal(
          <div {...focusTrapCompanion} aria-hidden="true">
            <button>unseen</button>
          </div>,
          document.body
        )
      );
      screen.getByText('last').focus();

      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));
    });

    it('ignores a marked region inside the dialog, whose controls are already its own', () => {
      renderReview(
        null,
        <>
          <button>first</button>
          <div {...focusTrapCompanion}>
            <button>inner last</button>
          </div>
        </>
      );
      screen.getByText('inner last').focus();

      tab();
      expect(document.activeElement).toBe(screen.getByText('first'));
    });

    it('only the topmost dialog hands focus on', () => {
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
          <ToastMount />
        </>
      );

      screen.getByText('over last').focus();
      tab();
      expect(document.activeElement).toBe(undo());

      // From the toast it goes back to the TOPMOST dialog, not the one beneath.
      dismiss().focus();
      tab();
      expect(document.activeElement).toBe(screen.getByText('over first'));
    });
  });

  describe('when the toast is covered by a dialog above it', () => {
    // The toast ranks below confirm, rename and flag (z 1350 against 2200), so
    // one raised over those is hidden. Offering its buttons to Tab there would
    // put focus on a control nobody can see, and Enter would press "Undo" blind.
    const paintOver = (hit: Element) => {
      // jsdom has no layout, so give every control a box and say what the
      // browser would find painted at its centre.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 10,
        width: 80,
        height: 30,
        right: 90,
        bottom: 40,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => hit,
      });
    };

    it('is skipped, so Tab does not land on something hidden', () => {
      const scrim = document.createElement('div');
      document.body.appendChild(scrim);
      renderReview();
      paintOver(scrim);
      screen.getByText('last').focus();

      tab();

      expect(document.activeElement).toBe(screen.getByText('first'));
      scrim.remove();
    });

    it('is offered when it is the thing actually painted there', () => {
      renderReview();
      paintOver(screen.getByTestId('toast-mount'));
      screen.getByText('last').focus();

      tab();

      expect(document.activeElement).toBe(undo());
    });
  });
});

describe('the toast mount in App', () => {
  it('is marked as a focus-trap companion', () => {
    // `App` is too large to mount in a unit test, so this guards the wiring: the
    // wrapper that carries `z-toast` must spread `focusTrapCompanion`, or the
    // keyboard cycle above silently stops including the toast.
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(app).toMatch(/<div\s+\{\.\.\.focusTrapCompanion\}\s+className="[^"]*\bz-toast\b/);
  });
});
