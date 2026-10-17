import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * The focus picker is a single-select control standing in for a multi-pick, so
 * its answer ("2 focus areas") matches no option. Handed in as the placeholder,
 * the count was set in placeholder ink and weight and read as "nothing chosen".
 * `summary` shows it as a chosen value instead.
 */

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Fetch' },
  { id: 'b', label: 'Decode' },
];

const closed = (props: Partial<React.ComponentProps<typeof Combobox>>) => {
  const { container } = render(
    <Combobox
      options={options}
      value=""
      onChange={() => {}}
      label={null}
      placeholder="All of this syllabus point"
      appearance="quiet"
      caption="Focus"
      {...props}
    />
  );
  return container.querySelector('button[aria-haspopup="listbox"]') as HTMLElement;
};

describe('a summary reads as a chosen value', () => {
  it('sets the placeholder in muted ink and normal weight', () => {
    const button = closed({});
    expect(button.textContent).toContain('All of this syllabus point');
    expect(button.className).toContain('text-[rgb(var(--color-text-muted))]');
    expect((button.querySelector('span.flex') as HTMLElement).className).not.toContain('font-bold');
    expect(button.textContent).not.toContain('Focus');
  });

  it('sets a summary in the value ink and weight, with its caption', () => {
    const button = closed({ summary: '2 focus areas' });
    expect(button.textContent).toContain('2 focus areas');
    expect(button.textContent).not.toContain('All of this syllabus point');
    expect(button.getAttribute('title')).toBe('2 focus areas');
    expect(button.className).toContain('text-[rgb(var(--color-text-primary))]');
    expect(button.className).not.toContain('text-[rgb(var(--color-text-muted))]');
    expect((button.querySelector('span.flex') as HTMLElement).className).toContain('font-bold');
    expect(button.textContent).toContain('Focus');
  });
});
