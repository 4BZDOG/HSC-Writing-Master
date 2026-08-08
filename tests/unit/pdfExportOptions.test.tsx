import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useRef, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PdfExportOptions from '../../components/PdfExportOptions';
import { DEFAULT_PDF_PREFERENCES, PdfExportPreferences } from '../../utils/pdfExportPreferences';

/**
 * The export options panel, and the two things that made it misbehave inside
 * the evaluation modal — both found by driving it in a real browser.
 *
 * 1. Escape closed the panel AND the report behind it: two bubble-phase
 *    listeners on `window`, one press, both fired.
 * 2. The panel was clipped to nothing by the modal's scrolling body, so it
 *    now renders through a portal.
 */

afterEach(cleanup);

const Harness: React.FC<{
  onClose?: () => void;
  onModalEscape?: () => void;
  initial?: PdfExportPreferences;
}> = ({ onClose, onModalEscape, initial = DEFAULT_PDF_PREFERENCES }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(true);

  // Stands in for the evaluation modal: a window-level Escape handler that
  // must not fire while the panel is the topmost thing on screen.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onModalEscape?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onModalEscape]);

  return (
    <div ref={anchorRef}>
      <button onClick={() => setOpen((v) => !v)}>trigger</button>
      <span data-testid="state">{JSON.stringify(value)}</span>
      <PdfExportOptions
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        value={value}
        onChange={setValue}
        anchorRef={anchorRef}
      />
    </div>
  );
};

const state = (): PdfExportPreferences =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}');

describe('the export options panel', () => {
  it('offers the options the exporter supports', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'A4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Letter' })).toBeTruthy();
    expect(screen.getByText(/Student's response/i)).toBeTruthy();
    expect(screen.getByText(/Marker's notes/i)).toBeTruthy();
    expect(screen.getByLabelText(/Copies/i)).toBeTruthy();
  });

  it('reports each change up, so the choice can be persisted', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Letter' }));
    expect(state().pageSize).toBe('letter');

    fireEvent.click(screen.getByText(/Marker's notes/i));
    expect(state().markerNotes).toBe(true);
  });

  // A typed 999 would render for a minute before anyone could stop it.
  it('clamps the copy count as it is typed', () => {
    render(<Harness />);
    const copies = screen.getByLabelText(/Copies/i);

    fireEvent.change(copies, { target: { value: '5000' } });
    expect(state().copies).toBeLessThanOrEqual(40);

    fireEvent.change(copies, { target: { value: '0' } });
    expect(state().copies).toBe(1);
  });

  /**
   * The bug: the panel and the evaluation modal both listened for Escape on
   * `window`, so one press closed the panel and the whole report with it.
   */
  it('closes on Escape without closing the report behind it', () => {
    const onClose = vi.fn();
    const onModalEscape = vi.fn();
    render(<Harness onClose={onClose} onModalEscape={onModalEscape} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onModalEscape).not.toHaveBeenCalled();
  });

  it('closes on a click outside, but not on a click inside it', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole('dialog', { name: /export options/i }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Clipped to nothing inside the modal's scrolling body until it was portalled
  // out to the document.
  it('renders outside its parent, above the surface that would clip it', () => {
    const { container } = render(<Harness />);
    const panel = screen.getByRole('dialog', { name: /export options/i });

    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
    expect(panel.className).toContain('fixed');
  });

  it('renders nothing at all while closed', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

    expect(screen.queryByRole('dialog', { name: /export options/i })).toBeNull();
  });
});
