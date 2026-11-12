import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * The picker's keyboard and pointer paths, pinned where they used to fail: a
 * locked question that could not be picked at all, a highlight left pointing at
 * the wrong row after a search, an End on an empty result that broke Enter, Tab
 * leaving the list open, and search that ignored accents and curly quotes.
 */

beforeAll(() => {
  // jsdom has no layout, so the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const trigger = () =>
  document.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
const search = () => screen.getByRole('combobox') as HTMLInputElement;
const optionTexts = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent);

const numbered = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));

describe('locked options', () => {
  const options = [
    { id: 'free', label: 'Free question' },
    { id: 'locked', label: 'Advanced question', disabled: true },
  ];

  it('hands a click on a locked option to onDisabledPick, not onChange', () => {
    const onChange = vi.fn();
    const onDisabledPick = vi.fn();
    render(
      <Combobox
        options={options}
        value="free"
        onChange={onChange}
        onDisabledPick={onDisabledPick}
        label={null}
      />
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: /Advanced question/ }));

    expect(onDisabledPick).toHaveBeenCalledWith('locked');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('hands Enter on a locked option to onDisabledPick, not onChange', () => {
    const onChange = vi.fn();
    const onDisabledPick = vi.fn();
    render(
      <Combobox
        options={options}
        value="free"
        onChange={onChange}
        onDisabledPick={onDisabledPick}
        label={null}
      />
    );
    fireEvent.click(trigger());
    // Locked rows are landable once a handler exists, so the arrow reaches one.
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });

    expect(onDisabledPick).toHaveBeenCalledWith('locked');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing on a locked click when no handler is supplied, as before', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value="free" onChange={onChange} label={null} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: /Advanced question/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});

describe('the highlight after searching', () => {
  it('Enter commits the first match, not the row that was selected before the search', async () => {
    const onChange = vi.fn();
    render(<Combobox options={numbered(9)} value="o8" onChange={onChange} label={null} />);
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: 'option' } });
    await waitFor(() => expect(optionTexts()).toHaveLength(9));
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('o0');
  });
});

describe('an empty result', () => {
  it('End on a list with no matches, then clearing the search, does not throw and commits a real option', async () => {
    const onChange = vi.fn();
    render(<Combobox options={numbered(9)} value="" onChange={onChange} label={null} />);
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());

    expect(() => fireEvent.keyDown(trigger(), { key: 'End' })).not.toThrow();
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    await waitFor(() => expect(optionTexts()).toHaveLength(9));
    expect(() => fireEvent.keyDown(search(), { key: 'Enter' })).not.toThrow();

    expect(onChange).toHaveBeenCalledWith('o0');
  });
});

describe('Home and End in the search box', () => {
  it('leaves the highlight alone while the caret is in a non-empty query', async () => {
    render(<Combobox options={numbered(9)} value="" onChange={vi.fn()} label={null} />);
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: 'option' } });
    await waitFor(() => expect(optionTexts()).toHaveLength(9));
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    const before = search().getAttribute('aria-activedescendant');

    const notPrevented = fireEvent.keyDown(search(), { key: 'Home' });

    expect(notPrevented).toBe(true);
    expect(search().getAttribute('aria-activedescendant')).toBe(before);
  });
});

describe('Tab with the list open', () => {
  it('closes the list from the search box and returns focus to the trigger', () => {
    render(<Combobox options={numbered(9)} value="" onChange={vi.fn()} label={null} />);
    fireEvent.click(trigger());
    expect(document.activeElement).toBe(search());

    const notPrevented = fireEvent.keyDown(search(), { key: 'Tab' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(notPrevented).toBe(false);
  });

  it('closes the list from the trigger and lets Tab run on', () => {
    render(<Combobox options={numbered(3)} value="" onChange={vi.fn()} label={null} />);
    fireEvent.click(trigger());

    const notPrevented = fireEvent.keyDown(trigger(), { key: 'Tab' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(notPrevented).toBe(true);
  });
});

describe('the accessible name', () => {
  it('names the trigger by its caption and value when there is no visible label', () => {
    render(
      <Combobox options={numbered(3)} value="o1" onChange={vi.fn()} label={null} caption="Course" />
    );
    expect(screen.getByRole('button', { name: 'Course: Option 1' })).toBeTruthy();
  });

  it('names the open listbox by the caption', () => {
    render(
      <Combobox options={numbered(3)} value="" onChange={vi.fn()} label={null} caption="Topic" />
    );
    fireEvent.click(trigger());
    expect(screen.getByRole('listbox', { name: 'Topic' })).toBeTruthy();
  });
});

describe('search matching', () => {
  const options = [
    { id: 'cafe', label: 'Café au lait' },
    { id: 'curly', label: 'Don’t stop' },
    ...numbered(5),
  ];

  it('matches "cafe" to "Café"', async () => {
    render(<Combobox options={options} value="" onChange={vi.fn()} label={null} />);
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: 'cafe' } });

    await waitFor(() => expect(optionTexts()).toEqual(['Café au lait']));
  });

  it('matches a straight apostrophe to a curly one', async () => {
    render(<Combobox options={options} value="" onChange={vi.fn()} label={null} />);
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "don't" } });

    await waitFor(() => expect(optionTexts()).toEqual(['Don’t stop']));
  });
});
