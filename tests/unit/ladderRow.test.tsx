import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import LadderRow, { LadderRowGutter } from '../../components/LadderRow';
import { getBandConfig, getBandRgb } from '../../utils/renderUtils';
import {
  LADDER_BODY,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_FILL,
  LADDER_SOLID,
  LADDER_GUTTER,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_MARK_LONG,
  LADDER_GUTTER_MARK_MEDIUM,
  LADDER_ROW,
  LADDER_STACK,
} from '../../utils/ladderChrome';

/**
 * The mark ladder's row: a solid gutter on the left that names the mark over the
 * question's total, and a body that says what earns it. The Marking Guide and the
 * Sample Answers panel both draw it, so the gutter, the edge, the fill, the radius
 * and the type are checked here rather than trusted to each caller.
 */

afterEach(cleanup);

/** The gutter of a row, by the class every gutter carries. */
const gutterOf = (container: HTMLElement): HTMLElement =>
  container.querySelector(`[class*="${LADDER_GUTTER.split(' ')[0]}"]`) as HTMLElement;

describe('LadderRow gutter', () => {
  it('shows the mark, and the band beneath it as a caption', () => {
    render(
      <LadderRow band={4} markLabel="5">
        criterion
      </LadderRow>
    );

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('Band 4')).toBeTruthy();
  });

  it('shows the mark over the total, as a figure, when a total is given', () => {
    const { container } = render(
      <LadderRow band={4} markLabel="5" total={6}>
        criterion
      </LadderRow>
    );

    expect(gutterOf(container).textContent).toBe('5/6Band 4');
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows a range of marks over the total, as the guide does for "3–4"', () => {
    const { container } = render(
      <LadderRow band={3} markLabel="3–4" total={6}>
        x
      </LadderRow>
    );
    expect(gutterOf(container).textContent).toBe('3–4/6Band 3');
  });

  it('sets the figure in the band’s solid ink, and the caption in the same ink', () => {
    render(
      <LadderRow band={6} markLabel="8" total={8}>
        criterion
      </LadderRow>
    );

    const figure = screen.getByText('8');
    const caption = screen.getByText('Band 6');
    // The ink is the gutter's own (`band-solid` sets it in index.css), inherited by
    // the figure and the caption, so neither restates a colour.
    expect(figure.className).not.toMatch(/text-(white|yellow-950)/);
    expect(caption.className).not.toMatch(/text-(white|yellow-950)/);
    expect(caption.className).toContain('t-label');
    expect(figure.className).toContain(LADDER_GUTTER_MARK);
    expect(figure.className).toContain('font-mono');
    expect(figure.className).toContain('tabular-nums');
  });

  it('takes the default caption from the band, unless one is given', () => {
    render(
      <LadderRow band={3} markLabel="2">
        criterion
      </LadderRow>
    );
    expect(screen.getByText('Band 3')).toBeTruthy();
  });

  it('uses a custom caption when one is given', () => {
    render(
      <LadderRow band={3} markLabel="2" bandCaption="Developing">
        criterion
      </LadderRow>
    );
    expect(screen.getByText('Developing')).toBeTruthy();
    expect(screen.queryByText('Band 3')).toBeNull();
  });

  it('writes no caption when bandCaption is false', () => {
    render(
      <LadderRow band={3} markLabel="2" total={6} bandCaption={false}>
        criterion
      </LadderRow>
    );
    expect(screen.queryByText('Band 3')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('keeps a mark at the usual size, and a long figure at the smaller one that fits the gutter', () => {
    const { container, unmount } = render(
      <LadderRow band={3} markLabel="3" total={6}>
        x
      </LadderRow>
    );
    expect(gutterOf(container).firstElementChild!.className).toContain(LADDER_GUTTER_MARK);
    unmount();

    const long = render(
      <LadderRow band={3} markLabel="10–12" total={12}>
        x
      </LadderRow>
    );
    // "10–12/12" is eight characters, which will not fit the gutter at the usual size.
    expect(gutterOf(long.container).firstElementChild!.className).toContain(
      LADDER_GUTTER_MARK_LONG
    );
    expect(gutterOf(long.container).firstElementChild!.className).not.toContain(LADDER_GUTTER_MARK);
  });

  it('steps a middle-length figure down one size, between the usual and the long', () => {
    // "7–8/10" is six characters: too long for the usual size, short of the longest.
    const { container } = render(
      <LadderRow band={5} markLabel="7–8" total={10}>
        x
      </LadderRow>
    );
    const figure = gutterOf(container).firstElementChild as HTMLElement;
    expect(figure.className).toContain(LADDER_GUTTER_MARK_MEDIUM);
    expect(figure.className).not.toContain(LADDER_GUTTER_MARK);
    expect(figure.className).not.toContain(LADDER_GUTTER_MARK_LONG);
    expect(figure.textContent).toBe('7–8/10');
  });
});

describe('LadderRow edge and colour', () => {
  it('draws a shut row at the band edge, and an open row at the strong edge', () => {
    const { container, rerender } = render(
      <LadderRow band={5} markLabel="4">
        x
      </LadderRow>
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain(LADDER_EDGE_SHUT);
    expect(row.className).not.toContain(LADDER_EDGE_OPEN);

    rerender(
      <LadderRow band={5} markLabel="4" edge="open">
        x
      </LadderRow>
    );
    const opened = container.firstElementChild as HTMLElement;
    expect(opened.className).toContain(LADDER_EDGE_OPEN);
    expect(opened.className).not.toMatch(/(^|\s)band-edge(\s|$)/);
  });

  it('puts the edge on the gutter divider too, so the seam matches the outline', () => {
    const { container } = render(
      <LadderRow band={2} markLabel="3" edge="open">
        x
      </LadderRow>
    );
    const gutter = container.querySelector('.border-r') as HTMLElement;
    expect(gutter).toBeTruthy();
    expect(gutter.className).toContain(LADDER_EDGE_OPEN);
  });

  it('hands the band to CSS as --band-rgb, and never as a colour literal', () => {
    const { container } = render(
      <LadderRow band={4} markLabel="2">
        x
      </LadderRow>
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(4));
    expect(row.className).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });

  it('fills the row with the band’s fill class, and the gutter with the band’s solid colour', () => {
    const { container } = render(
      <LadderRow band={5} markLabel="4">
        x
      </LadderRow>
    );
    const row = container.firstElementChild as HTMLElement;
    const gutter = gutterOf(container);
    // The row's fill is a class in index.css that reads --band-rgb, so it is the same
    // band in both themes; the gutter is the band's SOLID colour, not its wash.
    expect(row.className).toContain(LADDER_FILL);
    expect(gutter.className).toContain(LADDER_SOLID);
    expect(gutter.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(5));
    for (const token of getBandConfig(5).bg.split(' ')) {
      expect(gutter.className).not.toContain(token);
    }
  });
});

describe('LadderRow shape', () => {
  it('uses the shared radius, gutter width and spacing, so both panels line up', () => {
    const { container } = render(
      <LadderRow band={4} markLabel="4">
        x
      </LadderRow>
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain(LADDER_ROW);
    expect(row.className).toContain('rounded-xl');
    expect(row.className).toContain('items-stretch');

    const gutter = container.querySelector('.border-r') as HTMLElement;
    expect(gutter.className).toContain(LADDER_GUTTER);
    // The gutter widened for the "5/6" figure, and it is one width in both panels.
    expect(gutter.className).toContain('w-[4.5rem]');
    expect(gutter.className).toContain('sm:w-20');
  });

  it('holds the criterion in the body, beside the gutter', () => {
    const { container } = render(
      <LadderRow band={4} markLabel="4">
        <span>Provides a sound explanation</span>
      </LadderRow>
    );
    const body = screen.getByText('Provides a sound explanation').parentElement!;
    expect(body.className).toContain(LADDER_BODY);
    expect(container.firstElementChild!.contains(body)).toBe(true);
  });

  it('spaces a stack of rows with the shared gap', () => {
    expect(LADDER_STACK).toBe('space-y-2');
  });
});

describe('LadderRow footer', () => {
  it('renders a footer inside the body, beneath the content', () => {
    render(
      <LadderRow band={4} markLabel="4" footer={<button>Model answer</button>}>
        <p>criterion text</p>
      </LadderRow>
    );

    const button = screen.getByRole('button', { name: 'Model answer' });
    const text = screen.getByText('criterion text');
    // The footer follows the content, and both sit in the body, not the gutter.
    expect(text.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const body = text.parentElement!;
    expect(body.className).toContain(LADDER_BODY);
    expect(button.parentElement!.parentElement).toBe(body);
  });

  it('renders no footer element when none is given', () => {
    render(
      <LadderRow band={4} markLabel="4">
        <p>criterion text</p>
      </LadderRow>
    );
    const body = screen.getByText('criterion text').parentElement!;
    expect(body.children).toHaveLength(1);
  });
});

describe('LadderRowGutter on its own', () => {
  it('renders the same gutter a row uses, so a different body can sit beside it', () => {
    const { container } = render(
      <div className="flex items-stretch">
        <LadderRowGutter band={3} markLabel="2" total={6} edge="open" />
        <p>interactive body</p>
      </div>
    );

    const gutter = gutterOf(container);
    expect(gutter.className).toContain(LADDER_GUTTER);
    expect(gutter.className).toContain(LADDER_EDGE_OPEN);
    expect(gutter.textContent).toBe('2/6Band 3');
    expect(gutter.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
  });

  it('honours bandCaption false in the standalone gutter as well', () => {
    render(<LadderRowGutter band={3} markLabel="3" total={6} bandCaption={false} />);
    expect(screen.queryByText('Band 3')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
