import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * A dot point can carry a dozen questions and a course a dozen topics; the
 * picker had no way to find one but scrolling. Search appears only where
 * scanning stops working, and matches the things a teacher would type — the
 * verb, the marks, the paper — not just the question text.
 */

beforeAll(() => {
  // jsdom has no layout, so the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const makeOptions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));

const questions = [
  { id: 'q1', label: 'Assess the impact of automation.', searchText: 'ASSESS 8 marks HSC 2023' },
  { id: 'q2', label: 'Describe the fetch-execute cycle.', searchText: 'DESCRIBE 4 marks' },
  { id: 'q3', label: 'Explain how a cache reduces latency.', searchText: 'EXPLAIN 6 marks' },
  { id: 'q4', label: 'Analyse a sorting algorithm.', searchText: 'ANALYSE 6 marks HSC 2021' },
  { id: 'q5', label: 'Outline the OSI model.', searchText: 'OUTLINE 3 marks' },
  { id: 'q6', label: 'Compare two data structures.', searchText: 'COMPARE 5 marks' },
  { id: 'q7', label: 'Justify a design decision.', searchText: 'JUSTIFY 7 marks HSC 2023' },
];

const renderBox = (options: React.ComponentProps<typeof Combobox>['options'], onChange = vi.fn()) => {
  render(<Combobox options={options} value="" onChange={onChange} label={null} />);
  fireEvent.click(screen.getByRole('button', { name: /select/i }));
  return onChange;
};

const search = () => screen.getByRole('combobox');
const optionTexts = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('Combobox search', () => {
  it('stays out of the way for a short list', () => {
    renderBox(makeOptions(6));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('appears once the list is long enough to be worth searching', () => {
    renderBox(makeOptions(7));
    expect(search()).toBeTruthy();
    expect(search().getAttribute('placeholder')).toContain('7');
  });

  it('filters on the option text', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'cache' } });

    expect(optionTexts()).toEqual(['Explain how a cache reduces latency.']);
  });

  it('filters on the metadata the row shows but the question text lacks', () => {
    renderBox(questions);

    fireEvent.change(search(), { target: { value: 'hsc 2023' } });
    expect(optionTexts()).toHaveLength(2);

    fireEvent.change(search(), { target: { value: '6 marks' } });
    expect(optionTexts()).toHaveLength(2);
  });

  // Typed the way a person thinks of a question, not in the order the data
  // happens to be stored in.
  it('matches terms in any order', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: '2023 justify' } });

    expect(optionTexts()).toEqual(['Justify a design decision.']);
  });

  it('says so when nothing matches, quoting what was searched for', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'photosynthesis' } });

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Nothing matches .photosynthesis./)).toBeTruthy();
  });

  it('Enter picks the first match, not the first option of the whole list', () => {
    const onChange = renderBox(questions);
    fireEvent.change(search(), { target: { value: 'osi' } });
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('q5');
  });

  it('arrow keys walk the filtered list', () => {
    const onChange = renderBox(questions);
    fireEvent.change(search(), { target: { value: 'marks' } });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('q2');
  });

  it('Escape clears the query before it closes the list', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'osi' } });
    expect(optionTexts()).toHaveLength(1);

    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(optionTexts()).toHaveLength(questions.length);

    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears the query with the clear button', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'osi' } });
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect((search() as HTMLInputElement).value).toBe('');
    expect(optionTexts()).toHaveLength(questions.length);
  });

  // A query left behind would silently hide options the next time this opens.
  it('forgets the query when the list closes', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'osi' } });
    fireEvent.keyDown(search(), { key: 'Escape' });
    fireEvent.keyDown(search(), { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
    expect(optionTexts()).toHaveLength(questions.length);
  });
});

describe('the option list portals clear of a clipping ancestor', () => {
  /**
   * `App.tsx` opens this control inside a `grid-rows-[0fr]/[1fr]` collapse
   * wrapper whose child carries `overflow-hidden` (needed so the collapse
   * animation has something to clip to zero height). The list used to be an
   * `absolute` child of the trigger's own container: out of flow, so it never
   * grew that ancestor's measured height, and `overflow-hidden` then clipped
   * the list at the trigger's own bottom edge — with whatever rendered next
   * on the page (here, the command verb ribbon) visible immediately below
   * the cut. Portaling to `document.body` is what makes the list escape that
   * ancestor regardless of its overflow or height.
   */
  it('escapes an overflow-hidden ancestor instead of being clipped by it', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden', height: 40 }}>
        <Combobox options={questions} value="" onChange={vi.fn()} label={null} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /select/i }));

    const listbox = screen.getByRole('listbox');
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it('still commits a click on an option once it lives outside the trigger’s container', () => {
    const onChange = vi.fn();
    render(
      <div style={{ overflow: 'hidden', height: 40 }}>
        <Combobox options={questions} value="" onChange={onChange} label={null} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    fireEvent.click(screen.getByRole('option', { name: /Outline the OSI model/ }));

    expect(onChange).toHaveBeenCalledWith('q5');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('typing stays instant', () => {
  /**
   * The list is deferred; the TEXT is not. Filtering twenty tinted question
   * rows is enough work to be felt on a school laptop, and the one place it
   * must never be felt is between a key going down and the letter appearing —
   * which is exactly what a naive debounce on the input's own value would do.
   */
  it('shows each keystroke in the box straight away', () => {
    renderBox(questions);

    fireEvent.change(search(), { target: { value: 'c' } });
    expect((search() as HTMLInputElement).value).toBe('c');

    fireEvent.change(search(), { target: { value: 'ca' } });
    expect((search() as HTMLInputElement).value).toBe('ca');

    fireEvent.change(search(), { target: { value: 'cache' } });
    expect((search() as HTMLInputElement).value).toBe('cache');
    // …and the list has caught up by the time anyone could read it.
    expect(optionTexts()).toHaveLength(1);
  });

  it('names the query the list was actually filtered by', () => {
    renderBox(questions);
    fireEvent.change(search(), { target: { value: 'zzz' } });

    expect(screen.getByText(/Nothing matches “zzz”/)).toBeTruthy();
  });
});
