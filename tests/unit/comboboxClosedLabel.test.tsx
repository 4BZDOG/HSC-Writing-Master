import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import Combobox from '../../components/Combobox';

/**
 * The closed control shows the chosen option, and it used to hold all of it to
 * one `nowrap` line: every label sat in `truncate`. That is right for a name and
 * wrong for a node that lays itself out in two lines, which then clipped at the
 * control's edge. A node now says `multiline` and owns its own overflow.
 *
 * jsdom has no layout, so these pin the classes the control puts on the label
 * and not the pixels. The pixels were checked in the navigator at 1440 and 390.
 */

afterEach(cleanup);

/** The element that holds the chosen label, under the closed button. */
const labelHolder = (container: HTMLElement): HTMLElement => {
  const button = container.querySelector('button[aria-haspopup="listbox"]') as HTMLElement;
  expect(button, 'closed control').toBeTruthy();
  const outer = button.querySelector('span.flex') as HTMLElement;
  expect(outer, 'outer label wrapper').toBeTruthy();
  const inner = outer.querySelector(':scope > span') as HTMLElement;
  expect(inner, 'inner label wrapper').toBeTruthy();
  return inner;
};

const chosen = (option: React.ComponentProps<typeof Combobox>['options'][number]) => {
  const { container } = render(
    <Combobox options={[option]} value={option.id} onChange={() => {}} label={null} />
  );
  return container;
};

describe('the closed control holds a single-line label to one line', () => {
  it('truncates a plain label, as it always has', () => {
    const container = chosen({ id: 'a', label: 'Describe the fetch-execute cycle.' });
    const outer = container.querySelector('button span.flex') as HTMLElement;
    const inner = labelHolder(container);

    expect(outer.className).toContain('truncate');
    expect(inner.className).toContain('truncate');
    expect(inner.className).not.toContain('whitespace-normal');
  });

  it('truncates a node that does not say it wraps, so a name still ends in an ellipsis', () => {
    const container = chosen({
      id: 'b',
      label: 'Using data to tell a story',
      renderLabel: <span className="font-medium">Using data to tell a story</span>,
    });
    const inner = labelHolder(container);

    expect(inner.className).toContain('truncate');
  });
});

describe('the closed control lets a multi-line node wrap', () => {
  it('drops the one-line truncation and wraps the node instead', () => {
    const container = chosen({
      id: 'c',
      label: 'Construct models of the processes of DNA replication.',
      multiline: true,
      renderLabel: (
        <div className="flex items-start gap-3 w-full">
          <span className="leading-snug font-semibold line-clamp-2 whitespace-normal">
            Construct models of the processes of DNA replication and explain how each enzyme
            contributes to the accuracy of the copied sequence.
          </span>
        </div>
      ),
    });
    const outer = container.querySelector('button span.flex') as HTMLElement;
    const inner = labelHolder(container);

    expect(outer.className).not.toContain('truncate');
    expect(inner.className).not.toContain('truncate');
    expect(inner.className).toContain('whitespace-normal');
    // The node's own text is all there: the control clips nothing it renders.
    expect(container.textContent).toContain('copied sequence.');
  });
});
