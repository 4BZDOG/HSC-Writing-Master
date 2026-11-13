import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * Where the open list sits, and what a multi-pick list does on a pick.
 *
 * Placement is computed from the trigger's rect and the viewport, and jsdom has
 * neither, so both are stubbed before the list opens. The list opens below the
 * trigger when there is room, above when there is not, and pinned inside the
 * viewport (covering the trigger) only when neither side can hold a list.
 */

const originalInnerHeight = window.innerHeight;

beforeAll(() => {
  // jsdom has no layout, so the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
});

const trigger = () =>
  document.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
const menu = () => document.querySelector('[data-placement]') as HTMLElement;
const listbox = () => screen.getByRole('listbox');

const numbered = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));

/** Set the viewport height and stub the trigger's rect before it is opened. */
const setLayout = (viewportHeight: number, top: number, bottom: number) => {
  Object.defineProperty(window, 'innerHeight', { value: viewportHeight, configurable: true });
  render(<Combobox options={numbered(12)} value="" onChange={vi.fn()} label={null} />);
  trigger().getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 100,
      right: 300,
      width: 200,
      height: bottom - top,
      x: 100,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  fireEvent.click(trigger());
};

describe('menu placement', () => {
  it('opens above a trigger near the bottom of the viewport, bounded by the room above it', () => {
    // 300px of room above (minus the 8px margins), and 24px below: above wins.
    setLayout(800, 300, 760);

    expect(menu().getAttribute('data-placement')).toBe('above');
    // Anchored by its bottom edge, 8px above the trigger.
    expect(menu().style.bottom).toBe(`${800 - 300 + 8}px`);
    expect(menu().style.top).toBe('');
    // Bounded by the space above: 300 - 2*8 margins, less 54px of chrome (the
    // 52px search row and the 2px border; these twelve options are searchable).
    expect(listbox().style.maxHeight).toBe('230px');
  });

  it('opens below a trigger near the top, at rect.bottom + 8', () => {
    setLayout(800, 100, 140);

    expect(menu().getAttribute('data-placement')).toBe('below');
    expect(menu().style.top).toBe(`${140 + 8}px`);
    // Plenty of room: the list takes its cap of 480px, not the old 288px.
    expect(listbox().style.maxHeight).toBe('480px');
  });

  it('stays inside a tiny viewport, with a positive list height', () => {
    // A 300px viewport with the trigger in the middle: neither side is roomy,
    // but the list still fits on screen.
    setLayout(300, 130, 160);

    const top = parseFloat(menu().style.top);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(parseFloat(listbox().style.maxHeight)).toBeGreaterThan(0);
  });

  it('pins inside the viewport, and accepts covering the trigger, when neither side has room', () => {
    // 74px above and 74px below: less than 120px of list after the 54px of
    // chrome on either side.
    setLayout(200, 90, 110);

    expect(menu().getAttribute('data-placement')).toBe('below');
    expect(menu().style.top).toBe('8px');
    // 200 - 2*8 margins - 54px of chrome.
    expect(listbox().style.maxHeight).toBe('130px');
  });
});

describe('keepOpenOnSelect', () => {
  it('calls onChange on each pick and leaves the list open', () => {
    const onChange = vi.fn();
    render(
      <Combobox options={numbered(3)} value="" onChange={onChange} label={null} keepOpenOnSelect />
    );
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole('option', { name: 'Option 0' }));
    expect(onChange).toHaveBeenLastCalledWith('o0');
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(onChange).toHaveBeenLastCalledWith('o1');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on the first pick without the prop, as before', () => {
    const onChange = vi.fn();
    render(<Combobox options={numbered(3)} value="" onChange={onChange} label={null} />);
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole('option', { name: 'Option 0' }));

    expect(onChange).toHaveBeenCalledWith('o0');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('keepOpenOnSelect with new option objects', () => {
  const withSelected = (selectedIds: string[]) =>
    numbered(3).map((o) => ({ ...o, selected: selectedIds.includes(o.id) }));

  it('keeps the highlight where it was, and reports selection from each option', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Combobox
        options={withSelected([])}
        value=""
        onChange={onChange}
        label={null}
        keepOpenOnSelect
      />
    );
    fireEvent.click(trigger());
    expect(listbox().getAttribute('aria-multiselectable')).toBe('true');

    // Move the highlight to the second row and pick it.
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('o1');

    // The parent takes the pick and hands back new option objects, the second now selected.
    rerender(
      <Combobox
        options={withSelected(['o1'])}
        value=""
        onChange={onChange}
        label={null}
        keepOpenOnSelect
      />
    );

    const activeId = trigger().getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId as string)?.textContent).toBe('Option 1');
    expect(screen.getByRole('option', { name: 'Option 1', selected: true })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Option 0', selected: false })).toBeTruthy();
    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(1);
  });
});
