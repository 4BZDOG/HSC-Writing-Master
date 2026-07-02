import { describe, it, expect, vi } from 'vitest';
import { drawLines } from '../../pdf/helpers';
import { LAYOUT, MM_PER_PT, JsPdfLike } from '../../pdf/types';

// Minimal JsPdfLike stub — only the methods drawLines touches.
const makeDoc = () => {
  const ys: number[] = [];
  const doc = {
    setFont: vi.fn().mockReturnThis(),
    setFontSize: vi.fn().mockReturnThis(),
    setTextColor: vi.fn().mockReturnThis(),
    text: vi.fn(function (this: JsPdfLike, _text: unknown, _x: number, y: number) {
      ys.push(y);
      return this;
    }),
  } as unknown as JsPdfLike;
  return { doc, ys };
};

describe('drawLines default leading', () => {
  it('advances by LAYOUT.defaultLineFactor when no lineHeightFactor is supplied', () => {
    const { doc, ys } = makeDoc();
    drawLines(doc, ['line one', 'line two', 'line three'], {
      family: 'helvetica',
      customFontAvailable: false,
      x: 10,
      y: 20,
      fontPt: 10,
    });
    const step = ys[1] - ys[0];
    // This is the exact leading the layout engine assumes when it measures a
    // block with no explicit lineHeightFactor (pdf/layout.ts measureBlock).
    // If drawing and measuring ever disagree here again, blocks silently
    // overflow the column/page they were placed on.
    expect(step).toBeCloseTo(10 * LAYOUT.defaultLineFactor * MM_PER_PT, 6);
  });

  it('honours an explicit lineHeightFactor override', () => {
    const { doc, ys } = makeDoc();
    drawLines(doc, ['a', 'b'], {
      family: 'helvetica',
      customFontAvailable: false,
      x: 10,
      y: 20,
      fontPt: 10,
      lineHeightFactor: 1.4,
    });
    const step = ys[1] - ys[0];
    expect(step).toBeCloseTo(10 * 1.4 * MM_PER_PT, 6);
  });
});
