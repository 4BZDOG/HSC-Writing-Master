import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * The question picker breaks a dot point's questions into runs by tier, so
 * twenty tinted cards read as six kinds of question. The run headings were
 * `role="presentation"`, so a screen reader heard twenty options and none of
 * the kinds. Each run is now a named group (listbox > group > option).
 */

beforeAll(() => {
  // jsdom has no layout, so the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const open = (options: React.ComponentProps<typeof Combobox>['options'], onChange = vi.fn()) => {
  render(<Combobox options={options} value="" onChange={onChange} label={null} />);
  fireEvent.click(screen.getByRole('button', { name: /select/i }));
  return onChange;
};

describe('Combobox option groups', () => {
  it('names each run of a grouped list as a group that owns its options', () => {
    open([
      { id: 'a', label: 'Identify two purposes.', group: 'Tier 1 · Remember' },
      { id: 'b', label: 'Define a variable.', group: 'Tier 1 · Remember' },
      { id: 'c', label: 'Explain a cache.', group: 'Tier 3 · Explain' },
    ]);
    const listbox = screen.getByRole('listbox');
    const groups = within(listbox).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Tier 1 · Remember',
      'Tier 3 · Explain',
    ]);
    expect(within(groups[0]).getAllByRole('option')).toHaveLength(2);
    expect(within(groups[1]).getAllByRole('option')).toHaveLength(1);
  });

  it('leaves an ungrouped list flat, as every other picker has it', () => {
    open([
      { id: 'a', label: 'HSC Biology' },
      { id: 'b', label: 'HSC Chemistry' },
    ]);
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).queryAllByRole('group')).toHaveLength(0);
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
  });

  it('still selects an option inside a group', () => {
    const onChange = open([
      { id: 'a', label: 'Identify two purposes.', group: 'Tier 1 · Remember' },
      { id: 'c', label: 'Explain a cache.', group: 'Tier 3 · Explain' },
    ]);
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /explain a cache/i }));
    expect(onChange).toHaveBeenCalledWith('c');
  });
});
