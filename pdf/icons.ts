// pdf/icons.ts
//
// A small stroked icon set for the report's section headings.
//
// Why hand-built rather than the app's Lucide set: an SVG icon reaches paper
// only through a path parser (arcs, beziers, fill rules), and the exporter has
// no business carrying one for eleven glyphs. Every icon here is a polyline or
// a circle, so it draws with `line()` and `circle()` — two primitives that
// cannot disagree with the measurer about how much room they take.
//
// Geometry is Lucide's 24x24 grid with a 2px stroke, so the printed glyphs sit
// at the same weight and optical size as the ones on screen. Nothing here is
// load-bearing: an icon is a second way to recognise a section the heading
// already names, never the only way.

import { JsPdfLike } from './types';

/** A stroked path in the 24x24 grid: absolute points, joined in order. */
type Polyline = [number, number][];

interface IconShape {
  lines?: Polyline[];
  /** [cx, cy, r] circles, stroked. */
  circles?: [number, number, number][];
  /** [cx, cy, r] circles, filled — dots and counters. */
  dots?: [number, number, number][];
}

export type IconName =
  | 'question'
  | 'target'
  | 'pen'
  | 'bulb'
  | 'speech'
  | 'check'
  | 'arrow'
  | 'bars'
  | 'sparkle'
  | 'swap'
  | 'notes';

/** Points along an arc, for the glyphs that need one (the ? hook, the bulb). */
const arc = (
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
  steps = 10
): Polyline => {
  const pts: Polyline = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
};

/**
 * The set. Each is read in a heading's own colour at the heading's own size, so
 * none of them carries a colour or a scale of its own.
 */
const ICONS: Record<IconName, IconShape> = {
  // The question being marked.
  question: {
    circles: [[12, 12, 9.5]],
    lines: [[...arc(12, 9.6, 3.1, 175, -25), [12, 14.6]]],
    dots: [[12, 17.4, 1]],
  },
  // The mark: where the response landed.
  target: {
    circles: [
      [12, 12, 9],
      [12, 12, 4.6],
    ],
    dots: [[12, 12, 1.3]],
  },
  // The student's own writing.
  pen: {
    lines: [
      [
        [4, 20],
        [5.8, 14.6],
        [16.4, 4],
        [20, 7.6],
        [9.4, 18.2],
        [4, 20],
      ],
      [
        [15.2, 5.2],
        [18.8, 8.8],
      ],
    ],
  },
  // The coach's tip.
  bulb: {
    lines: [
      [
        [7.6, 12.4],
        ...arc(12, 10, 5.4, 200, 340),
        [16.4, 12.4],
        [14.6, 16],
        [9.4, 16],
        [7.6, 12.4],
      ],
      [
        [9.8, 18.6],
        [14.2, 18.6],
      ],
      [
        [10.6, 21],
        [13.4, 21],
      ],
    ],
  },
  // The marker speaking.
  speech: {
    lines: [
      [
        [4, 4.5],
        [20, 4.5],
        [20, 15.5],
        [10.5, 15.5],
        [6, 20],
        [6.6, 15.5],
        [4, 15.5],
        [4, 4.5],
      ],
    ],
  },
  // What the response already does well.
  check: {
    lines: [
      [
        [3.5, 12.8],
        [9.4, 18.6],
        [20.5, 5.4],
      ],
    ],
  },
  // What to do next.
  arrow: {
    lines: [
      [
        [3.5, 12],
        [20, 12],
      ],
      [
        [13.8, 5.8],
        [20, 12],
        [13.8, 18.2],
      ],
    ],
  },
  // Marks criterion by criterion.
  bars: {
    lines: [
      [
        [3.5, 20.5],
        [20.5, 20.5],
      ],
      [
        [7, 20.5],
        [7, 13],
      ],
      [
        [12, 20.5],
        [12, 5.5],
      ],
      [
        [17, 20.5],
        [17, 16],
      ],
    ],
  },
  // The answer this could have been.
  sparkle: {
    lines: [
      [
        [11, 3],
        [12.6, 9.4],
        [19, 11],
        [12.6, 12.6],
        [11, 19],
        [9.4, 12.6],
        [3, 11],
        [9.4, 9.4],
        [11, 3],
      ],
      [
        [18.5, 15.5],
        [19.4, 18.6],
        [22.5, 19.5],
        [19.4, 20.4],
        [18.5, 23.5],
        [17.6, 20.4],
        [14.5, 19.5],
        [17.6, 18.6],
        [18.5, 15.5],
      ],
    ],
  },
  // The student's words against the rewrite's.
  swap: {
    lines: [
      [
        [3.5, 8.5],
        [19, 8.5],
      ],
      [
        [15, 4.8],
        [19, 8.5],
        [15, 12.2],
      ],
      [
        [20.5, 16.5],
        [5, 16.5],
      ],
      [
        [9, 12.8],
        [5, 16.5],
        [9, 20.2],
      ],
    ],
  },
  // Where the teacher writes.
  notes: {
    lines: [
      [
        [3.5, 20.5],
        [20.5, 20.5],
      ],
      [
        [4, 15.5],
        [5.2, 11.8],
        [14.4, 2.8],
        [17.2, 5.6],
        [8, 14.6],
        [4, 15.5],
      ],
    ],
  },
};

/** The grid every icon is drawn on. */
export const ICON_GRID = 24;

/**
 * Draw `name` in a `size` mm box whose TOP-LEFT is (x, y), stroked in `color`.
 *
 * The stroke scales with the box so a heading icon and a page-header icon look
 * like the same drawing at two sizes rather than two drawings.
 */
export const drawIcon = (
  doc: JsPdfLike,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: [number, number, number]
): void => {
  const icon = ICONS[name];
  if (!icon || size <= 0) return;
  const k = size / ICON_GRID;
  const px = (p: number) => x + p * k;
  const py = (p: number) => y + p * k;

  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setLineWidth(Math.max(0.12, 1.9 * k));

  for (const poly of icon.lines ?? []) {
    for (let i = 1; i < poly.length; i++) {
      doc.line(px(poly[i - 1][0]), py(poly[i - 1][1]), px(poly[i][0]), py(poly[i][1]));
    }
  }
  for (const [cx, cy, r] of icon.circles ?? []) {
    doc.circle(px(cx), py(cy), r * k, 'S');
  }
  for (const [cx, cy, r] of icon.dots ?? []) {
    doc.circle(px(cx), py(cy), r * k, 'F');
  }
};

/** Test/maintenance hook: the names the set actually defines. */
export const iconNames = (): IconName[] => Object.keys(ICONS) as IconName[];
