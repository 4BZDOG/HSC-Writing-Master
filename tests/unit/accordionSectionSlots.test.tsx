import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AccordionSection } from '../../components/ReferenceMaterials';
import { PANEL_ROW_MIN_H } from '../../utils/panelStyles';

/**
 * The disclosure header's contract, and the two openings a sibling can use:
 *
 *  - the header row is the disclosure and nothing else, so it holds one button and
 *    stands on the shared row height;
 *  - `forceOpenSignal` opens the section from outside when it changes.
 */

afterEach(cleanup);

const toggle = () => screen.getByRole('button', { name: /Exemplars/i });

describe('AccordionSection header', () => {
  it('renders the header with the disclosure alone, as its only control', () => {
    render(
      <AccordionSection title="Exemplars" icon={<span />}>
        <p>body</p>
      </AccordionSection>
    );

    const headerRow = toggle().parentElement!;
    expect(headerRow.querySelectorAll('button')).toHaveLength(1);
    expect(headerRow.children).toHaveLength(1);
  });

  it('keeps the shared header height on the row that holds the disclosure', () => {
    const { container } = render(
      <AccordionSection title="Exemplars" icon={<span />}>
        <p>body</p>
      </AccordionSection>
    );
    const row = container.querySelector(`[class*="${PANEL_ROW_MIN_H}"]`);
    expect(row).toBeTruthy();
    expect(row!.contains(toggle())).toBe(true);
  });

  it('keeps aria-controls pointing at the body it discloses', () => {
    render(
      <AccordionSection title="Exemplars" icon={<span />}>
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

describe('AccordionSection lazy', () => {
  // A body whose rows run work on mount must not do that for a section nobody has
  // opened. Off by default, so the other callers keep their children across a fold.
  const body = (lazy?: boolean) => (
    <AccordionSection title="Exemplars" icon={<span />} lazy={lazy}>
      <p>expensive body</p>
    </AccordionSection>
  );

  it('mounts no children while shut, and mounts them once opened', () => {
    render(body(true));
    expect(screen.queryByText('expensive body')).toBeNull();

    fireEvent.click(toggle());
    expect(screen.getByText('expensive body')).toBeTruthy();
  });

  it('unmounts the children again when the section is shut', () => {
    render(body(true));
    fireEvent.click(toggle());
    expect(screen.getByText('expensive body')).toBeTruthy();

    fireEvent.click(toggle());
    expect(screen.queryByText('expensive body')).toBeNull();
  });

  it('keeps the body mounted while shut when lazy is not given, as before', () => {
    render(body());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('expensive body')).toBeTruthy();
  });

  it('mounts the children in the same render that a force-open signal opens the section', () => {
    const section = (signal: number) => (
      <AccordionSection title="Exemplars" icon={<span />} lazy forceOpenSignal={signal}>
        <p>expensive body</p>
      </AccordionSection>
    );
    const { rerender } = render(section(0));
    expect(screen.queryByText('expensive body')).toBeNull();

    rerender(section(1));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('expensive body')).toBeTruthy();
  });
});
