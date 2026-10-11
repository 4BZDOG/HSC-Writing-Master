import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AccordionSection } from '../../components/ReferenceMaterials';
import { PANEL_ROW_MIN_H } from '../../utils/panelStyles';

/**
 * Two slots on the disclosure header, both for the Sample Answers panel to use:
 *
 *  - `actions` sits in the header row BESIDE the disclosure, as a sibling of its
 *    button. A button cannot hold another button, and a control inside the
 *    toggle used to nest one inside the other.
 *  - `forceOpenSignal` opens the section from outside when it changes.
 */

afterEach(cleanup);

const toggle = () => screen.getByRole('button', { name: /Exemplars/i });

describe('AccordionSection actions', () => {
  it('renders the action beside the disclosure, never inside it', () => {
    render(
      <AccordionSection
        title="Exemplars"
        icon={<span />}
        actions={<button type="button">Generate</button>}
      >
        <p>body</p>
      </AccordionSection>
    );

    const action = screen.getByRole('button', { name: 'Generate' });
    const disclosure = toggle();
    expect(disclosure.contains(action)).toBe(false);
    expect(action.closest('button[aria-expanded]')).toBeNull();
    // Still in the same header, so it reads as one row.
    expect(disclosure.parentElement!.contains(action)).toBe(true);
  });

  it('does not open or shut the section when an action is pressed', () => {
    const onAction = vi.fn();
    render(
      <AccordionSection
        title="Exemplars"
        icon={<span />}
        actions={
          <button type="button" onClick={onAction}>
            Generate
          </button>
        }
      >
        <p>body</p>
      </AccordionSection>
    );

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('still toggles from the disclosure when actions are present', () => {
    render(
      <AccordionSection
        title="Exemplars"
        icon={<span />}
        actions={<button type="button">Generate</button>}
      >
        <p>body</p>
      </AccordionSection>
    );

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the header with the disclosure alone when no actions are given', () => {
    render(
      <AccordionSection title="Exemplars" icon={<span />}>
        <p>body</p>
      </AccordionSection>
    );

    // One button in the header, and it is the disclosure.
    const headerRow = toggle().parentElement!;
    expect(headerRow.querySelectorAll('button')).toHaveLength(1);
    expect(headerRow.children).toHaveLength(1);
  });

  it('keeps the shared header height on the row that holds the disclosure', () => {
    const { container } = render(
      <AccordionSection
        title="Exemplars"
        icon={<span />}
        actions={<button type="button">Generate</button>}
      >
        <p>body</p>
      </AccordionSection>
    );
    const row = container.querySelector(`[class*="${PANEL_ROW_MIN_H}"]`);
    expect(row).toBeTruthy();
    expect(row!.contains(toggle())).toBe(true);
  });

  it('keeps aria-controls pointing at the body it discloses', () => {
    render(
      <AccordionSection
        title="Exemplars"
        icon={<span />}
        actions={<button type="button">Generate</button>}
      >
        <p>body</p>
      </AccordionSection>
    );
    const controlled = toggle().getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(document.getElementById(controlled!)).toBeTruthy();
  });
});

describe('AccordionSection forceOpenSignal', () => {
  const section = (signal?: number) => (
    <AccordionSection title="Exemplars" icon={<span />} forceOpenSignal={signal}>
      <p>body</p>
    </AccordionSection>
  );

  it('does not open on mount, because the value it starts at is not a change', () => {
    render(section(3));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens when the signal changes to a truthy value', () => {
    const { rerender } = render(section(0));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    rerender(section(1));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens again on a later change, after the student has shut it', () => {
    const { rerender } = render(section(1));
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    rerender(section(2));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('does not reopen a section the student shut, when the signal is unchanged', () => {
    const { rerender } = render(section(1));
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    // A re-render that changes nothing must not pull the panel back open.
    rerender(section(1));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open when the signal changes to zero', () => {
    const { rerender } = render(section(1));
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    rerender(section(0));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves a section open that was already open', () => {
    const { rerender } = render(section(1));
    rerender(section(2));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('is inert with no signal at all, so existing callers are unchanged', () => {
    const { rerender } = render(section(undefined));
    rerender(section(undefined));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
