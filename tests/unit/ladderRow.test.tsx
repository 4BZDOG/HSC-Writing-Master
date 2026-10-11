import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import LadderRow, { LadderRowGutter } from '../../components/LadderRow';
import { getBandConfig, getBandRgb } from '../../utils/renderUtils';
import {
  LADDER_BODY,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_GUTTER,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_MARK_LONG,
  LADDER_ROW,
  LADDER_STACK,
} from '../../utils/ladderChrome';

/**
 * The mark ladder's row: a gutter on the left that names the mark or band, and a
 * body that says what earns it. The Marking Guide and the Sample Answers panel
 * both draw it, so the gutter, the edge, the radius and the type are checked
 * here rather than trusted to each caller.
 */

afterEach(cleanup);

describe('LadderRow gutter', () => {
  it('shows the mark label, and the band beneath it as a caption', () => {
    render(
      <LadderRow band={4} markLabel="5">
        criterion
      </LadderRow>
    );

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('Band 4')).toBeTruthy();
  });

  it('draws the caption in the band text shade and the label in the same shade', () => {
    render(
      <LadderRow band={6} markLabel="8">
        criterion
      </LadderRow>
    );

    const config = getBandConfig(6);
    const label = screen.getByText('8');
    const caption = screen.getByText('Band 6');
    for (const token of config.text.split(' ')) {
      expect(label.className).toContain(token);
      expect(caption.className).toContain(token);
    }
    expect(caption.className).toContain('t-label');
    expect(label.className).toContain('text-lg');
    expect(label.className).toContain('font-bold');
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

  it('writes no caption when the label already names the band', () => {
    // A band-labelled row reads "Band 3" in its label, so a caption would say it twice.
    render(
      <LadderRow band={3} markLabel="Band 3" bandCaption={false}>
        criterion
      </LadderRow>
    );

    expect(screen.getAllByText('Band 3')).toHaveLength(1);
    expect(screen.getByText('Band 3').className).toContain('text-sm');
  });

  it('keeps a band label at a size that fits the gutter, and a mark at the usual size', () => {
    const { unmount } = render(
      <LadderRow band={3} markLabel="Band 3" bandCaption={false}>
        x
      </LadderRow>
    );
    expect(screen.getByText('Band 3').className).toContain(LADDER_GUTTER_MARK_LONG);
    unmount();

    render(
      <LadderRow band={3} markLabel="10–12">
        x
      </LadderRow>
    );
    // A two-digit range is a mark, not a band label, so it keeps the usual size.
    expect(screen.getByText('10–12').className).toContain(LADDER_GUTTER_MARK);
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

  it('paints the row and its gutter in the band fill from getBandConfig', () => {
    const { container } = render(
      <LadderRow band={5} markLabel="4">
        x
      </LadderRow>
    );
    const row = container.firstElementChild as HTMLElement;
    const gutter = container.querySelector('.border-r') as HTMLElement;
    for (const token of getBandConfig(5).bg.split(' ')) {
      expect(row.className).toContain(token);
      expect(gutter.className).toContain(token);
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
    expect(gutter.className).toContain('w-16');
    expect(gutter.className).toContain('sm:w-[4.5rem]');
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
        <LadderRowGutter band={3} markLabel="2" edge="open" />
        <p>interactive body</p>
      </div>
    );

    const gutter = container.querySelector('.border-r') as HTMLElement;
    expect(gutter.className).toContain(LADDER_GUTTER);
    expect(gutter.className).toContain(LADDER_EDGE_OPEN);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Band 3')).toBeTruthy();
    expect(gutter.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
  });

  it('honours bandCaption false in the standalone gutter as well', () => {
    render(<LadderRowGutter band={3} markLabel="Band 3" bandCaption={false} />);
    expect(screen.getAllByText('Band 3')).toHaveLength(1);
  });
});
