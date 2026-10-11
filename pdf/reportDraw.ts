// pdf/reportDraw.ts
//
// Draws the progress report's block kinds — the result strip, the progress chart
// and the bar list — at the coordinates `reportGeometry` measured. Nothing here
// decides a position: every x and y is read from `block.reportLayout`, so the page
// cannot disagree with the flow that placed the block.
//
// Colour follows the report's one rule, that each colour means one thing:
//   band colour    attainment — values, points, segments, bar fills
//   slate / rule   structure — frames, gridlines, tracks, dividers
//   muted / ink    text
// A chart carries no rose: nothing on it is a thing to fix.

import { bandColor, COLORS } from './buildBlocks';
import { drawDisplayLine, drawLines, tint, TextStyleCtx } from './helpers';
import { LINE_CHART, MeasuredBlock, PANEL, STAT_STRIP, TABLE } from './types';
import type { JsPdfLike } from './types';
import type {
  BarListLayout,
  CellDrawing,
  LineChartLayout,
  ReportBlockLayout,
  StatStripLayout,
  TableLayout,
  TextLineLayout,
} from './reportBlocks';

type Rgb = [number, number, number];

const setFill = (doc: JsPdfLike, c: Rgb): void => {
  doc.setFillColor(c[0], c[1], c[2]);
};
const setStroke = (doc: JsPdfLike, c: Rgb): void => {
  doc.setDrawColor(c[0], c[1], c[2]);
};

/**
 * Draw one progress-report block whose top-left content corner is (`x`, `yTop`),
 * where `yTop` is the top of the block's padding (as for the marking report's
 * blocks). A block that carries no layout draws nothing.
 */
export const drawReportBlock = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  x: number,
  yTop: number,
  pScale: number
): void => {
  const layout: ReportBlockLayout | undefined = block.reportLayout;
  if (!layout) return;
  const y = yTop + block.padTopMm;
  if (layout.kind === 'statStrip') {
    drawStatStrip(doc, ctx, block, layout, x, y, pScale);
  } else if (layout.kind === 'lineChart') {
    drawLineChart(doc, ctx, layout, x, y, pScale);
  } else if (layout.kind === 'barList') {
    drawBarList(doc, ctx, layout, block.accent ?? COLORS.slate, x, y, pScale);
  } else {
    drawGrid(doc, ctx, layout, block.accent ?? COLORS.slate, x, y, pScale);
  }
};

/**
 * The result strip: one framed box across the page, hairline dividers between
 * the cells, a display label over each value. A value takes its cell's band colour
 * when it has one — the attainment — and ink otherwise.
 */
const drawStatStrip = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  layout: StatStripLayout,
  x: number,
  y: number,
  s: number
): void => {
  const h = layout.height;
  const padY = STAT_STRIP.padYBaseMm * s;
  const r = STAT_STRIP.radiusBaseMm * s;

  setFill(doc, tint(COLORS.slate, PANEL.tintMix));
  setStroke(doc, COLORS.rule);
  doc.setLineWidth(PANEL.borderBaseMm * s);
  doc.roundedRect(x, y, layout.width, h, r, r, 'FD');

  setStroke(doc, COLORS.rule);
  doc.setLineWidth(STAT_STRIP.dividerWeightBaseMm * s);
  for (const cell of layout.cells.slice(1)) {
    doc.line(x + cell.x, y + padY, x + cell.x, y + h - padY);
  }

  const cells = block.report?.type === 'statStrip' ? block.report.cells : [];
  layout.cells.forEach((cell, i) => {
    const textX = x + cell.textX;
    drawDisplayLine(doc, cell.label, {
      ...ctx,
      x: textX,
      y: y + cell.labelBaseline,
      fontPt: layout.labelPt,
      color: COLORS.muted,
    });
    const band = cells[i]?.band;
    // A dash stands for "nothing to report yet", so it is quiet rather than a
    // figure: a value in ink would read as a result.
    const placeholder = cell.value.trim() === '\u2014';
    drawLines(doc, [cell.value], {
      ...ctx,
      x: textX,
      y: y + cell.valueBaseline,
      fontPt: layout.valuePt,
      style: 'bold',
      color: placeholder ? COLORS.dim : typeof band === 'number' ? bandColor(band) : COLORS.ink,
    });
    if (cell.hintLines.length) {
      drawLines(doc, cell.hintLines, {
        ...ctx,
        x: textX,
        y: y + cell.hintBaseline,
        fontPt: layout.hintPt,
        color: COLORS.muted,
        lineHeightFactor: 1.3,
      });
    }
  });
};

/**
 * Progress over time on the band ladder. The gridlines and their names come first,
 * then the dashed average, then the line and the points — so the data sits on top
 * of the scale it is read against — and the dates and caption last.
 */
const drawLineChart = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  layout: LineChartLayout,
  x: number,
  y: number,
  s: number
): void => {
  const { plot } = layout;
  const left = x + plot.left;
  const right = x + plot.right;

  setStroke(doc, COLORS.rule);
  doc.setLineWidth(LINE_CHART.gridWeightBaseMm * s);
  for (const g of layout.gridlines) {
    doc.line(left, y + g.y, right, y + g.y);
  }

  setStroke(doc, COLORS.slate);
  doc.setLineWidth(LINE_CHART.axisWeightBaseMm * s);
  doc.line(left, y + plot.bottom, right, y + plot.bottom);

  for (const g of layout.gridlines) {
    drawLines(doc, [g.label], {
      ...ctx,
      x: x + g.labelX,
      y: y + g.baseline,
      fontPt: layout.labelPt,
      color: COLORS.muted,
      align: 'right',
    });
  }

  if (layout.average) {
    const avg = layout.average;
    setStroke(doc, COLORS.body);
    doc.setLineWidth(LINE_CHART.averageWeightBaseMm * s);
    doc.setLineDashPattern([1.2 * s, 1 * s], 0);
    doc.line(left, y + avg.y, right, y + avg.y);
    doc.setLineDashPattern([], 0);
    for (const line of avg.lines) {
      drawLines(doc, [line.text], {
        ...ctx,
        x: x + avg.labelX,
        y: y + line.baseline,
        fontPt: LINE_CHART.averageLabelPt * s,
        style: 'bold',
        color: COLORS.body,
      });
    }
  }

  // A segment takes the band of the point it arrives at, so the line changes
  // colour as the attainment does, and the points sit on it in the same colours.
  doc.setLineWidth(LINE_CHART.lineWeightBaseMm * s);
  for (const poly of layout.polylines) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      setStroke(doc, bandColor(b.band));
      doc.line(x + a.x, y + a.y, x + b.x, y + b.y);
    }
  }

  const r = LINE_CHART.pointRadiusBaseMm * s;
  for (const p of layout.points) {
    setFill(doc, bandColor(p.band));
    doc.circle(x + p.x, y + p.y, r, 'F');
  }

  for (const label of layout.xLabels) {
    drawLines(doc, [label.text], {
      ...ctx,
      x: x + label.x,
      y: y + label.baseline,
      fontPt: layout.xLabelPt,
      color: COLORS.muted,
      align: label.align,
    });
  }

  if (layout.emptyLabel) {
    drawLines(doc, [layout.emptyLabel.text], {
      ...ctx,
      x: x + layout.emptyLabel.x,
      y: y + layout.emptyLabel.baseline,
      fontPt: layout.captionPt,
      color: COLORS.muted,
      align: 'center',
    });
  }

  if (layout.captionLines.length) {
    drawLines(doc, layout.captionLines, {
      ...ctx,
      x,
      y: y + layout.captionBaseline,
      fontPt: layout.captionPt,
      color: COLORS.muted,
      lineHeightFactor: 1.3,
    });
  }
};

/**
 * Horizontal bars: label, track, value. The track is light structure; the fill is
 * the attainment colour the block carries. A row with no attempts draws an empty
 * dashed track and says so where its value would be.
 */
const drawBarList = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  layout: BarListLayout,
  accent: Rgb,
  x: number,
  y: number,
  s: number
): void => {
  for (const row of layout.rows) {
    drawLines(doc, [row.label], {
      ...ctx,
      x,
      y: y + row.labelBaseline,
      fontPt: layout.labelPt,
      color: row.notAttempted ? COLORS.muted : COLORS.ink,
    });

    const trackLeft = x + layout.trackX;
    const barY = y + row.barY;
    if (row.notAttempted) {
      setStroke(doc, COLORS.dim);
      doc.setLineWidth(0.25 * s);
      doc.setLineDashPattern([0.8 * s, 0.8 * s], 0);
      doc.rect(trackLeft, barY, layout.trackWidth, layout.barHeight, 'S');
      doc.setLineDashPattern([], 0);
    } else {
      setFill(doc, COLORS.rule);
      doc.rect(trackLeft, barY, layout.trackWidth, layout.barHeight, 'F');
      if (row.fillWidth > 0) {
        setFill(doc, accent);
        doc.rect(trackLeft, barY, row.fillWidth, layout.barHeight, 'F');
      }
    }

    drawLines(doc, [row.value], {
      ...ctx,
      x: x + layout.width,
      y: y + row.valueBaseline,
      fontPt: layout.valuePt,
      color: row.notAttempted ? COLORS.muted : COLORS.ink,
      align: 'right',
    });
  }
};

// ---------------------------------------------------------------------------
// Tables and the tier heatmap
// ---------------------------------------------------------------------------

/**
 * The colour a text tone is drawn in. Read from COLORS at call time, not at module
 * load, so this module never reads an imported value during initialisation.
 */
const toneColor = (tone: TextLineLayout['tone']): Rgb => {
  switch (tone) {
    case 'ink':
      return COLORS.ink;
    case 'body':
      return COLORS.body;
    case 'muted':
      return COLORS.muted;
    case 'slate':
      return COLORS.slate;
    case 'rose':
      return COLORS.rose;
  }
};

/** One line of cell text, at the size and in the tone the measurer recorded. */
const drawTextLine = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  line: TextLineLayout,
  x: number,
  y: number
): void => {
  drawLines(doc, [line.text], {
    ...ctx,
    x: x + line.x,
    y: y + line.baseline,
    fontPt: line.fontPt,
    style: line.bold ? 'bold' : 'normal',
    color: toneColor(line.tone),
    align: line.align,
  });
};

/**
 * One cell, drawn from what the measurer placed. The fill of a bar or chip is the
 * attainment colour; the track and the rules are structure. Heat shades are the
 * band's tint, with the percentage printed in ink so the shade is not the only measure.
 */
const drawCell = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  drawing: CellDrawing,
  cx: number,
  cy: number,
  accent: Rgb,
  s: number
): void => {
  if (drawing.kind === 'lines') {
    for (const line of drawing.lines) drawTextLine(doc, ctx, line, cx, cy);
    return;
  }
  if (drawing.kind === 'empty') {
    drawTextLine(doc, ctx, drawing.line, cx, cy);
    return;
  }
  if (drawing.kind === 'bar') {
    const t = drawing.track;
    setFill(doc, COLORS.rule);
    doc.rect(cx + t.x, cy + t.y, t.width, t.height, 'F');
    if (drawing.fillWidth > 0) {
      setFill(doc, accent);
      doc.rect(cx + t.x, cy + t.y, drawing.fillWidth, t.height, 'F');
    }
    drawTextLine(doc, ctx, drawing.line, cx, cy);
    return;
  }
  if (drawing.kind === 'chip') {
    const b = drawing.box;
    const c = bandColor(drawing.band);
    setFill(doc, tint(c, TABLE.chipTintMix));
    setStroke(doc, c);
    doc.setLineWidth(0.25 * s);
    const r = b.height / 2;
    doc.roundedRect(cx + b.x, cy + b.y, b.width, b.height, r, r, 'FD');
    drawTextLine(doc, ctx, drawing.line, cx, cy);
    return;
  }
  if (drawing.kind === 'heat') {
    const b = drawing.box;
    setFill(doc, tint(bandColor(drawing.band), TABLE.heatTintMix));
    const r = 0.8 * s;
    doc.roundedRect(cx + b.x, cy + b.y, b.width, b.height, r, r, 'F');
    drawTextLine(doc, ctx, drawing.line, cx, cy);
    return;
  }
  // A sparkline: the weekly trace in structure, each week's point in its band.
  const box = drawing.box;
  const ox = cx + box.x;
  const oy = cy + box.y;
  setStroke(doc, COLORS.rule);
  doc.setLineWidth(0.2 * s);
  doc.line(ox, oy + box.height, ox + box.width, oy + box.height);
  setStroke(doc, COLORS.slate);
  doc.setLineWidth(0.25 * s);
  for (const poly of drawing.polylines) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      doc.line(ox + a.x, oy + a.y, ox + b.x, oy + b.y);
    }
  }
  const last = drawing.points[drawing.points.length - 1];
  drawing.points.forEach((p) => {
    setFill(doc, bandColor(p.band));
    const isLast = p === last;
    doc.circle(ox + p.x, oy + p.y, (isLast ? 0.75 : 0.5) * s, 'F');
  });
};

/**
 * A table or heatmap fragment: the header (the labels, a rule beneath), then each
 * row. Group headings sit over their rows; body rows carry a hairline beneath.
 * Every position is read from the layout the fragment was measured with.
 */
const drawGrid = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  layout: TableLayout,
  accent: Rgb,
  x: number,
  y: number,
  s: number
): void => {
  const header = layout.header;
  for (const cell of header.cells) {
    for (const line of cell.lines) {
      drawDisplayLine(doc, line.text, {
        ...ctx,
        x: x + cell.x + line.x,
        y: y + line.baseline,
        fontPt: line.fontPt,
        color: COLORS.muted,
      });
    }
  }
  let cursor = y + header.height;
  setStroke(doc, COLORS.slate);
  doc.setLineWidth(TABLE.headerRuleWeightBaseMm * s);
  doc.line(x, cursor, x + layout.width, cursor);

  for (const row of layout.rows) {
    if (row.type === 'group') {
      drawDisplayLine(doc, row.label ?? '', {
        ...ctx,
        x: x + TABLE.padXBaseMm * s,
        y: cursor + (row.labelBaseline ?? row.height * 0.7),
        fontPt: TABLE.groupPt * s,
        color: COLORS.slate,
      });
      setStroke(doc, COLORS.rule);
      doc.setLineWidth(0.2 * s);
      doc.line(x, cursor + row.height, x + layout.width, cursor + row.height);
      cursor += row.height;
      continue;
    }
    if (row.shaded) {
      setFill(doc, tint(COLORS.slate, TABLE.zebraTintMix));
      doc.rect(x, cursor, layout.width, row.height, 'F');
    }
    for (const cell of row.cells) {
      drawCell(doc, ctx, cell.drawing, x + cell.x, cursor, accent, s);
    }
    setStroke(doc, COLORS.rule);
    doc.setLineWidth(TABLE.rowRuleWeightBaseMm * s);
    doc.line(x, cursor + row.height, x + layout.width, cursor + row.height);
    cursor += row.height;
  }
};
